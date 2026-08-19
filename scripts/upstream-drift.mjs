/**
 * upstream-drift — compare this repo against the legacy arbitrum-docs tree.
 *
 * Usage:
 *   pnpm drift                       # human report; exits 1 if anything is absent or gutted
 *   pnpm drift --json                # JSON to stdout; exits 0
 *   pnpm drift --tree-a <path>       # override the legacy tree location
 *
 * Reports three things:
 *   ABSENT  a legacy page with no counterpart here
 *   GUTTED  a page present here whose body is under 70% of the legacy body
 *   Each ABSENT item is labelled DRIFT (added upstream after the port window closed, never in scope)
 *   or MISS (existed before the port window closed and should have been ported).
 *
 * NOT YET A RELIABLE WORK LIST: pairing depends on `RENAME_MAP` in lib/tree-compare.mjs, which
 * currently covers only a handful of the ~34 known migration renames. A page ported under a new
 * name that isn't in `RENAME_MAP` still surfaces here as ABSENT (looks unported) rather than being
 * matched to its real counterpart. Treat ABSENT entries as a starting point to investigate, not a
 * ground-truth backlog, until `RENAME_MAP` is filled in.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { bodyLineCount, buildTreeIndex, resolveTreeBMatch } from './lib/tree-compare.mjs';

const PORT_WINDOW_END = '2026-07-10';
const GUTTED_RATIO = 0.7;
const DEFAULT_TREE_A = '/Users/allup/OCL/arbitrum-docs/docs';
const SKIP = [/^superpowers\//, /^api\//, /(^|\/)partials\//, /^Offchain-pattern-guide\.md$/];

function listDocs(root) {
  const out = [];
  const walk = (abs) => {
    for (const d of readdirSync(abs, { withFileTypes: true })) {
      const next = path.join(abs, d.name);
      if (d.isDirectory()) walk(next);
      else if (/\.mdx?$/.test(d.name)) out.push(path.relative(root, next));
    }
  };
  walk(root);
  return out;
}

function addedDate(treeA, relPath) {
  try {
    const out = execFileSync(
      'git',
      ['-C', treeA, 'log', '--diff-filter=A', '--format=%ad', '--date=short', '--', path.join('docs', relPath)],
      { encoding: 'utf8' },
    ).trim().split('\n');
    return out[out.length - 1] || null;
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const idx = argv.indexOf('--tree-a');
  const treeA = idx !== -1 ? argv[idx + 1] : DEFAULT_TREE_A;
  const treeARepo = path.dirname(treeA);
  const treeB = path.join(process.cwd(), 'content', 'docs');

  if (!existsSync(treeA)) {
    console.error(`upstream-drift: legacy tree not found at ${treeA}. Pass --tree-a <path>.`);
    process.exitCode = 1;
    return;
  }

  const bIndex = buildTreeIndex(listDocs(treeB));

  const absent = [];
  const gutted = [];

  for (const relA of listDocs(treeA)) {
    if (SKIP.some((re) => re.test(relA))) continue;
    const relB = resolveTreeBMatch(bIndex, relA);

    if (!relB) {
      const added = addedDate(treeARepo, relA);
      absent.push({ treeA: relA, added, kind: added && added > PORT_WINDOW_END ? 'DRIFT' : 'MISS' });
      continue;
    }

    const aLines = bodyLineCount(readFileSync(path.join(treeA, relA), 'utf8'));
    const bLines = bodyLineCount(readFileSync(path.join(treeB, relB), 'utf8'));
    if (aLines > 20 && bLines / aLines < GUTTED_RATIO) {
      gutted.push({ treeA: relA, treeB: relB, aLines, bLines, ratio: +(bLines / aLines).toFixed(2) });
    }
  }

  if (json) {
    console.log(JSON.stringify({ absent, gutted }, null, 2));
    return;
  }

  console.log(`upstream-drift: ${absent.length} absent, ${gutted.length} gutted\n`);
  for (const a of [...absent].sort((x, y) => (y.added ?? '').localeCompare(x.added ?? ''))) {
    console.log(`  ABSENT  ${a.kind}  added ${a.added ?? 'unknown'}  ${a.treeA}`);
  }
  if (absent.length && gutted.length) console.log('');
  for (const g of [...gutted].sort((x, y) => x.ratio - y.ratio)) {
    console.log(`  GUTTED  ratio ${g.ratio}  ${g.aLines}->${g.bLines}  ${g.treeA}  ->  ${g.treeB}`);
  }

  if (absent.length || gutted.length) process.exitCode = 1;
}

main();
