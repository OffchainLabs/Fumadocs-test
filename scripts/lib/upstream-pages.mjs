/**
 * Derives the canonical URL of every page the upstream Docusaurus site (docs.arbitrum.io) serves.
 *
 * `redirects.legacy.mjs` used to be seeded only from upstream's own redirect *sources*. That
 * covers the URLs upstream itself had already moved and nothing else: a canonical URL that was
 * never a redirect source (`/stylus/quickstart`, say) had no entry at all, and would 404 at
 * cutover because upstream served docs at the site root and this site serves them under `/docs`.
 * So the generator seeds from both: upstream's redirect sources *and* every canonical page URL.
 *
 * The rules below are Docusaurus's, reimplemented rather than imported: running Docusaurus needs
 * its whole toolchain, and only the routing subset matters here. They are transcribed from
 * `@docusaurus/plugin-content-docs` (`slug.js`, `numberPrefix.js`, `docs.js#isCategoryIndex`) as
 * of the pinned upstream checkout, and verified against upstream's published `/llms.txt`: the
 * 288 file-derived URLs matched it exactly, with the remaining two coming from `sidebars.js`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix } from 'node:path';

/**
 * Docusaurus's `DefaultNumberPrefixParser`: `02-run-full-node` -> `run-full-node`.
 *
 * The ignored pattern keeps date-like and version-like names (`2024-06-audit`, `7.0-foo`) intact,
 * exactly as upstream does. Stripping those would invent URLs that upstream never served.
 */
const IGNORED_PREFIX = /^\d+[-_.]\d+/;
const NUMBER_PREFIX = /^(?<numberPrefix>\d+)\s*[-_.]+\s*(?<suffix>[^-_.\s].*)$/;

export function stripNumberPrefix(name) {
  if (IGNORED_PREFIX.test(name)) return name;
  return NUMBER_PREFIX.exec(name)?.groups.suffix ?? name;
}

export function stripPathNumberPrefixes(path) {
  return path.split('/').map(stripNumberPrefix).join('/');
}

/**
 * Directories under `docs/` that are not user-facing pages.
 *
 * `api` and `hosted-pdfs` are excluded by upstream's own Docusaurus config (`exclude`) and
 * sitemap/llms `ignorePatterns`; `sdk` is the TypeDoc-generated SDK reference, which this site
 * never ported and which upstream links to GitHub for; `superpowers` is agent scratch space.
 */
export const EXCLUDED_TOP_LEVEL_DIRS = new Set(['api', 'hosted-pdfs', 'sdk', 'superpowers']);

/**
 * Directory name that marks reusable fragments. Upstream's `nonCanonicalRoutePatterns` lists
 * `**\/partials/**` alongside the `_`-prefix convention, because this repo has non-underscored
 * files inside `partials/` directories.
 */
const PARTIALS_DIR = 'partials';

/**
 * Individually excluded files. `Offchain-pattern-guide.md` is a writing-pattern guide for the docs
 * team that upstream happens to publish; it has no counterpart here and no reader on
 * docs.arbitrum.io is looking for it. `scripts/upstream-drift.mjs` skips it for the same reason.
 */
export const EXCLUDED_SOURCES = new Set(['Offchain-pattern-guide.md']);

/** True for sources Docusaurus routes but that are not standalone pages. */
export function isExcludedSource(source) {
  if (EXCLUDED_SOURCES.has(source)) return true;
  const segments = source.split('/');
  if (EXCLUDED_TOP_LEVEL_DIRS.has(segments[0])) return true;
  if (segments.includes(PARTIALS_DIR)) return true;
  // Docusaurus's default `exclude` drops `_`-prefixed files and everything under `_`-prefixed
  // directories. Upstream repeats it in `nonCanonicalRoutePatterns` for the sitemap.
  return segments.some((segment) => segment.startsWith('_'));
}

/**
 * Docusaurus's `isCategoryIndex`: a file named `index`, `readme`, or the same as its immediate
 * parent directory takes the directory's URL rather than its own. Both names are compared raw,
 * before number-prefix stripping, which is what upstream does.
 */
export function isCategoryIndex({ fileName, parentDir }) {
  const eligible = ['index', 'readme', parentDir?.toLowerCase()];
  return eligible.includes(fileName.toLowerCase());
}

/** Minimal frontmatter read: `id` and `slug` are the only fields that move a page's URL. */
export function parseRoutingFrontmatter(text) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return {};
  const out = {};
  for (const line of block[1].split('\n')) {
    const match = line.match(/^(id|slug):\s*(.+?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

/** Resolve a relative slug against its directory, the way Docusaurus's `resolvePathname` does. */
function resolveAgainstDir(slug, dirSlug) {
  return posix.resolve(dirSlug, slug);
}

/** `/a/b/` and `/a/b` both normalise to `/a/b`; the site root stays `/`. */
export const normaliseUrl = (url) => url.replace(/\/+$/, '') || '/';

/**
 * The URL upstream serves a doc file at, given its path relative to `docs/` and its frontmatter.
 *
 * Upstream sets `routeBasePath: '/'`, so the computed slug *is* the URL, with no section prefix.
 */
export function docUrl({ source, frontmatter = {} }) {
  const parsed = posix.parse(source);
  const sourceDirName = parsed.dir === '' ? '.' : parsed.dir;
  const dirSlug = sourceDirName === '.' ? '/' : `/${stripPathNumberPrefixes(sourceDirName)}/`;

  if (frontmatter.slug?.startsWith('/')) return normaliseUrl(frontmatter.slug);

  const parentDir = sourceDirName === '.' ? undefined : sourceDirName.split('/').at(-1);
  if (!frontmatter.slug && isCategoryIndex({ fileName: parsed.name, parentDir })) {
    return normaliseUrl(dirSlug);
  }

  const baseSlug = frontmatter.slug ?? frontmatter.id ?? stripNumberPrefix(parsed.name);
  return normaliseUrl(resolveAgainstDir(baseSlug, dirSlug));
}

/** Every `.md`/`.mdx` source under `docs/`, as posix paths relative to it. */
export function collectPageSources(docsDir) {
  const sources = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, rel ? `${rel}/${entry}` : entry);
      else if (/\.mdx?$/.test(entry)) sources.push(rel ? `${rel}/${entry}` : entry);
    }
  };
  walk(docsDir, '');
  return sources.filter((source) => !isExcludedSource(source));
}

/**
 * Category landing pages that exist only in `sidebars.js`, not as files.
 *
 * A `generated-index` category link with an explicit `slug` is a real, indexable URL upstream
 * (`/arbitrum-essentials`, `/stylus`). It appears in upstream's sitemap and `llms.txt`. One
 * without a slug lands under `/category/…`, which upstream marks non-canonical, so it is skipped.
 *
 * `sidebars.js` is plain CommonJS, so it is required rather than pattern-matched. Returns an empty
 * list when it cannot be loaded: a missing landing page costs a redirect, never a wrong one.
 */
export function readGeneratedIndexUrls(sidebarsPath) {
  let sidebars;
  try {
    sidebars = createRequire(sidebarsPath)(sidebarsPath);
  } catch {
    return [];
  }
  const urls = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const link = node.link;
    if (link?.type === 'generated-index' && typeof link.slug === 'string') {
      urls.add(normaliseUrl(link.slug));
    }
    Object.values(node).forEach(visit);
  };
  visit(sidebars.default ?? sidebars);
  return [...urls];
}

/**
 * Every canonical upstream URL: one per routable doc file, plus the sidebar landing pages.
 *
 * Sorted and deduplicated, so the generator's output order never depends on directory iteration.
 */
export function deriveCanonicalUrls({ docsDir, sidebarsPath }) {
  const urls = new Set();
  for (const source of collectPageSources(docsDir)) {
    const frontmatter = parseRoutingFrontmatter(readFileSync(join(docsDir, source), 'utf8'));
    urls.add(docUrl({ source, frontmatter }));
  }
  if (sidebarsPath) for (const url of readGeneratedIndexUrls(sidebarsPath)) urls.add(url);
  return [...urls].sort((a, b) => a.localeCompare(b));
}

/**
 * Paths this site already serves, which therefore must never become a redirect source.
 *
 * Next applies `redirects()` before anything renders, so a redirect whose source is a live route
 * wins over the route, and the page, asset, or API handler becomes unreachable. `redirects:check`
 * reports that as SHADOWED for doc pages, but it only knows about `/docs`, so the root-level
 * routes and the `public/` assets are guarded here instead.
 *
 * Three shapes, because the collision is not the same in each case:
 *  - `exact`: the path itself is a route or a file (`/`, `/llms.txt`, `/favicon.ico`).
 *  - `subtree`: the path and everything under it (`/api`, `/og`).
 *  - `children`: only what is *under* it (`/audit-reports/*.pdf` are files; `/audit-reports`
 *    itself is not, and upstream served a page there that this site serves at
 *    `/docs/audit-reports`, so that one redirect is both safe and wanted).
 *
 * `/docs` is deliberately absent. It is the one namespace whose live pages are enumerable, from
 * the content tree, so the generator checks a `/docs` source against that inventory instead of
 * banning the prefix. A few legacy sources are `/docs`-prefixed and name no page here.
 */
export const RESERVED_EXACT = [
  '/',
  '/llms.txt',
  '/llms-full.txt',
  '/favicon.ico',
  '/icon.png',
  '/apple-icon.png',
  '/nitro-whitepaper.pdf',
  '/sitemap.xml',
  '/robots.txt',
];
export const RESERVED_SUBTREES = ['/api', '/og', '/llms.mdx', '/img', '/_next'];
export const RESERVED_CHILDREN = ['/audit-reports', '/brand', '/fonts'];

/** Why this path may not be a redirect source, or null when it is free to use. */
export function reservedRouteReason(url) {
  const path = normaliseUrl(url);
  if (RESERVED_EXACT.includes(path)) return `reserved route (${path})`;
  for (const prefix of RESERVED_SUBTREES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return `reserved subtree (${prefix})`;
  }
  for (const prefix of RESERVED_CHILDREN) {
    if (path.startsWith(`${prefix}/`)) return `reserved asset directory (${prefix}/)`;
  }
  return null;
}
