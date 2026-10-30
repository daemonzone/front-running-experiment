// Brand-like pseudo-word generator (think "kleoshq", "vantora", "zelkio").
import { randomInt } from 'node:crypto';

const pick = <T>(a: readonly T[]): T => a[randomInt(a.length)];

const onsets = ['b','br','c','cl','cr','d','dr','f','fl','g','gl','h','j','k','kl','kr','l','m','n','p','pl','pr','qu','r','s','sk','sl','sp','st','t','tr','v','w','z','zh','sh','th'];
const vowels = ['a','e','i','o','u','ae','io','eo','ia','ou','ee','oa'];
const codas = ['', '', '', 'n','r','s','l','x','k','m','t','sh','nd','rk','lt'];
const endings = ['a','o','io','ix','ly','ora','ify','era','ium','ex','ora','is','on','ara','eo','ova','ino'];

function word(): string {
  const style = randomInt(4);
  const syll = () => pick(onsets) + pick(vowels) + pick(codas);
  switch (style) {
    case 0: return syll() + pick(endings);
    case 1: return pick(onsets) + pick(vowels) + pick(onsets) + pick(endings);
    case 2: return syll() + syll();
    default: return pick(onsets) + pick(vowels) + pick(['sh','q','x','z','k']) + pick(['q','x','hq','z','k','ly','io']);
  }
}

export function generateLabel(): string {
  for (;;) {
    const w = word().replace(/[^a-z]/g, '');
    if (w.length >= 6 && w.length <= 10 && !/(.)\1\1/.test(w)) return w;
  }
}

export function weightedTld(weights: { tld: string; weight: number }[]): string {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const w of weights) { if ((r -= w.weight) < 0) return w.tld; }
  return weights[0].tld;
}
