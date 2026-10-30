import { makeCartAdapter } from './helpers.js';

export const namecheap = makeCartAdapter({
  typed: {
    homeUrl: 'https://www.namecheap.com/domains/',
    // The hero form on /domains/ (the top bar's "Search" icon is a different, site-wide search).
    input: (page) => page.locator('form.gb-search--lg input[name="domain"]:visible'),
    submit: (page) => page.locator('form.gb-search--lg button[type="submit"]:visible'),
  },
  cartUrl: 'https://www.namecheap.com/cart/',
  addToCart: /add to cart|^add$/i,
  confirm: /added to (your )?cart|in your cart|view cart|checkout|your cart/i,
  // After "add", a bar appears at the bottom of the page: "1 item", "View Item", "Checkout".
  confirmCheck: async (page) => {
    const count = await page.getByText(/^\s*\d+\s+items?\s*$/i).first().isVisible({ timeout: 8000 }).catch(() => false);
    const viewItem = await page.getByText(/view item/i).first().isVisible({ timeout: 3000 }).catch(() => false);
    return count && viewItem;
  },
  remove: /remove|delete|empty cart/i,
});
