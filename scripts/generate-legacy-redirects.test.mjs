import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { build } from './lib/legacy-redirects.mjs';
import {
  docUrl,
  isExcludedSource,
  readGeneratedIndexUrls,
  reservedRouteReason,
} from './lib/upstream-pages.mjs';

// --- canonical URL derivation (Docusaurus routing rules) ---------------------------------------

test('docUrl strips numeric prefixes from the file name and every directory', () => {
  assert.equal(
    docUrl({ source: 'run-arbitrum-node/02-run-full-node.mdx' }),
    '/run-arbitrum-node/run-full-node',
  );
  assert.equal(docUrl({ source: '01-section/02-sub/03-page.md' }), '/section/sub/page');
});

test('docUrl keeps date-like and version-like prefixes, as upstream does', () => {
  assert.equal(docUrl({ source: 'notices/2024-06-upgrade.mdx' }), '/notices/2024-06-upgrade');
  assert.equal(docUrl({ source: 'releases/7.0-notes.mdx' }), '/releases/7.0-notes');
});

test('docUrl gives index, README and folder-named files the directory URL', () => {
  assert.equal(docUrl({ source: 'stylus/index.mdx' }), '/stylus');
  assert.equal(docUrl({ source: 'stylus/README.md' }), '/stylus');
  assert.equal(docUrl({ source: 'stylus/stylus.mdx' }), '/stylus');
  assert.equal(docUrl({ source: 'index.mdx' }), '/');
});

test('docUrl honours an absolute slug override, including the site root', () => {
  assert.equal(
    docUrl({
      source: 'build-decentralized-apps/01-quickstart-solidity-remix.mdx',
      frontmatter: { slug: '/build-decentralized-apps/quickstart-solidity-remix' },
    }),
    '/build-decentralized-apps/quickstart-solidity-remix',
  );
  assert.equal(docUrl({ source: 'get-started/overview.mdx', frontmatter: { slug: '/' } }), '/');
});

test('docUrl honours an id override, which renames only the last segment', () => {
  assert.equal(
    docUrl({
      source: 'for-devs/oracles/supra/use-supras-price-feed-oracle.mdx',
      frontmatter: { id: 'supras-price-feed' },
    }),
    '/for-devs/oracles/supra/supras-price-feed',
  );
});

test('docUrl prefers a slug over an id when a page carries both', () => {
  assert.equal(
    docUrl({ source: 'a/b.mdx', frontmatter: { id: 'from-id', slug: '/from-slug' } }),
    '/from-slug',
  );
});

test('isExcludedSource drops partials, generated references and the internal pattern guide', () => {
  assert.equal(isExcludedSource('stylus/partials/_setup-foundry.mdx'), true);
  assert.equal(isExcludedSource('for-devs/_draft.mdx'), true);
  assert.equal(isExcludedSource('sdk/assetBridger/erc20Bridger.md'), true);
  assert.equal(isExcludedSource('api/reference.md'), true);
  assert.equal(isExcludedSource('hosted-pdfs/whitepaper.md'), true);
  assert.equal(isExcludedSource('Offchain-pattern-guide.md'), true);
  assert.equal(isExcludedSource('stylus/quickstart.mdx'), false);
});

test('readGeneratedIndexUrls takes category landings that have a slug, and only those', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sidebars-'));
  const file = path.join(dir, 'sidebars.js');
  writeFileSync(
    file,
    `module.exports = {
       main: [
         { type: 'category', link: { type: 'generated-index', slug: '/landing' }, items: ['a'] },
         { type: 'category', link: { type: 'generated-index' }, items: ['b'] },
         { type: 'category', link: { type: 'doc', id: 'c' }, items: ['c'] },
       ],
     };`,
  );
  assert.deepEqual(readGeneratedIndexUrls(file), ['/landing']);
});

test('readGeneratedIndexUrls returns nothing rather than throwing when the file will not load', () => {
  assert.deepEqual(readGeneratedIndexUrls('/nowhere/sidebars.js'), []);
});

// --- routes a redirect source may not shadow ---------------------------------------------------

test('reservedRouteReason refuses the site root, the llms routes and the static assets', () => {
  assert.ok(reservedRouteReason('/'));
  assert.ok(reservedRouteReason('/llms.txt'));
  assert.ok(reservedRouteReason('/favicon.ico'));
  assert.ok(reservedRouteReason('/og/docs/stylus'));
  assert.ok(reservedRouteReason('/api/search'));
  assert.ok(reservedRouteReason('/img/logo.svg'));
  assert.ok(reservedRouteReason('/audit-reports/2024_06_stylus.pdf'));
});

test('reservedRouteReason leaves ordinary legacy paths alone, /audit-reports included', () => {
  assert.equal(reservedRouteReason('/stylus/quickstart'), null);
  // The PDFs live under it; the bare path is a page upstream and a page here, so it may redirect.
  assert.equal(reservedRouteReason('/audit-reports'), null);
  // `/docs` is checked against the content tree instead, so it is not reserved wholesale.
  assert.equal(reservedRouteReason('/docs/anything'), null);
});

// --- end to end, over a fixture repo pair ------------------------------------------------------

/** A throwaway upstream repo and site content tree, so these tests never depend on repo state. */
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'legacy-redirects-'));
  const write = (rel, body) => {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  };

  // Upstream: pages at the site root, plus one redirect corpus entry.
  write('upstream/docs/index.mdx', '---\ntitle: Home\n---\n');
  write('upstream/docs/section/01-page-one.mdx', '---\ntitle: Page one\n---\n');
  write('upstream/docs/section/page-two.mdx', '---\ntitle: Page two\n---\n');
  write('upstream/docs/moved/renamed-here.mdx', '---\ntitle: Renamed\n---\n');
  write('upstream/docs/img/brand-guide.mdx', '---\ntitle: Brand\n---\n');
  write('upstream/docs/section/partials/_note.mdx', 'a partial\n');
  write(
    'upstream/sidebars.js',
    `module.exports = { main: [{ type: 'category', link: { type: 'generated-index', slug: '/landing' }, items: [] }] };`,
  );
  write(
    'upstream/vercel.json',
    JSON.stringify({
      redirects: [
        { source: '/old-path', destination: '/section/page-one' },
        // Upstream redirects a URL it also still serves, so the two inputs collide on one source.
        { source: '/section/page-two', destination: '/nowhere-upstream' },
      ],
    }),
  );

  // This site: the same pages under /docs, with one of them filed somewhere else.
  const page = '---\ntitle: x\n---\n';
  write('site/section/page-one.mdx', page);
  write('site/section/page-two.mdx', page);
  write('site/newplace/renamed-here.mdx', page);
  write('site/landing.mdx', page);

  return build({
    sourcePath: path.join(root, 'upstream/vercel.json'),
    contentDir: path.join(root, 'site'),
    upstreamDocsDir: path.join(root, 'upstream/docs'),
    sidebarsPath: path.join(root, 'upstream/sidebars.js'),
  });
}

test('a canonical URL that names a live page here resolves by the self-URL rule', () => {
  const { redirects } = fixture();
  const entry = redirects.find((r) => r.source === '/section/page-one');
  assert.deepEqual(entry, {
    source: '/section/page-one',
    destination: '/docs/section/page-one',
    permanent: false,
  });
});

test('a canonical URL whose page moved here resolves by the unique-basename rule', () => {
  const { redirects, slugMatched } = fixture();
  const entry = redirects.find((r) => r.source === '/moved/renamed-here');
  assert.equal(entry.destination, '/docs/newplace/renamed-here');
  assert.deepEqual(
    slugMatched.map((m) => m.source),
    ['/moved/renamed-here'],
  );
});

test('a sidebar category landing is seeded as a canonical URL', () => {
  const { redirects } = fixture();
  assert.equal(redirects.find((r) => r.source === '/landing').destination, '/docs/landing');
});

test('a path that is both an upstream redirect source and a canonical URL yields one entry', () => {
  const { redirects, canonicalAlreadyMapped } = fixture();
  const hits = redirects.filter((r) => r.source === '/section/page-two');
  assert.equal(hits.length, 1);
  assert.equal(canonicalAlreadyMapped, 1);
  // The redirect entry is the one kept, and its own resolution still prefers our copy of the page.
  assert.equal(hits[0].destination, '/docs/section/page-two');
});

test('sources that would shadow a live route here are skipped and reported', () => {
  const { redirects, shadowed } = fixture();
  assert.deepEqual(shadowed.map((s) => s.source).sort(), ['/', '/img/brand-guide']);
  assert.equal(
    redirects.some((r) => r.source === '/' || r.source.startsWith('/img/')),
    false,
  );
});

test('partials never become redirect sources, and every emitted entry is temporary', () => {
  const { redirects, todo } = fixture();
  assert.equal(
    redirects.some((r) => r.source.includes('/partials/')),
    false,
  );
  assert.equal(
    redirects.every((r) => r.permanent === false),
    true,
  );
  assert.deepEqual(todo, []);
});

test('the emitted map is sorted by source, so regeneration diffs stay reviewable', () => {
  const { redirects } = fixture();
  const sources = redirects.map((r) => r.source);
  assert.deepEqual(
    sources,
    [...sources].sort((a, b) => a.localeCompare(b)),
  );
});
