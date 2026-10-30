import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { getAdapter } from '../adapters/index.js';
import { config } from '../config.js';
import { q, type DomainRow, type Registrar } from '../db.js';
import { createLogger, isDebug, type Logger } from '../logger.js';
import { sleep } from '../rdap.js';

/** Launch the browser: the real Chrome if BROWSER_CHANNEL=chrome, otherwise Playwright's Chromium. */
export async function launchBrowser(log: Logger): Promise<Browser> {
  try {
    const browser = await chromium.launch({ headless: config.headless, channel: config.browserChannel });
    log.info('browser ready', { browser: config.browserChannel ?? 'chromium (bundled)', version: browser.version(), headless: config.headless });
    if (config.headless) log.warn('headless browsers identify themselves as HeadlessChrome; use --chrome (or --headed) for real searches');
    return browser;
  } catch (e) {
    const msg = (e as Error).message;
    if (config.browserChannel === 'chrome') {
      throw new Error(`could not launch Google Chrome (${msg.split('\n')[0]}). Is it installed? macOS: /Applications/Google Chrome.app. Without it, unset BROWSER_CHANNEL to use Playwright's Chromium (npx playwright install chromium).`);
    }
    throw e;
  }
}

const clearCart = (process.env.CLEAR_CART ?? 'false') === 'true';

async function egressIp(): Promise<string | null> {
  try { return (await (await fetch('https://api.ipify.org')).text()).trim(); } catch { return null; }
}

const statePath = (slug: string) => path.join(config.dataDir, 'state', `${slug}.json`);

/** Browser-level detail, only with --verbose / LOG_LEVEL=debug. */
function traceBrowser(page: Page, log: Logger) {
  page.on('response', (r) => {
    if (r.request().resourceType() === 'document') log.debug('document response', { status: r.status(), url: r.url().slice(0, 140) });
  });
  page.on('requestfailed', (r) => {
    const reason = r.failure()?.errorText;
    if (reason !== 'net::ERR_ABORTED') log.debug('request failed', { url: r.url().slice(0, 120), reason }); // aborted = harmless prefetch cancellations
  });
  page.on('console', (m) => { if (m.type() === 'error') log.debug('browser console error', { text: m.text().slice(0, 160) }); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) log.debug('navigated', { url: f.url().slice(0, 140) }); });
}

/** Screenshot of a failed attempt: the quickest way to see why a selector didn't match. */
async function failureShot(page: Page, d: DomainRow, log: Logger): Promise<string | null> {
  try {
    const dir = path.join(config.dataDir, 'screenshots', 'errors');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${d.name}-${Date.now()}.png`);
    await page.screenshot({ path: file });
    log.info('failure screenshot saved', { file, url: page.url().slice(0, 140), title: await page.title().catch(() => '') });
    return file;
  } catch { return null; }
}

async function runOne(browser: Browser, d: DomainRow, r: Registrar, ip: string | null, base: Logger): Promise<boolean> {
  const log = base.child(d.name);
  const t0 = Date.now();
  const adapter = getAdapter(r.adapter_key);
  const action = d.assigned_action;
  if (action === 'search_cart' && !adapter.addToCart) throw new Error(`${r.slug} adapter has no cart support`);

  const [{ n: prior }] = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM search_log WHERE domain_id = $1 AND outcome = 'error'`, [d.id]);
  log.info('search start', { registrar: r.slug, action, attempt: prior + 1, of: 3 });

  const logId = (await q<{ id: number }>(
    `INSERT INTO search_log (domain_id, registrar_id, action, outcome, egress_ip)
     VALUES ($1,$2,$3,'error',$4) RETURNING id`, [d.id, r.id, action, ip])
  )[0].id;

  // Anonymous registrars get a fresh visitor each time; login-only ones reuse the saved session.
  const useState = r.requires_login && existsSync(statePath(r.slug));
  log.debug('new browser context', { locale: config.locale, saved_session: useState });
  const context = await browser.newContext({
    locale: config.locale,
    viewport: { width: 1366, height: 850 },
    ...(useState ? { storageState: statePath(r.slug) } : {}),
  });
  const page = await context.newPage();
  if (isDebug()) traceBrowser(page, log);

  try {
    const ua = await page.evaluate(() => navigator.userAgent);
    log.debug('user agent', { ua });

    log.info('step: opening search page', { registrar: r.slug });
    const s = await adapter.search(page, d.name, r);
    log.info('step: search done', { site_says_available: s.siteSaysAvailable ?? 'unknown', title: await page.title().catch(() => '') });
    let cartConfirmed: boolean | null = null;
    let cartCleared: boolean | null = null;
    let notes = s.notes ?? null;

    if (action === 'search_cart') {
      log.info('step: adding to cart');
      const c = await adapter.addToCart!(page, d.name);
      cartConfirmed = c.confirmed;
      notes = [notes, c.notes].filter(Boolean).join('; ') || null;
      log.info('step: cart result', { confirmed: c.confirmed, notes: c.notes });
      if (clearCart && adapter.clearCart) {
        cartCleared = await adapter.clearCart(page);
        log.info('step: cart cleared', { cleared: cartCleared });
      }
    }

    const shotDir = path.join(config.dataDir, 'screenshots');
    await mkdir(shotDir, { recursive: true });
    const shot = path.join(shotDir, `${d.name}-${action}-${Date.now()}.png`);
    const buf = await page.screenshot({ path: shot });
    const sha = createHash('sha256').update(buf).digest('hex');
    log.info('screenshot saved', { file: shot, sha256: sha.slice(0, 16) });

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
      log.info('SEARCH OK, now monitoring', { registrar: r.slug, action, ms: Date.now() - t0, monitor_days: config.monitorDays });
    } else {
      await failureShot(page, d, log);
      log.warn('search NOT counted: cart add unconfirmed, will retry', { registrar: r.slug, notes, ms: Date.now() - t0 });
    }
    if (r.requires_login) await context.storageState({ path: statePath(r.slug) });
    return valid;
  } catch (e) {
    await q(`UPDATE search_log SET finished_at = now(), error = $2 WHERE id = $1`, [logId, (e as Error).message]);
    log.error('search failed', { registrar: r.slug, action, error: (e as Error).message, ms: Date.now() - t0 });
    log.debug('stack', { stack: (e as Error).stack });
    await failureShot(page, d, log);
    return false;
  } finally {
    await context.close();
  }
}

/** Say WHY there is nothing to search, and what to do about it. */
async function explainNothingToSearch(log: Logger, limit: number) {
  const byStatus = await q<{ status: string; n: number }>(`SELECT status::text AS status, COUNT(*)::int AS n FROM domains GROUP BY 1`);
  const total = byStatus.reduce((s, r) => s + r.n, 0);
  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r.n]));
  if (total === 0) {
    log.warn('nothing to search: no names exist yet. Run `generate` first, or `run`, which generates and then searches', { hint: 'cli generate' });
  } else if (limit === 0) {
    log.info('limit is 0, nothing attempted');
  } else if (counts.pending_search) {
    log.info('nothing selected this run', counts);
  } else {
    log.info('nothing to search: every name has already been searched (or failed). Wait for the next monthly cohort, or run `generate <YYYY-MM>`', counts);
  }
}

/** Wait with a progress line every 30 s, so a long human-like pause doesn't look like a hang. */
async function pause(seconds: number, log: Logger) {
  let left = Math.round(seconds);
  while (left > 0) {
    const step = Math.min(30, left);
    await sleep(step * 1000);
    left -= step;
    if (left > 0) log.info('still waiting', { seconds_left: left });
  }
}

export interface SearchOptions {
  registrar?: string;   // only names assigned to this registrar slug
  action?: string;      // search_only | search_cart
  domain?: string;      // one specific name
  exclude?: string;     // comma-separated registrar slugs to skip
  dryRun?: boolean;     // list what would be searched, don't open a browser
}

/** Process up to `limit` pending domains, with long random pauses between them. */
export async function search(
  limit = config.searchesPerRun,
  log: Logger = createLogger('search'),
  opts: SearchOptions = {},
): Promise<Record<string, unknown>> {
  if (opts.action && !['search_only', 'search_cart'].includes(opts.action)) {
    throw new Error(`--action must be search_only or search_cart, got "${opts.action}"`);
  }
  if (opts.registrar) {
    const [known] = await q('SELECT 1 FROM registrars WHERE slug = $1', [opts.registrar]);
    if (!known) throw new Error(`unknown registrar "${opts.registrar}"`);
  }
  const filters = { registrar: opts.registrar, action: opts.action, domain: opts.domain?.toLowerCase(), exclude: opts.exclude };
  if (opts.registrar || opts.action || opts.domain || opts.exclude) log.info('filters', filters);

  // Give up on domains that already failed 3 times, so a broken adapter doesn't loop forever.
  const gaveUp = await q(`UPDATE domains d SET status = 'failed' WHERE status = 'pending_search'
             AND (SELECT COUNT(*) FROM search_log s WHERE s.domain_id = d.id AND s.outcome = 'error') >= 3 RETURNING name`);
  if (gaveUp.length) log.warn('gave up after 3 failed attempts', { domains: gaveUp.map((g: any) => g.name).join(',') });

  const [{ pending }] = await q<{ pending: number }>(`SELECT COUNT(*)::int AS pending FROM domains WHERE status = 'pending_search'`);
  const rows = await q<DomainRow>(
    `SELECT d.id, d.name, d.label, d.tld, d.assigned_action, d.assigned_registrar_id
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
      WHERE d.status = 'pending_search'
        AND ($2::text IS NULL OR r.slug = $2)
        AND ($3::text IS NULL OR d.assigned_action::text = $3)
        AND ($4::text IS NULL OR d.name = $4)
        AND ($5::text IS NULL OR r.slug <> ALL (string_to_array($5, ',')))
      ORDER BY random() LIMIT $1`,
    [limit, filters.registrar ?? null, filters.action ?? null, filters.domain ?? null, filters.exclude ?? null]);
  log.info('pending searches', { pending, this_run: rows.length, limit });

  if (opts.dryRun) {
    for (const d of rows) log.info('DRY RUN would search', { domain: d.name, action: d.assigned_action, registrar_id: d.assigned_registrar_id });
    log.info('dry run: no browser opened, nothing changed');
    return { pending, dry_run: true, would_search: rows.length };
  }
  if (!rows.length) {
    await explainNothingToSearch(log, limit);
    return { pending, attempted: 0, ok: 0, failed: 0 };
  }

  const registrars = await q<Registrar>('SELECT * FROM registrars WHERE enabled');
  const ip = await egressIp();
  log.info('launching browser', { channel: config.browserChannel ?? 'chromium', headless: config.headless, egress_ip: ip ?? 'unknown', locale: config.locale });
  const browser = await launchBrowser(log);
  let ok = 0, failed = 0;
  try {
    for (let i = 0; i < rows.length; i++) {
      const d = rows[i];
      const r = registrars.find((x) => x.id === d.assigned_registrar_id);
      if (!r) { log.warn('skipped: registrar disabled or missing', { domain: d.name }); failed++; continue; }
      if (i > 0) {
        const wait = config.minDelaySec + Math.random() * (config.maxDelaySec - config.minDelaySec);
        log.info('pausing like a human would', { seconds: Math.round(wait), next: i + 1, of: rows.length });
        await pause(wait, log);
      }
      (await runOne(browser, d, r, ip, log)) ? ok++ : failed++;
    }
  } finally {
    await browser.close();
    log.debug('browser closed');
  }
  return { pending, attempted: rows.length, ok, failed };
}

/** Interactive: open a headed browser, let the user log in, save the session. (Run on the host.) */
export async function login(slug: string): Promise<void> {
  const [r] = await q<Registrar>('SELECT * FROM registrars WHERE slug = $1', [slug]);
  if (!r) throw new Error(`unknown registrar ${slug}`);
  const browser = await chromium.launch({ headless: false, channel: config.browserChannel });
  const context = await browser.newContext({ locale: config.locale, viewport: { width: 1366, height: 850 } });
  const page = await context.newPage();
  await page.goto(r.search_url_template?.split('{')[0] || 'about:blank');
  console.log(`Log in to ${r.name} in the opened window, then press Enter here to save the session...`);
  await new Promise<void>((res) => process.stdin.once('data', () => res()));
  await mkdir(path.dirname(statePath(slug)), { recursive: true });
  await writeFile(statePath(slug), JSON.stringify(await context.storageState()));
  await browser.close();
  createLogger('login').info('session saved', { file: statePath(slug) });
}

/** Record a search you performed by hand (fallback when an adapter breaks). */
export async function logManual(domain: string, action: string, notes?: string, log: Logger = createLogger('log-manual')): Promise<Record<string, unknown>> {
  const [d] = await q<DomainRow>('SELECT * FROM domains WHERE name = $1', [domain.toLowerCase()]);
  if (!d) throw new Error(`unknown domain ${domain}`);
  if (action !== d.assigned_action) throw new Error(`${domain} is assigned to ${d.assigned_action}, not ${action}`);
  await q(
    `INSERT INTO search_log (domain_id, registrar_id, action, outcome, finished_at, manual, notes)
     VALUES ($1,$2,$3,'ok', now(), TRUE, $4)`, [d.id, d.assigned_registrar_id, action, notes ?? null]);
  await q(`UPDATE domains SET status = 'monitoring', searched_at = now(),
                  monitor_until = now() + make_interval(days => $2) WHERE id = $1`, [d.id, config.monitorDays]);
  log.info('manual search recorded, now monitoring', { domain, action });
  return { domain, action };
}
