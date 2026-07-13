#!/usr/bin/env node
/**
 * Port docs/stylus/ from arbitrum-docs (Docusaurus) into the Fumadocs repo.
 *
 * Applies the same transform standard as port-launch-arbitrum-chain.mjs, updated
 * for the current conventions (latest commits):
 *   - Partials land in the `content/partials/` registry (section-local under
 *     `content/partials/stylus/`, global under `content/partials/`), included via
 *     root-anchored `<include cwd>…</include>`.
 *   - Raw `<details><summary>` collapsibles → Fumadocs `<Accordions>/<Accordion>`.
 *   - Relative links (`./x`, `../dir/y`) resolved to absolute `/docs/…`.
 *
 * NOT handled here (reuse existing tools afterward):
 *   - Quicklooks (`<a data-quicklook-from>`) → run `node scripts/migrate-quicklooks.mjs`
 *     (converts content/docs → <Term>, unwraps in content/partials).
 *   - meta.json parent wiring for the root is done at the end of this script.
 *
 * Code blocks pass through untouched: Fumadocs renders fenced blocks via its
 * CodeBlock/Shiki pipeline and `title="…"` fence meta is compatible.
 *
 * Usage: node scripts/codemods/port-stylus.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import varsJson from '../../content/vars.json' with { type: 'json' };

const LEGACY_DOCS_ROOT = '/Users/allup/OCL/arbitrum-docs/docs';
const STYLUS_SRC = join(LEGACY_DOCS_ROOT, 'stylus');
const LEGACY_GLOBAL_PARTIALS = join(LEGACY_DOCS_ROOT, 'partials');
const LEGACY_STYLUS_PARTIALS = join(STYLUS_SRC, 'partials');

const V2_ROOT = '/Users/allup/OCL/Fumadocs-test';
const V2_DOCS_EN = join(V2_ROOT, 'content/docs/en');
const V2_STYLUS_DEST = join(V2_DOCS_EN, 'stylus');
const V2_PARTIALS_ROOT = join(V2_ROOT, 'content/partials');
const V2_STYLUS_PARTIALS = join(V2_PARTIALS_ROOT, 'stylus');

const CONTENT_TYPE_ENUM = new Set([
  'how-to',
  'concept',
  'quickstart',
  'tutorial',
  'reference',
  'troubleshooting',
  'faq',
]);

const ADMONITION_TYPE_MAP = {
  note: 'note',
  tip: 'tip',
  info: 'info',
  warning: 'warning',
  caution: 'warning',
  danger: 'danger',
  important: 'info',
};

// Docusaurus-only frontmatter keys with no meaning in Fumadocs.
const DROP_FRONTMATTER = new Set([
  'slug',
  'displayed_sidebar',
  'pagination_next',
  'pagination_prev',
  'id',
  'sidebar_position',
  'target_audience',
]);

const stats = {
  pagesPorted: 0,
  partialsCopied: 0,
  warnings: [],
  manualReview: [],
  errors: [],
};

// Source-partial-abs → dest-partial-abs (deduped copy list, filled during walk).
const partialsToCopy = new Map();

// ─────────────────────────────────────────────────────────────────────
// Fenced-code protection helper
// ─────────────────────────────────────────────────────────────────────
function protectCode(content) {
  const blocks = [];
  let work = content;
  for (const fence of ['```', '~~~']) {
    work = work.replace(new RegExp(`${fence}[\\s\\S]*?${fence}`, 'g'), (m) => {
      blocks.push(m);
      return `__CODEBLOCK_${blocks.length - 1}__`;
    });
  }
  return { work, blocks };
}
function restoreCode(work, blocks) {
  return work.replace(/__CODEBLOCK_(\d+)__/g, (_m, i) => blocks[parseInt(i)]);
}

// ─────────────────────────────────────────────────────────────────────
// Transform: frontmatter
// ─────────────────────────────────────────────────────────────────────
function transformFrontmatter(content, relPath) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  const unquote = (s) => s.replace(/^['"](.*)['"]$/, '$1').trim();

  const fm = {};
  let rest = content;
  if (fmMatch) {
    rest = content.slice(fmMatch[0].length);
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (!m) continue;
      const raw = m[2].trim();
      if (unquote(raw) === '' || unquote(raw) === 'null') continue;
      fm[m[1]] = raw;
    }
  } else {
    stats.warnings.push(`${relPath}: no frontmatter, synthesized`);
  }

  for (const k of DROP_FRONTMATTER) delete fm[k];

  let ct = unquote(fm.content_type || 'concept');
  if (!CONTENT_TYPE_ENUM.has(ct)) {
    stats.manualReview.push(`${relPath}: content_type '${ct}' not in enum → defaulted to concept`);
    ct = 'concept';
  }
  fm.content_type = `'${ct}'`;

  const author = unquote(fm.author || 'gblanchemain');
  fm.author = author;
  fm.sme = unquote(fm.sme || author);

  if (!fm.title) {
    const fallback = basename(relPath)
      .replace(/\.mdx?$/, '')
      .replace(/^\d+-/, '')
      .replace(/-/g, ' ');
    fm.title = `'${fallback}'`;
    stats.warnings.push(`${relPath}: missing title, defaulted`);
  }
  if (!fm.description) {
    fm.description = fm.title;
    stats.warnings.push(`${relPath}: missing description, used title`);
  }

  const ORDER = [
    'title',
    'description',
    'sidebar_label',
    'user_story',
    'content_type',
    'author',
    'sme',
    'draft',
  ];
  let out = '---\n';
  for (const k of ORDER) if (fm[k] !== undefined) out += `${k}: ${fm[k]}\n`;
  for (const [k, v] of Object.entries(fm)) if (!ORDER.includes(k)) out += `${k}: ${v}\n`;
  out += '---\n';
  return out + rest;
}

// ─────────────────────────────────────────────────────────────────────
// Transform: @@vars@@  (no-op for stylus, kept for parity)
// ─────────────────────────────────────────────────────────────────────
function transformVars(content) {
  const lines = content.split('\n');
  let inFence = false;
  let delim = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^(\s*)(```|~~~)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        delim = fence[2];
      } else if (fence[2] === delim) {
        inFence = false;
        delim = null;
      }
    }
    lines[i] = lines[i].replace(
      /@@([A-Za-z_][A-Za-z0-9_]*)(?:=([^@]*))?@@/g,
      (_f, name, inline) => {
        if (inFence) {
          if (Object.prototype.hasOwnProperty.call(varsJson, name)) return String(varsJson[name]);
          if (inline !== undefined) return inline;
          return name;
        }
        return `<Var name="${name}" />`;
      },
    );
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Transform: strip @site/src/components imports (globally registered in v2)
// ─────────────────────────────────────────────────────────────────────
function transformComponentImports(content) {
  return content.replace(
    /^import\s+(?:[\w{},\s]+?)\s+from\s+['"]@site\/src\/components\/[^'"]+['"];?\s*$\n?/gm,
    '',
  );
}

// ─────────────────────────────────────────────────────────────────────
// Transform: partial imports → <include> (registry-aware, relative-resolved)
// ─────────────────────────────────────────────────────────────────────
function transformPartialImports(content, srcFileAbs, relPath) {
  const srcDir = dirname(srcFileAbs);
  const importMap = {};

  let cleaned = content.replace(
    /^import\s+(\w+)\s+from\s+['"]([^'"]+\.mdx?)['"];?\s*$/gm,
    (match, name, imp) => {
      const targetAbs = resolve(srcDir, imp);
      let includePath;
      if (targetAbs.startsWith(LEGACY_STYLUS_PARTIALS + sep)) {
        const base = basename(targetAbs);
        partialsToCopy.set(targetAbs, join(V2_STYLUS_PARTIALS, base));
        includePath = `content/partials/stylus/${base}`;
      } else if (targetAbs.startsWith(LEGACY_GLOBAL_PARTIALS + sep)) {
        const base = basename(targetAbs);
        partialsToCopy.set(targetAbs, join(V2_PARTIALS_ROOT, base));
        includePath = `content/partials/${base}`;
      } else {
        stats.manualReview.push(`${relPath}: partial import '${imp}' outside known partial roots`);
        return match; // leave the import untouched for manual review
      }
      importMap[name] = includePath;
      return '';
    },
  );

  for (const [name, inc] of Object.entries(importMap)) {
    cleaned = cleaned.replace(new RegExp(`<${name}\\s*/>`, 'g'), `<include cwd>${inc}</include>`);
    cleaned = cleaned.replace(
      new RegExp(`<${name}>[\\s\\S]*?</${name}>`, 'g'),
      `<include cwd>${inc}</include>`,
    );
  }

  cleaned = cleaned.replace(/(\n---\n)\n{2,}/g, '$1\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────
// Transform: admonitions (no-op for stylus, kept for parity)
// ─────────────────────────────────────────────────────────────────────
function transformAdmonitions(content) {
  const { work: protectedWork, blocks } = protectCode(content);
  let work = protectedWork;
  const types = Object.keys(ADMONITION_TYPE_MAP).join('|');
  for (const colons of ['::::', ':::']) {
    const re = new RegExp(
      `^${colons}(${types})(?:\\s+(.+))?\\n([\\s\\S]*?)\\n${colons}\\s*$`,
      'gm',
    );
    work = work.replace(re, (_m, type, title, body) => {
      const mapped = ADMONITION_TYPE_MAP[type];
      const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;').trim()}"` : '';
      return `<VanillaAdmonition type="${mapped}"${titleAttr}>\n${body}\n</VanillaAdmonition>`;
    });
  }
  return restoreCode(work, blocks);
}

// ─────────────────────────────────────────────────────────────────────
// Transform: raw <details><summary> → Fumadocs <Accordions>/<Accordion>
// ─────────────────────────────────────────────────────────────────────
function transformDetails(content) {
  const { work: protectedWork, blocks } = protectCode(content);
  let work = protectedWork;
  work = work.replace(
    /<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g,
    (_m, summary, body) => {
      const title = summary.trim().replace(/\s+/g, ' ');
      if (/[<[]/.test(title)) {
        stats.manualReview.push(`<details> summary has markup, flattened to title: "${title}"`);
      }
      const safeTitle = title.replace(/"/g, '&quot;');
      return `<Accordions>\n<Accordion title="${safeTitle}">\n\n${body.trim()}\n\n</Accordion>\n</Accordions>`;
    },
  );
  return restoreCode(work, blocks);
}

// ─────────────────────────────────────────────────────────────────────
// Transform: HTML comments → MDX comments
// ─────────────────────────────────────────────────────────────────────
function transformHtmlComments(content) {
  const { work: protectedWork, blocks } = protectCode(content);
  let work = protectedWork.replace(/<!--([\s\S]*?)-->/g, (_m, inner) => `{/*${inner}*/}`);
  return restoreCode(work, blocks);
}

// ─────────────────────────────────────────────────────────────────────
// Transform: strip Docusaurus heading anchors {#id}
// ─────────────────────────────────────────────────────────────────────
function transformHeadingAnchors(content) {
  return content.replace(/^(#+\s.+?)\s*\{#[^}]+\}\s*$/gm, '$1');
}

// ─────────────────────────────────────────────────────────────────────
// Transform: Shiki language fixes
// ─────────────────────────────────────────────────────────────────────
function transformShikiLanguages(content) {
  return content.replace(/^```typscript\b/gm, '```typescript');
}

// ─────────────────────────────────────────────────────────────────────
// Transform: relative links (./x, ../dir/y) → absolute /docs/…
// ─────────────────────────────────────────────────────────────────────
function transformRelativeLinks(content, srcFileAbs) {
  const srcDir = dirname(srcFileAbs);
  const { work: protectedWork, blocks } = protectCode(content);
  let work = protectedWork.replace(/\]\((\.\.?\/[^)\s]+)\)/g, (m, rawUrl) => {
    const hashIdx = rawUrl.indexOf('#');
    const anchor = hashIdx >= 0 ? rawUrl.slice(hashIdx) : '';
    const p = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl;
    const targetAbs = resolve(srcDir, p);
    let rel = relative(LEGACY_DOCS_ROOT, targetAbs);
    if (rel.startsWith('..')) return m; // escapes docs root — leave unchanged
    rel = rel.replace(/\.mdx?$/, '');
    rel = rel
      .split('/')
      .map((s) => s.replace(/^\d+-/, ''))
      .join('/');
    return `](/docs/${rel}${anchor})`;
  });
  return restoreCode(work, blocks);
}

// ─────────────────────────────────────────────────────────────────────
// Transform: absolute internal link rewrites
// ─────────────────────────────────────────────────────────────────────
// Any absolute link that isn't a static asset / external / already-/docs is a
// doc link → prefix with /docs (per the "leave as local /docs/ links" decision
// for not-yet-ported sections). Then strip numeric prefixes + trailing .md(x)
// from every /docs/ link so URLs match Fumadocs routing.
function transformLinks(content) {
  const SKIP = /^\/(docs\/|img\/|assets\/|fonts\/|favicon)/;
  let work = content.replace(/\]\((\/[^)#]*?)(#[^)]*)?\)/g, (m, p, anchor = '') => {
    if (SKIP.test(p)) return m;
    return `](/docs${p}${anchor})`;
  });
  work = work.replace(/\]\((\/docs\/[^)#]*?)(\.mdx?)?(#[^)]*)?\)/g, (_m, p, _ext, anchor = '') => {
    const stripped = p
      .split('/')
      .map((seg) => seg.replace(/^\d+-/, ''))
      .join('/');
    return `](${stripped}${anchor})`;
  });
  return work;
}

// ─────────────────────────────────────────────────────────────────────
// Per-file pipeline
// ─────────────────────────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile() && /\.mdx?$/.test(e.name)) out.push(full);
  }
  return out;
}
function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function runDocPipeline(content, srcFileAbs, relPath) {
  content = transformFrontmatter(content, relPath);
  content = transformVars(content);
  content = transformComponentImports(content);
  content = transformPartialImports(content, srcFileAbs, relPath);
  content = transformAdmonitions(content);
  content = transformDetails(content);
  content = transformHtmlComments(content);
  content = transformHeadingAnchors(content);
  content = transformShikiLanguages(content);
  content = transformRelativeLinks(content, srcFileAbs);
  content = transformLinks(content);
  return content;
}

function processDoc(srcAbs) {
  const relPath = relative(STYLUS_SRC, srcAbs);
  if (relPath.split('/').includes('partials')) return; // partials handled separately
  try {
    // .md → .mdx (stylus .md files contain MDX imports/JSX)
    const destRel = relPath
      .split('/')
      .map((seg) => seg.replace(/^\d+-/, ''))
      .join('/')
      .replace(/\.md$/, '.mdx');
    const destAbs = join(V2_STYLUS_DEST, destRel);

    const content = runDocPipeline(readFileSync(srcAbs, 'utf8'), srcAbs, relPath);
    ensureDir(dirname(destAbs));
    writeFileSync(destAbs, content);
    stats.pagesPorted++;
  } catch (err) {
    stats.errors.push(`${relPath}: ${err.message}`);
  }
}

function copyPartials() {
  for (const [srcAbs, destAbs] of partialsToCopy) {
    try {
      let content = readFileSync(srcAbs, 'utf8');
      // Partials carry no page frontmatter; run the content transforms only.
      content = transformVars(content);
      content = transformComponentImports(content);
      content = transformPartialImports(content, srcAbs, relative(LEGACY_DOCS_ROOT, srcAbs));
      content = transformAdmonitions(content);
      content = transformDetails(content);
      content = transformHtmlComments(content);
      content = transformHeadingAnchors(content);
      content = transformShikiLanguages(content);
      content = transformRelativeLinks(content, srcAbs);
      content = transformLinks(content);
      ensureDir(dirname(destAbs));
      writeFileSync(destAbs, content);
      stats.partialsCopied++;
    } catch (err) {
      stats.errors.push(`partial ${basename(srcAbs)}: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// meta.json generation (ordered by sidebar_position, then alphabetical)
// ─────────────────────────────────────────────────────────────────────
function readSidebarPosition(fileAbs) {
  const m = readFileSync(fileAbs, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return Infinity;
  const p = m[1].match(/^sidebar_position:\s*(\d+)/m);
  return p ? parseInt(p[1]) : Infinity;
}
function humanize(name) {
  return name
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function minDescendantPosition(dir) {
  let min = Infinity;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'partials') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) min = Math.min(min, minDescendantPosition(full));
    else if (/\.mdx?$/.test(e.name)) min = Math.min(min, readSidebarPosition(full));
  }
  return min;
}

function generateMeta(srcDir, destDir) {
  if (!existsSync(srcDir) || basename(srcDir) === 'partials') return;
  const entries = readdirSync(srcDir, { withFileTypes: true });
  const items = [];
  let hasIndex = false;

  for (const e of entries) {
    if (e.name === 'partials') continue;
    const full = join(srcDir, e.name);
    if (e.isDirectory()) {
      items.push({ name: e.name.replace(/^\d+-/, ''), pos: minDescendantPosition(full) });
    } else if (/\.mdx?$/.test(e.name)) {
      const base = e.name.replace(/\.mdx?$/, '');
      if (base === 'index') hasIndex = true;
      else items.push({ name: base.replace(/^\d+-/, ''), pos: readSidebarPosition(full) });
    }
  }

  items.sort((a, b) => (a.pos !== b.pos ? a.pos - b.pos : a.name.localeCompare(b.name)));
  const pages = items.map((i) => i.name);
  if (hasIndex) pages.unshift('index');

  ensureDir(destDir);
  writeFileSync(
    join(destDir, 'meta.json'),
    JSON.stringify({ title: humanize(basename(destDir)), pages }, null, 2) + '\n',
  );

  for (const e of entries) {
    if (e.isDirectory() && e.name !== 'partials') {
      generateMeta(join(srcDir, e.name), join(destDir, e.name.replace(/^\d+-/, '')));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Wire "stylus" into the root sidebar meta.json
// ─────────────────────────────────────────────────────────────────────
function wireRootMeta() {
  const rootMetaPath = join(V2_DOCS_EN, 'meta.json');
  const meta = JSON.parse(readFileSync(rootMetaPath, 'utf8'));
  if (!meta.pages.includes('stylus')) {
    meta.pages.push('stylus');
    writeFileSync(rootMetaPath, JSON.stringify(meta, null, 2) + '\n');
    console.log('✓ Added "stylus" to root meta.json');
  } else {
    console.log('• root meta.json already lists "stylus"');
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('=== port-stylus ===');
  console.log(`Source: ${STYLUS_SRC}`);
  console.log(`Dest:   ${V2_STYLUS_DEST}`);
  console.log('');

  for (const f of walk(STYLUS_SRC)) processDoc(f);
  console.log(`✓ Pages ported: ${stats.pagesPorted}`);

  copyPartials();
  console.log(`✓ Partials copied: ${stats.partialsCopied}`);

  generateMeta(STYLUS_SRC, V2_STYLUS_DEST);
  console.log('✓ meta.json files generated');

  wireRootMeta();

  const report = (label, arr) => {
    console.log(`\n=== ${label} (${arr.length}) ===`);
    if (arr.length === 0) console.log('(none)');
    else for (const x of arr.slice(0, 40)) console.log(`  ${x}`);
    if (arr.length > 40) console.log(`  … and ${arr.length - 40} more`);
  };
  report('Errors', stats.errors);
  report('Warnings', stats.warnings);
  report('Manual review', stats.manualReview);
  console.log('\nDone.');
}

main();
