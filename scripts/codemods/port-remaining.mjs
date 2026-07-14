#!/usr/bin/env node
/**
 * port-remaining — config-driven driver that ports remaining Docusaurus sections
 * into the Fumadocs repo, reusing the shared transform pipeline in
 * scripts/lib/port-pipeline.mjs.
 *
 * Usage:
 *   node scripts/codemods/port-remaining.mjs <key> [--dry-run]
 *
 * <key> selects one entry from SECTIONS (below), or one of the special keys:
 *   - pin-sidebars : append the "Chain info" / "Contribute" pins to every
 *                    content/docs/en/<section>/meta.json pages array (idempotent).
 *
 * Behavior:
 *   - MERGE-SAFE: never overwrites an existing dest file (page or partial); records
 *     a `SKIP (exists): …` line in manualReview instead. Protects hand-curated files.
 *   - --dry-run: prints planned dest paths + partial copies, writes NOTHING.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import {
  ensureDir,
  humanize,
  readSidebarPosition,
  runDocPipeline,
  transformAdmonitions,
  transformComponentImports,
  transformDetails,
  transformHeadingAnchors,
  transformHtmlComments,
  transformLinks,
  transformPartialImports,
  transformRelativeLinks,
  transformShikiLanguages,
  transformTabs,
  transformVars,
  walk,
} from '../lib/port-pipeline.mjs';

const LEGACY = '/Users/allup/OCL/arbitrum-docs/docs';
const V2 = '/Users/allup/OCL/Fumadocs-test/content/docs/en';
const PARTIALS = '/Users/allup/OCL/Fumadocs-test/content/partials';
const REPO = '/Users/allup/OCL/Fumadocs-test';

// ─────────────────────────────────────────────────────────────────────
// Section registry. Seeded with `notices` only; later waves add entries here.
//
// Entry shape:
//   srcDir         legacy source dir (rel to LEGACY)
//   destDir        v2 dest dir (rel to V2)         [top-level name wired into root meta]
//   extraSources?  string[]  extra source dirs/files (rel to LEGACY) → same destDir
//   excludeSubdirs? string[] source subdirs (rel to srcDir) to skip
//   mdToMdx?       boolean   .md → .mdx on dest (default true)
//   isPinnedPage?  boolean   port a single file to the docs root: { src, dest } (rel)
// ─────────────────────────────────────────────────────────────────────
const SECTIONS = {
  notices: { srcDir: 'notices', destDir: 'notices' },
  // ── Wave 1: new top-level sections carved out of for-devs ──
  oracles: {
    srcDir: 'for-devs/oracles',
    destDir: 'oracles',
    extraSources: ['arbitrum-essentials/oracles/overview-oracles.mdx'],
    meta: { title: 'Oracles', icon: 'Radio', root: true, description: 'Integrate oracle price feeds and VRF into your Arbitrum apps.' },
    synthIndex: { title: 'Oracles', description: 'Integrate oracle price feeds and VRF from providers on Arbitrum.' },
  },
  'third-party-docs': {
    srcDir: 'for-devs/third-party-docs',
    destDir: 'third-party-docs',
    meta: { title: 'Third-party docs', icon: 'Boxes', root: true, description: 'Guides for tools and services in the Arbitrum ecosystem.' },
    synthIndex: { title: 'Third-party docs', description: 'Guides for integrating third-party tools and services with Arbitrum.' },
  },
  // ── Wave 2: pinned pages shown in every sidebar ──
  'chain-info': {
    isPinnedPage: true,
    src: 'for-devs/dev-tools-and-resources/chain-info.mdx',
    dest: 'chain-info.mdx',
  },
  'contribute': {
    isPinnedPage: true,
    src: 'for-devs/contribute.mdx',
    dest: 'contribute.mdx',
  },
  // ── Wave 3: merge run-arbitrum-node + node-running into run-a-node ──
  'run-a-node': {
    srcDir: 'run-arbitrum-node',
    destDir: 'run-a-node',
    extraSources: ['node-running'],
  },
  // ── Wave 4: how-arbitrum-works deep, arbitrum-essentials, stylus-by-example ──
  'how-arbitrum-works': { srcDir: 'how-arbitrum-works', destDir: 'how-arbitrum-works' },
  'arbitrum-essentials': {
    srcDir: 'arbitrum-essentials',
    destDir: 'arbitrum-essentials',
    excludeSubdirs: ['oracles'], // consumed into the top-level oracles section (Wave 1)
  },
  'stylus-by-example': {
    srcDir: 'stylus-by-example',
    destDir: 'stylus/stylus-by-example',
  },
  // ── ADD MORE SECTION ENTRIES HERE (later waves) ──
};

const PIN_ENTRIES = ['[Chain info](/docs/chain-info)', '[Contribute](/docs/contribute)'];

// Restructure path remaps: old Docusaurus /docs paths → new Fumadocs IA. Applied
// to every ported doc/partial AFTER the generic link transform so links that point
// at dissolved/renamed sections resolve to their new homes. Longest prefixes first.
// Applied in order. Section-rename remaps run first; content-map collapses run
// LAST so they match paths already rewritten to their new section home.
const RESTRUCTURE_REMAPS = [
  ['/docs/for-devs/dev-tools-and-resources/chain-info', '/docs/chain-info'],
  ['/docs/for-devs/oracles', '/docs/oracles'],
  ['/docs/for-devs/third-party-docs', '/docs/third-party-docs'],
  ['/docs/for-devs/contribute', '/docs/contribute'],
  ['/docs/arbitrum-essentials/oracles', '/docs/oracles'],
  ['/docs/run-arbitrum-node', '/docs/run-a-node'],
  ['/docs/node-running', '/docs/run-a-node'],
  // Removed Docusaurus content-map landings → the section's Fumadocs index.
  ['/docs/oracles/oracles-content-map', '/docs/oracles'],
  ['/docs/run-a-node/sequencer-content-map', '/docs/run-a-node'],
];

function applyRestructureRemaps(content) {
  let out = content;
  for (const [from, to] of RESTRUCTURE_REMAPS) {
    // Match the prefix only at a path boundary (next char is /, #, ), or quote).
    out = out.replaceAll(new RegExp(escapeRe(from) + '(?=[/#)\\s"\'])', 'g'), to);
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function toDestRel(rel, mdToMdx) {
  let destRel = rel
    .split('/')
    .map((seg) => seg.replace(/^\d+-/, ''))
    .join('/');
  if (mdToMdx !== false) destRel = destRel.replace(/\.md$/, '.mdx');
  return destRel;
}

function collectSourceFiles(entry, stats) {
  const out = [];
  const excludes = (entry.excludeSubdirs || []).map((ex) => ex.replace(/\/$/, ''));
  const roots = [entry.srcDir, ...(entry.extraSources || [])];
  for (const root of roots) {
    const rootAbs = join(LEGACY, root);
    if (!existsSync(rootAbs)) {
      stats.errors.push(`source not found: ${root}`);
      continue;
    }
    if (statSync(rootAbs).isDirectory()) {
      for (const fileAbs of walk(rootAbs)) {
        const rel = relative(rootAbs, fileAbs);
        if (rel.split('/').includes('partials')) continue; // partials handled separately
        // Docusaurus "*-content-map.mdx" category-landing helpers: Fumadocs
        // auto-generates section indexes from meta.json, so skip them.
        if (/-content-map\.mdx?$/.test(basename(rel))) {
          stats.manualReview.push(`SKIP (content-map): ${rel}`);
          continue;
        }
        if (
          root === entry.srcDir &&
          excludes.some((ex) => rel === ex || rel.startsWith(ex + '/'))
        ) {
          continue;
        }
        out.push({ srcAbs: fileAbs, rel });
      }
    } else {
      out.push({ srcAbs: rootAbs, rel: basename(rootAbs) });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Per-file port (merge-safe)
// ─────────────────────────────────────────────────────────────────────
function processDoc(srcAbs, rel, destAbs, ctx, dryRun, planned) {
  let content;
  try {
    content = applyRestructureRemaps(runDocPipeline(readFileSync(srcAbs, 'utf8'), srcAbs, rel, ctx));
  } catch (err) {
    ctx.stats.errors.push(`${rel}: ${err.message}`);
    return;
  }
  if (dryRun) {
    planned.pages.push(destAbs);
    return;
  }
  if (existsSync(destAbs)) {
    ctx.stats.manualReview.push(`SKIP (exists): ${relative(REPO, destAbs)}`);
    return;
  }
  ensureDir(dirname(destAbs));
  writeFileSync(destAbs, content);
  ctx.stats.pagesPorted++;
}

function copyPartials(ctx, dryRun, planned) {
  for (const [srcAbs, destAbs] of ctx.partialsToCopy) {
    if (dryRun) {
      planned.partials.push(destAbs);
      continue;
    }
    if (existsSync(destAbs)) {
      ctx.stats.manualReview.push(`SKIP (exists): ${relative(REPO, destAbs)}`);
      continue;
    }
    try {
      let content = readFileSync(srcAbs, 'utf8');
      content = transformVars(content);
      content = transformComponentImports(content);
      content = transformTabs(content);
      content = transformPartialImports(content, srcAbs, relative(LEGACY, srcAbs), ctx);
      content = transformAdmonitions(content);
      content = transformDetails(content, ctx.stats);
      content = transformHtmlComments(content);
      content = transformHeadingAnchors(content);
      content = transformShikiLanguages(content);
      content = transformRelativeLinks(content, srcAbs, LEGACY);
      content = applyRestructureRemaps(transformLinks(content));
      ensureDir(dirname(destAbs));
      writeFileSync(destAbs, content);
      ctx.stats.partialsCopied++;
    } catch (err) {
      ctx.stats.errors.push(`partial ${basename(srcAbs)}: ${err.message}`);
    }
  }
}

function wireRootMeta(destDir) {
  const rootMetaPath = join(V2, 'meta.json');
  const meta = JSON.parse(readFileSync(rootMetaPath, 'utf8'));
  const topName = destDir.split('/')[0];
  if (!meta.pages.includes(topName)) {
    meta.pages.push(topName);
    writeFileSync(rootMetaPath, JSON.stringify(meta, null, 2) + '\n');
    console.log(`✓ Added "${topName}" to root meta.json`);
  } else {
    console.log(`• root meta.json already lists "${topName}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Special key: pin-sidebars
// ─────────────────────────────────────────────────────────────────────
function runPinSidebars(dryRun) {
  console.log('=== pin-sidebars ===');
  for (const e of readdirSync(V2, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const metaPath = join(V2, e.name, 'meta.json');
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    // A section with no explicit pages array auto-lists its files; seed one with a
    // rest glob so the pins can be appended without dropping the auto-listing.
    if (!Array.isArray(meta.pages)) meta.pages = ['...'];
    let changed = false;
    for (const pin of PIN_ENTRIES) {
      if (!meta.pages.includes(pin)) {
        meta.pages.push(pin);
        changed = true;
      }
    }
    if (!changed) {
      console.log(`• ${e.name}: already pinned`);
      continue;
    }
    if (dryRun) console.log(`  [dry-run] would pin: ${e.name}`);
    else {
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
      console.log(`✓ pinned: ${e.name}`);
    }
  }
  console.log('\nDone.');
}

// ─────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────
function report(stats, planned, dryRun) {
  const rel = (p) => relative(REPO, p);
  if (dryRun) {
    console.log(`\n=== Planned pages (${planned.pages.length}) ===`);
    for (const p of planned.pages) console.log(`  ${rel(p)}`);
    console.log(`\n=== Planned partial copies (${planned.partials.length}) ===`);
    if (planned.partials.length === 0) console.log('  (none)');
    else for (const p of planned.partials) console.log(`  ${rel(p)}`);
  } else {
    console.log(`✓ Pages ported: ${stats.pagesPorted}`);
    console.log(`✓ Partials copied: ${stats.partialsCopied}`);
  }
  const dump = (label, arr) => {
    console.log(`\n=== ${label} (${arr.length}) ===`);
    if (arr.length === 0) console.log('  (none)');
    else for (const x of arr.slice(0, 40)) console.log(`  ${x}`);
    if (arr.length > 40) console.log(`  … and ${arr.length - 40} more`);
  };
  dump('Errors', stats.errors);
  dump('Warnings', stats.warnings);
  dump('Manual review', stats.manualReview);
  console.log('\nDone.');
}

// ─────────────────────────────────────────────────────────────────────
// Section / pinned-page runners
// ─────────────────────────────────────────────────────────────────────
// Deterministic global partial resolver: maps ANY source partial (regardless of
// which section imports it) to its single registry location, so cross-section
// imports resolve to the same file the owning section's port produced. Mirrors
// the section→destDir remaps used elsewhere.
function resolvePartial(targetAbs) {
  const rel = relative(LEGACY, targetAbs);
  if (rel.startsWith('..')) return null;
  const parts = rel.split(sep);
  if (!parts.includes('partials')) return null;
  const base = parts[parts.length - 1];
  const section = parts[0];
  let sub;
  if (section === 'partials') sub = ''; // top-level docs/partials → global root
  else if (rel.includes(`for-devs${sep}dev-tools-and-resources${sep}partials`))
    sub = 'precompile-tables';
  else if (section === 'for-devs') sub = ''; // dissolved for-devs shared → global root
  else if (section === 'run-arbitrum-node' || section === 'node-running') sub = 'run-a-node';
  else if (section === 'stylus-by-example') sub = 'stylus';
  else sub = section; // same-name section subfolder
  return {
    destAbs: sub ? join(PARTIALS, sub, base) : join(PARTIALS, base),
    includePath: sub ? `content/partials/${sub}/${base}` : `content/partials/${base}`,
  };
}

function newCtx() {
  const stats = { pagesPorted: 0, partialsCopied: 0, warnings: [], manualReview: [], errors: [] };
  return {
    legacyDocsRoot: LEGACY,
    resolvePartial,
    partialsToCopy: new Map(),
    stats,
  };
}

function runPinnedPage(entry, dryRun) {
  const ctx = newCtx();
  const planned = { pages: [], partials: [] };
  console.log(`=== port-remaining: pinned page ===`);
  console.log(`Source: ${join(LEGACY, entry.src)}`);
  console.log(`Dest:   ${join(V2, entry.dest)}\n`);

  const srcAbs = join(LEGACY, entry.src);
  if (!existsSync(srcAbs)) {
    ctx.stats.errors.push(`source not found: ${entry.src}`);
  } else {
    processDoc(srcAbs, entry.src, join(V2, entry.dest), ctx, dryRun, planned);
    copyPartials(ctx, dryRun, planned);
  }
  report(ctx.stats, planned, dryRun);
}

// ─────────────────────────────────────────────────────────────────────
// Dest-driven meta.json generation
//
// Source-driven meta would clobber hand-curated section metas and ignore
// excludes/extras/synthesized index pages. Instead we read the DEST tree and:
//   - preserve an existing meta.json (its curated order + `"..."` rest glob);
//     only append dest pages it doesn't already list when it has no `"..."`.
//   - generate a fresh meta.json (with a trailing `"..."`) for dirs that lack one.
// Ordering uses a source-derived position map (frontmatter sidebar_position, else
// numeric filename prefix) so the sidebar keeps its intended order.
// ─────────────────────────────────────────────────────────────────────
function numPrefix(name) {
  const m = name.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

function buildPosMap(entry) {
  const map = new Map();
  for (const s of [entry.srcDir, ...(entry.extraSources || [])]) {
    const abs = join(LEGACY, s);
    if (!existsSync(abs)) continue;
    const files = statSync(abs).isDirectory() ? walk(abs) : [abs];
    for (const f of files) {
      if (f.split(sep).includes('partials')) continue;
      const fn = basename(f);
      if (/-content-map\.mdx?$/.test(fn)) continue;
      const key = fn.replace(/\.mdx?$/, '').replace(/^\d+-/, '');
      let pos = readSidebarPosition(f);
      if (!Number.isFinite(pos)) {
        const np = numPrefix(fn);
        if (np != null) pos = np;
      }
      map.set(key, pos);
    }
  }
  return map;
}

function dirMinPos(dirAbs, posMap) {
  let min = Infinity;
  const rec = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'partials') continue;
      const full = join(d, e.name);
      if (e.isDirectory()) rec(full);
      else if (/\.mdx?$/.test(e.name)) {
        const key = e.name.replace(/\.mdx?$/, '').replace(/^\d+-/, '');
        min = Math.min(min, posMap.get(key) ?? Infinity);
      }
    }
  };
  rec(dirAbs);
  return min;
}

function orderedPages(dirAbs, posMap) {
  const items = [];
  let hasIndex = false;
  for (const e of readdirSync(dirAbs, { withFileTypes: true })) {
    if (e.name === 'meta.json' || e.name === 'partials') continue;
    if (e.isDirectory()) {
      items.push({ name: e.name, pos: dirMinPos(join(dirAbs, e.name), posMap) });
    } else if (/\.mdx?$/.test(e.name)) {
      const base = e.name.replace(/\.mdx?$/, '');
      if (base === 'index') hasIndex = true;
      else items.push({ name: base, pos: posMap.get(base) ?? Infinity });
    }
  }
  items.sort((a, b) => (a.pos !== b.pos ? a.pos - b.pos : a.name.localeCompare(b.name)));
  const pages = items.map((i) => i.name);
  if (hasIndex) pages.unshift('index');
  return pages;
}

function genMeta(dirAbs, posMap, opts = {}) {
  const metaPath = join(dirAbs, 'meta.json');
  const pages = orderedPages(dirAbs, posMap);
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (Array.isArray(meta.pages) && !meta.pages.includes('...')) {
      let changed = false;
      for (const p of pages) {
        if (!meta.pages.includes(p)) {
          meta.pages.push(p);
          changed = true;
        }
      }
      if (changed) writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    }
  } else {
    const meta = { title: opts.title || humanize(basename(dirAbs)) };
    if (opts.icon) meta.icon = opts.icon;
    if (opts.root) meta.root = true;
    if (opts.description) meta.description = opts.description;
    meta.pages = pages.length ? [...pages, '...'] : ['...'];
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  }
  for (const e of readdirSync(dirAbs, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== 'partials') genMeta(join(dirAbs, e.name), posMap);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Synthesized Fumadocs landing (replaces removed Docusaurus content-maps)
// ─────────────────────────────────────────────────────────────────────
function readFmFields(fileAbs) {
  const m = readFileSync(fileAbs, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const mm = line.match(/^([a-zA-Z_]\w*):\s*(.*)$/);
      if (mm) fm[mm[1]] = mm[2].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return fm;
}

function routeOf(destAbs) {
  return '/docs/' + relative(V2, destAbs).split(sep).join('/');
}

function synthSectionIndex(dirAbs, { title, description }) {
  const idx = join(dirAbs, 'index.mdx');
  if (existsSync(idx)) return false;
  const cards = [];
  const entries = readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const e of entries) {
    if (e.name === 'meta.json' || e.name === 'partials' || e.name === 'index.mdx') continue;
    let repAbs;
    let routeAbs;
    if (e.isFile() && /\.mdx?$/.test(e.name)) {
      repAbs = join(dirAbs, e.name);
      routeAbs = join(dirAbs, e.name.replace(/\.mdx?$/, ''));
    } else if (e.isDirectory()) {
      const di = join(dirAbs, e.name, 'index.mdx');
      if (existsSync(di)) {
        repAbs = di;
        routeAbs = join(dirAbs, e.name);
      } else {
        const first = readdirSync(join(dirAbs, e.name))
          .filter((f) => /\.mdx?$/.test(f))
          .sort()[0];
        if (!first) continue;
        repAbs = join(dirAbs, e.name, first);
        routeAbs = join(dirAbs, e.name, first.replace(/\.mdx?$/, ''));
      }
    } else continue;
    const fm = readFmFields(repAbs);
    const t = (fm.title || humanize(basename(routeAbs))).replace(/"/g, '&quot;');
    const d = (fm.description || '').replace(/"/g, '&quot;');
    cards.push(`  <Card title="${t}" description="${d}" href="${routeOf(routeAbs)}" />`);
  }
  const content =
    `---\ntitle: '${title}'\ndescription: '${description}'\ncontent_type: concept\n` +
    `author: gblanchemain\nsme: gblanchemain\n---\n\n${description}\n\n<Cards>\n${cards.join('\n')}\n</Cards>\n`;
  writeFileSync(idx, content);
  return true;
}

function runSection(entry, dryRun) {
  const ctx = newCtx();
  const planned = { pages: [], partials: [] };
  console.log(`=== port-remaining: ${entry.srcDir} ===`);
  console.log(`Source: ${join(LEGACY, entry.srcDir)}`);
  console.log(`Dest:   ${join(V2, entry.destDir)}\n`);

  for (const { srcAbs, rel } of collectSourceFiles(entry, ctx.stats)) {
    const destAbs = join(V2, entry.destDir, toDestRel(rel, entry.mdToMdx));
    processDoc(srcAbs, rel, destAbs, ctx, dryRun, planned);
  }
  copyPartials(ctx, dryRun, planned);

  if (!dryRun) {
    const destDirAbs = join(V2, entry.destDir);
    if (entry.synthIndex && synthSectionIndex(destDirAbs, entry.synthIndex)) {
      console.log('✓ synthesized index.mdx landing');
    }
    genMeta(destDirAbs, buildPosMap(entry), entry.meta || {});
    console.log('✓ meta.json generated (dest-driven, preserving curated metas)');
    if (!entry.isPinnedPage) wireRootMeta(entry.destDir);
  }
  report(ctx.stats, planned, dryRun);
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const key = args.find((a) => !a.startsWith('--'));

  if (!key) {
    console.error('Usage: node scripts/codemods/port-remaining.mjs <key> [--dry-run]');
    console.error(`Keys: ${Object.keys(SECTIONS).join(', ')}, pin-sidebars`);
    process.exit(1);
  }

  if (key === 'pin-sidebars') {
    runPinSidebars(dryRun);
    return;
  }

  const entry = SECTIONS[key];
  if (!entry) {
    console.error(`Unknown key: ${key}`);
    console.error(`Keys: ${Object.keys(SECTIONS).join(', ')}, pin-sidebars`);
    process.exit(1);
  }

  if (entry.isPinnedPage) runPinnedPage(entry, dryRun);
  else runSection(entry, dryRun);
}

main();
