export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(`
    INSERT INTO TEST VALUES (1, 'Test');
  `);
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(`
    DELETE FROM TEST WHERE ID = 1;
  `);
}