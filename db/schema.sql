-- FrontRunning experiment schema (PostgreSQL 15+, Neon compatible: no extensions needed).
-- Idempotent: safe to apply repeatedly.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE experiment_action AS ENUM ('search_only', 'search_cart', 'no_search');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- generated -> (pending_search ->) monitoring -> registered | window_closed
  CREATE TYPE domain_status AS ENUM ('pending_search', 'monitoring', 'registered', 'window_closed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE search_outcome AS ENUM ('ok', 'error', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Result of the RDAP check done on every generated candidate name.
  CREATE TYPE candidate_outcome AS ENUM ('available', 'already_registered', 'inconclusive', 'duplicate_label');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Registrars. adapter_key maps to worker/src/adapters/*.ts.
-- 'generic' needs no code: it just opens search_url_template ({domain} is replaced)
-- and can only do search_only. Cart support always needs a custom adapter.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registrars (
  id                  SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  adapter_key         TEXT NOT NULL DEFAULT 'generic',
  search_url_template TEXT,                     -- e.g. https://example.com/search?q={domain}
  supports_cart       BOOLEAN NOT NULL DEFAULT FALSE,
  requires_login      BOOLEAN NOT NULL DEFAULT FALSE,
  iana_id             INTEGER,                  -- ICANN registrar id, used to cross-check RDAP
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO registrars (slug, name, adapter_key, search_url_template, supports_cart, requires_login, iana_id, notes) VALUES
  ('namecheap',  'Namecheap',  'namecheap',  'https://www.namecheap.com/domains/registration/results/?domain={domain}', TRUE,  FALSE, 1068, NULL),
  ('godaddy',    'GoDaddy',    'godaddy',    'https://www.godaddy.com/domainsearch/find?domainToCheck={domain}',        TRUE,  FALSE, 146,  NULL),
  ('ionos',      'IONOS',      'ionos',      'https://www.ionos.com/domains/domain-check?domain={domain}',              TRUE,  FALSE, 83,   NULL)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Cohorts: one per calendar month (UTC). Generated on the 1st, consolidated on the next 1st.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cohorts (
  month              DATE PRIMARY KEY CHECK (date_trunc('month', month) = month),
  names_per_arm      SMALLINT NOT NULL,
  generated_at       TIMESTAMPTZ,            -- set once every arm quota is filled
  assignments_sha256 TEXT,                   -- hash of the final (name, action, registrar) list: the pre-registration
  consolidated_at    TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Domains: every generated name. The experiment arm is assigned at generation.
--   assigned_action = no_search  => assigned_registrar_id IS NULL (control group)
--   otherwise                    => assigned_registrar_id is the registrar searched on
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,            -- full name, lower case, e.g. kleoshq.com
  label                 TEXT NOT NULL,                   -- part before the TLD
  tld                   TEXT NOT NULL,
  cohort                DATE NOT NULL REFERENCES cohorts(month),
  assigned_action       experiment_action NOT NULL,
  assigned_registrar_id SMALLINT REFERENCES registrars(id),
  status                domain_status NOT NULL DEFAULT 'pending_search',
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  searched_at           TIMESTAMPTZ,                     -- when the experimental action completed
  monitor_until         TIMESTAMPTZ,                     -- stop monitoring after this
  -- Filled when RDAP first shows the domain as registered:
  registered_detected_at TIMESTAMPTZ,
  rdap_created_at        TIMESTAMPTZ,                    -- registration event date reported by RDAP
  rdap_registrar_name    TEXT,
  rdap_registrar_iana_id INTEGER,
  flagged_registrar_id   SMALLINT REFERENCES registrars(id), -- registrar the domain was searched on (NULL for control)
  CONSTRAINT arm_consistency CHECK (
    (assigned_action = 'no_search' AND assigned_registrar_id IS NULL) OR
    (assigned_action <> 'no_search' AND assigned_registrar_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS domains_status_idx      ON domains (status);
CREATE INDEX IF NOT EXISTS domains_arm_idx         ON domains (assigned_registrar_id, assigned_action);
CREATE INDEX IF NOT EXISTS domains_cohort_idx      ON domains (cohort);

-- ---------------------------------------------------------------------------
-- Search log: one row per experimental action performed (including no_search,
-- which records the moment the control name entered monitoring).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_log (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain_id      BIGINT NOT NULL REFERENCES domains(id),
  registrar_id   SMALLINT REFERENCES registrars(id),     -- NULL for no_search
  action         experiment_action NOT NULL,
  outcome        search_outcome NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  site_says_available BOOLEAN,                           -- what the registrar page showed, if detectable
  cart_confirmed BOOLEAN,                                -- search_cart: item seen in cart / add confirmation
  cart_cleared   BOOLEAN,                                -- cart emptied afterwards
  manual         BOOLEAN NOT NULL DEFAULT FALSE,         -- performed by hand and logged via CLI
  egress_ip      TEXT,
  user_agent     TEXT,
  screenshot_path TEXT,
  screenshot_sha256 TEXT,
  notes          TEXT,
  error          TEXT
);
CREATE INDEX IF NOT EXISTS search_log_domain_idx ON search_log (domain_id);

-- ---------------------------------------------------------------------------
-- Every candidate name that was generated and RDAP-checked, accepted or not.
-- Accepted candidates link to their domains row (which holds the group assignment).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS name_candidates (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cohort      DATE NOT NULL REFERENCES cohorts(month),
  name        TEXT NOT NULL,
  label       TEXT NOT NULL,
  tld         TEXT NOT NULL,
  outcome     candidate_outcome NOT NULL,
  http_status INTEGER,
  recipe      TEXT,                       -- how the name was built, e.g. 'root+suffix: kleos + hq'
  rdap_url    TEXT,                       -- public URL anyone can open to verify the result
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  error       TEXT,
  domain_id   BIGINT REFERENCES domains(id)   -- set when the candidate was accepted
);
CREATE INDEX IF NOT EXISTS name_candidates_cohort_idx ON name_candidates (cohort, id);

-- ---------------------------------------------------------------------------
-- Immutable month-end snapshots (taken on the 1st for the previous month).
-- Names keep being monitored for the whole window, so live numbers can still grow later.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cohort_snapshots (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cohort     DATE NOT NULL REFERENCES cohorts(month),
  taken_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_names INTEGER NOT NULL,
  total_registered INTEGER NOT NULL,
  arms       JSONB NOT NULL,              -- [{registrar, action, names, registered, monitoring}]
  registered JSONB NOT NULL,              -- [{name, registrar, action, delay_days, registered_via}]
  sha256     TEXT NOT NULL,               -- hash of arms+registered, can be timestamped
  UNIQUE (cohort)
);

-- ---------------------------------------------------------------------------
-- RDAP observations (append-only). One row per check.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rdap_checks (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain_id        BIGINT NOT NULL REFERENCES domains(id),
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  http_status      INTEGER,
  registered       BOOLEAN,                 -- NULL when the check was inconclusive
  registrar_name   TEXT,
  registrar_iana_id INTEGER,
  created_at_rdap  TIMESTAMPTZ,
  nameservers      TEXT[],
  rdap_url         TEXT,
  raw              JSONB,
  error            TEXT
);
CREATE INDEX IF NOT EXISTS rdap_checks_domain_idx ON rdap_checks (domain_id, checked_at DESC);

-- ---------------------------------------------------------------------------
-- Worker job runs: one row per execution of generate / search / monitor / consolidate.
-- Lets you follow what the worker did (and see what is running right now).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_runs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job         TEXT NOT NULL,
  trigger     TEXT NOT NULL DEFAULT 'manual',        -- manual | cron | startup
  status      TEXT NOT NULL DEFAULT 'running',       -- running | ok | error | aborted
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  summary     JSONB,                                 -- counters returned by the job
  error       TEXT
);
CREATE INDEX IF NOT EXISTS job_runs_started_idx ON job_runs (started_at DESC);

-- ---------------------------------------------------------------------------
-- Reporting view: per-arm results used by the UI.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS arm_stats;
CREATE VIEW arm_stats AS
SELECT
  d.cohort                                                     AS cohort,
  COALESCE(r.name, '(none — control)')                         AS registrar,
  d.assigned_action                                            AS action,
  COUNT(*)                                                     AS domains,
  COUNT(*) FILTER (WHERE d.status = 'registered')              AS registered,
  COUNT(*) FILTER (WHERE d.status IN ('monitoring','pending_search')) AS still_monitoring,
  ROUND(100.0 * COUNT(*) FILTER (WHERE d.status = 'registered') / NULLIF(COUNT(*),0), 1) AS registered_pct
FROM domains d
LEFT JOIN registrars r ON r.id = d.assigned_registrar_id
GROUP BY d.cohort, r.id, r.name, d.assigned_action
ORDER BY d.cohort, r.id NULLS LAST, d.assigned_action;
