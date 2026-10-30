import pg from 'pg';

// DATE columns (cohort months) must stay plain 'YYYY-MM-DD' strings: the default parser turns them
// into local-midnight Dates, which shift to the previous day/month when read in UTC.
pg.types.setTypeParser(1082, (v: string) => v);

const g = globalThis as unknown as { pool?: pg.Pool };

export const pool =
  g.pool ??
  (g.pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    // Neon requires TLS; local docker postgres does not. Use sslmode in DATABASE_URL.
  }));

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query<T>(text, params)).rows;
}
