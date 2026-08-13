import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bodyLineCount, mapSectionPath, normalizeSlug } from './lib/tree-compare.mjs';

test('normalizeSlug strips numeric prefixes, extension and case', () => {
  assert.equal(normalizeSlug('run-arbitrum-node/01-overview.mdx'), 'overview');
  assert.equal(normalizeSlug('a/b/Some-Page.md'), 'somepage');
  assert.equal(normalizeSlug('partials/_my-partial.mdx'), 'mypartial');
});

test('mapSectionPath applies the Tree A -> Tree B section renames', () => {
  assert.equal(mapSectionPath('run-arbitrum-node/overview.mdx'), 'run-a-node/overview.mdx');
  assert.equal(
    mapSectionPath('launch-arbitrum-chain/chain-config/costs/x.mdx'),
    'launch-arbitrum-chain/configuration/costs/x.mdx',
  );
  assert.equal(mapSectionPath('for-devs/oracles/api3/api3.mdx'), 'oracles/api3/api3.mdx');
  assert.equal(mapSectionPath('stylus-by-example/x.mdx'), 'stylus/x.mdx');
});

test('mapSectionPath leaves unmapped sections untouched', () => {
  assert.equal(mapSectionPath('how-arbitrum-works/x.mdx'), 'how-arbitrum-works/x.mdx');
});

test('mapSectionPath applies whole-file renames, and they beat section prefixes', () => {
  assert.equal(
    mapSectionPath('launch-arbitrum-chain/operate/monitoring.mdx'),
    'launch-arbitrum-chain/operate/monitoring-tools-and-considerations.mdx',
  );
  // This one also matches the chain-config -> configuration section prefix; the rename must win.
  assert.equal(
    mapSectionPath('launch-arbitrum-chain/chain-config/sequencer/sequencer-timing-adjustments.mdx'),
    'launch-arbitrum-chain/configuration/sequencer/config-sequencer-timing-adjustments.mdx',
  );
});

test('bodyLineCount excludes frontmatter', () => {
  const src = ['---', 'title: X', '---', '', 'line one', 'line two'].join('\n');
  assert.equal(bodyLineCount(src), 3);
});

test('bodyLineCount handles a file with no frontmatter', () => {
  assert.equal(bodyLineCount('just\ntwo lines'), 2);
});

test('bodyLineCount ignores the trailing empty element from a final newline', () => {
  assert.equal(bodyLineCount('just\ntwo lines\n'), 2);
  assert.equal(bodyLineCount(['---', 'title: X', '---', 'body one', 'body two', ''].join('\n')), 2);
});
