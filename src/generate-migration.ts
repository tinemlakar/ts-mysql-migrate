#!/usr/bin/env node

import { createNewTsMigrationScript } from './common';

try {
  require('dotenv').config();
} catch (err) {}

let migrationFolder = process.env.MIGRATION_FOLDER ?? 'migration-scripts';

async function run() {
  process.stdin.setEncoding('utf8');

  console.log(
    `Please enter the migration folder name. Will be created if doesn't exists [default: ${migrationFolder}]:`
  );

  process.stdin.once('data', (folder: string) => {
    migrationFolder = folder.trim() || migrationFolder;

    console.log('Please enter the migration name [default: sql_migration]:');
    process.stdin.once('data', (migrationName: string) => {
      migrationName = migrationName.trim() || 'sql_migration'; // Remove the newline at the end

      const migrationFilePath = createNewTsMigrationScript(
        migrationFolder,
        migrationName
      );
      console.log(`Migration file created at ${migrationFilePath}`);
      process.exit(0);
    });
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
