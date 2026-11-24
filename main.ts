// Token Radar v2, the program (Node 22, standard library only, no network).
//
// It reads the sealed snapshot, hands it to the same two scripts the page loads (dashboard/model.js and
// dashboard/plan.js), and writes what they return: /output/board.json for the gate, /output/data.js for
// the page, the dashboard and screenshots copied beside them, and last /output/dossier.json.
// The model lives in one place on purpose: the page re-runs it in the browser and compares its ranking
// with the board written here, so a screen and a file that disagree would say so on the page.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './dashboard/model.js';
import './dashboard/plan.js';
import { buildDossier } from './vendor/makefun-board.ts';

type Protocol = {
  slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; mcap_usd: number | null; listed_at: string | null; gecko_id: string | null; symbol: string | null;
};
type Snapshot = { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] };
type Ranked = { p: Protocol; watch: boolean; rank: number; score: { implied: number }; plan: { steps: string[] } };

const radar = (globalThis as unknown as { TokenRadar: { buildBoard(s: Snapshot): { rows: Ranked[]; counts: Record<string, number> } } }).TokenRadar;
const root = dirname(fileURLToPath(import.meta.url));

function option(name: string): string | null {
  const flag = `--${name}`;
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    if (a === flag) return process.argv[i + 1] ?? null;
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return null;
}
function stop(why: string): never {
  process.stderr.write(`token-radar-v2: ${why}\n`);
  process.exit(1);
}

const given = option('input') ?? '/input';
const snapshotPath = given.endsWith('.json') ? given : join(given, 'snapshot.json');
if (!existsSync(snapshotPath)) stop(`no snapshot at ${snapshotPath} (pass --input <file or directory>)`);
const outDir = option('output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Snapshot;
if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) stop('the snapshot has no protocols or no watchlist');

const built = radar.buildBoard(snapshot);
const rows = built.rows.map((r) => ({
  slug: r.p.slug,
  name: r.p.name,
  rank: r.rank,
  implied_value_usd: r.score.implied,
  on_watchlist: r.watch,
  farm_steps: r.plan.steps,
}));

/** The gate's shape, checked here first so a board it would refuse is never written. */
function refusal(): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows, outside 100 to 4,000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!known.has(r.slug) || seen.has(r.slug)) return `row ${i + 1}: slug ${r.slug} is unknown or repeated`;
    seen.add(r.slug);
    if (r.rank !== i + 1) return `row ${i + 1}: rank ${r.rank} breaks 1..N`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `row ${i + 1}: implied value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `row ${i + 1}: value rises with rank`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${i + 1}: ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `row ${i + 1}: a farm step of ${s.trim().length} characters`;
  }
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `watchlist protocol ${slug} is missing`;
  if (rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) return 'every implied value is the same';
  return null;
}
const why = refusal();
if (why !== null) stop(`the board would be refused: ${why}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), JSON.stringify({ as_of: snapshot.as_of, rows }) + '\n');
// data.js carries two things: the snapshot the page re-runs the model on, and the ranking just written
// to board.json (slug and value per rank), so the page can show whether its own figures equal the file's.
const handedIn = rows.map((r) => [r.slug, r.implied_value_usd]);
writeFileSync(join(outDir, 'data.js'), `window.RADAR_SNAPSHOT=${JSON.stringify(snapshot)};\nwindow.RADAR_BOARD=${JSON.stringify(handedIn)};\n`);

function copyFlat(name: string): number {
  const from = join(root, name);
  const to = join(outDir, name);
  mkdirSync(to, { recursive: true });
  let n = 0;
  for (const file of readdirSync(from).sort()) {
    if (file.startsWith('.') || !statSync(join(from, file)).isFile()) continue;
    copyFileSync(join(from, file), join(to, file));
    n++;
  }
  return n;
}
const pageFiles = copyFlat('dashboard');
const shots = copyFlat('screenshots');
if (shots < 3) stop(`screenshots/ holds ${shots} images, the gate asks for 3 or 4`);

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } }));

process.stdout.write(`token-radar-v2: ${rows.length} rows ranked (${built.counts.watchlist} watchlist, ${built.counts.early} early), ${built.counts.trading} trading protocols used to calibrate; ${pageFiles} page files, ${shots} screenshots\n`);
