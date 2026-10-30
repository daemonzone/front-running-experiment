import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Whitelisted tables only. rdap_checks.raw is excluded to keep the CSV compact.
const queries: Record<string, string> = {
  name_candidates: `SELECT to_char(c.cohort, 'YYYY-MM') AS cohort, c.name, c.outcome, c.http_status, c.rdap_url, c.checked_at,
                           d.assigned_action AS action, r.slug AS registrar
                      FROM name_candidates c LEFT JOIN domains d ON d.id = c.domain_id
                      LEFT JOIN registrars r ON r.id = d.assigned_registrar_id ORDER BY c.id`,
  cohort_snapshots: `SELECT to_char(s.cohort, 'YYYY-MM') AS cohort, s.taken_at, s.total_names, s.total_registered, s.sha256
                       FROM cohort_snapshots s ORDER BY s.cohort`,
  domains: `SELECT d.name, to_char(d.cohort, 'YYYY-MM') AS cohort, d.assigned_action, r.slug AS registrar, d.status, d.generated_at, d.searched_at,
                   d.registered_detected_at, d.rdap_created_at, d.rdap_registrar_name
              FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id ORDER BY d.id`,
  search_log: `SELECT d.name, s.action, r.slug AS registrar, s.outcome, s.started_at, s.finished_at, s.site_says_available,
                      s.cart_confirmed, s.manual, s.egress_ip, s.screenshot_sha256, s.error
                 FROM search_log s JOIN domains d ON d.id = s.domain_id LEFT JOIN registrars r ON r.id = s.registrar_id ORDER BY s.id`,
  rdap_checks: `SELECT d.name, c.checked_at, c.http_status, c.registered, c.registrar_name, c.created_at_rdap, c.error
                  FROM rdap_checks c JOIN domains d ON d.id = c.domain_id ORDER BY c.id`,
};

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const table = new URL(req.url).searchParams.get('table') ?? '';
  const sql = queries[table];
  if (!sql) return new Response('unknown table', { status: 400 });
  const rows = await q(sql);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${table}.csv"` },
  });
}
