export async function upgrade(
  queryFn: (query: string, values?: any[]) => Promise<Array<any>>
) {
  await queryFn(`
    INSERT INTO STRICT_TEST VALUES (1, 'Test');
  `);
}

export async function downgrade(
  queryFn: (query: string, values?: any[]) => Promise<Array<any>>
) {
  await queryFn(`
    DELETE FROM STRICT_TEST WHERE ID = 1;
  `);
}
