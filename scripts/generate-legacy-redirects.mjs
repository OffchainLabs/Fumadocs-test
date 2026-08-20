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

/**
 * Every routable doc URL on this site, derived from the content tree, keyed by lowercased URL.
 *
 * The legacy corpus has casing drift (`/sdk/assetbridger` next to `/sdk/assetBridger`), and this
 * tree has mixed-case directories (`oracles/DIA`, `third-party-docs/Circle`). Matching
 * case-sensitively would report a destination that exists as "not in tree". The map value is the
 * real casing, which is what must be emitted — a redirect to the wrong case still 404s.
 */
function collectValidUrls() {
  const urls = new Map();
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}/${entry}`);
      } else if (entry.endsWith('.mdx') && !entry.startsWith('_')) {
        const base = entry.slice(0, -'.mdx'.length);
        const url = base === 'index' ? `/docs${prefix}` : `/docs${prefix}/${base}`;
        const key = url.toLowerCase();
        const clash = urls.get(key);
        if (clash && clash !== url) {
          throw new Error(
            `generate-legacy-redirects: two pages differ only by case (${clash} vs ${url}); ` +
              `case-insensitive matching cannot pick between them.`,
          );
        }
        urls.set(key, url);
      }
    }
  };
  walk(CONTENT_DIR, '');
  return urls;
}

/** Resolve a URL to its real casing on this site, or undefined when no page serves it. */
const resolveUrl = (valid, url) => valid.get(url.toLowerCase());

/** `/(a/b/?)` and `/a/b/` both normalise to `/a/b`. */
function normaliseSource(source) {
  const group = source.match(/^\/\((.*)\)$/);
  const bare = group ? `/${group[1]}` : source;
  return bare.replace(/\/\?$/, '').replace(/\/+$/, '') || '/';
}

const isAbsolute = (value) => /^https?:\/\//.test(value);

/**
 * Destinations the legacy corpus records as paths but that are not paths: an absolute URL with a
 * stray leading slash (`/https://…`) or a doubled root (`//launch-…`). Slug-matching these would
 * find a real page and emit a confidently-wrong redirect, so they are rejected outright.
 */
const isMalformed = (value) => value.startsWith('//') || /^\/https?:/.test(value);

/**
 * Page basename, reduced for comparison: lowercase, punctuation dropped. `Gas-Fees.mdx` and
 * `gas_fees.mdx` collapse to the same key.
 */
const slugKey = (url) =>
  url
    .split('/')
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** slug -> every routable URL ending in that slug. Built once from the same page inventory. */
function indexBySlug(valid) {
  const bySlug = new Map();
  for (const url of valid.values()) {
    const key = slugKey(url);
    if (!bySlug.has(key)) bySlug.set(key, []);
    bySlug.get(key).push(url);
  }
  return bySlug;
}

/**
 * How many legacy pages carried each slug, read from the sibling repo's `docs/` tree.
 *
 * The slug fallback assumes a basename identifies a page. That holds only if the basename was
 * unique upstream too. It was not always: upstream had both
 * `launch-arbitrum-chain/chain-config/costs/gas-optimization` and
 * `stylus/best-practices/gas-optimization`, and only the Stylus one was ported — so matching on
 * basename alone sends a chain-config page to a Stylus page. Where the legacy path was doing the
 * disambiguating, the fallback cannot, and must decline.
 *
 * Returns null when the tree is unavailable, which makes the fallback decline everything rather
 * than match unverified.
 */
function countUpstreamSlugs(sourcePath) {
  const docsDir = join(dirname(sourcePath), 'docs');
  const counts = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.mdx?$/.test(entry) && !entry.startsWith('_')) {
        const key = slugKey(entry.replace(/\.mdx?$/, ''));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  };
  try {
    walk(docsDir);
  } catch {
    return null;
  }
  return counts;
}

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
  const bySlug = indexBySlug(valid);
  const upstreamSlugs = countUpstreamSlugs(sourcePath);

  const redirects = [];
  const todo = [];
  const renamed = [];
  const slugMatched = [];
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
    if (resolveUrl(valid, source)) {
      todo.push({ source, legacyDestination: entry.destination, reason: 'source-is-live-url' });
      continue;
    }

    if (isAbsolute(entry.destination)) {
      redirects.push({ source, destination: entry.destination, permanent: !!entry.permanent });
      continue;
    }

    if (isMalformed(entry.destination)) {
      todo.push({ source, legacyDestination: entry.destination, reason: 'malformed-destination' });
      continue;
    }

    const candidates = candidateDestinations(entry.destination);
    const index = candidates.findIndex((candidate) => resolveUrl(valid, candidate));

    if (index === -1) {
      // No prefix rule resolved it. The page may still exist under a path SECTION_RENAMES does
      // not describe — the deep restructures moved pages individually, so no prefix rule can.
      // Fall back to the basename, and accept it only when exactly one page carries that slug:
      // two candidates means the generator would be picking, and a plausible-but-wrong redirect
      // is worse than none.
      const key = slugKey(entry.destination);
      const hits = bySlug.get(key) ?? [];
      if (hits.length !== 1) {
        todo.push({
          source,
          legacyDestination: entry.destination,
          reason: hits.length === 0 ? 'destination-not-in-tree' : 'ambiguous-slug',
          ...(hits.length > 1 ? { candidates: hits } : {}),
        });
        continue;
      }
      // The basename only identifies a page if it was unique upstream too.
      if (!upstreamSlugs || (upstreamSlugs.get(key) ?? 0) > 1) {
        todo.push({
          source,
          legacyDestination: entry.destination,
          reason: upstreamSlugs ? 'ambiguous-upstream-slug' : 'slug-fallback-unverifiable',
          ...(upstreamSlugs ? { wouldMatch: hits[0] } : {}),
        });
        continue;
      }
      slugMatched.push({ source, from: entry.destination, to: hits[0] });
      redirects.push({ source, destination: hits[0], permanent: !!entry.permanent });
      continue;
    }

    // Emit the tree's real casing, not the legacy corpus's.
    const destination = resolveUrl(valid, candidates[index]);
    if (index > 0) renamed.push({ source, from: entry.destination, to: destination });

    redirects.push({ source, destination, permanent: !!entry.permanent });
  }

  redirects.sort((a, b) => a.source.localeCompare(b.source));
  todo.sort((a, b) => a.source.localeCompare(b.source));
  return { redirects, todo, renamed, slugMatched, duplicates, validCount: valid.size };
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

const { redirects, todo, renamed, slugMatched, duplicates, validCount } = build(sourcePath);

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
console.log(`slug fallback : ${slugMatched.length} (basename matched exactly one page)`);
console.log(`\nvia section rename (${renamed.length}) — review these:`);
for (const r of renamed) console.log(`  ${r.source}\n    ${r.from} => ${r.to}`);
