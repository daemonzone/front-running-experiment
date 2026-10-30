import type { Locator, Page } from 'playwright';
import { config } from '../config.js';
import type { Registrar } from '../db.js';
import { createLogger } from '../logger.js';
import type { Adapter, CartResult, SearchResult } from './types.js';

const log = createLogger('adapter');

export const humanPause = (min = 800, max = 2500) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

export function urlFor(registrar: Registrar, domain: string): string {
  if (!registrar.search_url_template) throw new Error(`registrar ${registrar.slug} has no search_url_template`);
  return registrar.search_url_template.replace('{domain}', encodeURIComponent(domain));
}

/** Dismiss a cookie banner the way an ordinary visitor would. Best effort, never throws. */
export async function dismissConsent(page: Page): Promise<void> {
  try {
    const btn = page.getByRole('button', { name: /^(accept( all)?( cookies)?|i agree|got it|allow all)$/i }).first();
    if (await btn.isVisible({ timeout: 1500 })) { await btn.click({ timeout: 2000 }); log.debug('cookie banner dismissed'); }
  } catch { /* no banner */ }
}

/** Looks at the page text around the domain name. null = could not tell. */
export async function detectAvailability(page: Page, domain: string): Promise<boolean | null> {
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  const i = text.toLowerCase().indexOf(domain.toLowerCase());
  if (i < 0) return null;
  const win = text.slice(Math.max(0, i - 200), i + 400).toLowerCase();
  if (/(unavailable|not available|taken|already registered|is registered|make offer|backorder)/.test(win)) return false;
  if (/(available|add to cart|congratulations|get it)/.test(win)) return true;
  return null;
}

export async function openAndSearch(page: Page, registrar: Registrar, domain: string): Promise<SearchResult> {
  const url = urlFor(registrar, domain);
  log.debug('goto', { url });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => log.debug('network not idle after 20s, continuing'));
  await dismissConsent(page);
  await humanPause(1500, 3500); // time to "read" the results
  const available = await detectAvailability(page, domain);
  log.debug('availability heuristic', { domain, available: available ?? 'unknown' });
  return { siteSaysAvailable: available };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (min: number, max: number) => min + Math.random() * (max - min);

/** How to find the search box and its button on a registrar's landing page. */
export interface TypedSearchConfig {
  homeUrl: string;                              // page with the domain search box
  input: (page: Page) => Locator;               // the search box
  submit?: (page: Page, input: Locator) => Locator; // the search button (given the box we typed in); Enter is pressed if omitted
}

// A challenge can be completed by a person (a checkbox, an automatic check). A block cannot: the site has refused.
const CHALLENGE_TITLE = /just a moment|attention required|verify you are human|security check/i;
const CHALLENGE_BODY = /performing security verification|are you a (robot|human)|verify you are human|checking your browser/i;
const BLOCK_TITLE = /^\s*access denied/i;
const BLOCK_BODY = /you don'?t have permission to access|access to this page has been denied|request blocked/i;

async function onBlockPage(page: Page): Promise<boolean> {
  const title = await page.title().catch(() => '');
  if (BLOCK_TITLE.test(title)) return true;
  const body = await page.evaluate(() => document.body?.innerText.slice(0, 300) ?? '').catch(() => '');
  return BLOCK_BODY.test(body);
}

async function onChallengePage(page: Page): Promise<boolean> {
  const title = await page.title().catch(() => '');
  if (CHALLENGE_TITLE.test(title)) return true;
  const body = await page.evaluate(() => document.body?.innerText.slice(0, 400) ?? '').catch(() => '');
  return CHALLENGE_BODY.test(body);
}

/**
 * Registrars sometimes show a security check before the page. We never try to get around it: in a
 * visible window we wait (up to 3 min) for the person watching to complete it; headless, we stop.
 */
async function waitOutChallenge(page: Page): Promise<void> {
  if (await onBlockPage(page)) {
    throw new Error(`the site blocked this browser ("${await page.title().catch(() => '')}" at ${page.url().slice(0, 90)}); nothing to complete here. Search this name by hand and record it with log-manual`);
  }
  if (!(await onChallengePage(page))) return;
  if (config.headless) throw new Error(`security check page shown (title "${await page.title()}"); headless runs can't complete it. Use --chrome and complete it in the window`);
  log.warn('SECURITY CHECK shown by the site: complete it in the browser window (waiting up to 3 minutes)', { url: page.url().slice(0, 100) });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await wait(2000);
    if (!(await onChallengePage(page))) { log.info('security check passed'); await page.waitForLoadState('domcontentloaded').catch(() => {}); return; }
  }
  throw new Error('security check was not completed within 3 minutes');
}

/** Type like a person: letter by letter with uneven timing and the occasional hesitation. */
async function typeLikeAPerson(page: Page, text: string) {
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i]);
    await wait(rnd(70, 190));
    if (i > 1 && Math.random() < 0.18) await wait(rnd(180, 420)); // a small hesitation
  }
}

/** Move the mouse to an element in a few steps and click it. */
async function mouseClick(page: Page, el: Locator) {
  const box = await el.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * rnd(0.25, 0.75), box.y + box.height * rnd(0.3, 0.7), { steps: Math.round(rnd(12, 28)) });
    await wait(rnd(120, 360));
  }
  await el.click({ timeout: 10_000 });
}

/**
 * The human flow: open the registrar's page, click the search box, type the name letter by letter,
 * press the search button. Returns what the results page seems to say about availability.
 */
export async function typeAndSearch(page: Page, domain: string, cfg: TypedSearchConfig): Promise<SearchResult> {
  log.info('opening the registrar page', { url: cfg.homeUrl });
  await page.goto(cfg.homeUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => log.debug('network not idle after 20s, continuing'));
  await waitOutChallenge(page);
  await dismissConsent(page);
  await humanPause(1500, 3200); // look at the page first

  const input = cfg.input(page).first();
  try {
    await input.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    throw new Error(`search box not found on ${page.url().slice(0, 100)} (selectors need tuning)`);
  }
  log.info('clicking the search box');
  await mouseClick(page, input);
  await input.fill('');                         // clear anything pre-filled
  await humanPause(300, 800);
  log.info('typing the name', { domain, letters: domain.length });
  await typeLikeAPerson(page, domain);
  await humanPause(500, 1400);                  // glance at what was typed

  const before = page.url();
  if (cfg.submit) {
    const btn = cfg.submit(page, input).first();
    log.info('pressing the search button');
    await mouseClick(page, btn);
  } else {
    log.info('pressing Enter');
    await page.keyboard.press('Enter');
  }

  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => log.debug('network not idle after 25s, continuing'));
  await waitOutChallenge(page);
  await humanPause(2000, 4000);                 // time to read the results
  log.info('results page', { url: page.url().slice(0, 140), changed: page.url() !== before, title: await page.title().catch(() => '') });
  // A search only counts if the results page actually shows the name. Without this, pressing the wrong
  // button (e.g. a site-wide search) would be recorded as a successful search.
  const shown = (await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')).toLowerCase().includes(domain.toLowerCase());
  if (!shown) {
    throw new Error(`the results for ${domain} are not on the page (title "${await page.title().catch(() => '')}", url unchanged: ${page.url() === before}); the search was probably not submitted`);
  }
  const available = await detectAvailability(page, domain);
  log.info('availability as the page shows it', { domain, available: available ?? 'unknown' });
  return { siteSaysAvailable: available };
}

export interface CartAdapterOptions {
  typed: TypedSearchConfig;
  cartUrl: string;
  addToCart: RegExp;
  confirm: RegExp;
  /** Registrar-specific proof that the name is really in the cart; replaces the text/URL heuristic. */
  confirmCheck?: (page: Page, domain: string) => Promise<boolean>;
  remove: RegExp;
}

/** Click "Add to cart" in the result row that contains the domain, then look for a confirmation. */
export function makeCartAdapter(opts: CartAdapterOptions): Adapter {
  return {
    async search(page, domain) {
      return typeAndSearch(page, domain, opts.typed);
    },

    async addToCart(page, domain): Promise<CartResult> {
      const row = page
        .getByText(domain, { exact: false })
        .first()
        .locator('xpath=ancestor::*[.//button or .//a[@role="button"]][1]');
      let button = row.getByRole('button', { name: opts.addToCart }).first();
      if (!(await button.isVisible({ timeout: 3000 }).catch(() => false))) {
        button = page.getByRole('button', { name: opts.addToCart }).first(); // fallback: first on page
      }
      if (!(await button.isVisible({ timeout: 3000 }).catch(() => false))) {
        log.warn('add-to-cart button not found', { domain, pattern: String(opts.addToCart) });
        return { confirmed: false, notes: 'add-to-cart button not found (selectors need tuning?)' };
      }
      log.debug('add-to-cart button found', { domain });
      await humanPause(600, 1500);
      await button.click({ timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await humanPause(1500, 3000);

      const body = (await page.evaluate(() => document.body.innerText).catch(() => '')).toLowerCase();
      const confirmed = opts.confirmCheck
        ? await opts.confirmCheck(page, domain)
        : opts.confirm.test(body) || page.url().toLowerCase().includes('cart');
      log.debug('cart confirmation check', { confirmed, url: page.url().slice(0, 120) });
      return { confirmed, notes: confirmed ? undefined : 'clicked, but no cart confirmation detected' };
    },

    async clearCart(page): Promise<boolean> {
      await page.goto(opts.cartUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      for (let i = 0; i < 10; i++) {
        const rm = page.getByRole('button', { name: opts.remove }).or(page.getByRole('link', { name: opts.remove })).first();
        if (!(await rm.isVisible({ timeout: 2500 }).catch(() => false))) return true;
        await rm.click().catch(() => {});
        const yes = page.getByRole('button', { name: /^(yes|confirm|remove|delete)/i }).first();
        if (await yes.isVisible({ timeout: 1000 }).catch(() => false)) await yes.click().catch(() => {});
        await humanPause(800, 1600);
      }
      return false;
    },
  };
}
