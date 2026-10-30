import { makeCartAdapter } from './helpers.js';

export const godaddy = makeCartAdapter({
  cartUrl: 'https://cart.godaddy.com/',
  addToCart: /add to cart|^select$|^add$/i,
  confirm: /added to (your )?cart|in your cart|continue to cart|view cart|your cart/i,
  remove: /remove|delete|empty cart/i,
});
