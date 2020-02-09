export async function upgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(`
    INSERT INTO TEST VALUES (?, ?);
  `, [10, 'Test-10']);
}

export async function downgrade(queryFn: (query: string, values?: any[]) => Promise<Array<any>>) {
  await queryFn(`
    DELETE FROM TEST WHERE ID = ?;
  `, [10]);
}
