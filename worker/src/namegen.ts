// Brand-style name generator: names are assembled from real words and roots (see words.ts),
// so they read like names people actually search for ("kleoshq", "harborlane", "neocedar").
import { randomInt } from 'node:crypto';
import { blocklist, endings, prefixes, roots, shorts, suffixes } from './words.js';

const pick = <T>(a: readonly T[]): T => a[randomInt(a.length)];

export type Pattern = 'root+suffix' | 'prefix+root' | 'word+word' | 'root+ending';

export interface GeneratedName {
  label: string;      // the part before the TLD, e.g. 'kleoshq'
  pattern: Pattern;
  parts: string[];    // the pieces it was built from
  recipe: string;     // human-readable, stored with the candidate: 'root+suffix: kleos + hq'
}

const MIN_LEN = 5;
const MAX_LEN = 11;

/** Pattern weights: roughly 40% root+suffix, 30% word+word, 15% prefix+root, 15% root+ending. */
const patterns: [Pattern, number][] = [['root+suffix', 40], ['word+word', 30], ['prefix+root', 15], ['root+ending', 15]];

function pickPattern(): Pattern {
  let r = randomInt(100);
  for (const [p, w] of patterns) { if ((r -= w) < 0) return p; }
  return 'root+suffix';
}

function build(pattern: Pattern): string[] {
  switch (pattern) {
    case 'root+suffix': return [pick(roots), pick(suffixes)];
    case 'prefix+root': return [pick(prefixes), pick(roots)];
    case 'word+word': return [pick(shorts), pick(shorts)];
    case 'root+ending': return [pick(roots), pick(endings)];
  }
}

function acceptable(parts: string[]): boolean {
  const label = parts.join('');
  if (!/^[a-z]+$/.test(label)) return false;
  if (label.length < MIN_LEN || label.length > MAX_LEN) return false;
  if (/(.)\1\1/.test(label)) return false;                                  // no triple letters
  if (parts.length === 2 && parts[0] === parts[1]) return false;             // 'sparkspark'
  if (parts[0].slice(-1) === parts[1][0]) return false;                      // awkward junction: 'moon'+'nest'
  if (blocklist.some((b) => label.includes(b))) return false;
  return true;
}

export function generateName(): GeneratedName {
  for (;;) {
    const pattern = pickPattern();
    const parts = build(pattern);
    if (acceptable(parts)) return { label: parts.join(''), pattern, parts, recipe: `${pattern}: ${parts.join(' + ')}` };
  }
}

/** Kept for callers that only need the label. */
export const generateLabel = () => generateName().label;

export function weightedTld(weights: { tld: string; weight: number }[]): string {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const w of weights) { if ((r -= w.weight) < 0) return w.tld; }
  return weights[0].tld;
}
