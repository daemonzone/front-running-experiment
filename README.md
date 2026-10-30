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
docker compose up -d worker      # cron: one search session a day at 10:17 (3 names), RDAP monitor daily 06:30, on the 1st at 05:00 consolidate last month and at 05:10 generate the new cohort (also run at startup if missed)
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
| `search [n] [options]` | Search up to `n` pending names (default 3) on their assigned registrar, one after the other with random 10–30 s pauses. Options: `--registrar=<slug>`, `--action=<search_only\|search_cart>`, `--domain=<name>`, `--dry-run`. See [Scanning the names](#scanning-the-names-manual-run) |
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

**How a search is made.** The adapter opens the registrar's page, moves the mouse to the search box, clicks it, types the name **letter by letter** (uneven 70–190 ms keystrokes, the odd hesitation), then presses the search button, as a person would. It never opens a results URL directly. If the site shows a **security check** page ("Just a moment…", "Access Denied"), the adapter doesn't try to get around it: in a visible window it waits up to 3 minutes for you to complete the check, headless it stops.

**Status.** IONOS: validated end to end (search + cart) with real Chrome. Namecheap: loads normally in a visible Chrome (it blocked *headless*); search-only selectors fixed, search+cart not yet validated. **GoDaddy: blocks the automated browser** (its bot protection answers "Access Denied" on the search results, even in a visible real Chrome). Nothing is done to get around that: GoDaddy names are searched by hand and recorded with `log-manual`, or GoDaddy is dropped from the experiment (`UPDATE registrars SET enabled = FALSE WHERE slug = 'godaddy'`).

The adapters in `worker/src/adapters` were written **without being run against the live sites** (their markup changes often and may be behind bot protection). Before trusting the data:

1. Run `search 1 --chrome -v` on your Mac (`cd worker && npm install`) and watch what happens.
2. Check `data/screenshots/` and `search_log.notes`/`cart_confirmed`. Fix the regexes/selectors in the adapter if needed.
3. Headless Chromium in Docker is easier for sites to flag than a headed browser on your machine. If a site challenges you, do that search by hand and use `log-manual`. There is deliberately no CAPTCHA solving, fingerprint spoofing or proxy rotation here, and the pacing is slow on purpose (one short session a day). Check each registrar's ToS.
4. Registrars with `requires_login = TRUE` reuse a session saved with `login <slug>` on the host (shared with the container through `./data`).

By default carts are left abandoned like a real visitor would (`CLEAR_CART=true` empties them).

## Evidence hygiene

- Names are verified free *before* any exposure, and RDAP queries go to the registry (e.g. Verisign), never a registrar.
- Publish the arm assignments before the results come in (e.g. the `domains.csv` export or a hash of it) so they can't be accused of cherry-picking.
- Keep `data/screenshots` (hashes are in `search_log`). Run `manifest` **before the first search** and again periodically, then timestamp each file with [OpenTimestamps](https://opentimestamps.org) (`pip install opentimestamps-client; ots stamp <manifest>`) and publish the manifest + `.ots`. Anyone can later run `ots verify`.
- Sample size matters: with a near-zero base rate, a few hits in an arm of 30–50 names is meaningful; one hit is not. Report counts and controls, and only claim what the data shows.
- Note that the confounders are your own IP, browser extensions and DNS resolver. The `search_only` arms on *other* registrars act as the control for that.

## Web UI

`http://localhost:10100`: arm results, registered names with delay since search, per-domain timeline, CSV exports (`/api/export?table=domains|search_log|rdap_checks`). Dates are dd/mm/yyyy and times are 24 h UTC (CSV exports and worker logs keep ISO 8601). **Delay** is the gap between the search and the registration, compact: `6:49` (h:mm), `8d 02:15` (days hh:mm), with a minus sign if the registry's creation date is *before* the search; hover it for the plain-language version ("registered 8 days later"). **Registered (UTC)** is the creation timestamp reported by the registry (RDAP). The **Action** column uses icons, with a legend under each table: magnifier = search only, magnifier + cart = search and add to cart, crossed-out eye = never searched (control). On registered names, the (i) icon opens the registry details (registrar of record, nameservers, registration and last-change times). Read-only, no login, no write endpoints. To publish it, deploy `web/` anywhere (Vercel, etc.) with `DATABASE_URL` pointing to Neon (ideally a read-only role).

## Where to run the browser

**Decision: your Mac, with the real Google Chrome** (`--chrome`). A headed Chrome on your home connection is the closest thing to how you originally searched. Headless Chromium announces itself as "HeadlessChrome", datacenter IPs are what bot defences flag first, and Docker can't use your Mac's Chrome, so the searches run on the host. See [Running on your Mac](#running-on-your-mac-real-chrome).

Keep the same egress IP for the whole experiment (it is logged per search), and put `web/` on Vercel with Neon if you want it public. A 32-bit ARM board (e.g. an armv7 Orange Pi) can't run the browser, but could host the browser-less jobs (`monitor`, `generate`, `consolidate`) if you ever want an always-on box.

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

## Scanning the names (manual run)

"Scanning" is two separate things, and the worker does both:

| | What it does | Command | Who sees it |
|---|---|---|---|
| **Search** (the experiment's exposure) | opens the registrar's site in a real browser, searches the name, and for `search_cart` names also adds it to the cart. Takes a screenshot, then the name starts its 90-day monitoring window | `search` | the registrar |
| **Monitor** (the measurement) | asks the public registry (RDAP) whether each monitored name has become registered, and flags it against the registrar it was searched on | `monitor` | nobody but the registry |

Control names are never searched: they start being monitored as soon as they are generated. The other names wait in `pending_search` until a search completes.

### Pre-flight checklist (once, before the first real search)

A name that has been searched is **exposed for good**, so get these right first.

1. **Stop the scheduler** so nothing else searches while you work: `docker compose stop worker`.
2. **Lock the pre-registration.** The assignment list must be fixed before any exposure: run `npm run cli -- manifest`, then `ots stamp data/manifests/manifest-<timestamp>.txt` ([Evidence hygiene](#evidence-hygiene)), and keep the `.ots` file.
3. **Know that the adapters are untested** against the live sites ([Adapters](#adapters-read-this)). The first search on each registrar is also the test of its adapter, so start with a single name and a visible browser.
4. **See the plan without touching anything:** `npm run cli -- search 5 --dry-run`.

### Syntax

Run from `worker/` on your Mac (one-time setup in [Running the worker manually](#running-the-worker-manually)). The general form is:

```
npm run cli -- search [n] [--registrar=<slug>] [--action=<search_only|search_cart>] [--domain=<name>] [--dry-run] [--headed] [--fast] [-v]
```

`n` is how many names to search in this run (default 3). Names are picked at random among the pending ones that match the filters.

```bash
cd worker

# What would it search? (no browser opened, nothing changes)
npm run cli -- search 5 --dry-run

# ONE search, watching the browser, with debug detail   <- start here
npm run cli -- search 1 --headed --verbose

# Test one registrar / one action at a time
npm run cli -- search 1 --registrar=namecheap --action=search_only --headed -v
npm run cli -- search 1 --registrar=namecheap --action=search_cart --headed -v

# One specific name (it must still be pending)
npm run cli -- search --domain=seleneova.com --headed -v

# Several in a row. --fast = 3-8 s pauses (testing only); without it the pauses are 10-30 s
npm run cli -- search 3 --headed --fast
npm run cli -- search 5 --headed

# The same from Docker (headless browser, no window)
docker compose run --rm worker npx tsx src/cli.ts search 1 -v
```

The flag-first style works for every command too (`npm run cli -- --search 1 --headed`).

### What happens for each name

```
search start → step: opening search page → step: search done
  → (search_cart only) step: adding to cart → step: cart result
  → screenshot saved (with SHA-256) → SEARCH OK, now monitoring
```

- **`SEARCH OK`**: the exposure counted. The name moves to `monitoring`, with `searched_at` and a 90-day window.
- **`search NOT counted: cart add unconfirmed`**: for `search_cart` names, a cart add that can't be confirmed doesn't count. The name stays pending for a retry.
- **`search failed`**: an error (page didn't load, button not found). A diagnostic screenshot goes to `data/screenshots/errors/`, and the name stays pending for a retry.
- **Three failed attempts** and the name is marked `failed` and stops being retried.
- **Caveat.** If an attempt fails *after* the results page loaded, the name may already have been seen by the registrar even though the attempt didn't count. The retry then adds the cart step. Keep that in mind when you read the `search_log` and note it if it matters.
- **If a site blocks the automation**, do that search by hand (same action as assigned) and record it: `npm run cli -- log-manual <domain> <search_only|search_cart> "searched by hand"`.

### After a search: check the result

```bash
npm run cli -- runs 5          # what ran, how it ended, counters
npm run cli -- status          # per-group state
ls data/screenshots data/screenshots/errors
tail -f data/logs/worker-$(date -u +%F).log
```

Or open the website: **Names** (`/domains?status=monitoring`) lists each name's status, and a name's page shows its timeline and the log of every action with the screenshot hash. In SQL:

```sql
SELECT d.name, s.action, s.outcome, s.cart_confirmed, s.started_at, s.error
  FROM search_log s JOIN domains d ON d.id = s.domain_id ORDER BY s.id DESC LIMIT 20;
```

### The RDAP scan (monitor)

```bash
npm run cli -- monitor            # checks every name in 'monitoring' once
npm run cli -- monitor -v         # + each registry answer
```

A registered name logs `DOMAIN REGISTERED` and is flagged against the registrar it was searched on; the registrar of record reported by RDAP is stored for information only. The scheduler runs this daily at 06:30; run it by hand whenever you want a fresh look.

### Handing over to the scheduler

When searches work for every registrar and action:

```bash
docker compose up -d worker
docker compose logs -f worker
```

It then runs **one search session a day at 10:17** (container timezone) with 3 names (`SEARCHES_PER_RUN`; change the time with `CRON_SEARCH`), so a cohort of 30 searchable names is exposed over about ten days, and it runs the RDAP scan every morning at 06:30. A bigger `SEARCHES_PER_RUN` finishes the cohort sooner; the names' 90-day windows start at their own search, so spreading the searches doesn't affect the comparison. Don't search the whole cohort within minutes: the slow pace is deliberate, to look like a person.

## Running on your Mac (real Chrome)

The searches use the Google Chrome installed on your Mac (`/Applications/Google Chrome.app`), driven by Playwright. No `npx playwright install` is needed for this. The worker logs the Chrome version at every run, and each search stores the browser's user agent.

### One-time setup

```bash
cd worker && npm install
docker compose up -d db web          # the database (and the site) in Docker; the Docker worker stays stopped
```

The worker finds the database at `localhost:15432` by default. Settings can be given as flags or environment variables:

| | Flag | Environment |
|---|---|---|
| use the installed Google Chrome, visible window | `--chrome` | `BROWSER_CHANNEL=chrome` + `HEADLESS=false` |

### Searching

```bash
cd worker
npm run cli -- search 1 --chrome -v            # one search, Chrome window visible, debug detail
```

### The daily schedule, from your Mac

```bash
cd worker
caffeinate -is npm run cli -- scheduler --chrome
```

This is the same scheduler the container runs (one search session a day at 10:17, RDAP monitor at 06:30, monthly generate and consolidate on the 1st), just using your Chrome. `caffeinate -is` stops the Mac from sleeping while it runs. Leave the terminal open, or use the LaunchAgent below.

- **Run only one scheduler.** Keep the Docker `worker` container stopped (`docker compose stop worker`), otherwise both would run the same jobs.
- **If the Mac sleeps or is off** at 10:17, that day's session is skipped. The scheduler catches up on the monthly `consolidate` and `generate` when it starts, but searches simply wait for the next day, and a missed RDAP check just means the next check sees the change later.
- **What the site sees.** A real, headed Chrome, but still *automated*: Chrome shows its "controlled by automated test software" bar, and `navigator.webdriver` is true. There is deliberately no stealth or fingerprint spoofing. If a registrar challenges the browser, do that search by hand and record it with `log-manual`.
- **Clean profile.** Each search opens a fresh browser context, with no extensions, history or logins of your everyday Chrome. That keeps extensions (which can send URLs elsewhere) out of the experiment.

### Optional: start it automatically at login (LaunchAgent)

A *LaunchAgent* (not a daemon) is needed, because a visible browser requires your logged-in desktop session. Save as `~/Library/LaunchAgents/com.frontrunning.worker.plist`, fix the path, then `launchctl load ~/Library/LaunchAgents/com.frontrunning.worker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.frontrunning.worker</string>
  <key>ProgramArguments</key><array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>cd "/Users/YOU/Desktop/Tech Stuff/FrontRunning/front-running-experiment/worker" &amp;&amp; caffeinate -is npm run cli -- scheduler --chrome</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/frontrunning-worker.out</string>
  <key>StandardErrorPath</key><string>/tmp/frontrunning-worker.err</string>
</dict></plist>
```

Stop it with `launchctl unload ~/Library/LaunchAgents/com.frontrunning.worker.plist`. The worker's own logs are in `data/logs/` either way.

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

### Optional: a rehearsal on throw-away data

Already have a real cohort you're happy with? Skip this and use [Scanning the names](#scanning-the-names-manual-run). A rehearsal is for testing the adapters without using up real names: **a name that was searched is exposed and can't be reused as a clean experiment name**, so adapter testing burns names. Use a tiny cohort in a separate trial, and wipe everything afterwards.

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
| `--chrome` | use the real Google Chrome installed on the Mac, with a visible window (`BROWSER_CHANNEL=chrome`) |
| `--fast` | short 3–8 s pauses between searches instead of 10–30 s (manual testing only) |
| `--force` | run even if another job is marked as running |
| `--no-file` | don't write the log file |
| `--dry-run` | (`search`) list the names that would be searched; no browser, nothing changes |
| `--registrar=<slug>` | (`search`) only names assigned to that registrar: `namecheap`, `godaddy`, `ionos` |
| `--action=<a>` | (`search`) only `search_only` or `search_cart` names |
| `--domain=<name>` | (`search`) only that one pending name |
| `--exclude=<slug,...>` | (`search`) skip those registrars, e.g. `--exclude=godaddy` |
| `--searches=N` | (`run`) how many searches the full cycle does |
| `--check` | (`words`) sample RDAP availability of the previewed names |

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
