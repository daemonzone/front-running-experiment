// Server-side RDAP lookup for the case study (cached for an hour so the page stays fast and polite).
export interface RdapInfo {
  url: string;
  registered: boolean;
  registeredAt: string | null;
  lastChanged: string | null;
  registrar: string | null;
  registrarIana: number | null;
  nameservers: string[];
}

// Next.js extends fetch() with `next.revalidate`; declare it so this file typechecks on its own.
type CachedInit = RequestInit & { next?: { revalidate: number } };
const cachedFetch = (url: string, init: CachedInit) => fetch(url, init);

async function rdapBase(tld: string): Promise<string | null> {
  const res = await cachedFetch('https://data.iana.org/rdap/dns.json', { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const json = (await res.json()) as { services: [string[], string[]][] };
  for (const [tlds, urls] of json.services) {
    if (tlds.map((t) => t.toLowerCase()).includes(tld)) {
      const u = urls.find((x) => x.startsWith('https://')) ?? urls[0];
      return u.endsWith('/') ? u : u + '/';
    }
  }
  return null;
}

export async function fetchRdap(domain: string): Promise<RdapInfo | null> {
  try {
    const base = await rdapBase(domain.split('.').pop()!.toLowerCase());
    if (!base) return null;
    const url = `${base}domain/${domain}`;
    const res = await cachedFetch(url, { headers: { accept: 'application/rdap+json' }, next: { revalidate: 3600 } });
    if (res.status === 404) return { url, registered: false, registeredAt: null, lastChanged: null, registrar: null, registrarIana: null, nameservers: [] };
    if (!res.ok) return null;
    const j: any = await res.json();
    const ev = (a: string) => (j.events ?? []).find((e: any) => e.eventAction === a)?.eventDate ?? null;
    const ent = (j.entities ?? []).find((e: any) => (e.roles ?? []).includes('registrar'));
    const iana = (ent?.publicIds ?? []).find((p: any) => /IANA/i.test(p.type))?.identifier;
    return {
      url,
      registered: true,
      registeredAt: ev('registration'),
      lastChanged: ev('last changed'),
      registrar: ent?.vcardArray?.[1]?.find((p: any[]) => p[0] === 'fn')?.[3] ?? null,
      registrarIana: iana ? Number(iana) : null,
      nameservers: (j.nameservers ?? []).map((n: any) => String(n.ldhName).toLowerCase()),
    };
  } catch {
    return null;
  }
}
