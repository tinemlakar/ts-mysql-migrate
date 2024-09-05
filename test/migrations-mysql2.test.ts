import { Migration } from '../src/index';
import { createNewTsMigrationScript } from '../src/common';
import { createPool, ConnectionOptions } from 'mysql2';
import * as mysql from 'mysql';
import * as path from 'path';
import * as fs from 'fs';

require('dotenv').config();

let migration: Migration;
let invalidMigration: Migration;
let timestampMigration: Migration;
const poolConfig: ConnectionOptions = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  // debug: true,
  connectionLimit: 1,
  charset: 'utf8_slovenian_ci',
};
const pool = createPool(poolConfig);
const pool2 = createPool(poolConfig);
const pool3 = createPool(poolConfig);

beforeAll(async () => {
  migration = new Migration({
    conn: pool as unknown as mysql.Connection,
    tableName: 'migrations',
    dir: `./test/migration-scripts/`,
    silent: true,
  });

  invalidMigration = new Migration({
    conn: pool2 as unknown as mysql.Connection,
    tableName: 'migrations',
    dir: `./test/invalid-migration-scripts/`,
    silent: true,
  });

  createNewTsMigrationScript('./test/time-migrations', 'test1', true);
  await new Promise((resolve) => setTimeout(resolve, 300));
  createNewTsMigrationScript('./test/time-migrations', 'test2', true);
  await new Promise((resolve) => setTimeout(resolve, 300));
  createNewTsMigrationScript('./test/time-migrations', 'test3', true);

  timestampMigration = new Migration({
    conn: pool3 as unknown as mysql.Connection,
    tableName: 'ts_migrations',
    dir: `./test/time-migrations/`,
    silent: false,
    strictOrder: true,
  });

  await migration.initialize();
  await invalidMigration.initialize();
  await timestampMigration.initialize();
});

afterAll(async () => {
  // downgrade all
  await migration.down(-1);
  await migration.destroy();
  await invalidMigration.destroy();
  await timestampMigration.down(-1);
  await timestampMigration.destroy();
  fs.rmSync(path.join(process.cwd(), './test/time-migrations'), {
    recursive: true,
    force: true,
  });
});

describe('Indexed migrations', () => {
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
    await expect(invalidMigration.down()).rejects.toThrow(/filename mismatch/);
  });
});

describe('Strict indexing test', () => {
  let strictInvalidMigration: Migration;
  let strictMigration: Migration;
  const pool4 = createPool(poolConfig);
  const pool5 = createPool(poolConfig);
  beforeAll(async () => {
    strictInvalidMigration = new Migration({
      conn: pool4 as unknown as mysql.Connection,
      tableName: 'str_inv_migrations',
      dir: `./test/invalid-migration-scripts/`,
      silent: true,
      numOrder: true,
    });
    strictMigration = new Migration({
      conn: pool5 as unknown as mysql.Connection,
      tableName: 'str_migrations',
      dir: `./test/strict-migration-scripts/`,
      silent: true,
      numOrder: true,
    });
  });
  afterAll(async () => {
    await strictMigration.down(-1);
    await strictMigration.destroy();
    try {
      await strictInvalidMigration.down(-1);
    } catch (err) {
      console.log(err);
    }
    await strictInvalidMigration.destroy();
  });

  test('Should fail with invalid index', async () => {
    await expect(strictInvalidMigration.initialize()).rejects.toThrow(
      /lower timestamp or version index/
    );
  });

  test('Should pass with proper index order', async () => {
    await strictMigration.initialize();
    await strictMigration.up();
    const { version } = await strictMigration.getLastVersion();
    expect(version).toBe(4);
  });

  test('Should fail when script is missing', async () => {
    strictInvalidMigration = new Migration({
      conn: pool4 as unknown as mysql.Connection,
      tableName: 'str_migrations',
      dir: `./test/migration-scripts-missing/`,
      silent: true,
      numOrder: true,
    });
    await expect(strictInvalidMigration.initialize()).rejects.toThrow(
      /Cannot find module/
    );
  });
});

describe('Timestamp migrations', () => {
  test('Test upgrade migrations', async () => {
    await timestampMigration.up();
    const lastVersion = await timestampMigration.getLastVersion();
    expect(lastVersion.version).toBe(3);
  });

  test('Test downgrade migrations', async () => {
    await timestampMigration.down();
    const { version } = await timestampMigration.getLastVersion();
    expect(version).toBe(2);
  });

  test('If migration with smaller timestamp is added after migration with bigger has already been deployed, smaller should be deployed later', async () => {
    createNewTsMigrationScript('./test/time-migrations', 'test_index_OK', true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    timestampMigration = new Migration({
      conn: pool3 as unknown as mysql.Connection,
      tableName: 'ts_migrations',
      dir: `./test/time-migrations/`,
      silent: true,
      strictOrder: true,
    });
    await timestampMigration.initialize();

    const { version } = await timestampMigration.getLastVersion();

    await timestampMigration.up();
    const lastVersion = await timestampMigration.getLastVersion();
    expect(lastVersion.version).toBe(version + 2);

    // creating migration with older timestamp - should fail
    createNewTsMigrationScript(
      './test/time-migrations',
      'test1',
      true,
      -100000
    );

    const failedMigration = new Migration({
      conn: pool3 as unknown as mysql.Connection,
      tableName: 'ts_migrations',
      dir: `./test/time-migrations/`,
      silent: true,
      strictOrder: true,
    });

    await expect(failedMigration.initialize()).rejects.toThrow(
      /lower timestamp or version index/
    );
  });

  describe('Empty folder test', () => {
    let emptyMigrations: Migration;

    const pool6 = createPool(poolConfig);
    beforeAll(async () => {
      emptyMigrations = new Migration({
        conn: pool6 as unknown as mysql.Connection,
        tableName: 'empty_migrations',
        dir: `./test/empty-folder/`,
        silent: true,
      });
      await emptyMigrations.initialize();
    });
    afterAll(async () => {
      await emptyMigrations.destroy();
    });
    test('Run migrations in empty folder with .gitkeep file', async () => {
      await emptyMigrations.up();
      await emptyMigrations.down(-1);
      console.log('Done!');
      expect(1).toBe(1);
    });
  });
});
