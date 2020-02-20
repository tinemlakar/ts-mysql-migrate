# ts-mysql-migrate

MySQL migration tool for typescript projects. Supports mysqljs and node-mysql2 driver.

## IMPORTANT NOTICE

This code is work in progress. Please test your upgrade and downgrade scripts well before use it on production database!

Please also note the following paragraph from License:

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Installation

```ssh
npm i ts-mysql-migrate
```

## API

### initialize()

Ensures database connectivity and creates migration table on database, if not yet present. Must be awaited before running migration scripts.

### up(step: number)

Upgrades database by running upgrade functions in migration scripts. Parameter ```step``` defines number of versions to upgrade which is number of migration scripts to execute. If omitted, all not-yet-deployed upgrade functions will execute - database will upgrade to last version.

### down(step: number = 1)

Runs downgrade functions in migration scripts. Parameter ```step``` defines how many versions should database downgrade. If omitted, one downgrade functions will be executed - database will downgrade one version.

### reset()

Runs all downgrade and upgrade migrations. Depending od your upgrade and downgrade scripts, this could be used to clean database of all data.

## Guide

### Create migration scripts

Create migration scripts and name them with number prefix to set the order of execution (versions). Each migration script should have ```upgrade``` and ```downgrade``` functions exported. These functions must have ```queryFn``` as parameter - see examples below.

 Example: ```/src/migrations/1-init_db.ts```

 ```ts
 export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {

// write upgrade logic as parameter of queryFn
  await queryFn(`
    CREATE TABLE TEST (ID INTEGER NULL, NAME VARCHAR(20) NULL);
  `);
  
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {

// write downgrade logic as parameter of queryFn
  await queryFn(`
    DROP TABLE TEST;
  `);


}

 ```

 Example: ```/src/migrations/2-seed_data.ts```

 ```ts
 export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {

  // write upgrade logic as parameters of queryFn
  await queryFn(`
    INSERT INTO TEST VALUES (?, ?);
  `, [1, 'Test']);

}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  
  // write downgrade logic as parameters of queryFn
  await queryFn(`
    DELETE FROM TEST WHERE ID = ?;
  `, [1]);

}

```

### Create starter script

Create scripts that will run your upgrade and/or downgrade migrations. You can write multiple scripts for different scenarios/environments (dev, staging, production).

Example: ```/src/scripts/upgrade.ts``` (or ```/src/scripts/downgrade.ts```)

```ts
import { Migration, MigrationConnection } from 'ts-mysql-migrate';

const run = async () => {
  
/**** mysqljs example ****/

/*
   const poolConfig: PoolConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,

  };

  const pool = createPool(poolConfig);

  migration = new Migration({
    conn: pool,
    tableName: 'migrations',
    dir: `./src/migrations/`
  });

*/

/**** node-mysql2 example ****/

const poolConfig: ConnectionOptions = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  };

  const pool = createPool(poolConfig); // make sure that you are not using mysl2/promise lib

  const migration = new Migration({
    conn: pool as unknown as mysql.Connection,
    tableName: 'migrations',
    dir: `./src/migrations/`
  });

  await migration.initialize();
  
  await migration.up();       // use for upgrade script
  // await migration.down();  // use for downgrade script
  // await migration.reset(); // use for resetting database
};

run().catch((err) => {
  console.log(err);
});

```

### Run upgrade or downgrade migrations

All you have to do now is to run your starter scripts each time you want to upgrade or downgrade a database.

You can put them in ```package.json``` and run it from npm. Example:

```package.json```

```json
  "scripts": {
    "upgrade": "node -r ts-node/register ./src/scripts/upgrade-stg.ts",
    "downgrade": "node -r ts-node/register ./src/scripts/downgrade-stg.ts",
    "upgrade-production": "node -r ts-node/register ./src/scripts/upgrade-prod.ts",
    "downgrade-production": "node -r ts-node/register ./src/scripts/downgrade-prod.ts",
  },
```
