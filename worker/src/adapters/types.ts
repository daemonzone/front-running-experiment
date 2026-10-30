import type { Page } from 'playwright';
import type { Registrar } from '../db.js';

export interface SearchResult { siteSaysAvailable: boolean | null; notes?: string }
export interface CartResult { confirmed: boolean; notes?: string }

/**
 * One adapter per registrar website. Rows in `registrars` select an adapter through
 * `adapter_key`. A registrar with adapter_key = 'generic' only needs a URL template.
 */
export interface Adapter {
  search(page: Page, domain: string, registrar: Registrar): Promise<SearchResult>;
  addToCart?(page: Page, domain: string): Promise<CartResult>;
  clearCart?(page: Page): Promise<boolean>;
}
