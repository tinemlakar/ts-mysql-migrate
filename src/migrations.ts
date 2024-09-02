import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { QueryFunction } from 'mysql';

try {
  require('dotenv').config();
} catch (err) {}

/**
 * Database connection interface
 */
export interface MigrationConnection {
  query: QueryFunction;
  end(callback?: (err: Error | null) => void): void;
}

/**
 * Config interface
 */
export interface MigrationConfig {
  /**
   * DB connection object
   */
  conn: MigrationConnection;
  /**
   * database table name for version keeping.
   */
  tableName: string;
  /**
   * path to migration dir relative to module root
   */
  dir: string;
  /**
   * prevents console outputs
   */
  silent?: boolean;
  /**
   * override default MIGRATIONS_STRICT_ORDER flag
   */
  strictOrder?: boolean;
  /**
   * override default MIGRATIONS_NUMERIC_ORDER flag
   */
  numOrder?: boolean;
}

/**
 * Migration script interface
 */
export interface MigrationScript {
  version: number;
  fileName: string;
  upgrade?(
    queryFn?: (query: string, value: any[]) => Promise<Array<any>>
  ): any | Promise<any>;
  downgrade?(
    queryFn?: (query: string, value: any[]) => Promise<Array<any>>
  ): any | Promise<any>;
}

export class Migration {
  private config: MigrationConfig;
  private scripts: MigrationScript[] = [];
  private maxVersion = 0;
  private isInit = false;
  private strictOrder = !!process.env.MIGRATIONS_STRICT_ORDER
    ? process.env.MIGRATIONS_STRICT_ORDER?.toLowerCase() === 'true'
    : process.env.NODE_ENV?.toLowerCase() === 'production';
  private numOrder =
    process.env.MIGRATIONS_NUMERIC_ORDER?.toLowerCase() === 'true';

  public constructor(config: MigrationConfig) {
    this.config = config;
    this.isInit = false;
    this.strictOrder =
      config.strictOrder !== undefined ? config.strictOrder : this.strictOrder;
    this.numOrder =
      config.numOrder !== undefined ? config.numOrder : this.numOrder;
  }

  /**
   * Migrator initialization function. Must be awaited before other functions can be run.
   */
  public async initialize() {
    await this.initMigrationTable();
    await this.loadScripts(this.config.dir || 'migrations');
    this.isInit = true;
  }

  /**
   * Version upgrade function.
   * @param steps number of steps above current version. If not present all upgrade scripts will run.
   */
  public async up(steps?: number) {
    if (!this.isInit) {
      throw new Error(
        'Migration class not initialized! Run initialize function first!'
      );
    }

    this.writeLog('Starting upgrade migration!');

    // get files to execute
    const infinite = !steps || steps < 0;

    let countStep = 0;
    while (infinite || countStep < steps) {
      const script = await this.getNextUpgradeScript();
      if (!script) {
        const { version } = await this.getLastVersion();
        if (version != this.maxVersion) {
          throw new Error('Next upgrade script not found!');
        } else {
          this.writeLog('Upgrade complete!');
          break;
        }
      } else if (script.upgrade) {
        // execute
        this.writeLog(`Step: ${countStep + 1}`);
        this.writeLog(`Upgrading to version ${script.version}...`);
        await script.upgrade(this.query.bind(this));
        await this.saveVersion(script);
        this.writeLog(`DB upgraded to version : ${script.version}`);
      }
      countStep++;
    }
  }

  /**
   * Version downgrade function.
   * @param steps number of downgrade scripts to run below current version. Default value is 1.
   * @default steps = 1
   */
  public async down(steps = 1) {
    if (!this.isInit) {
      throw new Error(
        'Migration class not initialized! Run initialize function first!'
      );
    }

    this.writeLog('Starting downgrade migration!');

    // get files to execute
    const infinite = !steps || steps < 0;

    let countStep = 0;
    while (infinite || countStep < steps) {
      const script = await this.getNextDowngradeScript();
      if (!script) {
        const { version } = await this.getLastVersion();
        if (version) {
          throw new Error('Next downgrade script not found!');
        } else {
          this.writeLog('Downgrade complete!');
          break;
        }
      } else if (script.downgrade) {
        // execute
        this.writeLog(`Step: ${countStep + 1}`);
        this.writeLog(`Downgrading to version ${script.version - 1}...`);
        await script.downgrade(this.query.bind(this));
        await this.deleteVersion(script);
        this.writeLog(`DB downgraded to version : ${script.version - 1}`);
      }
      countStep++;
    }
  }

  /**
   * Run all downgrade scripts and then all upgrade scripts
   */
  public async reset() {
    await this.down(-1);
    await this.up();
  }

  /**
   * Returns last version of database
   */
  public async getLastVersion(): Promise<{
    version: number;
    fileName: string;
  }> {
    return await this.query(
      `SELECT version, fileName
      FROM ${this.config.tableName}
      ORDER BY version DESC
      LIMIT 1`,
      null,
      true
    ).then((val: any) =>
      !!val && val.length
        ? { version: val[0].version, fileName: val[0].fileName }
        : { version: 0, fileName: null }
    );
  }

  public async getLoadedScripts(
    sortDirection = 'desc'
  ): Promise<{ version: number; fileName: string }[]> {
    return await this.query(
      `SELECT version, fileName
      FROM ${this.config.tableName}
      ORDER BY version ${sortDirection}`,
      null,
      true
    );
  }

  public async destroy() {
    await new Promise<void>((resolve, reject) => {
      this.config.conn.end((e) => {
        this.writeLog(
          `Migrations: DB connection terminated: ${e?.message || 'CLOSED'}`
        );
        resolve();
      });
    });
  }
  /**
   * Loads scripts from file system
   */
  private async loadScripts(dirPath: string) {
    const files = await promisify(fs.readdir)(dirPath);
    let ver = 1;

    const loaded = await this.getLoadedScripts('asc');
    const notLoaded = files.filter(
      (file) => !loaded.find((loadedScripts) => loadedScripts.fileName === file)
    );

    const sortedNotLoadedScripts = notLoaded.sort(this.sortFiles);

    // if (loaded.length && sortedNotLoadedScripts.length) {
    //   const lastLoadedScript = loaded[loaded.length - 1];
    //   // Get timestamp from filename of both scripts
    //   const lastLoadedScriptTimestamp =
    //     lastLoadedScript.fileName.match(/^(\d*)-/)[1];
    //   const firstNotLoadedScriptTimestamp =
    //     sortedNotLoadedScripts[0].match(/^(\d*)-/)[1];
    //   if (
    //     process.env.MIGRATIONS_STRICT_ORDER === 'true' &&
    //     firstNotLoadedScriptTimestamp < lastLoadedScriptTimestamp
    //   ) {
    //     throw new Error(
    //       'Check your migration scripts! You are trying to load a script with a lower timestamp than the last loaded script!'
    //     );
    //   }
    // }

    const fileArr = [
      ...loaded.map((script) => script.fileName),
      ...sortedNotLoadedScripts,
    ];

    this.writeLog(`Found migration scripts: ${fileArr.join(', ')}`);

    let previousFilePrefix = null;

    fileArr.forEach((file) => {
      let script;
      try {
        script = module.parent.parent.require(
          path.resolve(process.cwd(), dirPath, file)
        );
      } catch (e) {
        this.writeLog(`Unable to load script from ${file}! (${e})`);
        // typescript/javascript file are expected to load successfully from folder
        if (/(\.js|\.ts|\.jsx|\.jsm)$/.test(file)) {
          throw e;
        }
      }

      // strict versions check
      const filePrefix = file.match(/^(\d*)-/)[1];
      if (
        previousFilePrefix &&
        ((this.strictOrder && filePrefix < previousFilePrefix) ||
          (this.numOrder && +previousFilePrefix + 1 !== +filePrefix))
      ) {
        throw new Error(
          'Check your migration scripts! You are trying to load a script with a lower timestamp or version index than the last loaded script!'
        );
      }

      const isValid =
        !!script &&
        typeof script.upgrade !== 'undefined' &&
        typeof script.downgrade !== 'undefined';

      if (isValid) {
        script.version = ver;
        script.fileName = file;
        this.scripts.push(script);
        this.maxVersion = ver;
        ver++;
        previousFilePrefix = filePrefix;
      }
    });
  }

  /**
   * Returns next upgrade script object
   */
  private async getNextUpgradeScript(): Promise<MigrationScript> {
    const { version } = await this.getLastVersion();
    for (const script of this.scripts) {
      if (script.version === version + 1) {
        return script;
      }
    }
    return null;
  }

  /**
   * Returns next downgrade script object
   */
  private async getNextDowngradeScript(): Promise<MigrationScript> {
    const { version, fileName } = await this.getLastVersion();
    for (const script of this.scripts) {
      if (script.version === version) {
        if (script.fileName !== fileName) {
          throw new Error(
            `Script version and filename mismatch! version: ${version} -> file system: ${script.fileName} | database: ${fileName}`
          );
        }
        return script;
      }
    }
    return null;
  }

  /**
   * If needed, creates database table for version tracking
   */
  private async initMigrationTable() {
    try {
      await this.query(
        `
        CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
          version INT NOT NULL,
          fileName VARCHAR(256),
          date DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (version)
        )
      `,
        null,
        true
      );
    } catch (err) {
      this.writeLog('Failed to create table for migrations.');
      throw new Error(err);
    }
  }

  /**
   * Saves version of database into migration table
   */
  private async saveVersion(script: MigrationScript) {
    return await this.query(
      `INSERT INTO ${this.config.tableName} (version, fileName)
       VALUES (${script.version}, '${script.fileName}')
      `,
      null,
      true
    );
  }

  /**
   * deletes version from database
   */
  private async deleteVersion(script: MigrationScript) {
    return await this.query(
      `DELETE FROM ${this.config.tableName}
       WHERE version = ${script.version}
      `,
      null,
      true
    );
  }

  /**
   * Allows async calls of native query function
   */
  private async query(
    query: string,
    values?: any,
    silent = false
  ): Promise<Array<any>> {
    const q = promisify(this.config.conn.query).bind(this.config.conn);
    this.writeLog(query, silent);
    return await q(query, values);
  }

  /**
   * Sort migration files by prefix numbers.
   */
  private sortFiles(a: string, b: string): number {
    const verA = a.match(/^(\d*)-/)[1];
    const verB = b.match(/^(\d*)-/)[1];

    if (!parseInt(verA) || !parseInt(verB)) {
      return 0;
    }

    if (parseInt(verA) > parseInt(verB)) {
      return 1;
    }
    if (parseInt(verA) < parseInt(verB)) {
      return -1;
    }
    return 0;
  }

  private writeLog(text: string, forceSilent?: boolean) {
    if (!this.config.silent && !forceSilent) {
      console.log(text);
    }
  }
}
