import { makeCartAdapter } from './helpers.js';

export const godaddy = makeCartAdapter({
  typed: {
    homeUrl: 'https://www.godaddy.com/domains',
    input: (page) => page.locator('input:visible[type="search"], input:visible[placeholder*="domain" i], input:visible[placeholder*="search" i], input:visible[name*="domain" i], input:visible[aria-label*="domain" i]'),
    submit: (page) => page.getByRole('button', { name: /search|check|find/i }),
  },
  cartUrl: 'https://cart.godaddy.com/',
  addToCart: /add to cart|^select$|^add$/i,
  confirm: /added to (your )?cart|in your cart|continue to cart|view cart|your cart/i,
  remove: /remove|delete|empty cart/i,
});
