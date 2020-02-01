import * as mysql from 'mysql';
import * as globby from 'globby';
import { promisify } from 'util';

export interface MigrationConfig {
  conn: mysql.Connection;
  tableName: string;
  dir?: string;
}

export interface MigrationScripts {
  version: number;
  upgrade?(conn?: mysql.Connection): (any | Promise<any>);
  downgrade?(conn?: mysql.Connection): (any | Promise<any>);
}

export class Migration {
  private config: MigrationConfig;
  private scripts: MigrationScripts[] = [];
  private maxVersion = 0;

  public constructor(config: MigrationConfig) {
    this.config = config;
    this.loadScripts(this.config.dir || 'migrations');
    this.initMigrationTable();
  }

  /**
   * up
   */
  public async up(steps?: number) {
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
        await script.upgrade();
        await this.updateVersion(script);
      }
      countStep++;
    }

  }

  /**
   * down
   */
  public async down(steps = 1) {
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
        await script.downgrade();
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

  private async loadScripts(dir: string) {
    const files = await globby([dir]);
    let ver = 1;

    files.sort().forEach((file) => {
      let script;
      try { script = require(file); } catch (e) {
        console.log(`Unable to load script from ${file}`);
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
