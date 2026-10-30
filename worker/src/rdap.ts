// RDAP client. Uses the IANA bootstrap file to find the registry's RDAP server, so
// queries go to the registry (e.g. Verisign for .com), never to a registrar.
import { config } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('rdap');

let bootstrap: Map<string, string> | null = null;

async function loadBootstrap(): Promise<Map<string, string>> {
  if (bootstrap) return bootstrap;
  const res = await fetch('https://data.iana.org/rdap/dns.json');
  if (!res.ok) throw new Error(`IANA RDAP bootstrap failed: ${res.status}`);
  const json = (await res.json()) as { services: [string[], string[]][] };
  const map = new Map<string, string>();
  for (const [tlds, urls] of json.services) {
    const url = urls.find((u) => u.startsWith('https://')) ?? urls[0];
    for (const t of tlds) map.set(t.toLowerCase(), url.endsWith('/') ? url : url + '/');
  }
  bootstrap = map;
  return map;
}

export interface RdapResult {
  url: string;
  httpStatus: number | null;
  registered: boolean | null; // null = inconclusive (rate limit, network, 5xx)
  registrarName: string | null;
  registrarIanaId: number | null;
  createdAt: Date | null;
  nameservers: string[];
  raw: unknown;
  error: string | null;
}

function parseRegistrar(json: any): { name: string | null; iana: number | null } {
  const ent = (json.entities ?? []).find((e: any) => (e.roles ?? []).includes('registrar'));
  if (!ent) return { name: null, iana: null };
  const fn = ent.vcardArray?.[1]?.find((p: any[]) => p[0] === 'fn')?.[3] ?? null;
  const iana = (ent.publicIds ?? []).find((p: any) => /IANA/i.test(p.type))?.identifier;
  return { name: fn, iana: iana ? Number(iana) : null };
}

export async function rdapLookup(domain: string): Promise<RdapResult> {
  const t0 = Date.now();
  const r = await rdapLookupInner(domain);
  const fields = { domain, http: r.httpStatus ?? 'none', registered: r.registered ?? 'unknown', ms: Date.now() - t0 };
  if (r.error) log.warn('lookup inconclusive', { ...fields, error: r.error });
  else log.debug('lookup', r.registered ? { ...fields, registrar: r.registrarName } : fields);
  return r;
}

async function rdapLookupInner(domain: string): Promise<RdapResult> {
  const tld = domain.split('.').pop()!.toLowerCase();
  const empty: RdapResult = {
    url: '', httpStatus: null, registered: null, registrarName: null, registrarIanaId: null,
    createdAt: null, nameservers: [], raw: null, error: null,
  };
  try {
    const base = (await loadBootstrap()).get(tld);
    if (!base) return { ...empty, error: `no RDAP server for .${tld}` };
    const url = `${base}domain/${domain}`;
    const res = await fetch(url, { headers: { accept: 'application/rdap+json' }, redirect: 'follow' });
    const out: RdapResult = { ...empty, url, httpStatus: res.status };
    if (res.status === 404) return { ...out, registered: false };
    if (!res.ok) return { ...out, error: `HTTP ${res.status}` };
    const json: any = await res.json();
    const reg = parseRegistrar(json);
    const created = (json.events ?? []).find((e: any) => e.eventAction === 'registration')?.eventDate;
    return {
      ...out,
      registered: true,
      registrarName: reg.name,
      registrarIanaId: reg.iana,
      createdAt: created ? new Date(created) : null,
      nameservers: (json.nameservers ?? []).map((n: any) => String(n.ldhName).toLowerCase()),
      raw: json,
    };
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const rdapPause = () => sleep(config.rdapDelayMs);
