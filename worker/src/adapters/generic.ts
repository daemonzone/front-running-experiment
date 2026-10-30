import type { Adapter } from './types.js';
import { openAndSearch } from './helpers.js';

/** No-code adapter: opens registrars.search_url_template. Search-only. */
export const generic: Adapter = {
  search: (page, domain, registrar) => openAndSearch(page, registrar, domain),
};
