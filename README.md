# FrontRunning

An experiment to test whether a domain registrar registers names that people merely *searched* for on its site.

Every month (on the 1st), brand-style names built from real words and roots (`worker/src/namegen.ts`, word lists in `worker/src/words.ts`) (`.com` mostly) that are verified unregistered via RDAP are split into arms — `NAMES_PER_ARM` (default 5) per registrar × action, and 5 for the control:

| Arm | What happens |
|---|---|
| `search_only` | Searched on one registrar (Namecheap, GoDaddy, IONOS) |
| `search_cart` | Searched **and added to the cart** (never purchased) on Namecheap, GoDaddy or IONOS |
| `no_search` | Never typed anywhere. This is the control and gives the base rate |

Assignment is random but balanced (least-filled arm first, ties broken randomly). Every day all names are checked via RDAP. A name that turns out registered is flagged with the registrar it was searched on (`domains.flagged_registrar_id`). The registrar of record reported by RDAP is stored too (`rdap_registrar_name`, `rdap_registrar_iana_id`, plus nameservers in `rdap_checks`), but it is informational: attribution always follows where the name was searched. Control names that get registered show the base rate; if it is ~0 and a given registrar's arms are not, that is the signal.

```
 ┌─────────────┐   generate/search/monitor   ┌──────────────┐   read-only   ┌───────────┐
 │ worker      │ ───────────────────────────►│ PostgreSQL   │◄──────────────│ web       │
 │ cron+Playwr.│                             │ (local/Neon) │               │ Next.js   │
 └─────────────┘                             └──────────────┘               └───────────┘
```

## Repository layout

```
front-running-experiment/       <- the single git repository
├── web/                        Next.js read-only UI (Dockerfile)
├── worker/                     async worker: cron, Playwright searches, RDAP, consolidation (Dockerfile)
├── db/schema.sql               PostgreSQL / Neon schema
├── docker-compose.yml          db + website + worker
├── data/                       screenshots, manifests, saved sessions (git-ignored)
└── .env.example
```

## Quick start (local Docker)

```bash
cp .env.example .env            # optional
docker compose up -d --build db web
# generate this month's cohort (RDAP-checks every candidate, ~2s each)
docker compose run --rm worker npx tsx src/cli.ts generate
open http://localhost:10100
```

**Validate the registrar adapters before enabling the scheduler** (see [Adapters](#adapters-read-this)), then:

```bash
docker compose up -d worker      # cron: searches 3 names at 09:17/12:17/15:17/18:17, RDAP monitor daily 06:30, on the 1st at 05:00 consolidate last month and at 05:10 generate the new cohort (also run at startup if missed)
docker compose logs -f worker
```

## CLI

Run from `worker/` (needs `DATABASE_URL`, default `localhost:15432`) or via `docker compose run --rm worker npx tsx src/cli.ts <cmd>`.

| Command | |
|---|---|
| `run [--searches=N]` | **The whole cycle in the foreground**: consolidate finished months → generate this month's cohort if missing → search up to `N` names (default 3) → RDAP monitor. Everything is printed live; best way to watch it work |
| `words [n] [--check]` | Preview `n` generated names and the recipe of each; `--check` samples their RDAP availability. No database writes |
| `generate [YYYY-MM]` | Generate that month's cohort (default: current): `NAMES_PER_ARM` RDAP-verified names for every group + control; every candidate is logged in `name_candidates`. Idempotent (tops up short groups) |
| `consolidate [YYYY-MM]` | Freeze a cohort's results into an immutable snapshot (default: all finished, unconsolidated months) |
| `search [n]` | Run up to `n` pending searches now (random 90–420 s pauses between them) |
| `monitor` | RDAP-check everything being monitored and flag newly registered names |
| `login <registrar>` | **On the host:** open a headed browser to log in and save the session to `data/state/<slug>.json` (only for registrars with `requires_login`) |
| `log-manual <domain> <action> [notes]` | Record a search you did by hand when an adapter breaks. The action must match the assignment |
| `manifest` | Write `data/manifests/manifest-<ts>.txt`: hash of the arm assignments (the pre-registration) + SHA-256 of every screenshot. Then run `ots stamp <file>` |
| `runs [n]` | Last `n` job runs (what ran, when, how it ended, counters) |
| `status` | Per-arm table |
| `scheduler` | Long-running cron (what the container does) |

## Database

Schema: [`db/schema.sql`](db/schema.sql). Idempotent, no extensions, Neon compatible. Docker applies it on first start; for Neon: `psql "$DATABASE_URL" -f db/schema.sql` and set `DATABASE_URL` (with `?sslmode=require`) in `.env`.

- `registrars`: slug, `adapter_key`, `search_url_template`, `supports_cart`, `requires_login`, `iana_id`, `enabled`
- `cohorts`: one row per month (UTC): target per group, generated/consolidated timestamps, assignments hash
- `name_candidates`: every candidate tried with its RDAP result (accepted or not) — the transparency log
- `cohort_snapshots`: immutable month-end results with SHA-256
- `domains`: every name (belongs to a cohort), its assigned arm (`assigned_action`, `assigned_registrar_id`), status, registration details once flagged, `flagged_registrar_id`
- `search_log`: one row per action taken (`search_only` / `search_cart` / `no_search`), outcome, whether the cart add was confirmed, egress IP, user agent, screenshot path + SHA-256, `manual` flag
- `rdap_checks`: append-only RDAP observation per check, including the raw JSON
- `arm_stats` view: per-arm counts used by the UI

A `search_cart` whose cart add can't be confirmed is logged as `error` and retried (max 3 attempts), so unconfirmed attempts never count as exposures.

## Adding a registrar

- **Search-only, no code:** `INSERT INTO registrars (slug, name, adapter_key, search_url_template) VALUES ('porkbun','Porkbun','generic','https://porkbun.com/checkout/search?q={domain}');` The next `generate` includes it in the balancing. Check the page screenshot to make sure the URL really runs the search.
- **Cart support or a search that needs interaction:** needs a custom adapter. Add `worker/src/adapters/<name>.ts` (copy `namecheap.ts`, which is just selectors and the cart URL), register it in `adapters/index.ts`, and use `adapter_key = '<name>'`, `supports_cart = TRUE`.

## Adapters (read this)

The adapters in `worker/src/adapters` were written **without being run against the live sites** (their markup changes often and may be behind bot protection). Before trusting the data:

1. Run `search 1` with `HEADLESS=false` on the host (`cd worker && npm i && npx playwright install chromium && HEADLESS=false npm run cli -- search 1`) and watch what happens.
2. Check `data/screenshots/` and `search_log.notes`/`cart_confirmed`. Fix the regexes/selectors in the adapter if needed.
3. Headless Chromium in Docker is easier for sites to flag than a headed browser on your machine. If a site challenges you, do that search by hand and use `log-manual`. There is deliberately no CAPTCHA solving, fingerprint spoofing or proxy rotation here, and the pacing is slow on purpose (a few searches a day). Check each registrar's ToS.
4. Registrars with `requires_login = TRUE` reuse a session saved with `login <slug>` on the host (shared with the container through `./data`).

By default carts are left abandoned like a real visitor would (`CLEAR_CART=true` empties them).

## Evidence hygiene

- Names are verified free *before* any exposure, and RDAP queries go to the registry (e.g. Verisign), never a registrar.
- Publish the arm assignments before the results come in (e.g. the `domains.csv` export or a hash of it) so they can't be accused of cherry-picking.
- Keep `data/screenshots` (hashes are in `search_log`). Run `manifest` **before the first search** and again periodically, then timestamp each file with [OpenTimestamps](https://opentimestamps.org) (`pip install opentimestamps-client; ots stamp <manifest>`) and publish the manifest + `.ots`. Anyone can later run `ots verify`.
- Sample size matters: with a near-zero base rate, a few hits in an arm of 30–50 names is meaningful; one hit is not. Report counts and controls, and only claim what the data shows.
- Note that the confounders are your own IP, browser extensions and DNS resolver. The `search_only` arms on *other* registrars act as the control for that.

## Web UI

`http://localhost:10100`: arm results, registered names with delay since search, per-domain timeline, CSV exports (`/api/export?table=domains|search_log|rdap_checks`). Read-only, no login, no write endpoints. To publish it, deploy `web/` anywhere (Vercel, etc.) with `DATABASE_URL` pointing to Neon (ideally a read-only role).

## Where to run the browser

What matters is that the exposure looks like what you normally do: a headed Chromium (`HEADLESS=false`) on your usual home/office IP. Datacenter IPs (any VPS or cloud) are what bot defences flag first and are not how you originally searched. Options, best first:

1. **Your Mac, worker run on the host** (`npm run cli -- scheduler` with `HEADLESS=false`), with Postgres on Neon or the compose `db`. Simplest and most realistic. It must be awake at the cron times.
2. **An always-on home machine** (mini PC, Mac mini, NAS) running `docker compose up -d` with `HEADLESS=false`; the worker container uses a virtual display (Xvfb). Same residential IP, no need to keep your laptop on.
3. **A VPS** only as a last resort; expect challenges and a different network fingerprint than your own searches.

Keep the same egress IP for the whole experiment (it is logged per search), and put `web/` on Vercel with Neon if you want it public.

## Site pages

Edit `web/src/lib/site.ts` (author, contact, start date, repo URL) before publishing. `/about` is the intro, `/method` the pre-registered method, `/example-report` a clearly labelled fake-data report showing how results are presented (registrars anonymised as A/B/C).

## Name generation

`worker/src/namegen.ts` builds each name from real words and roots in `worker/src/words.ts`, in four patterns: **root + suffix** (`kleos` + `hq`), **word + word** (`harbor` + `lane`), **prefix + root** (`neo` + `cedar`) and **root + ending** (`lumen` + `ora`). Names are 5–11 letters, pronounceable by construction, free of a small blocklist of offensive strings, and mostly `.com`. The generator is part of the worker: the monthly `generate` job (cron, 1st of the month) calls it and keeps going until every group has `NAMES_PER_ARM` names the registry (RDAP) reports as unregistered. Most real-word names are already taken (roughly 75% in a test sample), so a cohort needs a few hundred candidates and takes several minutes. Every candidate, with its recipe and RDAP result, is stored in `name_candidates` and shown on the Generation page.

```bash
cd worker
npm run cli -- words 30 --check        # preview names + their availability, nothing stored
npm run cli -- --generate 202611       # generate November 2026's cohort (also: generate 2026-11, or no month = current)
```

To change the style, edit the word lists in `words.ts` or the pattern weights in `namegen.ts`; `words` shows the effect immediately.

## Monthly cycle

- **1st, 05:00** — `consolidate`: the previous month's results are frozen in `cohort_snapshots` (hash included).
- **1st, 05:10** — `generate`: the new cohort. Months are UTC calendar months. The UI's month picker (default: current month, or *All time*) scopes Results, Generation and Names; the hero box always shows the all-time total.
- Names keep being monitored for `MONITOR_DAYS` (default 90) after their search, so a month's *live* numbers can grow after its snapshot.
- Group size: `NAMES_PER_ARM` is per **(registrar, action)** group, so 3 registrars × 2 actions + control = 35 names/month at the default.

## Running the worker manually

The scheduler container does all of this on its own; run things by hand when you want to test, debug or force a step.

**Before you start** (once): apply the schema to an existing database so the `job_runs` table exists (fresh volumes get it automatically):

```bash
docker compose exec -T db psql -U frontrunning -d frontrunning < db/schema.sql
```

**Stop the scheduler while you work**, so nothing else searches at the same time (a manual run also refuses to start while another run is marked as running; `--force` overrides):

```bash
docker compose stop worker
```

### Two ways to run a command

| | Command | Browser |
|---|---|---|
| **In Docker** | `docker compose run --rm worker npx tsx src/cli.ts <command> [flags]` | headless |
| **On your Mac** (best for validating the registrar adapters) | `cd worker && npm run cli -- <command> [flags]` | `--headed` shows the window |

Set up the Mac route once:

```bash
cd worker
npm install && npx playwright install chromium
export DATABASE_URL=postgres://frontrunning:frontrunning@localhost:15432/frontrunning
export DATA_DIR=../data
```

Handy alias for the Docker route: `alias fr='docker compose run --rm worker npx tsx src/cli.ts'`, then `fr runs`, `fr monitor -v`, etc.

### Suggested first run

Do the first trial on throw-away data: **a name that was searched is exposed and can't be reused as a clean experiment name**, so adapter testing burns names. Use a tiny cohort and wipe it afterwards.

```bash
# The whole cycle in the foreground, with a visible browser (Mac route).
# 1 name per group = 7 names, 1 real search, 3-8 s pauses, debug detail:
cd worker
NAMES_PER_ARM=1 npm run cli -- run --headed --fast --searches=1 -v
#   consolidate -> generate (7 names, each RDAP-checked) -> search 1 -> monitor
#   then look at: the log lines, data/screenshots/ and data/screenshots/errors/, and:
npm run cli -- runs 5

# Repeat single steps while you tune an adapter (worker/src/adapters/<registrar>.ts):
npm run cli -- search 1 --headed --fast -v      # next pending name
npm run cli -- monitor -v
#   If a site blocks the automation, do that search by hand and record it:
npm run cli -- log-manual <domain> <search_only|search_cart> "searched by hand"

# When every registrar/action works: wipe the trial data and start for real
docker compose exec -T db psql -U frontrunning -d frontrunning -c \
  "TRUNCATE rdap_checks, search_log, name_candidates, cohort_snapshots, domains, cohorts, job_runs RESTART IDENTITY CASCADE;"
rm -rf ../data/screenshots ../data/logs
npm run cli -- generate                         # the real cohort (NAMES_PER_ARM=5); or just wait for the 1st
docker compose up -d worker                     # hand over to the scheduler
docker compose logs -f worker
```

`search` on an empty database now tells you why nothing happened (no names yet → run `generate` or `run`).

Other commands: `consolidate [YYYY-MM]` (freeze a month), `manifest` (hash assignments + screenshots, then `ots stamp <file>`), `generate 2026-12` (a specific month).

### Flags

| Flag | Effect |
|---|---|
| `-v`, `--verbose` | debug logging: browser navigation, RDAP lookups, selector and cart checks |
| `--quiet` | warnings and errors only |
| `--headed` | show the browser window (Mac route only; Docker has no display) |
| `--fast` | short 3–8 s pauses between searches instead of 90–420 s (manual testing only) |
| `--force` | run even if another job is marked as running |
| `--no-file` | don't write the log file |

## Logging: following what the worker does

Every line goes to the console (`docker compose logs -f worker`) **and** to `data/logs/worker-YYYY-MM-DD.log`:

```
2026-11-01T04:10:03.120Z INFO  [generate#12] candidate accepted name=zheoli.com action=search_cart registrar=namecheap left=29 tried=3
 ^ UTC time                ^level ^[job#run-id:domain]  ^message              ^key=value details
```

Levels: `debug` (only with `-v` / `LOG_LEVEL=debug`), `info`, `warn`, `error`. Each job run gets an id (`search#12`) and a row in `job_runs`, which `runs` prints and which you can also query:

```sql
SELECT id, job, trigger, status, started_at, finished_at, summary, error FROM job_runs ORDER BY id DESC LIMIT 20;
```

Lines worth knowing:

| Message | Meaning |
|---|---|
| `worker starting`, `scheduled … next_run=` | scheduler boot: config, state, when each job fires next (UTC) |
| `trigger job=… trigger=cron/startup` | a scheduled job is starting (`startup` = catch-up at boot) |
| `heartbeat` (hourly) | the worker is alive |
| `candidate accepted` / `candidate rejected` | name generation: the RDAP result for each candidate |
| `cohort complete` / `cohort incomplete` | generation finished, with the assignments hash; incomplete means re-run to top up |
| `pending searches` | how many searches are waiting and how many this run will do |
| `pausing like a human would` | the delay between searches |
| `step: opening search page` → `step: search done` → `step: adding to cart` → `step: cart result` | what the browser is doing |
| `SEARCH OK, now monitoring` | the exposure counted; the name enters its monitoring window |
| `search NOT counted: cart add unconfirmed` | cart step failed; will retry (max 3 attempts, then the name is marked `failed`) |
| `search failed` + `failure screenshot saved` | an error; open the screenshot in `data/screenshots/errors/` to see the page the adapter saw |
| `DOMAIN REGISTERED` | RDAP shows a monitored name as registered; attributed to the registrar it was searched on |
| `check inconclusive` | RDAP didn't answer cleanly; retried at the next run |
| `snapshot taken` | month consolidated |
| `skipped, another job is running` | a scheduled job found the previous one still busy |

Environment: `LOG_LEVEL=debug|info|warn|error` (default `info`), `LOG_FILE=false` to disable the log file.

**Common problems**
- *"another run is in progress"*: the scheduler container is mid-run. `docker compose stop worker`, or `--force`.
- *`add-to-cart button not found`*: the page markup differs from the adapter's guess. Run with `--headed -v`, look at the failure screenshot, adjust the regex in the adapter.
- *Job stuck as `running` after a crash*: the scheduler marks such rows `aborted` when it restarts; for manual runs use `--force`.

## License

The code in this repository is released under the [MIT License](LICENSE).
