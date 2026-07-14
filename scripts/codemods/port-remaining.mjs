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
import { basename, dirname, join, relative } from 'node:path';

import {
  ensureDir,
  generateMeta,
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
  // ── ADD MORE SECTION ENTRIES HERE (later waves) ──
};

const PIN_ENTRIES = ['[Chain info](/docs/chain-info)', '[Contribute](/docs/contribute)'];

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function findPartialsDirs(root) {
  const out = [];
  const rec = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const full = join(dir, e.name);
      if (e.name === 'partials') out.push(full);
      else rec(full);
    }
  };
  rec(root);
  return out;
}

function buildPartialRoots(entry) {
  const roots = [];
  const sectionDest = join(PARTIALS, entry.destDir);
  const sectionPrefix = `content/partials/${entry.destDir}`;

  // Explicit section-local partials root.
  roots.push({
    legacyDir: join(LEGACY, entry.srcDir, 'partials'),
    destDir: sectionDest,
    includePrefix: sectionPrefix,
  });

  // Catch-all: any nested dir named `partials` under the source roots maps to the
  // same section partials registry. Keeps no partial import dropped silently.
  const sourceRoots = [entry.srcDir, ...(entry.extraSources || [])]
    .map((s) => join(LEGACY, s))
    .filter((p) => existsSync(p) && statSync(p).isDirectory());
  for (const root of sourceRoots) {
    for (const dir of findPartialsDirs(root)) {
      if (!roots.some((r) => r.legacyDir === dir)) {
        roots.push({ legacyDir: dir, destDir: sectionDest, includePrefix: sectionPrefix });
      }
    }
  }

  // Global partials root (lowest priority fallback).
  roots.push({
    legacyDir: join(LEGACY, 'partials'),
    destDir: PARTIALS,
    includePrefix: 'content/partials',
  });
  return roots;
}

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
    content = runDocPipeline(readFileSync(srcAbs, 'utf8'), srcAbs, rel, ctx);
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
      content = transformPartialImports(content, srcAbs, relative(LEGACY, srcAbs), ctx);
      content = transformAdmonitions(content);
      content = transformDetails(content, ctx.stats);
      content = transformHtmlComments(content);
      content = transformHeadingAnchors(content);
      content = transformShikiLanguages(content);
      content = transformRelativeLinks(content, srcAbs, LEGACY);
      content = transformLinks(content);
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
    if (!Array.isArray(meta.pages)) continue;
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
function newCtx(entry) {
  const stats = { pagesPorted: 0, partialsCopied: 0, warnings: [], manualReview: [], errors: [] };
  return {
    legacyDocsRoot: LEGACY,
    partialRoots: buildPartialRoots(entry),
    partialsToCopy: new Map(),
    stats,
  };
}

function runPinnedPage(entry, dryRun) {
  const ctx = newCtx({ srcDir: dirname(entry.src), destDir: '.', ...entry });
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

function runSection(entry, dryRun) {
  const ctx = newCtx(entry);
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
    generateMeta(join(LEGACY, entry.srcDir), join(V2, entry.destDir));
    console.log('✓ meta.json files generated');
    wireRootMeta(entry.destDir);
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
