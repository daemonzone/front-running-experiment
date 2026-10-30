import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });

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
