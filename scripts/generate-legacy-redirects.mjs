#!/usr/bin/env node
/**
 * Ports the legacy Docusaurus redirect map (docs.arbitrum.io) into this site.
 *
 * Legacy URLs were served at the site root (`/stylus/using-cli`); this site
 * serves docs under `/docs`. So sources stay root-level — that is what real
 * inbound links look like — and destinations are rewritten to `/docs/...`.
 *
 * Only redirects whose destination provably exists in `content/docs` are
 * emitted. Everything else lands in the `.todo.json` worklist rather than being
 * guessed at, because a redirect to a merely-plausible page is worse than a 404:
 * it silently sends readers somewhere wrong.
 *
 * The output is committed, so builds never need the sibling arbitrum-docs repo —
 * only regeneration does. `git diff` after a run shows whether it was stale.
 *
 * Usage:
 *   node scripts/generate-legacy-redirects.mjs [--source <vercel.json>]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = resolve(ROOT, '../arbitrum-docs/vercel.json');
const OUT_REDIRECTS = join(ROOT, 'redirects.legacy.mjs');
const OUT_TODO = join(ROOT, 'redirects.legacy.todo.json');
const CONTENT_DIR = join(ROOT, 'content/docs');

/**
 * Legacy arbitrum-docs section -> this site's section.
 *
 * Only renames where the whole section moved wholesale and the target section
 * exists. Deep restructures (launch-arbitrum-chain, build-decentralized-apps)
 * are deliberately absent: their pages moved individually, so a section-level
 * rename would produce confidently-wrong destinations.
 */
const SECTION_RENAMES = [
  ['/run-arbitrum-node', '/run-a-node'],
  ['/node-running', '/run-a-node'],
  ['/for-devs', '/build-decentralized-apps'],
  ['/intro', '/get-started'],
  ['/learn-more', '/get-started'],
  ['/faqs', '/get-started'],
];

/** Every routable doc URL on this site, derived from the content tree. */
function collectValidUrls() {
  const urls = new Set();
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}/${entry}`);
      } else if (entry.endsWith('.mdx') && !entry.startsWith('_')) {
        const base = entry.slice(0, -'.mdx'.length);
        urls.add(base === 'index' ? `/docs${prefix}` || '/docs' : `/docs${prefix}/${base}`);
      }
    }
  };
  walk(CONTENT_DIR, '');
  return urls;
}

/** `/(a/b/?)` and `/a/b/` both normalise to `/a/b`. */
function normaliseSource(source) {
  const group = source.match(/^\/\((.*)\)$/);
  const bare = group ? `/${group[1]}` : source;
  return bare.replace(/\/\?$/, '').replace(/\/+$/, '') || '/';
}

const isAbsolute = (value) => /^https?:\/\//.test(value);

/** Candidate destinations, most-literal first. */
function candidateDestinations(destination) {
  const base = destination.replace(/\/+$/, '');
  const out = [`/docs${base}`];
  for (const [from, to] of SECTION_RENAMES) {
    if (base === from || base.startsWith(`${from}/`)) {
      out.push(`/docs${to}${base.slice(from.length)}`);
    }
  }
  return out;
}

function build(sourcePath) {
  const legacy = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const valid = collectValidUrls();

  const redirects = [];
  const todo = [];
  const renamed = [];
  const seen = new Set();
  let duplicates = 0;

  for (const entry of legacy.redirects ?? []) {
    if (entry.source.includes('__redirects-autogen')) continue;
    // The SDK reference was never ported and has no on-site home: arbitrum-docs deleted its
    // /sdk section and links readers to the GitHub repo from the sidebar. These legacy entries
    // are not a gap to close, so drop them instead of parking them in the worklist forever.
    if (entry.destination === '/sdk' || entry.destination.startsWith('/sdk/')) continue;

    const source = normaliseSource(entry.source);
    if (seen.has(source)) {
      duplicates += 1;
      continue;
    }
    seen.add(source);

    // A legacy source that is already a live URL here must never be redirected.
    if (valid.has(source)) {
      todo.push({ source, legacyDestination: entry.destination, reason: 'source-is-live-url' });
      continue;
    }

    if (isAbsolute(entry.destination)) {
      redirects.push({ source, destination: entry.destination, permanent: !!entry.permanent });
      continue;
    }

    const candidates = candidateDestinations(entry.destination);
    const index = candidates.findIndex((candidate) => valid.has(candidate));
    if (index === -1) {
      todo.push({
        source,
        legacyDestination: entry.destination,
        reason: 'destination-not-in-tree',
      });
      continue;
    }
    if (index > 0) renamed.push({ source, from: entry.destination, to: candidates[index] });

    redirects.push({ source, destination: candidates[index], permanent: !!entry.permanent });
  }

  redirects.sort((a, b) => a.source.localeCompare(b.source));
  todo.sort((a, b) => a.source.localeCompare(b.source));
  return { redirects, todo, renamed, duplicates, validCount: valid.size };
}

function render(redirects) {
  const body = redirects
    .map(
      (r) =>
        `  {\n    source: '${r.source}',\n    destination: '${r.destination}',\n` +
        `    permanent: ${r.permanent},\n  },`,
    )
    .join('\n');
  return (
    `// GENERATED by scripts/generate-legacy-redirects.mjs — do not edit by hand.\n` +
    `// Regenerate with \`pnpm redirects:legacy\`.\n` +
    `//\n` +
    `// Legacy docs.arbitrum.io URLs (root-level) -> this site's /docs paths.\n` +
    `// Unportable entries are listed in redirects.legacy.todo.json.\n` +
    `/** @type {{ source: string, destination: string, permanent: boolean }[]} */\n` +
    `export const legacyRedirects = [\n${body}\n];\n`
  );
}

const args = process.argv.slice(2);
const sourceArg = args.indexOf('--source');
const sourcePath = sourceArg === -1 ? DEFAULT_SOURCE : resolve(args[sourceArg + 1]);

const { redirects, todo, renamed, duplicates, validCount } = build(sourcePath);

/** Write through Prettier so generated output never trips `pnpm format:check`. */
async function writeFormatted(filePath, contents) {
  const config = await resolveConfig(filePath);
  writeFileSync(filePath, await format(contents, { ...config, filepath: filePath }));
}

await writeFormatted(OUT_REDIRECTS, render(redirects));
await writeFormatted(OUT_TODO, JSON.stringify(todo, null, 2));

console.log(`source        : ${sourcePath}`);
console.log(`routable urls : ${validCount}`);
console.log(`emitted       : ${redirects.length}  -> redirects.legacy.mjs`);
console.log(`unported      : ${todo.length}  -> redirects.legacy.todo.json`);
console.log(`duplicates    : ${duplicates} (first occurrence kept)`);
console.log(`\nvia section rename (${renamed.length}) — review these:`);
for (const r of renamed) console.log(`  ${r.source}\n    ${r.from} => ${r.to}`);
