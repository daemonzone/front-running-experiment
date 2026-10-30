import type { Page } from 'playwright';
import type { Registrar } from '../db.js';
import type { Adapter, CartResult, SearchResult } from './types.js';

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
    if (await btn.isVisible({ timeout: 1500 })) await btn.click({ timeout: 2000 });
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
  await page.goto(urlFor(registrar, domain), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await dismissConsent(page);
  await humanPause(1500, 3500); // time to "read" the results
  return { siteSaysAvailable: await detectAvailability(page, domain) };
}

export interface CartAdapterOptions {
  cartUrl: string;
  addToCart: RegExp;
  confirm: RegExp;
  remove: RegExp;
}

/** Click "Add to cart" in the result row that contains the domain, then look for a confirmation. */
export function makeCartAdapter(opts: CartAdapterOptions): Adapter {
  return {
    async search(page, domain, registrar) {
      return openAndSearch(page, registrar, domain);
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
        return { confirmed: false, notes: 'add-to-cart button not found (selectors need tuning?)' };
      }
      await humanPause(600, 1500);
      await button.click({ timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await humanPause(1500, 3000);

      const body = (await page.evaluate(() => document.body.innerText).catch(() => '')).toLowerCase();
      const confirmed = opts.confirm.test(body) || page.url().toLowerCase().includes('cart');
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
