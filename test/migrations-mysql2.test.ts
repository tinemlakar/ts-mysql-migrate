import { Migration } from '../src/index';
import { createPool, ConnectionOptions } from 'mysql2';
import * as mysql from 'mysql';
import * as fs from 'fs';
require('dotenv').config();

let migration: Migration;
let invalidMigration: Migration;

beforeAll(async () => {

  const poolConfig: ConnectionOptions = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    // debug: true,
    connectionLimit: 1,
    charset: 'utf8_slovenian_ci'
  };

  const pool = createPool(poolConfig);
  const pool2 = createPool(poolConfig);

  migration = new Migration({
    conn: pool as unknown as mysql.Connection,
    tableName: 'migrations',
    dir: `./test/migration-scripts/`,
    silent: true
  });

  invalidMigration = new Migration({
    conn: pool2 as unknown as mysql.Connection,
    tableName: 'migrations',
    dir: `./test/invalid-migration-scripts/`,
    silent: true
  });

  await migration.initialize();
  await invalidMigration.initialize();

});

afterAll(async () => {

  // downgrade all
  await migration.down(-1);
  await migration.destroy();
  await invalidMigration.destroy();

});

test('Test upgrade migrations', async () => {
  await migration.up();
  const lastVersion = await migration.getLastVersion();
  expect(lastVersion.version).toBe(4);
});

test('Test downgrade migrations', async () => {
  await migration.down();
  const { version } = await migration.getLastVersion();
  expect(version).toBe(3);
});

test('Test downgrade two migration', async () => {
  await migration.up();
  await migration.down(2);
  const { version } = await migration.getLastVersion();
  expect(version).toBe(2);
});

test('Test upgrade one migration', async () => {
  await migration.up(1);
  const { version } = await migration.getLastVersion();
  expect(version).toBe(3);
});

test('Test reset', async () => {
  await migration.reset();
  const { version } = await migration.getLastVersion();
  expect(version).toBe(4);
});

test('Test fail invalid migrations', async () => {
  await migration.reset();
  await expect(invalidMigration.down()).rejects.toThrow(/filename mismatch/);
});


test('If migration with smaller timestamp is added after migration with bigger has already been deployed, smaller should be deployed later', async ()=> {
  await migration.reset();
  const migrationPath= await migration.generateNew("new_one", 0);
  const lastVersion = await migration.getLastVersion();
 
  expect(lastVersion.version).toBe(4);
  await migration.initialize();
  await migration.up();

  const lastVersion2 = await migration.getLastVersion();
  expect(lastVersion2.version).toBe(5);
  expect(lastVersion2.fileName).toBe(`0-new_one.ts`);
  fs.unlinkSync(migrationPath);
})