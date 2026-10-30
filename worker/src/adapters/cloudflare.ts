import type { Adapter } from './types.js';
import { detectAvailability, dismissConsent, humanPause, urlFor } from './helpers.js';

/**
 * Cloudflare Registrar needs a logged-in dashboard session (run `npm run cli -- login cloudflare`
 * on the host once; the saved session lands in data/state/cloudflare.json) and has no cart,
 * so only `search_only` is supported (supports_cart = false in the registrars table).
 */
export const cloudflare: Adapter = {
  async search(page, domain, registrar) {
    await page.goto(urlFor(registrar, domain), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    if (/login|sign-up|access/i.test(page.url())) {
      throw new Error('Cloudflare login required: run `npm run cli -- login cloudflare` on the host');
    }
    await dismissConsent(page);
    const input = page.getByRole('searchbox').or(page.getByRole('textbox')).first();
    await input.waitFor({ timeout: 15_000 });
    await humanPause(500, 1200);
    await input.click();
    await input.pressSequentially(domain, { delay: 70 + Math.random() * 90 });
    await input.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await humanPause(1500, 3500);
    return { siteSaysAvailable: await detectAvailability(page, domain) };
  },
};
