/**
 * tree-compare — normalize the legacy Docusaurus tree onto this repo's layout.
 *
 * A raw path diff between the two trees is meaningless: the legacy tree carries Docusaurus numeric
 * ordering prefixes, and several sections were renamed during the migration. These helpers apply
 * those corrections so paths can be compared.
 */

/** Tree A section prefix -> Tree B section prefix. Longest match wins. */
export const SECTION_MAP = {
  'launch-arbitrum-chain/chain-config': 'launch-arbitrum-chain/configuration',
  'for-devs/third-party-docs': 'third-party-docs',
  'for-devs/oracles': 'oracles',
  'run-arbitrum-node': 'run-a-node',
  'stylus-by-example': 'stylus',
};

/**
 * Whole-file renames, Tree A relative path -> Tree B relative path.
 *
 * Pairing is otherwise done on the normalized slug, which cannot match a page whose filename changed
 * during the migration. Without these entries the renamed pages below are reported ABSENT (looks like
 * a missing page) instead of GUTTED (a present page that lost content) — the wrong verdict for the
 * wrong reason. Add an entry here whenever a port renames a file.
 */
export const RENAME_MAP = {
  'for-devs/contribute.mdx': 'contribute.mdx',
  'for-devs/oracles/oracles-content-map.mdx': 'oracles/index.mdx',
  'get-started/overview.mdx': 'get-started/index.mdx',
  'launch-arbitrum-chain/chain-config/batch-poster/config-batch-poster.mdx':
    'launch-arbitrum-chain/configuration/sequencer/batch-posting-assertion-control.mdx',
  'launch-arbitrum-chain/chain-config/batch-poster/enable-4844-blobs.mdx':
    'launch-arbitrum-chain/configuration/data-availability/enable-post-4844-blobs.mdx',
  'launch-arbitrum-chain/chain-config/batch-poster/fee-tuning.mdx':
    'launch-arbitrum-chain/configuration/sequencer/batch-poster-fee-tuning.mdx',
  'launch-arbitrum-chain/chain-config/costs/aep-overview.mdx':
    'launch-arbitrum-chain/configuration/costs/aep-fee-router-introduction.mdx',
  'launch-arbitrum-chain/chain-config/costs/aep-router-contracts.mdx':
    'launch-arbitrum-chain/configuration/costs/set-up-aep-fee-router.mdx',
  'launch-arbitrum-chain/chain-config/costs/configure-native-mint-burn.mdx':
    'launch-arbitrum-chain/configuration/costs/configure-native-mint-burn-gas-token.mdx',
  'launch-arbitrum-chain/chain-config/costs/custom-gas-token-anytrust.mdx':
    'launch-arbitrum-chain/configuration/costs/use-a-custom-gas-token-anytrust.mdx',
  'launch-arbitrum-chain/chain-config/costs/custom-gas-token-rollup.mdx':
    'launch-arbitrum-chain/configuration/costs/use-a-custom-gas-token-rollup.mdx',
  'launch-arbitrum-chain/chain-config/costs/dynamic-pricing.mdx':
    'launch-arbitrum-chain/configuration/costs/dynamic-pricing-for-arbitrum-chains.mdx',
  'launch-arbitrum-chain/chain-config/data-availability/dac-get-started.mdx':
    'launch-arbitrum-chain/configuration/data-availability/data-availability-committees/get-started.mdx',
  'launch-arbitrum-chain/chain-config/execution/smart-contract-size-limit.mdx':
    'launch-arbitrum-chain/configuration/core/config-smart-contract-size-limit.mdx',
  'launch-arbitrum-chain/chain-config/sequencer/chain-finality.mdx':
    'launch-arbitrum-chain/configuration/validation/arbitrum-chain-finality.mdx',
  'launch-arbitrum-chain/chain-config/sequencer/sequencer-timing-adjustments.mdx':
    'launch-arbitrum-chain/configuration/sequencer/config-sequencer-timing-adjustments.mdx',
  'launch-arbitrum-chain/chain-config/sequencer/timeboost.mdx':
    'launch-arbitrum-chain/configuration/sequencer/timeboost-for-arbitrum-chains.mdx',
  // Upstream split batch-poster and assertion config across two pages; the port merged them.
  'launch-arbitrum-chain/chain-config/validation/assertion-control.mdx':
    'launch-arbitrum-chain/configuration/sequencer/batch-posting-assertion-control.mdx',
  'launch-arbitrum-chain/chain-config/validation/bold.mdx':
    'launch-arbitrum-chain/configuration/sequencer/bold-adoption-for-arbitrum-chains.mdx',
  'launch-arbitrum-chain/chain-config/validation/bond-and-validator.mdx':
    'launch-arbitrum-chain/configuration/validation/stake-and-validator-configurations.mdx',
  'launch-arbitrum-chain/chain-config/validation/challenge-period.mdx':
    'launch-arbitrum-chain/configuration/validation/customizable-challenge-period.mdx',
  'launch-arbitrum-chain/deploy/configure-node.mdx':
    'launch-arbitrum-chain/arbitrum-chain-sdk-preparing-node-config.mdx',
  'launch-arbitrum-chain/deploy/deploy-chain.mdx':
    'launch-arbitrum-chain/deploy/deploying-an-arbitrum-chain.mdx',
  'launch-arbitrum-chain/deploy/token-bridge.mdx':
    'launch-arbitrum-chain/deploy/deploying-token-bridge.mdx',
  'launch-arbitrum-chain/integrations/bridged-usdc.mdx':
    'launch-arbitrum-chain/integrations/bridged-usdc-standard.mdx',
  'launch-arbitrum-chain/integrations/infrastructure-providers.mdx':
    'launch-arbitrum-chain/third-party-integrations/third-party-providers.mdx',
  'launch-arbitrum-chain/migrate/between-raases.mdx':
    'launch-arbitrum-chain/migrate/migrate-between-raases.mdx',
  'launch-arbitrum-chain/migrate/from-another-stack.mdx':
    'launch-arbitrum-chain/migrate/migrate-from-another-stack.mdx',
  'launch-arbitrum-chain/operate/monitoring.mdx':
    'launch-arbitrum-chain/operate/monitoring-tools-and-considerations.mdx',
  'launch-arbitrum-chain/operate/ownership-and-access.mdx':
    'launch-arbitrum-chain/operate/ownership-access-control.mdx',
  'launch-arbitrum-chain/operate/post-launch-deployments.mdx':
    'launch-arbitrum-chain/operate/post-launch-contract-deployments.mdx',
  'launch-arbitrum-chain/overview/faq.mdx':
    'launch-arbitrum-chain/troubleshooting-building-arbitrum-chain.mdx',
  'launch-arbitrum-chain/overview/introduction.mdx':
    'launch-arbitrum-chain/overview/a-gentle-introduction.mdx',
  'launch-arbitrum-chain/overview/license.mdx': 'launch-arbitrum-chain/overview/aep-license.mdx',
  'launch-arbitrum-chain/overview/public-preview.mdx':
    'launch-arbitrum-chain/overview/public-preview-expectations.mdx',
  'launch-arbitrum-chain/quickstart/l3-rollup-from-scratch.mdx':
    'launch-arbitrum-chain/quickstart/deploy-your-first-rollup.mdx',
  'launch-arbitrum-chain/quickstart/l3-rollup-testnet.mdx':
    'launch-arbitrum-chain/quickstart/run-testnet-infrastructure-first-rollup.mdx',
  'launch-arbitrum-chain/quickstart/sdk-introduction.mdx':
    'launch-arbitrum-chain/overview/arbitrum-chain-sdk-introduction.mdx',
  'launch-arbitrum-chain/run-a-node/high-availability-sequencer.mdx':
    'run-a-node/high-availability-sequencer-docs.mdx',
  'launch-arbitrum-chain/run-a-node/split-validator-node.mdx':
    'run-a-node/run-split-validator-node.mdx',
  'learn-more/faq.mdx': 'get-started/faq.mdx',
  'node-running/faq.mdx': 'run-a-node/faq.mdx',
};

/** Reduce a path to a comparable slug: basename, no extension, no ordering prefix, alphanumeric only. */
export function normalizeSlug(filePath) {
  const base = filePath.split('/').pop() ?? '';
  return base
    .replace(/\.mdx?$/, '')
    .replace(/^_/, '')
    .replace(/^\d+-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Rewrite a Tree A relative path onto Tree B's layout. Explicit renames win over section prefixes. */
export function mapSectionPath(relPath) {
  if (Object.hasOwn(RENAME_MAP, relPath)) return RENAME_MAP[relPath];

  const keys = Object.keys(SECTION_MAP).sort((a, b) => b.length - a.length);
  for (const from of keys) {
    if (relPath === from || relPath.startsWith(`${from}/`)) {
      return `${SECTION_MAP[from]}${relPath.slice(from.length)}`;
    }
  }
  return relPath;
}

/**
 * Build a Tree B lookup index from its relative file paths (posix-separated).
 *
 * Keys on directory + normalized slug so pages that share a bare slug (`index`, `overview`, …) in
 * different directories can't clobber each other. A bare-slug index is also kept as a fallback for
 * genuine cross-directory moves that a directory-qualified key can't find — but only for slugs that
 * are unique across Tree B, so an ambiguous bare slug is never guessed at.
 */
export function buildTreeIndex(relPaths) {
  const byDirSlug = new Map();
  const bareSlugCounts = new Map();
  const bareSlug = new Map();

  for (const rel of relPaths) {
    const dir = rel.split('/').slice(0, -1).join('/');
    const slug = normalizeSlug(rel);
    byDirSlug.set(`${dir}\0${slug}`, rel);

    const count = (bareSlugCounts.get(slug) ?? 0) + 1;
    bareSlugCounts.set(slug, count);
    if (count === 1) bareSlug.set(slug, rel);
    else bareSlug.delete(slug);
  }

  return { byDirSlug, bareSlug };
}

/**
 * Resolve a Tree A relative path to its Tree B counterpart, or `null` if none is found.
 *
 * Maps the Tree A path onto Tree B's layout first (section renames + whole-file renames), then
 * matches on directory + slug. Falls back to an unambiguous bare-slug match so a page that moved to
 * an unmapped directory can still pair, without letting a bare-slug collision mispair anything.
 */
export function resolveTreeBMatch(index, relA) {
  const mapped = mapSectionPath(relA);
  const dir = mapped.split('/').slice(0, -1).join('/');
  const slug = normalizeSlug(mapped);
  return index.byDirSlug.get(`${dir}\0${slug}`) ?? index.bareSlug.get(slug) ?? null;
}

/** Count body lines, excluding a leading YAML frontmatter block. */
export function bodyLineCount(source) {
  const lines = source.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines[0]?.trim() !== '---') return lines.length;
  const end = lines.indexOf('---', 1);
  if (end === -1) return lines.length;
  return lines.length - end - 1;
}
