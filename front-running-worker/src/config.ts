const int = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://frontrunning:frontrunning@localhost:15432/frontrunning',
  dataDir: process.env.DATA_DIR ?? './data',
  headless: (process.env.HEADLESS ?? 'true') !== 'false',
  locale: process.env.BROWSER_LOCALE ?? 'en-US',
  // Naming
  // Monthly cohort: this many names for EVERY (registrar, action) group, and for the control group.
  namesPerArm: int(process.env.NAMES_PER_ARM, 5),
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
  // 1st of every month: consolidate the previous month first, then generate the new cohort.
  cronConsolidate: process.env.CRON_CONSOLIDATE ?? '0 5 1 * *',
  cronGenerate: process.env.CRON_GENERATE ?? '10 5 1 * *',
};
