const int = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://frontrunning:frontrunning@localhost:5432/frontrunning',
  dataDir: process.env.DATA_DIR ?? './data',
  headless: (process.env.HEADLESS ?? 'true') !== 'false',
  locale: process.env.BROWSER_LOCALE ?? 'en-US',
  // Naming
  generateBatchSize: int(process.env.GENERATE_BATCH_SIZE, 40),
  tldWeights: (process.env.TLD_WEIGHTS ?? 'com:90,net:5,org:5')
    .split(',')
    .map((p) => p.split(':'))
    .map(([tld, w]) => ({ tld: tld.trim(), weight: Number(w) })),
  // Pacing: deliberately slow, a handful of searches per day, like a person would do.
  searchesPerRun: int(process.env.SEARCHES_PER_RUN, 3),
  minDelaySec: int(process.env.MIN_DELAY_SEC, 90),
  maxDelaySec: int(process.env.MAX_DELAY_SEC, 420),
  // Monitoring
  monitorDays: int(process.env.MONITOR_DAYS, 90),
  rdapDelayMs: int(process.env.RDAP_DELAY_MS, 1500),
  // Cron expressions (container timezone is TZ)
  cronSearch: process.env.CRON_SEARCH ?? '17 9-20/3 * * *', // 09:17, 12:17, 15:17, 18:17
  cronMonitor: process.env.CRON_MONITOR ?? '30 6 * * *', // daily 06:30
  cronGenerate: process.env.CRON_GENERATE ?? '', // empty = disabled, use `generate` CLI manually
};
