# ts-mysql-migrate

MySQL migration tool for typescript projects. Supports mysqljs and node-mysql2 driver.

## Installation

```ssh
npm i ts-mysql-migrate
```

## Changelog

### v1.1.0

 Now it is possible to [generate migration scripts](#cli--support-for-timestamp) with timestamps in order not to create problems when merging from different branches. That was an annoying issue in larger teams working on same project.

You can control behavior of strict order with environment variable `MIGRATIONS_STRICT_ORDER`. See [environment variables](#environment-variables) for details.

## Environment variables

This project utilizes environment variables to configure various aspects of the migration process. You can define these variables in a `.env` file at the root of your project. To use `.env` files, ensure the `dotenv` package is installed, as it is required for loading these variables into your environment.

Here are some key environment variables used in this project:

* **`MIGRATIONS_STRICT_ORDER`**: Ensures migration scripts follow a strict index/timeline order. Possible to override with passing `strictOrder` parameter to constructor. Default is `true` in production (`NODE_ENV='production'`), otherwise `false`.
* **`MIGRATIONS_NUMERIC_ORDER`**: Enforces strict number order for migration scripts ordered by numbers. Should be disabled if scripts are prefixed with timestamps. Possible to override with passing `numOrder` parameter to constructor. Set to `false` by default.
* **`MIGRATION_FOLDER`**: Specifies the default path to the migrations folder for the CLI script generator.
* **Database Configuration  for running tests**:
  * `DB_HOST`: Database host
  * `DB_PORT`: Database port.
  * `DB_USER`: Database user.
  * `DB_PASSWORD`: Database password.
  * `DB_DATABASE`: Database name.

## API

### initialize()

Ensures database connectivity and creates migration table on database, if not yet present. Must be awaited before running migration scripts.

### up(step: number)

Upgrades database by running upgrade functions in migration scripts. Parameter ```step``` defines number of versions to upgrade which is number of migration scripts to execute. If omitted, all not-yet-deployed upgrade functions will execute - database will upgrade to last version.

### down(step: number = 1)

Runs downgrade functions in migration scripts. Parameter ```step``` defines how many versions should database downgrade. If omitted, one downgrade functions will be executed - database will downgrade one version.

### reset()

Runs all downgrade and upgrade migrations. Depending od your upgrade and downgrade scripts, this could be used to clean database of all data.

### destroy()

Closes database connection and releases handles.

## Guide

### Create migration scripts

Create migration scripts and name them with number prefix to set the order of execution (versions). In v2 you can also generate it with [CLI](#cli--support-for-timestamp) to have a timestamp as identifier.

Each migration script should have ```upgrade``` and ```downgrade``` functions exported. These functions must have ```queryFn``` as parameter - see examples below.

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
  await migration.destroy();  // close db connection
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

## CLI & support for timestamp

> New in v1.1.x

You can now save script names with any number as a prefix - this is meant to be used with unix timestamp. To generate script with current timestamp, you can run CLI command from local installation by running

```sh
npx generate-migration
```

Alternatively you can also install package globally

```sh
npm i ts-mysql-migrate -g
```

Then you can call the command in the root of your project.

```sh
generate-migration
```

You can set the env variable `MIGRATION_FOLDER` to customize default or even set script in your `package.json` for example:

```json
{
  "scripts":{
    "new-migration": "cross-env MIGRATION_FOLDER=my-migration-folder generate-migration"
  }
}

```

and then just call `npm run new-migration` when you'd like to create new migration.

## IMPORTANT NOTICE

Please test your upgrade and downgrade scripts well before use it on production database!

Please also note the following paragraph from License:

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
