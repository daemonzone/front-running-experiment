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
  remove: /remove|delete|empty cart/i,
});
