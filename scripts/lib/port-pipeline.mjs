/**
 * port-pipeline — the shared pure-transform layer for the doc-porting codemods.
 *
 * These functions are extracted VERBATIM from scripts/codemods/port-stylus.mjs, with three
 * behavior-preserving generalizations so a single config-driven driver can port any section:
 *   - `stats` is a parameter (was a module-level global) on the functions that record
 *     warnings/manualReview (transformFrontmatter, transformDetails, transformPartialImports).
 *   - transformRelativeLinks takes `legacyDocsRoot` (was a closed-over constant).
 *   - transformPartialImports resolves against `ctx.partialRoots` (was stylus-hardcoded roots).
 *
 * `runDocPipeline(content, srcFileAbs, relPath, ctx)` threads a `ctx` carrying
 * `legacyDocsRoot`, `partialRoots`, `partialsToCopy`, and `stats`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import varsJson from '../../content/vars.json' with { type: 'json' };

export const CONTENT_TYPE_ENUM = new Set([
  'how-to',
  'concept',
  'quickstart',
  'tutorial',
  'reference',
  'troubleshooting',
  'faq',
]);

export const ADMONITION_TYPE_MAP = {
  note: 'note',
  tip: 'tip',
  info: 'info',
  warning: 'warning',
  caution: 'warning',
  danger: 'danger',
  important: 'info',
};

// Docusaurus-only frontmatter keys with no meaning in Fumadocs.
export const DROP_FRONTMATTER = new Set([
  'slug',
  'displayed_sidebar',
  'pagination_next',
  'pagination_prev',
  'id',
  'sidebar_position',
  'target_audience',
]);

// ─────────────────────────────────────────────────────────────────────
// Fenced-code protection helper
// ─────────────────────────────────────────────────────────────────────
export function protectCode(content) {
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
export function restoreCode(work, blocks) {
  return work.replace(/__CODEBLOCK_(\d+)__/g, (_m, i) => blocks[parseInt(i)]);
}

// ─────────────────────────────────────────────────────────────────────
// Transform: frontmatter
// ─────────────────────────────────────────────────────────────────────
export function transformFrontmatter(content, relPath, stats) {
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
// Transform: @@vars@@
// ─────────────────────────────────────────────────────────────────────
export function transformVars(content) {
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
    // A var inside a markdown link target — `](@@name@@)` — must resolve to the
    // literal value, not a <Var> component (a component is invalid as an href).
    if (!inFence) {
      lines[i] = lines[i].replace(
        /\]\(\s*@@([A-Za-z_][A-Za-z0-9_]*)(?:=([^@]*))?@@\s*\)/g,
        (_f, name, inline) => {
          if (Object.prototype.hasOwnProperty.call(varsJson, name)) return `](${varsJson[name]})`;
          if (inline !== undefined) return `](${inline})`;
          return `](#)`;
        },
      );
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
export function transformComponentImports(content) {
  return content.replace(
    /^import\s+(?:[\w{},\s]+?)\s+from\s+['"]@site\/src\/components\/[^'"]+['"];?\s*$\n?/gm,
    '',
  );
}

// ─────────────────────────────────────────────────────────────────────
// Transform: Docusaurus @theme/Tabs + @theme/TabItem → Fumadocs Tabs/Tab
//   - strip the @theme imports (Tabs/Tab are globally registered)
//   - <TabItem value="v" label="L"> → <Tab value="L">  (label, else value)
//   - inject items={[…]} on the enclosing <Tabs> from the child labels
// Docusaurus-only <Tabs> attrs (groupId) are dropped.
// ─────────────────────────────────────────────────────────────────────
export function transformTabs(content) {
  let work = content
    .replace(/^import\s+Tabs\s+from\s+['"]@theme\/Tabs['"];?\s*$\n?/gm, '')
    .replace(/^import\s+TabItem\s+from\s+['"]@theme\/TabItem['"];?\s*$\n?/gm, '');
  const { work: protectedWork, blocks } = protectCode(work);
  work = protectedWork.replace(/<Tabs\b([^>]*)>([\s\S]*?)<\/Tabs>/g, (_m, tabsAttrs, inner) => {
    const labels = [];
    let newInner = inner.replace(/<TabItem\b([^>]*?)\s*>/g, (_mm, attrs) => {
      const label = (attrs.match(/\blabel\s*=\s*["']([^"']*)["']/) || [])[1];
      const value = (attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/) || [])[1];
      const display = label || value || `Tab ${labels.length + 1}`;
      labels.push(display);
      return `<Tab value=${JSON.stringify(display)}>`;
    });
    newInner = newInner.replace(/<\/TabItem>/g, '</Tab>');
    const cleanedAttrs = tabsAttrs.replace(/\s*\bgroupId\s*=\s*["'][^"']*["']/g, '');
    const itemsAttr = /\bitems\s*=/.test(cleanedAttrs)
      ? cleanedAttrs
      : ` items={${JSON.stringify(labels)}}${cleanedAttrs}`;
    return `<Tabs${itemsAttr}>${newInner}</Tabs>`;
  });
  return restoreCode(work, blocks);
}

// ─────────────────────────────────────────────────────────────────────
// Transform: partial imports → <include> (registry-aware, relative-resolved)
// ─────────────────────────────────────────────────────────────────────
export function transformPartialImports(content, srcFileAbs, relPath, ctx) {
  const srcDir = dirname(srcFileAbs);
  const importMap = {};

  let cleaned = content.replace(
    /^import\s+(\w+)\s+from\s+['"]([^'"]+\.mdx?)['"];?\s*$/gm,
    (match, name, imp) => {
      const targetAbs = resolve(srcDir, imp);
      const entry = ctx.partialRoots.find((r) => targetAbs.startsWith(r.legacyDir + sep));
      if (!entry) {
        ctx.stats.manualReview.push(
          `${relPath}: partial import '${imp}' outside known partial roots`,
        );
        return match; // leave the import untouched for manual review
      }
      const base = basename(targetAbs);
      ctx.partialsToCopy.set(targetAbs, join(entry.destDir, base));
      const includePath = `${entry.includePrefix}/${base}`;
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
// Transform: admonitions
// ─────────────────────────────────────────────────────────────────────
export function transformAdmonitions(content) {
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
export function transformDetails(content, stats = { warnings: [], manualReview: [], errors: [] }) {
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
export function transformHtmlComments(content) {
  const { work: protectedWork, blocks } = protectCode(content);
  let work = protectedWork.replace(/<!--([\s\S]*?)-->/g, (_m, inner) => `{/*${inner}*/}`);
  return restoreCode(work, blocks);
}

// ─────────────────────────────────────────────────────────────────────
// Transform: strip Docusaurus heading anchors {#id}
// ─────────────────────────────────────────────────────────────────────
export function transformHeadingAnchors(content) {
  return content.replace(/^(#+\s.+?)\s*\{#[^}]+\}\s*$/gm, '$1');
}

// ─────────────────────────────────────────────────────────────────────
// Transform: Shiki language fixes
// ─────────────────────────────────────────────────────────────────────
export function transformShikiLanguages(content) {
  // Fix a common typo and neutralize fence tags that are not Shiki languages
  // (Shiki throws on unknown languages, which crashes rendering). These are
  // URL/output tags, not grammars → render as plain text.
  const REMAP = { typscript: 'typescript', https: 'text', http: 'text', console: 'text' };
  return content.replace(/^(\s*)```([A-Za-z][\w+-]*)/gm, (m, indent, lang) => {
    const fixed = REMAP[lang];
    return fixed ? `${indent}\`\`\`${fixed}` : m;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Transform: relative links (./x, ../dir/y) → absolute /docs/…
// ─────────────────────────────────────────────────────────────────────
export function transformRelativeLinks(content, srcFileAbs, legacyDocsRoot) {
  const srcDir = dirname(srcFileAbs);
  const { work: protectedWork, blocks } = protectCode(content);
  let work = protectedWork.replace(/\]\((\.\.?\/[^)\s]+)\)/g, (m, rawUrl) => {
    const hashIdx = rawUrl.indexOf('#');
    const anchor = hashIdx >= 0 ? rawUrl.slice(hashIdx) : '';
    const p = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl;
    const targetAbs = resolve(srcDir, p);
    let rel = relative(legacyDocsRoot, targetAbs);
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
export function transformLinks(content) {
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
// Ordered per-file pipeline
// ─────────────────────────────────────────────────────────────────────
export function runDocPipeline(content, srcFileAbs, relPath, ctx) {
  content = transformFrontmatter(content, relPath, ctx.stats);
  content = transformVars(content);
  content = transformComponentImports(content);
  content = transformTabs(content);
  content = transformPartialImports(content, srcFileAbs, relPath, ctx);
  content = transformAdmonitions(content);
  content = transformDetails(content, ctx.stats);
  content = transformHtmlComments(content);
  content = transformHeadingAnchors(content);
  content = transformShikiLanguages(content);
  content = transformRelativeLinks(content, srcFileAbs, ctx.legacyDocsRoot);
  content = transformLinks(content);
  return content;
}

// ─────────────────────────────────────────────────────────────────────
// Filesystem helpers
// ─────────────────────────────────────────────────────────────────────
export function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.isFile() && /\.mdx?$/.test(e.name)) out.push(full);
  }
  return out;
}
export function ensureDir(d) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────
// meta.json generation (ordered by sidebar_position, then alphabetical)
// ─────────────────────────────────────────────────────────────────────
export function readSidebarPosition(fileAbs) {
  const m = readFileSync(fileAbs, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return Infinity;
  const p = m[1].match(/^sidebar_position:\s*(\d+)/m);
  return p ? parseInt(p[1]) : Infinity;
}
export function humanize(name) {
  return name
    .replace(/^\d+-/, '')
    .replace(/-/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function minDescendantPosition(dir) {
  let min = Infinity;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'partials') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) min = Math.min(min, minDescendantPosition(full));
    else if (/\.mdx?$/.test(e.name)) min = Math.min(min, readSidebarPosition(full));
  }
  return min;
}

export function generateMeta(srcDir, destDir) {
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
