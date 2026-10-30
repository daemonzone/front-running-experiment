import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { getAdapter } from '../adapters/index.js';
import { config } from '../config.js';
import { q, type DomainRow, type Registrar } from '../db.js';
import { sleep } from '../rdap.js';

const clearCart = (process.env.CLEAR_CART ?? 'false') === 'true';

async function egressIp(): Promise<string | null> {
  try { return (await (await fetch('https://api.ipify.org')).text()).trim(); } catch { return null; }
}

const statePath = (slug: string) => path.join(config.dataDir, 'state', `${slug}.json`);

async function runOne(browser: Browser, d: DomainRow, r: Registrar, ip: string | null): Promise<void> {
  const adapter = getAdapter(r.adapter_key);
  const action = d.assigned_action;
  if (action === 'search_cart' && !adapter.addToCart) throw new Error(`${r.slug} adapter has no cart support`);

  const logId = (await q<{ id: number }>(
    `INSERT INTO search_log (domain_id, registrar_id, action, outcome, egress_ip)
     VALUES ($1,$2,$3,'error',$4) RETURNING id`, [d.id, r.id, action, ip])
  )[0].id;

  // Anonymous registrars get a fresh visitor each time; login-only ones reuse the saved session.
  const useState = r.requires_login && existsSync(statePath(r.slug));
  const context = await browser.newContext({
    locale: config.locale,
    viewport: { width: 1366, height: 850 },
    ...(useState ? { storageState: statePath(r.slug) } : {}),
  });
  const page = await context.newPage();

  try {
    const ua = await page.evaluate(() => navigator.userAgent);
    const s = await adapter.search(page, d.name, r);
    let cartConfirmed: boolean | null = null;
    let cartCleared: boolean | null = null;
    let notes = s.notes ?? null;

    if (action === 'search_cart') {
      const c = await adapter.addToCart!(page, d.name);
      cartConfirmed = c.confirmed;
      notes = [notes, c.notes].filter(Boolean).join('; ') || null;
      if (clearCart && adapter.clearCart) cartCleared = await adapter.clearCart(page);
    }

    const shotDir = path.join(config.dataDir, 'screenshots');
    await mkdir(shotDir, { recursive: true });
    const shot = path.join(shotDir, `${d.name}-${action}-${Date.now()}.png`);
    const buf = await page.screenshot({ path: shot });
    const sha = createHash('sha256').update(buf).digest('hex');

    // A search_cart whose cart add could not be confirmed is NOT a valid exposure: keep it pending.
    const valid = action !== 'search_cart' || cartConfirmed === true;
    await q(
      `UPDATE search_log SET outcome = $2, finished_at = now(), site_says_available = $3, cart_confirmed = $4,
              cart_cleared = $5, user_agent = $6, screenshot_path = $7, screenshot_sha256 = $8, notes = $9,
              error = $10 WHERE id = $1`,
      [logId, valid ? 'ok' : 'error', s.siteSaysAvailable, cartConfirmed, cartCleared, ua, shot, sha, notes,
       valid ? null : 'cart add not confirmed'],
    );
    if (valid) {
      await q(
        `UPDATE domains SET status = 'monitoring', searched_at = now(),
                monitor_until = now() + make_interval(days => $2) WHERE id = $1`,
        [d.id, config.monitorDays],
      );
      console.log(`  ✓ ${d.name} ${action} @ ${r.slug} (site says available: ${s.siteSaysAvailable})`);
    } else {
      console.log(`  ✗ ${d.name} ${action} @ ${r.slug}: ${notes}`);
    }
    if (r.requires_login) await context.storageState({ path: statePath(r.slug) });
  } catch (e) {
    await q(`UPDATE search_log SET finished_at = now(), error = $2 WHERE id = $1`, [logId, (e as Error).message]);
    console.log(`  ✗ ${d.name} ${action} @ ${r.slug}: ${(e as Error).message}`);
  } finally {
    await context.close();
  }
}

/** Process up to `limit` pending domains, with long random pauses between them. */
export async function search(limit = config.searchesPerRun): Promise<void> {
  // Give up on domains that already failed 3 times, so a broken adapter doesn't loop forever.
  await q(`UPDATE domains d SET status = 'failed' WHERE status = 'pending_search'
             AND (SELECT COUNT(*) FROM search_log s WHERE s.domain_id = d.id AND s.outcome = 'error') >= 3`);

  const rows = await q<DomainRow & { slug: string }>(
    `SELECT d.id, d.name, d.label, d.tld, d.assigned_action, d.assigned_registrar_id
       FROM domains d WHERE d.status = 'pending_search' ORDER BY random() LIMIT $1`, [limit]);
  if (!rows.length) { console.log('[search] nothing pending'); return; }

  const registrars = await q<Registrar>('SELECT * FROM registrars WHERE enabled');
  const ip = await egressIp();
  const browser = await chromium.launch({ headless: config.headless });
  console.log(`[search] ${rows.length} domains, headless=${config.headless}, ip=${ip}`);
  try {
    for (let i = 0; i < rows.length; i++) {
      const d = rows[i];
      const r = registrars.find((x) => x.id === d.assigned_registrar_id);
      if (!r) { console.log(`  skip ${d.name}: registrar disabled/missing`); continue; }
      if (i > 0) {
        const wait = config.minDelaySec + Math.random() * (config.maxDelaySec - config.minDelaySec);
        console.log(`  … waiting ${Math.round(wait)}s`);
        await sleep(wait * 1000);
      }
      await runOne(browser, d, r, ip);
    }
  } finally {
    await browser.close();
  }
}

/** Interactive: open a headed browser, let the user log in, save the session. (Run on the host.) */
export async function login(slug: string): Promise<void> {
  const [r] = await q<Registrar>('SELECT * FROM registrars WHERE slug = $1', [slug]);
  if (!r) throw new Error(`unknown registrar ${slug}`);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ locale: config.locale, viewport: { width: 1366, height: 850 } });
  const page = await context.newPage();
  await page.goto(r.search_url_template?.split('{')[0] || 'about:blank');
  console.log(`Log in to ${r.name} in the opened window, then press Enter here to save the session...`);
  await new Promise<void>((res) => process.stdin.once('data', () => res()));
  await mkdir(path.dirname(statePath(slug)), { recursive: true });
  await writeFile(statePath(slug), JSON.stringify(await context.storageState()));
  await browser.close();
  console.log(`saved ${statePath(slug)}`);
}

/** Record a search you performed by hand (fallback when an adapter breaks). */
export async function logManual(domain: string, action: string, notes?: string): Promise<void> {
  const [d] = await q<DomainRow>('SELECT * FROM domains WHERE name = $1', [domain.toLowerCase()]);
  if (!d) throw new Error(`unknown domain ${domain}`);
  if (action !== d.assigned_action) throw new Error(`${domain} is assigned to ${d.assigned_action}, not ${action}`);
  await q(
    `INSERT INTO search_log (domain_id, registrar_id, action, outcome, finished_at, manual, notes)
     VALUES ($1,$2,$3,'ok', now(), TRUE, $4)`, [d.id, d.assigned_registrar_id, action, notes ?? null]);
  await q(`UPDATE domains SET status = 'monitoring', searched_at = now(),
                  monitor_until = now() + make_interval(days => $2) WHERE id = $1`, [d.id, config.monitorDays]);
  console.log(`logged manual ${action} for ${domain}`);
}


