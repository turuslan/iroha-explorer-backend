import { createPool, DatabasePoolType, sql } from 'slonik';
import { PostgresContainer } from './util/postgres-container';

describe('postgres', () => {
  let postgres: PostgresContainer = null;
  let pool: DatabasePoolType = null;

  beforeAll(
    async () => {
      postgres = await PostgresContainer.create('postgres');
      pool = createPool(postgres.url.href);
    },
    30000,
  );

  afterAll(async () => {
    if (postgres) {
      await postgres.stop();
    }
  });

  test('connects', async () => {
    expect(await pool.oneFirst(sql`SELECT 1 + 1`)).toBe(2);
  });
});
