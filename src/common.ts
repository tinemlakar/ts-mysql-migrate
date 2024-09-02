import path = require('path');
import * as fs from 'fs';

const migrationTemplate = `
export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<void>) {
  await queryFn(\`\`);
}
    
export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<void>) {
  await queryFn(\`\`);
}
`;

const generateTestTemplate = () => {
  const tableName = `TABLE_${Math.floor(Math.random() * 10000)}`;
  return `
  export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<void>) {
  await queryFn('CREATE TABLE ${tableName} (ID INTEGER NULL, NAME VARCHAR(20) NULL);');
}
    
export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<void>) {
  await queryFn('DROP TABLE ${tableName};');
}
  `;
};

export function createNewTsMigrationScript(
  folder: string,
  name: string,
  isTest = false,
  deltaMs = 0
) {
  const migrationFileName = `${new Date().getTime() + deltaMs}-${name}.ts`;
  const migrationFilePath = path.join(process.cwd(), folder, migrationFileName);

  if (!fs.existsSync(path.join(process.cwd(), folder))) {
    fs.mkdirSync(path.join(process.cwd(), folder));
  }

  // console.log(`Creating migration file at ${migrationFilePath}`);
  fs.writeFileSync(
    migrationFilePath,
    isTest ? generateTestTemplate() : migrationTemplate
  );

  return migrationFilePath;
}
