import { Migration } from '../src/index';
import { createPool, ConnectionOptions } from 'mysql2';
import * as mysql from 'mysql';
require('dotenv').config();

let migration: Migration;

beforeAll(async () => {

  const poolConfig: ConnectionOptions = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    // debug: true,
    connectionLimit: 1,
    charset: 'utf8_slovenian_ci'
  };

  const pool = createPool(poolConfig);

  migration = new Migration({
    conn: pool as unknown as mysql.Connection,
    tableName: 'migrations',
    dir: `./test/migration-scripts/`,
    silent: true
  });

  await migration.initialize();

});

afterAll(async () => {

  // downgrade all
  await migration.down(-1);

});

test('Test upgrade migrations', async () => {
  await migration.up();
  const version = await migration.getLastVersion();
  expect(version).toBe(4);
});

test('Test downgrade migrations', async () => {
  await migration.down();
  const version = await migration.getLastVersion();
  expect(version).toBe(3);
});

test('Test downgrade two migration', async () => {
  await migration.up();
  await migration.down(2);
  const version = await migration.getLastVersion();
  expect(version).toBe(2);
});

test('Test upgrade one migration', async () => {
  await migration.up(1);
  const version = await migration.getLastVersion();
  expect(version).toBe(3);
});

test('Test reset', async () => {
  await migration.reset();
  const version = await migration.getLastVersion();
  expect(version).toBe(4);
});
