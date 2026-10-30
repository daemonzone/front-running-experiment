import cron from 'node-cron';
import { config } from './config.js';
import { pool, q } from './db.js';
import { generate } from './jobs/generate.js';
import { login, logManual, search } from './jobs/search.js';
import { monitor } from './jobs/monitor.js';

const [cmd, ...args] = process.argv.slice(2);

// Jobs never overlap (a search run can last many minutes because of the human-like delays).
let busy = false;
function guarded(name: string, fn: () => Promise<void>) {
  return async () => {
    if (busy) { console.log(`[scheduler] ${name} skipped, another job is running`); return; }
    busy = true;
    try { await fn(); } catch (e) { console.error(`[${name}] failed:`, e); } finally { busy = false; }
  };
}

async function scheduler() {
  console.log(`[scheduler] search="${config.cronSearch}" monitor="${config.cronMonitor}" generate="${config.cronGenerate || 'off'}" TZ=${process.env.TZ ?? 'UTC'}`);
  cron.schedule(config.cronSearch, guarded('search', () => search()));
  cron.schedule(config.cronMonitor, guarded('monitor', () => monitor()));
  if (config.cronGenerate) cron.schedule(config.cronGenerate, guarded('generate', () => generate()));
  await new Promise(() => {}); // keep alive
}

async function main() {
  switch (cmd) {
    case 'generate': await generate(args[0] ? Number(args[0]) : undefined); break;
    case 'search': await search(args[0] ? Number(args[0]) : undefined); break;
    case 'monitor': await monitor(); break;
    case 'login': await login(args[0]); break;
    case 'log-manual': await logManual(args[0], args[1], args.slice(2).join(' ') || undefined); break;
    case 'scheduler': await scheduler(); break;
    case 'status': console.table(await q('SELECT * FROM arm_stats')); break;
    default:
      console.log(`usage: cli <generate [n] | search [n] | monitor | login <registrar> | log-manual <domain> <action> [notes] | status | scheduler>`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { if (cmd !== 'scheduler') await pool.end(); });
