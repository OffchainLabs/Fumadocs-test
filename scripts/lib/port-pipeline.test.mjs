import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformFrontmatter, transformAdmonitions, transformDetails,
  transformHeadingAnchors, transformLinks,
} from './port-pipeline.mjs';

const stats = () => ({ warnings: [], manualReview: [], errors: [] });

test('frontmatter: coerces bad content_type to concept and defaults author/sme', () => {
  const out = transformFrontmatter('---\ntitle: X\ncontent_type: guide\n---\nbody', 'x.mdx', stats());
  assert.match(out, /content_type: 'concept'/);
  assert.match(out, /author: gblanchemain/);
  assert.match(out, /sme: gblanchemain/);
});
test('frontmatter: drops Docusaurus-only keys', () => {
  const out = transformFrontmatter('---\ntitle: X\ndescription: Y\nslug: /a\nsidebar_position: 3\n---\n', 'x.mdx', stats());
  assert.doesNotMatch(out, /slug:/);
  assert.doesNotMatch(out, /sidebar_position:/);
});
test('admonitions: :::warning -> VanillaAdmonition', () => {
  const out = transformAdmonitions(':::warning Careful\nbody\n:::');
  assert.match(out, /<VanillaAdmonition type="warning" title="Careful">/);
});
test('details -> Accordions', () => {
  const out = transformDetails('<details><summary>More</summary>\nx\n</details>');
  assert.match(out, /<Accordions>\n<Accordion title="More">/);
});
test('heading anchors stripped', () => {
  assert.equal(transformHeadingAnchors('## Hello {#hello}'), '## Hello');
});
test('links: strip numeric prefixes + .mdx, non-/docs absolute gets /docs prefix', () => {
  assert.match(transformLinks('[a](/docs/01-foo/02-bar.mdx#x)'), /\]\(\/docs\/foo\/bar#x\)/);
  assert.match(transformLinks('[a](/launch-arbitrum-chain/aep-license)'), /\]\(\/docs\/launch-arbitrum-chain\/aep-license\)/);
});
