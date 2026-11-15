// Token launch radar, v4 (Node 22, standard library only, no network).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores
// every native pre-token protocol with the joint model in lib/model.ts — v4 prices each protocol
// off one fitted equation (a log-log size curve plus a shrunk category dummy), nets every farm
// plan at a $1,000 ticket with a four-tier verdict, flags parent-linked protocols, prices the
// set-aside rows demoted off their size neighbours, and validates itself on a ladder of
// out-of-sample reads (flat multiple, size curve alone, joint model — leave-one-out, 5-fold
// cross-validation, and a blind time-split, each against the flat baseline) — writes the ranked
// board to /output/board.json and the dashboard's data to /output/data.js, copies this
// repository's dashboard/ to /output, decodes its base64 screenshots/ into /output/screenshots/
// as JPEGs, and writes /output/dossier.json with the vendored make.fun library
// (vendor/makefun-board.ts, the scorer's own file, byte for byte).
//
// The run is fully deterministic: the model derives every number from the snapshot, every sort
// breaks ties by slug, and no clock or random source is read. Two runs write identical bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(radar)};\n`);

/**
 * Copy a directory tree's regular files into `to`, skipping dot-names and dot-directories.
 * Returns the relative paths copied, in deterministic order.
 */
function copyTree(from: string, to: string, rel = ''): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    const st = lstatSync(path);
    const next = rel === '' ? name : `${rel}/${name}`;
    if (st.isDirectory()) {
      copied.push(...copyTree(path, join(to, name), next));
    } else if (st.isFile()) {
      copyFileSync(path, join(to, name));
      copied.push(next);
    }
  }
  return copied;
}

/**
 * Decode this repository's screenshots into `to` as real JPEGs. The images are stored as
 * base64 text (one .jpg.b64 file per image) so the repository stays text-only for tooling
 * that cannot push binary files; the bytes decoded here are the screenshots themselves,
 * unchanged. Returns the image names written, in deterministic order.
 */
function decodeScreenshots(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const written: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (!name.endsWith('.jpg.b64')) continue;
    const image = name.slice(0, -4); // strip '.b64', keep 'N-name.jpg'
    writeFileSync(join(to, image), Buffer.from(readFileSync(join(from, name), 'utf8').trim(), 'base64'));
    written.push(image);
  }
  return written;
}

const dashFiles = copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = decodeScreenshots(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

const vc = radar.verdict_counts;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live shown, ${radar.set_aside_size} set aside)\n` +
    `token radar: validation ladder (leave-one-out, ${radar.backtest_loo.n} live tokens): flat x${Math.exp(radar.backtest_flat.median_abs_log_error).toFixed(2)} -> size curve x${Math.exp(radar.backtest_size.median_abs_log_error).toFixed(2)} -> joint x${Math.exp(radar.backtest_loo.median_abs_log_error).toFixed(2)} (${Math.round(radar.backtest_loo.within_2x_share * 100)}% within 2x)\n` +
    `token radar: 5-fold cross-validation: median error x${Math.exp(radar.backtest_cv.median_abs_log_error).toFixed(2)}, ${Math.round(radar.backtest_cv.within_2x_share * 100)}% within 2x\n` +
    `token radar: blind time-split (fit on the oldest ${radar.backtest_time_split.train_n}, test on the newest ${radar.backtest_time_split.n}): joint x${Math.exp(radar.backtest_time_split.median_abs_log_error).toFixed(2)} vs flat x${Math.exp(radar.backtest_time_split_flat.median_abs_log_error).toFixed(2)}\n` +
    `token radar: farm verdicts at a $1,000 ticket: ROBUST ${vc.ROBUST} · FARM ${vc.FARM} · THIN ${vc.THIN} · SKIP ${vc.SKIP}; best net per hour ${radar.best_per_hour.name} $${radar.best_per_hour.net_per_hour_usd}/h\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
