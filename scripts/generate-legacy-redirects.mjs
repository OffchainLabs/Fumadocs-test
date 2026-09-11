#!/usr/bin/env node
/**
 * Ports the legacy Docusaurus URL space (docs.arbitrum.io) into this site.
 *
 * Seeds from two inputs and resolves both with the same rules: upstream's own redirect sources
 * (`vercel.json`) and every canonical upstream page URL (derived from its `docs/` tree). The
 * second half is what keeps a URL such as `/stylus/quickstart` (never a redirect source anywhere,
 * and so never mapped) from 404ing at cutover just because this site serves docs under `/docs`.
 *
 * The resolution policy lives in `scripts/lib/legacy-redirects.mjs`; the URL derivation lives in
 * `scripts/lib/upstream-pages.mjs`. This file is the command line around them.
 *
 * The output is committed, so builds never need the sibling arbitrum-docs repo. Only
 * regeneration does. `git diff` after a run shows whether it was stale.
 *
 * Usage:
 *   node scripts/generate-legacy-redirects.mjs [--upstream <repo dir>] [--source <vercel.json>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

import { build, render } from './lib/legacy-redirects.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_REDIRECTS = join(ROOT, 'redirects.legacy.mjs');
const OUT_TODO = join(ROOT, 'redirects.legacy.todo.json');
const CONTENT_DIR = join(ROOT, 'content/docs');
const UPSTREAM_CONFIG = join(ROOT, 'scripts/data/upstream.config.json');

/**
 * Locate the sibling arbitrum-docs checkout, in the order `scripts/data/upstream.config.json`
 * documents: explicit flag, `UPSTREAM_DOCS_REPO`, the configured `repo`, then the probe paths.
 * Probes resolve against this repo, so a git worktree (one directory deeper than a clone) finds
 * the checkout through `../../arbitrum-docs` without anyone passing a flag.
 */
function resolveUpstreamRepo(explicit) {
  if (explicit) return explicit;
  const config = JSON.parse(readFileSync(UPSTREAM_CONFIG, 'utf8'));
  const expand = (p) => resolve(ROOT, p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);
  const candidates = [
    process.env.UPSTREAM_DOCS_REPO,
    config.repo,
    ...(config.probePaths ?? []),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const path = expand(candidate);
    if (existsSync(join(path, 'vercel.json'))) return path;
  }
  throw new Error(
    `generate-legacy-redirects: no arbitrum-docs checkout found. Tried ` +
      `${candidates.map(expand).join(', ')}. Pass --upstream <dir> or set UPSTREAM_DOCS_REPO.`,
  );
}

function parseArgs(argv) {
  const flag = (...names) => {
    const i = argv.findIndex((arg) => names.includes(arg));
    return i === -1 ? undefined : resolve(argv[i + 1]);
  };
  // `--source` names the redirect corpus; the upstream repo is its parent unless given outright.
  const source = flag('--source');
  const upstreamRoot = resolveUpstreamRepo(
    flag('--upstream', '--tree-a') ?? (source ? dirname(source) : undefined),
  );
  return {
    sourcePath: source ?? join(upstreamRoot, 'vercel.json'),
    upstreamDocsDir: join(upstreamRoot, 'docs'),
    sidebarsPath: join(upstreamRoot, 'sidebars.js'),
  };
}

/** Write through Prettier so generated output never trips `pnpm format:check`. */
async function writeFormatted(filePath, contents) {
  const config = await resolveConfig(filePath);
  writeFileSync(filePath, await format(contents, { ...config, filepath: filePath }));
}

async function main() {
  const { sourcePath, upstreamDocsDir, sidebarsPath } = parseArgs(process.argv.slice(2));
  const result = build({ sourcePath, contentDir: CONTENT_DIR, upstreamDocsDir, sidebarsPath });

  await writeFormatted(OUT_REDIRECTS, render(result.redirects));
  await writeFormatted(OUT_TODO, JSON.stringify(result.todo, null, 2));

  console.log(`redirect corpus : ${sourcePath}`);
  console.log(`upstream docs   : ${upstreamDocsDir}`);
  console.log(`routable urls   : ${result.validCount} (this site)`);
  console.log(`canonical urls  : ${result.canonicalCount} (upstream pages)`);
  console.log(`emitted         : ${result.redirects.length}  -> redirects.legacy.mjs`);
  console.log(`  from canonical: ${result.canonicalEmitted}`);
  console.log(`unported        : ${result.todo.length}  -> redirects.legacy.todo.json`);
  console.log(`duplicates      : ${result.duplicates} redirect source(s), first occurrence kept`);
  console.log(`  canonical already mapped as a redirect source: ${result.canonicalAlreadyMapped}`);
  console.log(`slug fallback   : ${result.slugMatched.length} (basename matched exactly one page)`);
  console.log(`section landing : ${result.landings.length} (page not ported; nearest section)`);

  console.log(`\nskipped, source is a live route here (${result.shadowed.length}):`);
  for (const s of result.shadowed) console.log(`  ${s.source}  [${s.kind}]: ${s.reason}`);

  console.log(`\nvia section rename (${result.renamed.length}), review these:`);
  for (const r of result.renamed) console.log(`  ${r.source}\n    ${r.from} => ${r.to}`);
}

await main();
