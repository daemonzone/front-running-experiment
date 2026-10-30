import { makeCartAdapter } from './helpers.js';

export const namecheap = makeCartAdapter({
  cartUrl: 'https://www.namecheap.com/cart/',
  addToCart: /add to cart|^add$/i,
  confirm: /added to (your )?cart|in your cart|view cart|checkout|your cart/i,
  remove: /remove|delete|empty cart/i,
});
