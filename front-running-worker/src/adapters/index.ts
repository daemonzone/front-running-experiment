import type { Adapter } from './types.js';
import { generic } from './generic.js';
import { godaddy } from './godaddy.js';
import { ionos } from './ionos.js';
import { namecheap } from './namecheap.js';

// To add a registrar with custom behaviour: create adapters/<name>.ts, register it here,
// then INSERT a row into `registrars` with adapter_key = '<name>'.
const adapters: Record<string, Adapter> = { namecheap, godaddy, ionos, generic };

export function getAdapter(key: string): Adapter {
  const a = adapters[key];
  if (!a) throw new Error(`unknown adapter_key "${key}"`);
  return a;
}
