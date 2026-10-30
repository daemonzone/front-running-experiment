import pg from 'pg';

// DATE columns (cohort months) must stay plain 'YYYY-MM-DD' strings: the default parser turns them
// into local-midnight Dates, which shift to the previous day/month when read in UTC.
pg.types.setTypeParser(1082, (v: string) => v);
import { config } from './config.js';

/** Neon's copy-paste connection strings may carry `channel_binding=require`, which node-postgres can't use. */
function cleanUrl(raw: string): string {
  try { const u = new URL(raw); u.searchParams.delete('channel_binding'); return u.toString(); } catch { return raw; }
}

export const pool = new pg.Pool({ connectionString: cleanUrl(config.databaseUrl), max: 4 });

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export type Action = 'search_only' | 'search_cart' | 'no_search';

export interface Registrar {
  id: number;
  slug: string;
  name: string;
  adapter_key: string;
  search_url_template: string | null;
  supports_cart: boolean;
  requires_login: boolean;
  iana_id: number | null;
  enabled: boolean;
}

export interface DomainRow {
  id: number;
  name: string;
  label: string;
  tld: string;
  assigned_action: Action;
  assigned_registrar_id: number | null;
}
