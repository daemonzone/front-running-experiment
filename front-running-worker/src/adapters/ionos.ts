import { makeCartAdapter } from './helpers.js';

export const ionos = makeCartAdapter({
  cartUrl: 'https://www.ionos.com/cart',
  addToCart: /add to cart|^add$|^select$/i,
  confirm: /added to (your )?cart|in your cart|continue to cart|view cart|shopping cart/i,
  remove: /remove|delete|empty (shopping )?cart/i,
});
