/**
 * fix-admonition-titles — repair admonitions whose body prose was stranded in `title=`.
 *
 * The Docusaurus→Fumadocs admonition codemod converted `:::type\n\nbody\n\n:::` by putting the
 * *body* into the `title` attribute and leaving the body empty. The result renders as a blank
 * callout whose prose is styled as a heading, with any markdown in it (links, inline code)
 * printed literally because JSX attributes are plain strings. content-lint reports this as
 * A1 (empty admonition body) plus A4 (markup inside title=) — one defect, two rules.
 *
 * Upstream confirms the shape: every affected admonition was a *bare* `:::type` with no title
 * (verified against OffchainLabs/arbitrum-docs for rpc-methods.mdx, custom-gas-token-chains.mdx
 * and bold-economics-of-disputes.mdx). Moving the title back into the body and dropping the
 * attribute therefore restores the original exactly — the component falls back to
 * `defaultTitles[type]` ("Note", "Tip", …), which is what Docusaurus rendered for a bare
 * directive. Admonitions that already have a real title AND a real body are left alone.
 *
 * `&quot;` is decoded back to `"`: the codemod escaped quotes so they would survive inside a
 * double-quoted attribute, and upstream had literal quotes. No other entity appears in an
 * affected title, so nothing else is decoded — `&lt;`/`&gt;` would become JSX in a body.
 *
 * Usage:
 *   node scripts/codemods/fix-admonition-titles.mjs --dry-run   # report, touch nothing
 *   node scripts/codemods/fix-admonition-titles.mjs             # rewrite in place
 *
 * Verify after: `pnpm content:lint` (A1 → 0, A4 down to the body-bearing cases) and a browser
 * pass, since neither types:check nor build renders a page.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = 'content';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.mdx?$/i.test(entry)) out.push(p);
  }
  return out;
}

/**
 * Blank fenced blocks and inline code to spaces, preserving length and newlines, so an
 * admonition *documented inside* a code sample is never rewritten. Offsets stay 1:1 with the
 * original, so attribute values are always read from the real source.
 */
function stripCode(src) {
  const chars = [...src];
  const blank = (start, end) => {
    for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  };

  let offset = 0;
  let inFence = false;
  let fenceChar = '';
  for (const line of src.split('\n')) {
    const start = offset;
    const end = offset + line.length;
    const open = /^[ \t]*(`{3,}|~{3,})/.exec(line);
    if (!inFence && open) {
      inFence = true;
      fenceChar = open[1][0];
      blank(start, end);
    } else if (inFence) {
      blank(start, end);
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (close && close[1][0] === fenceChar) inFence = false;
    }
    offset = end + 1;
  }
  return chars.join('').replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

/**
 * Read an attribute, matching the closing quote to the opening one. A plain `["']([^"']*)["']`
 * truncates at the first apostrophe inside a double-quoted value ("…doesn't…"), which is why
 * content-lint under-reports A4.
 */
function readAttr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])((?:(?!\\1).)*)\\1`));
  return m ? { value: m[2], raw: m[0] } : null;
}

/** Plan every rewrite in one file. Returns edits sorted last-first so offsets stay valid. */
function planFile(src) {
  const text = stripCode(src);
  const edits = [];

  for (const m of text.matchAll(/<VanillaAdmonition\b([^>]*?)(\/?)>/g)) {
    const openTag = m[0];
    const openStart = m.index;
    const openEnd = openStart + openTag.length;
    const attrs = src.slice(openStart, openEnd);

    const title = readAttr(attrs, 'title');
    if (!title) continue;

    // Body must be genuinely empty; a self-closing tag has no body to fill.
    if (m[2] === '/') continue;
    const closeIdx = text.indexOf('</VanillaAdmonition>', openEnd);
    if (closeIdx === -1) continue;
    if (src.slice(openEnd, closeIdx).trim() !== '') continue;

    const prose = title.value.replace(/&quot;/g, '"').trim();
    if (prose === '') continue;

    // Drop the title attribute, collapsing the space it leaves behind.
    const newOpen = attrs
      .replace(title.raw, '')
      .replace(/\s+>$/, '>')
      .replace(/\s{2,}/g, ' ');

    edits.push({
      start: openStart,
      end: closeIdx,
      text: `${newOpen}\n\n${prose}\n\n`,
      line: src.slice(0, openStart).split('\n').length,
      prose,
    });
  }

  return edits.sort((a, b) => b.start - a.start);
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const repoRoot = process.cwd();
  let files = 0;
  let count = 0;

  for (const abs of walk(path.join(repoRoot, CONTENT_DIR))) {
    const src = readFileSync(abs, 'utf8');
    const edits = planFile(src);
    if (!edits.length) continue;

    let next = src;
    for (const e of edits) next = next.slice(0, e.start) + e.text + next.slice(e.end);

    files += 1;
    count += edits.length;
    const rel = path.relative(repoRoot, abs);
    for (const e of [...edits].reverse()) {
      console.log(`  ${rel}:${e.line}  ${JSON.stringify(e.prose.slice(0, 88))}`);
    }
    if (!dryRun) writeFileSync(abs, next);
  }

  console.log(
    `\n${dryRun ? '[dry-run] would move' : 'moved'} ${count} stranded title(s) into the body across ${files} file(s)`,
  );
}

main();
