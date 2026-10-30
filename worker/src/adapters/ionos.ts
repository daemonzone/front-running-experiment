import { makeCartAdapter } from './helpers.js';

export const ionos = makeCartAdapter({
  typed: {
    homeUrl: 'https://www.ionos.com/domains',
    input: (page) => page.locator('input[data-testid="checker-input-field"]:visible'),
    submit: (page) => page.locator('button[data-testid="checker-submit-button"]:visible'),
  },
  cartUrl: 'https://www.ionos.com/cart',
  addToCart: /add to cart|^add$|^select$/i,
  confirm: /added to (your )?cart|in your cart|continue to cart|view cart|shopping cart/i,
  // After "add", IONOS shows its checkout flow ("Your selection") with the domain and a Remove button.
  confirmCheck: async (page, domain) => {
    const removeShown = await page.getByRole('button', { name: /remove/i }).first().isVisible({ timeout: 8000 }).catch(() => false);
    const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).toLowerCase();
    return removeShown && text.includes(domain.toLowerCase());
  },
  remove: /remove|delete|empty (shopping )?cart/i,
});
