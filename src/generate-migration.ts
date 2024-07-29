import path = require("path");
import * as fs from "fs";

require('dotenv').config();

const migrationTemplate = `
export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<void>) {
  await queryFn(\`\`);
}
    
export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<void>) {
  await queryFn(\`\`);
}
`;

async function run(){
  process.stdin.setEncoding('utf8');

  console.log('Please enter the migration name:');
  
  process.stdin.on('data', (migrationName: string) => {
    migrationName = migrationName.trim(); // Remove the newline at the end
    const timestamp = new Date().getTime();
    const migrationFileName = `${timestamp}-${migrationName}.ts`;
    const migrationFilePath = path.join(process.env.MIGRATION_FOLDER ?? "migration-scripts", migrationFileName);
    console.log(`Creating migration file at ${migrationFilePath}`);
    fs.writeFileSync(migrationFilePath, migrationTemplate);
    console.log(`Migration file created at ${migrationFilePath}`);
    process.exit(0);
  });
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
}) 