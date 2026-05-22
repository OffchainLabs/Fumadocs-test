#!/usr/bin/env node
/**
 * Port docs/launch-arbitrum-chain/ from legacy arbitrum-docs to v2.
 * Spec: WEEK-4-launch-arbitrum-chain-port-spec-2026-05-22.md
 *
 * Spec called for modular files under transforms/; here implemented as a
 * single .mjs with transform functions to avoid adding tsx/ts-node to v2.
 * The function boundaries preserve modularity for future splits.
 *
 * Usage: node scripts/codemods/port-launch-arbitrum-chain.mjs
 */

import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, statSync,
} from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';

const LEGACY_ROOT = '/Users/allup/OCL/arbitrum-docs-baseline/docs/launch-arbitrum-chain';
const LEGACY_GLOBAL_PARTIALS = '/Users/allup/OCL/arbitrum-docs-baseline/docs/partials';
const V2_SECTION_ROOT = '/Users/allup/OCL/arbitrum-docs-v2/content/docs/en/launch-arbitrum-chain';
const V2_GLOBAL_PARTIALS = '/Users/allup/OCL/arbitrum-docs-v2/content/docs/en/partials';

const SKIP_PATHS = new Set([
  // All previously-deferred pages ported via MVP bucket 1 (2026-05-22):
  // CustomDetails + Tabs + AddressExplorerLink + FAQStructuredData now registered.
]);

const GLOBAL_PARTIALS_TO_COPY = [
  '_bold-config-params.mdx',
  '_additional-config-params.mdx',
  '_hardware-requirements.mdx',
  '_troubleshooting-arbitrum-chain-partial.mdx',
];

const CONTENT_TYPE_ENUM = new Set([
  'how-to', 'concept', 'quickstart', 'tutorial', 'reference', 'troubleshooting', 'faq',
]);

const SECTION_PREFIXES = [
  'arbitrum-bridge', 'build-decentralized-apps', 'stylus', 'how-arbitrum-works',
  'launch-arbitrum-chain', 'run-arbitrum-node', 'for-devs', 'get-started',
];

const ADMONITION_TYPE_MAP = {
  note: 'note',
  tip: 'tip',
  info: 'info',
  warning: 'warning',
  caution: 'warning',
  danger: 'danger',
  important: 'info',
};

const stats = {
  pagesPortedCount: 0,
  partialsPortedCount: 0,
  globalPartialsCopied: 0,
  skipped: 0,
  errors: [],
  warnings: [],
  manualReview: [],
};

// ─────────────────────────────────────────────────────────────────────
// Transform: frontmatter
// ─────────────────────────────────────────────────────────────────────
function transformFrontmatter(content, sourcePath) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);

  // Existing frontmatter
  if (fmMatch) {
    const fmText = fmMatch[1];
    const rest = content.slice(fmMatch[0].length);

    const fm = {};
    // Parse line-by-line; drop empty/null values (including quoted-empty like sme: '').
    for (const line of fmText.split('\n')) {
      const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (m) {
        const raw = m[2].trim();
        // Strip a single matched outer pair of quotes for emptiness check
        const inner = raw.replace(/^['"](.*)['"]$/, '$1').trim();
        if (inner === '' || inner === 'null') continue;
        fm[m[1]] = raw;
      }
    }

    // Strip Docusaurus-only fields
    const DROP = new Set(['slug', 'displayed_sidebar', 'pagination_next', 'pagination_prev', 'id']);
    for (const k of DROP) delete fm[k];

    // content_type normalization
    let ct = (fm.content_type || 'concept').replace(/^['"]|['"]$/g, '');
    if (!CONTENT_TYPE_ENUM.has(ct)) {
      stats.manualReview.push(`${sourcePath}: content_type '${ct}' not in enum, defaulted to concept`);
      ct = 'concept';
    }
    fm.content_type = `'${ct}'`;

    // Required: author, sme
    const author = (fm.author || 'gblanchemain').replace(/^['"]|['"]$/g, '');
    fm.author = author;
    if (!fm.sme) fm.sme = author;
    fm.sme = fm.sme.replace(/^['"]|['"]$/g, '');

    // Required: title, description
    if (!fm.title) {
      const fallback = basename(sourcePath, '.mdx').replace(/^\d+-/, '').replace(/-/g, ' ');
      fm.title = `'${fallback}'`;
      stats.warnings.push(`${sourcePath}: missing title, defaulted`);
    }
    if (!fm.description) {
      fm.description = fm.title;
      stats.warnings.push(`${sourcePath}: missing description, used title`);
    }

    // Rebuild — preserve a stable key order
    const ORDER = [
      'title', 'description', 'sidebar_label', 'sidebar_position',
      'user_story', 'content_type', 'author', 'sme', 'draft',
    ];
    let out = '---\n';
    for (const k of ORDER) if (fm[k] !== undefined) out += `${k}: ${fm[k]}\n`;
    // Append any remaining keys not in ORDER (carry-through, preserves writer intent)
    for (const [k, v] of Object.entries(fm)) {
      if (!ORDER.includes(k)) out += `${k}: ${v}\n`;
    }
    out += '---\n';
    return out + rest;
  }

  // No frontmatter — synthesize a minimal one
  const fallback = basename(sourcePath, '.mdx').replace(/^\d+-/, '').replace(/-/g, ' ');
  stats.warnings.push(`${sourcePath}: no frontmatter, synthesized`);
  return `---\ntitle: '${fallback}'\ndescription: '${fallback}'\ncontent_type: 'concept'\nauthor: gblanchemain\nsme: gblanchemain\n---\n` + content;
}

// ─────────────────────────────────────────────────────────────────────
// Transform: vars
// ─────────────────────────────────────────────────────────────────────
// Read vars.json once at module load for inside-code-fence substitution.
// JSX (<Var>) can't run inside MDX code fences, so we resolve those inline.
import varsJson from '../../content/vars.json' with { type: 'json' };

function transformVars(content) {
  // Legacy uses two shapes: bare `@@varName@@` and Vercel-cache-busting
  // `@@varName=currentValue@@`. Both must be substituted.
  //
  // Outside fenced code blocks: emit <Var name="varName" /> (resolves at render
  // time from content/vars.ts — single source of truth).
  //
  // Inside fenced code blocks (``` or ~~~): JSX is opaque to MDX, so emit the
  // literal current value from vars.json. Falls back to the inline `=value`
  // hint when the var isn't in vars.json (legacy `@@x=y@@` carries a copy of
  // the current value for Vercel cache-busting); falls back to the variable
  // name as last resort.
  const lines = content.split('\n');
  let inFence = false;
  let fenceDelimiter = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^(\s*)(```|~~~)/);
    if (fenceMatch) {
      const delim = fenceMatch[2];
      if (!inFence) { inFence = true; fenceDelimiter = delim; }
      else if (delim === fenceDelimiter) { inFence = false; fenceDelimiter = null; }
    }
    lines[i] = line.replace(
      /@@([A-Za-z_][A-Za-z0-9_]*)(?:=([^@]*))?@@/g,
      (_full, name, inlineValue) => {
        if (inFence) {
          if (Object.prototype.hasOwnProperty.call(varsJson, name)) return String(varsJson[name]);
          if (inlineValue !== undefined) return inlineValue;
          return name;
        }
        return `<Var name="${name}" />`;
      },
    );
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Transform: partial imports
// ─────────────────────────────────────────────────────────────────────
function transformPartialImports(content, destPath) {
  const destDir = dirname(destPath);
  const importMap = {};

  // Pass A: extract imports and strip them
  let cleaned = content.replace(
    /^import\s+(\w+)\s+from\s+['"]([^'"]+\.mdx?)['"];?\s*$/gm,
    (match, name, path) => {
      // Normalize duplicate slashes
      path = path.replace(/\/{2,}/g, '/').replace(/^\.\/+/, './');

      // Rewrite @site/docs/partials/ → relative to V2_GLOBAL_PARTIALS
      if (path.startsWith('@site/docs/partials/')) {
        const partialName = path.slice('@site/docs/partials/'.length);
        const absPartial = join(V2_GLOBAL_PARTIALS, partialName);
        let rel = relative(destDir, absPartial);
        if (!rel.startsWith('.')) rel = './' + rel;
        path = rel;
      }

      importMap[name] = path;
      return ''; // strip
    },
  );

  // Pass B: convert JSX usage to <include>
  for (const [name, path] of Object.entries(importMap)) {
    // Self-closing: <Name /> or <Name/>
    cleaned = cleaned.replace(new RegExp(`<${name}\\s*/>`, 'g'), `<include>${path}</include>`);
    // Open-close (rare; treat as no-children include)
    cleaned = cleaned.replace(
      new RegExp(`<${name}>[\\s\\S]*?</${name}>`, 'g'),
      `<include>${path}</include>`,
    );
  }

  // Collapse extra blank lines left by stripped imports (max one blank line in a row after frontmatter)
  cleaned = cleaned.replace(/(\n---\n)\n{2,}/g, '$1\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────
// Transform: admonitions
// ─────────────────────────────────────────────────────────────────────
function transformAdmonitions(content) {
  // Protect fenced code blocks (``` and ~~~)
  const codeBlocks = [];
  const protect = (s, fence) => s.replace(
    new RegExp(`${fence}[\\s\\S]*?${fence}`, 'g'),
    (m) => { codeBlocks.push(m); return `__CODEBLOCK_${codeBlocks.length - 1}__`; },
  );
  let work = content;
  work = protect(work, '```');
  work = protect(work, '~~~');

  const types = Object.keys(ADMONITION_TYPE_MAP).join('|');

  // Process 4-colon (outer wrappers) first, then 3-colon
  for (const colons of ['::::', ':::']) {
    const re = new RegExp(
      `^${colons}(${types})(?:\\s+(.+))?\\n([\\s\\S]*?)\\n${colons}\\s*$`,
      'gm',
    );
    work = work.replace(re, (match, type, title, body) => {
      const mapped = ADMONITION_TYPE_MAP[type];
      const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;').trim()}"` : '';
      return `<VanillaAdmonition type="${mapped}"${titleAttr}>\n${body}\n</VanillaAdmonition>`;
    });
  }

  // Restore code blocks
  work = work.replace(/__CODEBLOCK_(\d+)__/g, (m, idx) => codeBlocks[parseInt(idx)]);

  return work;
}

// ─────────────────────────────────────────────────────────────────────
// Transform: internal link rewrites
// ─────────────────────────────────────────────────────────────────────
function transformLinks(content) {
  // First add the /docs/ prefix to legacy section URLs.
  const re = new RegExp(`\\]\\(/(${SECTION_PREFIXES.join('|')})/`, 'g');
  let work = content.replace(re, '](/docs/$1/');

  // Then strip numeric prefixes from each path segment inside /docs/ links
  // (matches the slugsPlugin behavior in lib/source.ts so URLs resolve correctly).
  work = work.replace(/\]\(([^)]*\/docs\/[^)]+)\)/g, (m, url) => {
    const stripped = url
      .split('/')
      .map((seg) => seg.replace(/^\d+-/, ''))
      .join('/');
    return `](${stripped})`;
  });
  return work;
}

// ─────────────────────────────────────────────────────────────────────
// Transform: strip @site/src/components/ imports
// ─────────────────────────────────────────────────────────────────────
function transformComponentImports(content) {
  // Strip `import X from '@site/src/components/...';` — the components are
  // either globally registered in v2 (no import needed) or stubbed.
  return content.replace(
    /^import\s+(?:[\w{},\s]+?)\s+from\s+['"]@site\/src\/components\/[^'"]+['"];?\s*$\n?/gm,
    '',
  );
}

// ─────────────────────────────────────────────────────────────────────
// Transform: HTML comments → MDX comments
// ─────────────────────────────────────────────────────────────────────
function transformHtmlComments(content) {
  // Convert <!-- ... --> to {/* ... */} (MDX-compatible).
  // Preserve in fenced code blocks.
  const codeBlocks = [];
  let work = content.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m); return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });
  work = work.replace(/<!--([\s\S]*?)-->/g, (m, inner) => `{/*${inner}*/}`);
  work = work.replace(/__CODEBLOCK_(\d+)__/g, (m, idx) => codeBlocks[parseInt(idx)]);
  return work;
}

// ─────────────────────────────────────────────────────────────────────
// Transform: Docusaurus heading anchors {#anchor-id}
// ─────────────────────────────────────────────────────────────────────
function transformHeadingAnchors(content) {
  // Strip trailing {#anchor-id} from heading lines (Docusaurus convention).
  // Fumadocs auto-generates anchors from heading text.
  return content.replace(/^(#+\s.+?)\s*\{#[^}]+\}\s*$/gm, '$1');
}

// ─────────────────────────────────────────────────────────────────────
// Transform: Shiki language fixes
// ─────────────────────────────────────────────────────────────────────
function transformShikiLanguages(content) {
  // Fix the `typscript` typo found in one file. Targets code-fence lines.
  return content.replace(/^```typscript\b/gm, '```typescript');
}

// ─────────────────────────────────────────────────────────────────────
// Transform: Docusaurus <Tabs> / <TabItem>  →  Fumadocs <Tabs> / <Tab>
// ─────────────────────────────────────────────────────────────────────
function transformTabs(content, relPath) {
  // Strip imports
  let out = content
    .replace(/^\s*import\s+Tabs\s+from\s+['"]@theme\/Tabs['"];?\s*$/gm, '')
    .replace(/^\s*import\s+TabItem\s+from\s+['"]@theme\/TabItem['"];?\s*$/gm, '');

  // Warn on unsupported groupId (cross-page sync model differs).
  if (/<Tabs\b[^>]*\bgroupId=/.test(out)) {
    stats.manualReview.push(`${relPath}: <Tabs groupId="..."> — Fumadocs uses a different cross-page sync model; manual review required`);
  }

  // For each <Tabs ...> block, extract the values=[{label,value}] array, build a
  // label↔value map, rewrite opening tag to <Tabs items={[...labels]}>, and stash
  // a sentinel comment carrying the value→label map so the <TabItem> pass below
  // can rewrite each item's value to the corresponding label.
  out = out.replace(
    /<Tabs\b([^>]*)>/g,
    (full, attrs) => {
      const valuesMatch = attrs.match(/values=\{(\[[\s\S]*?\])\}/);
      if (!valuesMatch) return full;
      let parsed;
      try {
        // The values array uses unquoted keys: [{label:'X',value:'x'}].
        // Convert unquoted keys → JSON keys, single quotes → double, then JSON.parse.
        const jsonish = valuesMatch[1]
          .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
          .replace(/'/g, '"');
        parsed = JSON.parse(jsonish);
      } catch (e) {
        stats.manualReview.push(`${relPath}: could not parse <Tabs values={...}>; manual review required`);
        return full;
      }
      const labels = parsed.map((v) => v.label);
      const valueToLabel = Object.fromEntries(parsed.map((v) => [v.value, v.label]));
      const sentinel = `{/* __TABS_MAP__:${JSON.stringify(valueToLabel)} */}`;
      return `<Tabs items={${JSON.stringify(labels)}}>${sentinel}`;
    },
  );

  // Second shape: bare <Tabs> (or with className/defaultValue) followed by
  // <TabItem value="x" label="X" [default]> children — the modern Docusaurus
  // pattern where labels live on each TabItem instead of in a Tabs values array.
  // Walk the lines, for each bare <Tabs ...> (no items= yet), scan ahead to
  // collect TabItem labels until </Tabs>, then rewrite the opener.
  {
    const lines2 = out.split('\n');
    const result2 = [];
    let i = 0;
    while (i < lines2.length) {
      const line = lines2[i];
      const bareOpener = line.match(/^(\s*)<Tabs\b([^>]*)>(\s*)$/);
      const alreadyRewritten = bareOpener && /\bitems=/.test(bareOpener[2]);
      if (bareOpener && !alreadyRewritten) {
        const valueToLabel = {};
        const labels = [];
        let j = i + 1;
        let blockEnd = -1;
        while (j < lines2.length) {
          if (/<\/Tabs>/.test(lines2[j])) { blockEnd = j; break; }
          // Match TabItem with value+label in either order
          const m1 = lines2[j].match(/<TabItem\b[^>]*\bvalue=(["'])([^"']+)\1[^>]*\blabel=(["'])([^"']+)\3/);
          const m2 = m1 || lines2[j].match(/<TabItem\b[^>]*\blabel=(["'])([^"']+)\1[^>]*\bvalue=(["'])([^"']+)\3/);
          if (m1) {
            const value = m1[2], label = m1[4];
            valueToLabel[value] = label;
            if (!labels.includes(label)) labels.push(label);
          } else if (m2) {
            const label = m2[2], value = m2[4];
            valueToLabel[value] = label;
            if (!labels.includes(label)) labels.push(label);
          }
          j++;
        }
        if (blockEnd !== -1 && labels.length > 0) {
          const cleanedAttrs = bareOpener[2]
            .replace(/\bdefaultValue=\{[^}]*\}/g, '')
            .replace(/\bclassName=(["'])[^"']*\1/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          const opener = cleanedAttrs
            ? `${bareOpener[1]}<Tabs items={${JSON.stringify(labels)}} ${cleanedAttrs}>{/* __TABS_MAP__:${JSON.stringify(valueToLabel)} */}`
            : `${bareOpener[1]}<Tabs items={${JSON.stringify(labels)}}>{/* __TABS_MAP__:${JSON.stringify(valueToLabel)} */}`;
          result2.push(opener);
          i++;
          continue;
        }
      }
      result2.push(line);
      i++;
    }
    out = result2.join('\n');
  }

  // Drop now-unsupported attrs (defaultValue, className) on any remaining <Tabs>.
  out = out.replace(/<Tabs\b([^>]*)>/g, (_full, attrs) => {
    const cleaned = attrs
      .replace(/\bdefaultValue=\{[^}]*\}/g, '')
      .replace(/\bclassName=(["'])[^"']*\1/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned ? `<Tabs ${cleaned}>` : `<Tabs>`;
  });

  // State-machine pass: replay sentinels to track the current value→label map,
  // then rewrite <TabItem value="x" [label=... default ...]> → <Tab value="<label>">.
  const lines = out.split('\n');
  const result = [];
  let currentMap = null;
  for (const line of lines) {
    const sentinelMatch = line.match(/\{\/\*\s*__TABS_MAP__:(.*?)\s*\*\/\}/);
    if (sentinelMatch) {
      try {
        currentMap = JSON.parse(sentinelMatch[1]);
      } catch {
        currentMap = null;
      }
      result.push(line.replace(/\{\/\*\s*__TABS_MAP__:.*?\*\/\}/, ''));
      continue;
    }
    if (/<\/Tabs>/.test(line)) {
      currentMap = null;
    }
    if (currentMap) {
      const rewritten = line
        .replace(/<TabItem\s+value=(["'])([^"']+)\1[^>]*>/g, (_, _q, v) => {
          const label = currentMap[v] ?? v;
          return `<Tab value=${JSON.stringify(label)}>`;
        })
        .replace(/<\/TabItem>/g, '</Tab>');
      result.push(rewritten);
    } else {
      result.push(line);
    }
  }
  return result.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Walk + per-file pipeline
// ─────────────────────────────────────────────────────────────────────
function walk(dir, baseDir = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, baseDir));
    } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      out.push({ full, rel: relative(baseDir, full) });
    }
  }
  return out;
}

function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function processFile(srcAbs, relPath) {
  if (SKIP_PATHS.has(relPath)) {
    stats.skipped++;
    return;
  }
  try {
    // Any file in a partials/ dir is a partial regardless of filename prefix.
    // This catches files like partials/config-*.mdx (legacy convention without _).
    const inPartialsDir = relPath.split('/').includes('partials');
    const startsWithUnderscore = basename(relPath).startsWith('_');
    const isPartial = inPartialsDir || startsWithUnderscore;

    // Strip Docusaurus-style numeric prefixes (e.g., `01-`) from each path
    // segment. Legacy used `01-a-gentle-introduction.mdx` with Docusaurus's
    // default `numberPrefixParser` stripping `01-` from URLs. Fumadocs uses
    // filenames verbatim, so we strip during port to match legacy URLs.
    // Order is preserved via meta.json's `pages` array.
    let destRel = relPath
      .split('/')
      .map((seg, i, arr) => {
        // Don't strip from partial filenames (already `_`-prefixed; numeric strip would mangle `_01-foo` → `_foo`)
        if (i === arr.length - 1 && seg.startsWith('_')) return seg;
        return seg.replace(/^\d+-/, '');
      })
      .join('/');

    // If in partials/ dir but missing underscore, add one for Fumadocs exclusion.
    if (inPartialsDir && !startsWithUnderscore) {
      const dir = dirname(destRel);
      const file = basename(destRel);
      destRel = join(dir, `_${file}`);
      stats.warnings.push(`${relPath}: in partials/ but no underscore prefix; renamed to ${destRel}`);
    }

    const destAbs = join(V2_SECTION_ROOT, destRel);
    let content = readFileSync(srcAbs, 'utf8');

    // Pipeline (partials get most transforms — they can have admonitions/vars too)
    if (!isPartial) content = transformFrontmatter(content, relPath);
    content = transformVars(content);
    content = transformComponentImports(content);
    content = transformPartialImports(content, destAbs);
    content = transformAdmonitions(content);
    content = transformHtmlComments(content);
    content = transformHeadingAnchors(content);
    content = transformShikiLanguages(content);
    content = transformTabs(content, relPath);
    content = transformLinks(content);

    ensureDir(dirname(destAbs));
    writeFileSync(destAbs, content);

    if (isPartial) stats.partialsPortedCount++;
    else stats.pagesPortedCount++;
  } catch (err) {
    stats.errors.push(`${relPath}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Global partial copy
// ─────────────────────────────────────────────────────────────────────
function copyGlobalPartials() {
  ensureDir(V2_GLOBAL_PARTIALS);
  for (const name of GLOBAL_PARTIALS_TO_COPY) {
    const src = join(LEGACY_GLOBAL_PARTIALS, name);
    const dest = join(V2_GLOBAL_PARTIALS, name);
    try {
      let content = readFileSync(src, 'utf8');
      // Apply minimal transforms — partials don't have frontmatter or imports
      content = transformVars(content);
      content = transformAdmonitions(content);
      content = transformHtmlComments(content);
      content = transformHeadingAnchors(content);
      content = transformShikiLanguages(content);
      content = transformLinks(content);
      writeFileSync(dest, content);
      stats.globalPartialsCopied++;
    } catch (err) {
      stats.errors.push(`global-partial:${name}: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// meta.json auto-generation
// ─────────────────────────────────────────────────────────────────────
function humanize(dirName) {
  return dirName
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Build meta.json based on the SOURCE legacy directory (preserves numeric-prefix
 * sort order), while the listed page basenames are the STRIPPED v2 destination
 * names (so the sidebar entries match the v2 files on disk).
 */
function generateMetaJsonForSourceDir(srcDir, destDir) {
  if (!existsSync(srcDir)) return;
  if (basename(srcDir) === 'partials') return; // hide partials/ from sidebar

  const entries = readdirSync(srcDir, { withFileTypes: true });

  const pageEntries = []; // { sortKey, destName }
  const subDirs = []; // { srcName, destName, sortKey }
  let hasIndex = false;

  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name === 'partials') continue;
      const sortKey = e.name; // includes numeric prefix
      const destName = e.name.replace(/^\d+-/, '');
      subDirs.push({ srcName: e.name, destName, sortKey });
    } else if (e.isFile() && /\.mdx?$/.test(e.name) && !e.name.startsWith('_')) {
      const base = e.name.replace(/\.mdx?$/, '');
      if (base === 'index') {
        hasIndex = true;
      } else {
        const destBase = base.replace(/^\d+-/, '');
        pageEntries.push({ sortKey: base, destName: destBase });
      }
    }
  }

  const all = [
    ...pageEntries.map((p) => ({ sortKey: p.sortKey, name: p.destName })),
    ...subDirs.map((d) => ({ sortKey: d.sortKey, name: d.destName })),
  ];

  all.sort((a, b) => {
    const numA = a.sortKey.match(/^(\d+)-/);
    const numB = b.sortKey.match(/^(\d+)-/);
    if (numA && numB) return parseInt(numA[1]) - parseInt(numB[1]);
    if (numA) return -1;
    if (numB) return 1;
    return a.sortKey.localeCompare(b.sortKey);
  });

  const pages = all.map((x) => x.name);
  if (hasIndex) pages.unshift('index');

  const title = humanize(basename(destDir));
  ensureDir(destDir);
  writeFileSync(
    join(destDir, 'meta.json'),
    JSON.stringify({ title, pages }, null, 2) + '\n',
  );

  for (const sub of subDirs) {
    generateMetaJsonForSourceDir(join(srcDir, sub.srcName), join(destDir, sub.destName));
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('=== port-launch-arbitrum-chain ===');
  console.log(`Source: ${LEGACY_ROOT}`);
  console.log(`Dest:   ${V2_SECTION_ROOT}`);
  console.log('');

  // 1. Copy global partials
  copyGlobalPartials();
  console.log(`✓ Global partials copied: ${stats.globalPartialsCopied}`);

  // 2. Walk + transform per-file
  const files = walk(LEGACY_ROOT);
  console.log(`✓ Source files found: ${files.length}`);
  for (const { full, rel } of files) processFile(full, rel);

  console.log(`✓ Pages ported: ${stats.pagesPortedCount}`);
  console.log(`✓ Section-local partials ported: ${stats.partialsPortedCount}`);
  console.log(`✓ Skipped (unported components): ${stats.skipped}`);

  // 3. Generate meta.json per subdirectory (driven by SOURCE structure so numeric prefixes are honored for sort order)
  generateMetaJsonForSourceDir(LEGACY_ROOT, V2_SECTION_ROOT);
  console.log('✓ meta.json files generated');

  // 4. Final report
  console.log('');
  console.log('=== Errors ===');
  if (stats.errors.length === 0) console.log('(none)');
  else for (const e of stats.errors) console.log(`  ✗ ${e}`);

  console.log('');
  console.log('=== Warnings ===');
  if (stats.warnings.length === 0) console.log('(none)');
  else for (const w of stats.warnings.slice(0, 20)) console.log(`  ⚠ ${w}`);
  if (stats.warnings.length > 20) console.log(`  … and ${stats.warnings.length - 20} more`);

  console.log('');
  console.log('=== Manual review ===');
  if (stats.manualReview.length === 0) console.log('(none)');
  else for (const m of stats.manualReview) console.log(`  ? ${m}`);

  console.log('');
  console.log('Done.');
}

main();
