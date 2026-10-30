// One-sided Fisher exact test: P(at least `a` hits in group 1 | margins), for the 2x2 table
//            hit   no-hit
//  group 1     a     b
//  group 2     c     d
const logFact = (() => {
  const t = [0];
  return (n: number) => { for (let i = t.length; i <= n; i++) t[i] = t[i - 1] + Math.log(i); return t[n]; };
})();
const logC = (n: number, k: number) => logFact(n) - logFact(k) - logFact(n - k);

export function fisherOneSided(a: number, b: number, c: number, d: number): number {
  const n1 = a + b, n2 = c + d, hits = a + c, n = n1 + n2;
  let p = 0;
  for (let x = a; x <= Math.min(n1, hits); x++) {
    p += Math.exp(logC(n1, x) + logC(n2, hits - x) - logC(n, hits));
  }
  return Math.min(1, p);
}
