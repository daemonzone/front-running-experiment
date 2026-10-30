import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Which database: the local Docker Postgres (default) or Neon. Choose with `--db=neon` or DB_TARGET=neon.
// The Neon connection string is a secret: it lives in the git-ignored <repo>/.env.neon (see .env.neon.example),
// or in the environment. Values already set in the environment win over the file.
const neonEnvFile = fileURLToPath(new URL('../../.env.neon', import.meta.url));
if (existsSync(neonEnvFile)) process.loadEnvFile(neonEnvFile);

export const dbTarget = (process.argv.find((a) => a.startsWith('--db='))?.split('=')[1] ?? process.env.DB_TARGET ?? 'local') as 'local' | 'neon';

function pickDatabaseUrl(): string {
  if (dbTarget === 'neon') {
    const url = process.env.NEON_DATABASE_URL;
    if (!url) throw new Error('--db=neon needs NEON_DATABASE_URL: put it in .env.neon (see .env.neon.example) or the environment');
    return url;
  }
  if (dbTarget !== 'local') throw new Error(`--db must be "local" or "neon", got "${dbTarget}"`);
  return process.env.DATABASE_URL ?? 'postgres://frontrunning:frontrunning@localhost:15432/frontrunning';
}

const int = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  databaseUrl: pickDatabaseUrl(),
  // Default: <repo>/data, whatever directory the command is run from (Docker sets DATA_DIR=/data).
  dataDir: process.env.DATA_DIR ?? fileURLToPath(new URL('../../data', import.meta.url)),
  headless: (process.env.HEADLESS ?? 'true') !== 'false',
  // 'chrome' = the real Google Chrome installed on this machine (macOS: /Applications/Google Chrome.app).
  // Unset = Playwright's bundled Chromium (what the Docker image uses).
  browserChannel: (process.env.BROWSER_CHANNEL || undefined) as 'chrome' | undefined,
  locale: process.env.BROWSER_LOCALE ?? 'en-US',
  // Naming
  // Monthly cohort: this many names for EVERY (registrar, action) group, and for the control group.
  namesPerArm: int(process.env.NAMES_PER_ARM, 5),
  tldWeights: (process.env.TLD_WEIGHTS ?? 'com:90,net:5,org:5')
    .split(',')
    .map((p) => p.split(':'))
    .map(([tld, w]) => ({ tld: tld.trim(), weight: Number(w) })),
  // Pacing: deliberately slow: ONE search session a day with a few names, like a person would do.
  searchesPerRun: int(process.env.SEARCHES_PER_RUN, 3),
  minDelaySec: int(process.env.MIN_DELAY_SEC, 10),
  maxDelaySec: int(process.env.MAX_DELAY_SEC, 30),
  // Monitoring
  monitorDays: int(process.env.MONITOR_DAYS, 90),
  rdapDelayMs: int(process.env.RDAP_DELAY_MS, 1500),
  // Cron expressions (container timezone is TZ)
  cronSearch: process.env.CRON_SEARCH ?? '17 10 * * *', // once a day, 10:17 (container timezone)
  cronMonitor: process.env.CRON_MONITOR ?? '30 6 * * *', // daily 06:30
  // 1st of every month: consolidate the previous month first, then generate the new cohort.
  cronConsolidate: process.env.CRON_CONSOLIDATE ?? '0 5 1 * *',
  cronGenerate: process.env.CRON_GENERATE ?? '10 5 1 * *',
};
