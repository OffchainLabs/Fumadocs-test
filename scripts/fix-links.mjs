/**
 * fix-links — repair broken internal doc links left by the Docusaurus→Fumadocs port.
 *
 * The landing/nav cards and many cross-links use an intended information architecture
 * (`configure-your-chain/common/…`, `deploy-an-arbitrum-chain/…`, trailing `.mdx`) that doesn't match
 * the built file tree (`configuration/core/…`, `deploy/…`, clean URLs). For every link that currently
 * resolves to nothing, we remap it to the unique doc that shares its basename and re-emit a clean
 * (extension-less) URL. Links whose basename matches no doc (sections not ported yet) or matches more
 * than one doc (ambiguous) are left untouched and reported.
 *
 *   node scripts/fix-links.mjs [--dry]
 */
import { writeFileSync } from 'node:fs';

import {
  applyRewrites,
  buildIndex,
  extractRefs,
  isExternalOrFragment,
  lineAt,
  renderRef,
  resolveRefToFile,
  splitSuffix,
} from './lib/doc-links.mjs';

const dry = process.argv.slice(2).includes('--dry');
const index = buildIndex(process.cwd());

// basename (last slug segment) → [{abs, segs}] for every routable doc.
const byBasename = new Map();
for (const file of index.files) {
  if (file.url === null) continue;
  const segs = file.slug.split('/');
  const base = segs[segs.length - 1];
  if (!byBasename.has(base)) byBasename.set(base, []);
  byBasename.get(base).push({ abs: file.abs, segs });
}

/** Count matching trailing path segments between a link path and a candidate slug. */
function trailingOverlap(linkSegs, candSegs) {
  let i = linkSegs.length - 1;
  let j = candSegs.length - 1;
  let n = 0;
  while (i >= 0 && j >= 0 && linkSegs[i] === candSegs[j]) {
    n++;
    i--;
    j--;
  }
  return n;
}

/**
 * Choose the target doc for a broken link's path. A unique basename wins outright; otherwise the
 * candidate with the strictly-longest trailing-segment overlap wins. Returns null if still tied.
 */
function chooseTarget(pathPart, candidates) {
  if (candidates.length === 1) return candidates[0].abs;
  const linkSegs = pathPart
    .replace(/\.mdx?$/i, '')
    .replace(/^\/|\/$/g, '')
    .split('/');
  const scored = candidates
    .map((c) => ({ abs: c.abs, score: trailingOverlap(linkSegs, c.segs) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0].score >= 2 && scored[0].score > scored[1].score) return scored[0].abs;
  return null;
}

let fixed = 0;
const unresolved = [];

for (const file of index.files) {
  const rewrites = [];
  for (const ref of extractRefs(file.content)) {
    if (ref.range === null) continue;
    const { pathPart, suffix } = splitSuffix(ref.rawUrl);
    if (isExternalOrFragment(pathPart)) continue;
    if (resolveRefToFile(ref.rawUrl, file.abs, index) !== null) continue; // already resolves

    const base = pathPart
      .replace(/\.mdx?$/i, '')
      .replace(/\/$/, '')
      .split('/')
      .pop();
    const candidates = byBasename.get(base) ?? [];
    const target = candidates.length ? chooseTarget(pathPart, candidates) : null;
    if (!target) {
      unresolved.push({
        rel: file.rel,
        line: lineAt(file.content, ref.range[0]),
        url: ref.rawUrl,
        reason: candidates.length === 0 ? 'no-match' : 'ambiguous',
      });
      continue;
    }

    // Emit a clean URL: absolute link → urlAbs, relative link → urlRel. Drops any `.mdx` extension.
    const style = pathPart.startsWith('/') ? 'urlAbs' : 'urlRel';
    const newPath = renderRef(style, target, file.abs, pathPart, index);
    if (!newPath) {
      unresolved.push({
        rel: file.rel,
        line: lineAt(file.content, ref.range[0]),
        url: ref.rawUrl,
        reason: 'unrenderable',
      });
      continue;
    }
    rewrites.push({ range: ref.range, newText: newPath + suffix });
    fixed++;
  }
  if (rewrites.length && !dry) writeFileSync(file.abs, applyRewrites(file.content, rewrites));
}

const noMatch = unresolved.filter((u) => u.reason === 'no-match');
const ambiguous = unresolved.filter((u) => u.reason === 'ambiguous');
console.log(`fix-links: ${dry ? '[dry] would fix' : 'fixed'} ${fixed} link(s).`);
console.log(`  left ${noMatch.length} (basename matches no ported doc — likely unported section)`);
console.log(`  left ${ambiguous.length} (ambiguous — basename matches multiple docs)`);
if (ambiguous.length) {
  console.log('\nAmbiguous (need manual choice):');
  for (const u of ambiguous) console.log(`  ${u.rel}:${u.line}  ->  ${u.url}`);
}
