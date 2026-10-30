import cron from 'node-cron';
import { config } from './config.js';
import { pool, q } from './db.js';
import { createLogger, setLogFile, setLogLevel } from './logger.js';
import { generateName, weightedTld } from './namegen.js';
import { rdapLookup, rdapPause } from './rdap.js';
import { monthKey, monthStart, parseMonth } from './month.js';
import { consolidate, consolidateDue } from './jobs/consolidate.js';
import { generate } from './jobs/generate.js';
import { manifest } from './jobs/manifest.js';
import { monitor } from './jobs/monitor.js';
import { abortOrphanedRuns, runJob, type Trigger } from './jobs/runner.js';
import { login, logManual, search } from './jobs/search.js';

// ---- command line -------------------------------------------------------------------------------
// Both styles work:   cli.ts generate 2026-11      cli.ts --generate 202611      cli.ts --generate=2026-11
// Options:  --verbose/-v  --quiet  --headed  --fast  --force  --no-file  --searches=N  --check
//           --chrome (use the installed Google Chrome, headed)
//           --registrar=<slug> --action=<search_only|search_cart> --domain=<name> --dry-run   (for search)
const COMMANDS = ['generate', 'search', 'monitor', 'consolidate', 'manifest', 'run', 'runs', 'status', 'scheduler', 'login', 'log-manual', 'words', 'requeue'];
const raw = process.argv.slice(2);
const flags = new Set(raw.filter((a) => a.startsWith('-')));
const positional = raw.filter((a) => !a.startsWith('-'));
const flagCmd = raw.map((a) => /^--([a-z-]+)(?:=(.*))?$/.exec(a)).find((m) => m && COMMANDS.includes(m[1]));
let cmd: string | undefined;
let args: string[];
if (flagCmd) {
  cmd = flagCmd[1];
  args = flagCmd[2] !== undefined ? [flagCmd[2], ...positional] : positional; // --generate=202611 | --generate 202611
} else {
  [cmd, ...args] = positional;
}
if (flags.has('--verbose') || flags.has('-v')) setLogLevel('debug');
if (flags.has('--quiet')) setLogLevel('warn');
if (flags.has('--no-file')) setLogFile(false);
if (flags.has('--headed')) config.headless = false;
if (flags.has('--chrome')) { config.browserChannel = 'chrome'; config.headless = false; } // real Chrome, visible window
const force = flags.has('--force');
const opt = (name: string) => raw.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
if (flags.has('--fast')) { config.minDelaySec = 3; config.maxDelaySec = 8; } // short pauses for manual testing

const log = createLogger('cli');

// ---- scheduler -----------------------------------------------------------------------------
async function stateSnapshot(slog = createLogger('scheduler')) {
  const rows = await q<{ status: string; n: number }>(`SELECT status::text AS status, COUNT(*)::int AS n FROM domains GROUP BY status`);
  const [c] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cohorts`);
  slog.info('current state', { cohorts: c.n, ...Object.fromEntries(rows.map((r) => [r.status, r.n])) });
}

async function scheduler() {
  const slog = createLogger('scheduler');
  const startedAt = Date.now();
  await abortOrphanedRuns();

  slog.info('worker starting', {
    tz: process.env.TZ ?? 'UTC', headless: config.headless, names_per_group: config.namesPerArm,
    monitor_days: config.monitorDays, searches_per_run: config.searchesPerRun,
    pause_s: `${config.minDelaySec}-${config.maxDelaySec}`, db_host: new URL(config.databaseUrl).host,
    data_dir: config.dataDir, clear_cart: process.env.CLEAR_CART ?? 'false',
  });
  await stateSnapshot(slog);

  // Jobs never overlap (a search run can last many minutes because of the human-like delays).
  let busy: string | null = null;
  const guarded = (name: string, fn: (t: Trigger) => Promise<unknown>, trigger: Trigger = 'cron') => async () => {
    if (busy) { slog.warn('skipped, another job is running', { job: name, running: busy }); return; }
    busy = name;
    slog.info('trigger', { job: name, trigger });
    try { await fn(trigger); } catch { /* runJob already logged the failure */ } finally { busy = null; }
  };

  const tasks = [
    ['search', config.cronSearch, guarded('search', (t) => runJob('search', (l) => search(undefined, l), { trigger: t }))],
    ['monitor', config.cronMonitor, guarded('monitor', (t) => runJob('monitor', (l) => monitor(l), { trigger: t }))],
    ['consolidate', config.cronConsolidate, guarded('consolidate', (t) => runJob('consolidate', (l) => consolidateDue(l), { trigger: t }))],
    ['generate', config.cronGenerate, guarded('generate', (t) => runJob('generate', (l) => generate(monthStart(), l), { trigger: t }))],
  ] as const;
  for (const [name, expr, fn] of tasks) {
    const task = cron.schedule(expr, fn);
    const next = (task as { getNextRun?: () => Date | null }).getNextRun?.();
    slog.info('scheduled', { job: name, cron: expr, next_run: next ? next.toISOString() : undefined });
  }

  // Catch-up if the worker was down on the 1st: freeze finished months, make sure this month exists.
  await guarded('startup-catch-up', async (t) => {
    await runJob('consolidate', (l) => consolidateDue(l), { trigger: t });
    const [c] = await q('SELECT 1 FROM cohorts WHERE month = $1 AND generated_at IS NOT NULL', [monthKey(monthStart())]);
    if (c) slog.info('this month already has its cohort', { month: monthKey(monthStart()).slice(0, 7) });
    else await runJob('generate', (l) => generate(monthStart(), l), { trigger: t });
  }, 'startup')();

  slog.info('idle, waiting for the next scheduled job');
  setInterval(() => {
    slog.info('heartbeat', { uptime_h: Math.round((Date.now() - startedAt) / 360000) / 10, busy: busy ?? 'no' });
  }, 3600_000);
  await new Promise(() => {}); // keep alive
}

// ---- run: the whole cycle, in the foreground ------------------------------------------------
/** consolidate finished months -> generate this month's cohort if missing -> search -> monitor. */
async function runAll() {
  const rlog = createLogger('run');
  const searches = opt('searches') ? Number(opt('searches')) : config.searchesPerRun;
  rlog.info('full cycle, in the foreground', { searches, headless: config.headless, pauses_s: `${config.minDelaySec}-${config.maxDelaySec}` });
  await stateSnapshot(rlog);

  rlog.info('step 1/4: consolidate finished months');
  await runJob('consolidate', (l) => consolidateDue(l), { force });

  rlog.info('step 2/4: this month\'s cohort');
  const [c] = await q('SELECT 1 FROM cohorts WHERE month = $1 AND generated_at IS NOT NULL', [monthKey(monthStart())]);
  if (c) rlog.info('cohort already generated, skipping', { month: monthKey(monthStart()).slice(0, 7) });
  else await runJob('generate', (l) => generate(monthStart(), l), { force });

  rlog.info('step 3/4: searches', { up_to: searches });
  await runJob('search', (l) => search(searches, l), { force });

  rlog.info('step 4/4: RDAP monitoring');
  await runJob('monitor', (l) => monitor(l), { force });

  rlog.info('cycle complete');
  await stateSnapshot(rlog);
  console.table(await q('SELECT * FROM arm_stats'));
}

// ---- words: preview the name generator (no database writes) ------------------------------------
async function words(n = 20) {
  const wlog = createLogger('words');
  const check = flags.has('--check');
  let free = 0;
  for (let i = 0; i < n; i++) {
    const g = generateName();
    const name = `${g.label}.${weightedTld(config.tldWeights)}`;
    if (!check) { console.log(`${name.padEnd(24)} ${g.recipe}`); continue; }
    const r = await rdapLookup(name);
    await rdapPause();
    const state = r.registered === false ? 'FREE' : r.registered ? 'taken' : '?';
    if (r.registered === false) free++;
    console.log(`${name.padEnd(24)} ${state.padEnd(6)} ${g.recipe}`);
  }
  if (check) wlog.info('availability sample', { checked: n, free, taken_pct: Math.round((100 * (n - free)) / n) });
}

// ---- requeue: give a failed name another go -------------------------------------------------------
/** Put a failed (or stuck pending) name back in the queue; its failed attempts stop counting toward the limit of 3. */
async function requeue(domain: string, log = createLogger('requeue')): Promise<Record<string, unknown>> {
  const [d] = await q<{ id: number; status: string }>('SELECT id, status FROM domains WHERE name = $1', [domain.toLowerCase()]);
  if (!d) throw new Error(`unknown domain ${domain}`);
  if (!['failed', 'pending_search'].includes(d.status)) throw new Error(`only failed or pending names can be requeued; ${domain} is ${d.status}`);
  const voided = await q(`UPDATE search_log SET outcome = 'skipped', notes = COALESCE(notes || '; ', '') || 'voided by requeue'
                           WHERE domain_id = $1 AND outcome = 'error' RETURNING id`, [d.id]);
  await q(`UPDATE domains SET status = 'pending_search' WHERE id = $1`, [d.id]);
  log.info('back in the queue', { domain, was: d.status, voided_attempts: voided.length });
  return { domain, voided_attempts: voided.length };
}

// ---- one-off commands ------------------------------------------------------------------------
async function runs(n = 15) {
  const rows = await q(
    `SELECT id, job, trigger, status, to_char(started_at, 'MM-DD HH24:MI:SS') AS started,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(finished_at, now()) - started_at)))::int AS secs, summary, error
       FROM job_runs ORDER BY id DESC LIMIT $1`, [n]);
  console.table(rows.map((r: any) => ({ ...r, summary: r.summary ? JSON.stringify(r.summary) : '', error: r.error ?? '' })));
}

async function main() {
  const once = <T extends Record<string, unknown> | void>(job: string, fn: Parameters<typeof runJob<T>>[1]) => runJob(job, fn, { force });
  switch (cmd) {
    case 'generate': await once('generate', (l) => generate(parseMonth(args[0]), l)); break;
    case 'consolidate': await once('consolidate', (l) => (args[0] ? consolidate(parseMonth(args[0]), l) : consolidateDue(l))); break;
    case 'search': await once('search', (l) => search(args[0] ? Number(args[0]) : undefined, l, {
      registrar: opt('registrar'), action: opt('action'), domain: opt('domain'), exclude: opt('exclude'), dryRun: flags.has('--dry-run'),
    })); break;
    case 'monitor': await once('monitor', (l) => monitor(l)); break;
    case 'manifest': await once('manifest', (l) => manifest(l)); break;
    case 'log-manual': await once('log-manual', (l) => logManual(args[0], args[1], args.slice(2).join(' ') || undefined, l)); break;
    case 'requeue': await once('requeue', (l) => requeue(args[0], l)); break;
    case 'login': await login(args[0]); break;
    case 'runs': await runs(args[0] ? Number(args[0]) : undefined); break;
    case 'status': await stateSnapshot(log); console.table(await q('SELECT * FROM arm_stats')); break;
    case 'words': await words(args[0] ? Number(args[0]) : undefined); break;
    case 'run': await runAll(); break;
    case 'scheduler': await scheduler(); break;
    default:
      console.log(`usage: cli <command> [flags]

commands:
  run [--searches=N]     the whole cycle in the foreground: consolidate, generate (if missing),
                         search up to N (default ${config.searchesPerRun}), monitor. Best for watching it work
  generate [YYYY-MM]     generate a month's cohort (default: current month); also: --generate 202611
  words [n] [--check]    preview n generated names and how they are built (--check: RDAP availability sample; no DB writes)
  search [n]             search up to n pending names on their registrar now (default ${config.searchesPerRun})
                         options: --registrar=<slug> --exclude=<slug,slug> --action=<search_only|search_cart> --domain=<name> --dry-run
  monitor                RDAP-check every monitored name
  consolidate [YYYY-MM]  freeze finished months into snapshots
  manifest               hash assignments + screenshots (then: ots stamp <file>)
  log-manual <domain> <action> [notes]   record a search you did by hand
  requeue <domain>       put a failed name back in the queue (its failed attempts stop counting)
  login <registrar>      save a browser session (run on the host)
  runs [n]               last n job runs
  status                 current state + per-group results
  scheduler              long-running cron worker (what the container runs)

flags:
  -v, --verbose   debug logging (browser navigation, RDAP lookups, selectors)
  --quiet         warnings and errors only
  --headed        show the browser window (run on the host, not in Docker)
  --chrome        use the real Google Chrome installed on this machine, with a visible window
                  (same as BROWSER_CHANNEL=chrome HEADLESS=false). Not available inside Docker
  --fast          short pauses (3-8 s) between searches, for manual testing
  --force         run even if another job is marked as running
  --no-file       don't write data/logs/worker-YYYY-MM-DD.log`);
  }
}

main()
  .catch((e) => { log.error('command failed', { error: (e as Error).message }); process.exitCode = 1; })
  .finally(async () => { if (cmd !== 'scheduler') await pool.end(); });
