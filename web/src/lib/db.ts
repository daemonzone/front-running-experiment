import pg from 'pg';

// DATE columns (cohort months) must stay plain 'YYYY-MM-DD' strings: the default parser turns them
// into local-midnight Dates, which shift to the previous day/month when read in UTC.
pg.types.setTypeParser(1082, (v: string) => v);

const g = globalThis as unknown as { pool?: pg.Pool };

// DATABASE_URL normally. DB_TARGET=neon (with NEON_DATABASE_URL) points a local/Docker run at Neon.
function databaseUrl(): string | undefined {
  const raw = process.env.DB_TARGET === 'neon' ? process.env.NEON_DATABASE_URL : process.env.DATABASE_URL;
  if (!raw) return raw;
  try { const u = new URL(raw); u.searchParams.delete('channel_binding'); return u.toString(); } catch { return raw; }
}

export const pool =
  g.pool ??
  (g.pool = new pg.Pool({
    connectionString: databaseUrl(),
    max: 5,
    // Neon requires TLS; local docker postgres does not. Use sslmode in DATABASE_URL.
  }));

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query<T>(text, params)).rows;
}
