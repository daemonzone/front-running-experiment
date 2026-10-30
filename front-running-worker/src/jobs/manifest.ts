import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { q } from '../db.js';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/**
 * Writes data/manifests/manifest-<timestamp>.txt containing:
 *  - a hash of the canonical arm-assignment list (the pre-registration)
 *  - a hash of every screenshot
 * Then run `ots stamp <file>` (pip install opentimestamps-client) and publish file + .ots.
 */
export async function manifest(): Promise<void> {
  const rows = await q<{ name: string; action: string; registrar: string | null; cohort: string }>(
    `SELECT d.name, d.assigned_action AS action, r.slug AS registrar, to_char(d.cohort, 'YYYY-MM') AS cohort
       FROM domains d LEFT JOIN registrars r ON r.id = d.assigned_registrar_id ORDER BY d.name`);
  const canonical = rows.map((r) => `${r.name}\t${r.action}\t${r.registrar ?? '-'}\t${r.cohort}`).join('\n');

  const shotDir = path.join(config.dataDir, 'screenshots');
  const files = await readdir(shotDir).catch(() => [] as string[]);
  const shots: string[] = [];
  for (const f of files.sort()) shots.push(`${sha(await readFile(path.join(shotDir, f)))}  screenshots/${f}`);

  const stamp = new Date().toISOString();
  const out = [
    `FrontRunning manifest, generated ${stamp}`,
    `domains: ${rows.length}`,
    `assignments-sha256: ${sha(canonical)}`,
    '',
    '# assignments (name, action, registrar, cohort)',
    canonical,
    '',
    '# screenshots (sha256, file)',
    ...shots,
    '',
  ].join('\n');

  const dir = path.join(config.dataDir, 'manifests');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `manifest-${stamp.replace(/[:.]/g, '-')}.txt`);
  await writeFile(file, out);
  console.log(`wrote ${file}\nassignments-sha256: ${sha(canonical)}\nNext: ots stamp "${file}"`);
}
