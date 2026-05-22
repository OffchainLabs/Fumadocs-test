#!/usr/bin/env node
/**
 * Generate `index.mdx` landings for category directories under a content
 * section. Reads each directory's meta.json + its children's frontmatter to
 * build a static <Cards> block. Idempotent (skip-if-exists). Run once per
 * section being closed.
 *
 * Usage:
 *   node scripts/codemods/generate-section-landings.mjs <section>
 *   node scripts/codemods/generate-section-landings.mjs launch-arbitrum-chain --prune
 *
 * Spec: WEEK-4-MVP-bucket2-landings-nav-design-2026-05-22.md
 */
import {
  readFileSync, writeFileSync, readdirSync, existsSync, lstatSync,
} from 'node:fs';
import { join, resolve, dirname, basename, relative } from 'node:path';

const CONTENT_ROOT = resolve(import.meta.dirname, '..', '..', 'content', 'docs', 'en');

const args = process.argv.slice(2);
const sectionArg = args[0];
const prune = args.includes('--prune');
if (!sectionArg) {
  console.error('Usage: node generate-section-landings.mjs <section> [--prune]');
  process.exit(2);
}

const sectionRoot = resolve(CONTENT_ROOT, sectionArg);
if (!sectionRoot.startsWith(CONTENT_ROOT + '/')) {
  console.error(`Refusing to run outside content root. Resolved: ${sectionRoot}`);
  process.exit(2);
}
if (!existsSync(sectionRoot)) {
  console.error(`Section not found: ${sectionRoot}`);
  process.exit(2);
}

const stats = {
  landingsCreated: 0,
  skipped: 0,
  warnings: [],
  manualReview: [],
  prunedRefs: [],
};

function humanize(s) {
  return s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function escapeJsxAttr(s) {
  return s.replace(/"/g, '&quot;');
}

function readFrontmatter(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kv) {
      const v = kv[2].trim().replace(/^['"](.*)['"]$/, '$1');
      fm[kv[1]] = v;
    }
  }
  return fm;
}

function readMetaJson(dir) {
  const p = join(dir, 'meta.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) {
    stats.warnings.push(`${relative(CONTENT_ROOT, p)}: invalid JSON — ${e.message}`);
    return null;
  }
}

function resolveEntry(dir, entry) {
  if (entry === '---' || entry === '...' || entry.startsWith('[')) return { kind: 'special' };
  for (const ext of ['mdx', 'md']) {
    const p = join(dir, `${entry}.${ext}`);
    if (existsSync(p) && lstatSync(p).isFile()) return { kind: 'file', absPath: p };
  }
  const d = join(dir, entry);
  if (existsSync(d) && lstatSync(d).isDirectory()) return { kind: 'dir', absPath: d };
  return { kind: 'missing' };
}

function buildCardsBlock(dir, sectionAbsRoot, sectionUrlSegment) {
  const meta = readMetaJson(dir);
  if (!meta || !Array.isArray(meta.pages)) return '';
  const cards = [];
  for (const entry of meta.pages) {
    if (typeof entry !== 'string') continue;
    const res = resolveEntry(dir, entry);
    if (res.kind === 'special' || res.kind === 'missing') continue;
    let title, description;
    if (res.kind === 'file') {
      const fm = readFrontmatter(res.absPath);
      title = fm.title || humanize(entry);
      description = fm.description || `${title} documentation`;
    } else {
      const childMeta = readMetaJson(res.absPath);
      title = (childMeta && childMeta.title) || humanize(entry);
      description = `${title} documentation`;
    }
    if (/[<>\n\r]/.test(title) || /[<>\n\r]/.test(description)) {
      stats.manualReview.push(`${relative(CONTENT_ROOT, res.absPath)}: title/description contains <, >, or newline; skipped card`);
      continue;
    }
    const relFromSectionRoot = relative(sectionAbsRoot, res.absPath).replace(/\.(mdx|md)$/, '');
    const href = `/docs/${sectionUrlSegment}/${relFromSectionRoot}`;
    cards.push(`  <Card title="${escapeJsxAttr(title)}" description="${escapeJsxAttr(description)}" href="${href}" />`);
  }
  if (cards.length === 0) return '';
  return `<Cards>\n${cards.join('\n')}\n</Cards>\n`;
}

function processDir(dir, sectionAbsRoot, sectionUrlSegment) {
  if (lstatSync(dir).isSymbolicLink()) {
    stats.warnings.push(`${relative(CONTENT_ROOT, dir)}: symlink — skipped`);
    return;
  }
  if (dir.split('/').includes('partials')) return;

  const indexMdx = join(dir, 'index.mdx');
  const indexMd = join(dir, 'index.md');
  const meta = readMetaJson(dir);

  if (meta && !existsSync(indexMdx) && !existsSync(indexMd) && dir !== sectionAbsRoot) {
    const parent = dirname(dir);
    const siblingMdx = join(parent, `${basename(dir)}.mdx`);
    const siblingMd = join(parent, `${basename(dir)}.md`);
    if (existsSync(siblingMdx) || existsSync(siblingMd)) {
      stats.warnings.push(`${relative(CONTENT_ROOT, dir)}: sibling file with same name exists — skipped`);
    } else {
      const title = meta.title || humanize(basename(dir));
      const description = `${title} documentation`;
      if (/[<>\n\r]/.test(title)) {
        stats.manualReview.push(`${relative(CONTENT_ROOT, dir)}: meta.json title contains <, >, or newline; cannot generate landing`);
      } else {
        const cardsBlock = buildCardsBlock(dir, sectionAbsRoot, sectionUrlSegment);
        const body = cardsBlock || '{/* No child pages found in meta.json. */}\n';
        const mdx =
          `---\n` +
          `title: '${title.replace(/'/g, "''")}'` + `\n` +
          `description: '${description.replace(/'/g, "''")}'` + `\n` +
          `content_type: 'concept'\n` +
          `author: gblanchemain\n` +
          `sme: gblanchemain\n` +
          `---\n\n` +
          body;
        writeFileSync(indexMdx, mdx, { flag: 'wx' });
        stats.landingsCreated++;
      }
    }
  } else if (meta) {
    stats.skipped++;
  }

  if (meta && Array.isArray(meta.pages)) {
    let mutated = false;
    const kept = [];
    for (const entry of meta.pages) {
      if (typeof entry !== 'string') { kept.push(entry); continue; }
      const res = resolveEntry(dir, entry);
      if (res.kind === 'missing') {
        const where = `${relative(CONTENT_ROOT, join(dir, 'meta.json'))}:${entry}`;
        stats.manualReview.push(`${where} — broken ref`);
        if (prune) { stats.prunedRefs.push(where); mutated = true; continue; }
      }
      kept.push(entry);
    }
    if (mutated && prune) {
      const next = { ...meta, pages: kept };
      writeFileSync(join(dir, 'meta.json'), JSON.stringify(next, null, 2) + '\n');
    }
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const childPath = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      stats.warnings.push(`${relative(CONTENT_ROOT, childPath)}: symlink — skipped`);
    } else if (entry.isDirectory()) {
      processDir(childPath, sectionAbsRoot, sectionUrlSegment);
    }
  }
}

processDir(sectionRoot, sectionRoot, sectionArg);

console.log(`\n=== Section landings: ${sectionArg} ===`);
console.log(`✓ Landings created: ${stats.landingsCreated}`);
console.log(`✓ Skipped (existing index): ${stats.skipped}`);
if (stats.warnings.length) {
  console.log(`\n=== Warnings ===`);
  for (const w of stats.warnings) console.log(`  ⚠ ${w}`);
}
if (stats.manualReview.length) {
  console.log(`\n=== Manual review ===`);
  for (const m of stats.manualReview) console.log(`  ? ${m}`);
}
if (stats.prunedRefs.length) {
  console.log(`\n=== Pruned refs (--prune) ===`);
  for (const p of stats.prunedRefs) console.log(`  ✂ ${p}`);
}
console.log('\nDone.');
