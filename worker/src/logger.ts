import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export type Level = 'debug' | 'info' | 'warn' | 'error';
const rank: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: Level = (process.env.LOG_LEVEL as Level) in rank ? (process.env.LOG_LEVEL as Level) : 'info';
let fileEnabled = (process.env.LOG_FILE ?? 'true') !== 'false';

export const setLogLevel = (l: Level) => { minLevel = l; };
export const setLogFile = (on: boolean) => { fileEnabled = on; };
export const isDebug = () => rank[minLevel] <= rank.debug;

const color = process.stdout.isTTY
  ? { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m' }
  : { debug: '', info: '', warn: '', error: '', reset: '' };

function fmtVal(v: unknown): string {
  if (v instanceof Error) return JSON.stringify(v.message);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return /^[\w./:@+-]+$/.test(v) ? v : JSON.stringify(v);
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

let dirReady = false;
function writeFile(line: string) {
  try {
    const dir = path.join(config.dataDir, 'logs');
    if (!dirReady) { mkdirSync(dir, { recursive: true }); dirReady = true; }
    appendFileSync(path.join(dir, `worker-${new Date().toISOString().slice(0, 10)}.log`), line + '\n');
  } catch { /* logging must never break a job */ }
}

function emit(level: Level, scope: string, msg: string, fields?: Record<string, unknown>) {
  if (rank[level] < rank[minLevel]) return;
  const kv = fields
    ? Object.entries(fields).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${fmtVal(v)}`).join(' ')
    : '';
  const plain = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${kv ? ' ' + kv : ''}`;
  const shown = `${color[level]}${plain}${color.reset}`;
  (level === 'error' ? console.error : console.log)(shown);
  if (fileEnabled) writeFile(plain);
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, f) => emit('debug', scope, m, f),
    info: (m, f) => emit('info', scope, m, f),
    warn: (m, f) => emit('warn', scope, m, f),
    error: (m, f) => emit('error', scope, m, f),
    child: (s) => createLogger(`${scope}:${s}`),
  };
}
