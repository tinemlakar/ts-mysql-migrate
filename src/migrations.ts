// import * as globby from 'globby';
import * as fs from 'fs';
import { promisify } from 'util';
import { QueryFunction } from 'mysql';

export interface MigrationConnection {
  query: QueryFunction;
}

export interface MigrationConfig {
  conn: MigrationConnection;
  tableName: string;
  /**
   * path to migration dir relative to module root
   */
  dir: string;
  /**
   * path to migration dir relative to current file
   */
  pathToScripts: string;
}

export interface MigrationScripts {
  version: number;
  upgrade?(queryFn?: (query: string, value: any[]) => Promise<Array<any>>): (any | Promise<any>);
  downgrade?(queryFn?: (query: string, value: any[]) => Promise<Array<any>>): (any | Promise<any>);
}

export class Migration {
  private config: MigrationConfig;
  private scripts: MigrationScripts[] = [];
  private maxVersion = 0;
  private isInit = false;

  public constructor(config: MigrationConfig) {
    this.config = config;
    this.isInit = false;
  }

  public async initialize() {
    await this.loadScripts(this.config.dir || 'migrations');
    await this.initMigrationTable();
    this.isInit = true;
  }
  /**
   * up
   */
  public async up(steps?: number) {
    if (!this.isInit) {
      throw new Error('Migration class not initailized! Run initialize function first!');
    }
    // get files to execute
    if (!steps || steps < 0) {
      steps = 9999;
    }
    let countStep = 0;
    while (countStep < steps) {
      const script = await this.getNextUpgradeScript();
      if (!script) {
        const ver = await this.getlastVersion();
        if (ver != this.maxVersion) {
          throw new Error('Next upgrade script not found!');
        }
      } else if (script.upgrade) {
        // execute
        await script.upgrade(this.query.bind(this));
        await this.updateVersion(script);
      }
      countStep++;
    }

  }

  /**
   * down
   */
  public async down(steps = 1) {
    if (!this.isInit) {
      throw new Error('Migration class not initailized! Run initialize function first!');
    }
    // get files to execute
    if (!steps || steps < 0) {
      steps = 9999;
    }
    let countStep = 0;
    while (countStep < steps) {
      const script = await this.getNextDowngradeScript();
      if (!script) {
        const ver = await this.getlastVersion();
        if (ver) {
          throw new Error('Next downgrade script not found!');
        }
      } else if (script.downgrade) {
        // execute
        await script.downgrade(this.query.bind(this));
        await this.deleteVersion(script);
      }
      countStep++;
    }

  }

  /**
   * reset
   */
  public async reset() {
    // run all down migrations
    await this.down(-1);
  }

  private async loadScripts(dirPath: string) {
    // const files = await globby([dirPath]);

    const files = await promisify(fs.readdir)(dirPath);
    let ver = 1;
    // debugger;
    files.sort().forEach((file) => {
      let script;
      // console.log(__dirname);
      try { script = module.parent.parent.require(`${ this.config.pathToScripts + file}`); } catch (e) {
        console.log(`Unable to load script from ${file}! (${e})`);
      }

      const isValid = (
        !!script
        && typeof script.upgrade !== 'undefined'
        && typeof script.downgrade !== 'undefined'
      );

      if (isValid) {
        script.version = ver;
        this.scripts.push(script);
        ver++;
      }
    });

    this.maxVersion = ver;
  }

  private async getNextUpgradeScript() {
    const ver = await this.getlastVersion();
    for (const script of this.scripts) {
      if (script.version === (ver + 1)) {
        return script;
      }
    }
    return null;
  }

  private async getNextDowngradeScript() {
    const ver = await this.getlastVersion();
    for (const script of this.scripts) {
      if (script.version === (ver)) {
        return script;
      }
    }
    return null;
  }

  private async initMigrationTable() {
    try {
      await this.query(`
        CREATE TABLE IF NOT EXISTS ${this.config.tableName} (
          version INT NULL,
          date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (err) {
      console.log('Failed to create table for migrations.');
      throw new Error(err);
    }

  }

  private async getlastVersion(): Promise<number> {
    return await this.query(
      `SELECT version
      FROM ${this.config.tableName}
      ORDER BY version DESC
      LIMIT 1`).then((val: any) => !!val && val.length ? val[0][0].version : 0);
  }

  private async updateVersion(script: MigrationScripts) {
    return await this.query(
      `INSERT INTO ${this.config.tableName} (version)
       VALUES (${script.version})
      `);
  }

  private async deleteVersion(script: MigrationScripts) {
    return await this.query(
      `DELETE FROM ${this.config.tableName}
       WHERE version = ${script.version}
      `);
  }

  private query(query: string, values?: any): Promise<Array<any>> {
    const q = promisify(this.config.conn.query).bind(this.config.conn);
    return q(query, values);
  }

}
