// Token radar — model v5 (spec radar5-spec v1). Node 22, standard library only.
//
// Reads the sealed snapshot, ranks every eligible pre-token protocol with the
// fixed model in lib/model.ts (implied = TVL x 0.246x multiple x growth x
// maturity, capped at 20x TVL), writes board.json and data.js, copies the
// dashboard and screenshots into the output directory, and writes the
// dossier the judge reads with the vendored make.fun library.
//
// Run locally as:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_LABEL, SPEC_VERSION, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar v5: no snapshot at ${inputFile}; pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar v5: refusing to write a board the gate rejects: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const boardJson = {
  rows: board,
  model_version: radar.model_version,
  model_label: radar.model_label,
  spec_version: radar.spec_version,
  formula: radar.formula,
  multiple: radar.multiple,
  multiple_display: radar.multiple_display,
  cap_multiple: radar.cap_multiple,
  as_of: radar.as_of,
  source: radar.source,
  floor_usd: radar.floor_usd,
  validation: radar.validation,
  accounting: radar.accounting,
  set_aside: radar.set_aside,
};
writeFileSync(join(out, 'board.json'), `${JSON.stringify(boardJson)}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyDir(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar v5: screenshots/ holds ${shots.length} image(s); hand in 3: board, detail, filtered\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar v5: screenshots/${name}: name must be letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }),
);

process.stdout.write(
  `token radar ${MODEL_LABEL} (${SPEC_VERSION}): ${snapshot.protocols.length} protocols, ` +
    `${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked ` +
    `(${radar.accounting.live_token_set_aside} live-token set aside, ${radar.accounting.pre_token_set_aside} pre-token set aside)\n` +
    `token radar v5: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ` +
    `${join(out, 'dashboard')} (${dashboardFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
