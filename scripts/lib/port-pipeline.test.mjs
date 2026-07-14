import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformFrontmatter, transformAdmonitions, transformDetails,
  transformHeadingAnchors, transformLinks, transformTabs, transformVars,
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
test('tabs: @theme Tabs/TabItem -> Fumadocs Tabs/Tab with items', () => {
  const src = `import Tabs from '@theme/Tabs';\nimport TabItem from '@theme/TabItem';\n\n<Tabs>\n<TabItem value='npm'>\na\n</TabItem>\n<TabItem value="Yarn">\nb\n</TabItem>\n</Tabs>`;
  const out = transformTabs(src);
  assert.doesNotMatch(out, /@theme/);
  assert.doesNotMatch(out, /TabItem/);
  assert.match(out, /<Tabs items=\{\["npm","Yarn"\]\}>/);
  assert.match(out, /<Tab value="npm">/);
});
test('tabs: nested Tabs each get their own items; every TabItem closed', () => {
  const src = `<Tabs>\n<TabItem value="outer">\n<Tabs>\n<TabItem value="inner1">a</TabItem>\n<TabItem value="inner2">b</TabItem>\n</Tabs>\n</TabItem>\n<TabItem value="outer2">c</TabItem>\n</Tabs>`;
  const out = transformTabs(src);
  assert.doesNotMatch(out, /TabItem/);
  assert.match(out, /<Tabs items=\{\["outer","outer2"\]\}>/);
  assert.match(out, /<Tabs items=\{\["inner1","inner2"\]\}>/);
  // balanced: same count of <Tab ...> opens and </Tab> closes
  const opens = (out.match(/<Tab\s/g) || []).length;
  const closes = (out.match(/<\/Tab>/g) || []).length;
  assert.equal(opens, closes);
});
test('tabs: drops unclickable-element label pseudo-tabs', () => {
  const src = `<Tabs>\n<TabItem className="unclickable-element" value="label"></TabItem>\n<TabItem value="a">x</TabItem>\n</Tabs>`;
  const out = transformTabs(src);
  assert.match(out, /items=\{\["a"\]\}/);
  assert.doesNotMatch(out, /label/);
});
test('vars: var inside a link href resolves to literal value', () => {
  // nitroDocsRepo is present in content/vars.json
  assert.match(transformVars('see [repo](@@nitroDocsRepo@@)'), /\]\(https:\/\/github\.com\/OffchainLabs\/nitro\)/);
});
