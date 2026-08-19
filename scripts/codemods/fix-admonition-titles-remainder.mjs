/**
 * fix-admonition-titles-remainder — the 19 admonitions that carry markup in `title=` *and* have a
 * real body, so `fix-admonition-titles.mjs` (which only fills empty bodies) could not touch them.
 *
 * These need editorial judgement, not a heuristic: a 73-character title can be a deliberate warning
 * headline ("Clearing `x` is not a fix for a Rollup mismatch") while a 110-character one is prose the
 * body continues ("The `cargo-stylus` tool uses …" → "More information can be found on …"). Length,
 * punctuation and provenance all misclassify at least one case, so every decision is recorded below
 * against a unique substring of the title and applied exactly once.
 *
 * Actions:
 *   prose  — the title is body text: prepend it to the body as its own paragraph, drop the attribute
 *            so the component falls back to defaultTitles[type], exactly as a bare `:::type` rendered.
 *   strip  — the title is genuine, but inline-code backticks print literally because `title` is a
 *            plain string prop. Remove the backticks and keep the wording.
 *
 * Deliberately NOT handled: `title="L1 fee &quot;baked in&quot;"` in how-to-estimate-gas.mdx renders
 * correctly as `L1 fee "baked in"` — JSX decodes entities in attribute values (verified in a browser),
 * so content-lint's A4 entity rule is a false positive there. Fixed in content-lint rather than here.
 *
 * Usage: node scripts/codemods/fix-admonition-titles-remainder.mjs [--dry-run]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** title substring → action. Substrings are unique across content/. */
const DECISIONS = [
  // Stranded body prose (the codemod's original defect, or hand-authored the same way).
  ['The `cargo-stylus` command-line tool uses', 'prose'],
  ['The guidance in this document will only work', 'prose'],
  ['While Native Mint/Burn was introduced in ArbOS 41', 'prose'],
  ['The list returned by `ArbAggregator.getBatchPosters()`', 'prose'],
  ['Before calling `ArbAggregator.setFeeCollector()`', 'prose'],
  ['If you have a multisig as executor', 'prose'],
  ['It is important to understand that this is part of customizing ArbOS', 'prose'],
  ['- You can obtain the old keyset hash', 'prose'],
  ['Before setting a fee collector for a batch poster', 'prose'],
  ['For Docker deployments, you can set these', 'prose'],
  ['The following instructions are meant for Arbitrum chains only', 'prose'],
  ['- Unlike the RPC Urls, the Sequencer endpoints', 'prose'],

  // Genuine titles whose backticks render literally.
  ['block number vs `block.number`', 'strip'],
  ['Support for `eth_sendRawTransactionConditional`', 'strip'],
  ['PathDB and `--init.latest`', 'strip'],
  ['`.set()` vs `.setter()`', 'strip'],
  ['Clearing `pending-upgrade-module-root` is not a fix', 'strip'],
  ['On Nitro before v3.10.0, also set', 'strip'],
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.mdx?$/i.test(entry)) out.push(p);
  }
  return out;
}

function stripCode(src) {
  const chars = [...src];
  const blank = (s, e) => {
    for (let i = s; i < e; i++) if (chars[i] !== '\n') chars[i] = ' ';
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

function readAttr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])((?:(?!\\1).)*)\\1`));
  return m ? { value: m[2], raw: m[0] } : null;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const repoRoot = process.cwd();
  const applied = new Map();

  for (const abs of walk(path.join(repoRoot, 'content'))) {
    const src = readFileSync(abs, 'utf8');
    const text = stripCode(src);
    const rel = path.relative(repoRoot, abs);
    const edits = [];

    for (const m of text.matchAll(/<VanillaAdmonition\b([^>]*?)(\/?)>/g)) {
      const openTag = m[0];
      const openStart = m.index;
      const openEnd = openStart + openTag.length;
      const attrs = src.slice(openStart, openEnd);
      const title = readAttr(attrs, 'title');
      if (!title) continue;

      const decision = DECISIONS.find(([needle]) => title.value.includes(needle));
      if (!decision) continue;
      const [needle, action] = decision;

      const line = src.slice(0, openStart).split('\n').length;

      if (action === 'strip') {
        const cleaned = title.value.replace(/`/g, '');
        const newAttrs = attrs.replace(title.raw, title.raw.replace(title.value, cleaned));
        edits.push({ start: openStart, end: openEnd, text: newAttrs, line, action, needle });
        continue;
      }

      // prose: drop the attribute, prepend the text as the body's first paragraph
      const closeIdx = text.indexOf('</VanillaAdmonition>', openEnd);
      if (closeIdx === -1) continue;
      const body = src.slice(openEnd, closeIdx);
      const newOpen = attrs
        .replace(title.raw, '')
        .replace(/\s+>$/, '>')
        .replace(/\s{2,}/g, ' ');
      const prose = title.value.replace(/&quot;/g, '"').trim();
      edits.push({
        start: openStart,
        end: closeIdx,
        text: `${newOpen}\n\n${prose}\n${body.replace(/^\n+/, '\n')}`,
        line,
        action,
        needle,
      });
    }

    if (!edits.length) continue;
    let next = src;
    for (const e of edits.sort((a, b) => b.start - a.start)) {
      next = next.slice(0, e.start) + e.text + next.slice(e.end);
      applied.set(e.needle, `${rel}:${e.line}`);
      console.log(
        `  ${e.action.padEnd(5)}  ${rel}:${e.line}  ${JSON.stringify(e.needle.slice(0, 62))}`,
      );
    }
    if (!dryRun) writeFileSync(abs, next);
  }

  const missed = DECISIONS.filter(([n]) => !applied.has(n));
  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}applied ${applied.size}/${DECISIONS.length} decisions`,
  );
  if (missed.length) {
    console.error('UNMATCHED decisions (stale needle?):');
    for (const [n, a] of missed) console.error(`  ${a}  ${JSON.stringify(n)}`);
    process.exitCode = 1;
  }
}

main();
