import { makeCartAdapter } from './helpers.js';

export const namecheap = makeCartAdapter({
  typed: {
    homeUrl: 'https://www.namecheap.com/domains/',
    input: (page) => page.locator('input:visible[type="search"], input:visible[placeholder*="domain" i], input:visible[placeholder*="search" i], input:visible[name*="domain" i], input:visible[aria-label*="domain" i]'),
    submit: (page) => page.getByRole('button', { name: /search|check|find/i }),
  },
  cartUrl: 'https://www.namecheap.com/cart/',
  addToCart: /add to cart|^add$/i,
  confirm: /added to (your )?cart|in your cart|view cart|checkout|your cart/i,
  remove: /remove|delete|empty cart/i,
});
