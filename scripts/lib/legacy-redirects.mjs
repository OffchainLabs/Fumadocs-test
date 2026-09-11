/**
 * Resolves legacy docs.arbitrum.io URLs to pages on this site. Drives `pnpm redirects:legacy`.
 *
 * Legacy URLs were served at the site root (`/stylus/using-cli`); this site serves docs under
 * `/docs`. So sources stay root-level (that is what real inbound links look like) and
 * destinations are rewritten to `/docs/...`.
 *
 * Two kinds of source feed in, and both flow through the same resolution order:
 *
 *  - **Upstream's own redirect sources**, read from the sibling repo's `vercel.json`. These are
 *    URLs upstream had already moved before the migration.
 *  - **Upstream's canonical page URLs**, derived from its `docs/` tree by
 *    `scripts/lib/upstream-pages.mjs`. These were never redirect sources anywhere, so nothing
 *    mapped them, and every one of them would have 404'd at cutover purely because of the `/docs`
 *    prefix. They are the larger half of the corpus.
 *
 * Only redirects whose destination provably exists in `content/docs` are emitted. Everything else
 * lands in the `.todo.json` worklist rather than being guessed at, because a redirect to a
 * merely-plausible page is worse than a 404: it silently sends readers somewhere wrong, and
 * `redirects:check` cannot catch it, because the destination exists.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { deriveCanonicalUrls, reservedRouteReason } from './upstream-pages.mjs';

/**
 * Legacy arbitrum-docs section -> this site's section.
 *
 * Only renames where the whole section moved wholesale and the target section
 * exists. Deep restructures (launch-arbitrum-chain, build-decentralized-apps)
 * are deliberately absent: their pages moved individually, so a section-level
 * rename would produce confidently-wrong destinations.
 */
export const SECTION_RENAMES = [
  ['/run-arbitrum-node', '/run-a-node'],
  ['/node-running', '/run-a-node'],
  ['/for-devs', '/build-decentralized-apps'],
  ['/intro', '/get-started'],
  ['/learn-more', '/get-started'],
  ['/faqs', '/get-started'],
];

/**
 * Legacy destination -> this site's page, where no mechanical rule can pick the right one.
 *
 * Two situations land here. The basename fallback matches on basename, so when a how-to was
 * renamed on the way over it can only see a same-named concept page and sends the reader there
 * instead. And upstream has since restructured `launch-arbitrum-chain` into a `chain-config/…`
 * shape this site never adopted, so its redirect chains terminate at paths that exist upstream
 * and nowhere here — no prefix rule describes that, because the sections were re-cut, not renamed.
 *
 * Every entry was confirmed by comparing the upstream page's frontmatter title against this
 * site's candidates; where the titles are verbatim-identical that is noted as `=`. A value may
 * carry an `#anchor`; the page part must resolve or the build throws.
 */
export const MANUAL_DESTINATIONS = new Map([
  ['/get-started/overview', '/docs/get-started'],
  [
    '/launch-arbitrum-chain/extend-the-protocol/stf',
    '/docs/launch-arbitrum-chain/configuration/core/customize-stf',
  ],
  [
    '/launch-arbitrum-chain/extend-the-protocol/precompiles',
    '/docs/launch-arbitrum-chain/features/advanced/choose-chain-precompiles',
  ],
  ['/launch-arbitrum-chain/run-a-node/batch-poster', '/docs/run-a-node/run-batch-poster'],

  // --- upstream `launch-arbitrum-chain/chain-config/*` -> this site's `configuration/*` ---
  // Upstream re-cut these sections; the leaf pages kept their content but not their path.
  [
    '/launch-arbitrum-chain/chain-config/batch-poster/enable-4844-blobs',
    '/docs/launch-arbitrum-chain/configuration/data-availability/enable-post-4844-blobs',
  ],
  [
    '/launch-arbitrum-chain/chain-config/batch-poster/fee-tuning',
    '/docs/launch-arbitrum-chain/configuration/sequencer/batch-poster-fee-tuning',
  ],
  [
    '/launch-arbitrum-chain/chain-config/costs/aep-overview',
    '/docs/launch-arbitrum-chain/configuration/costs/aep-fee-router-introduction',
  ],
  [
    '/launch-arbitrum-chain/chain-config/costs/aep-router-contracts',
    '/docs/launch-arbitrum-chain/configuration/costs/set-up-aep-fee-router',
  ],
  [
    '/launch-arbitrum-chain/chain-config/costs/configure-native-mint-burn',
    '/docs/launch-arbitrum-chain/configuration/costs/configure-native-mint-burn-gas-token',
  ],
  [
    '/launch-arbitrum-chain/chain-config/costs/custom-gas-token-anytrust',
    '/docs/launch-arbitrum-chain/configuration/costs/use-a-custom-gas-token-anytrust',
  ],
  [
    '/launch-arbitrum-chain/chain-config/costs/custom-gas-token-rollup',
    '/docs/launch-arbitrum-chain/configuration/costs/use-a-custom-gas-token-rollup',
  ],
  [
    '/launch-arbitrum-chain/chain-config/costs/dynamic-pricing',
    '/docs/launch-arbitrum-chain/configuration/costs/dynamic-pricing-for-arbitrum-chains',
  ],
  // Without this the basename sends chain gas-optimization to stylus/best-practices/gas-optimization.
  [
    '/launch-arbitrum-chain/chain-config/costs/gas-optimization',
    '/docs/launch-arbitrum-chain/configuration/costs/gas-optimization-tools',
  ],
  [
    '/launch-arbitrum-chain/chain-config/data-availability/dac-get-started',
    '/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/get-started',
  ],
  [
    '/launch-arbitrum-chain/chain-config/execution/smart-contract-size-limit',
    '/docs/launch-arbitrum-chain/configuration/core/config-smart-contract-size-limit',
  ],
  [
    '/launch-arbitrum-chain/chain-config/sequencer/chain-finality',
    '/docs/launch-arbitrum-chain/configuration/validation/arbitrum-chain-finality',
  ],
  [
    '//launch-arbitrum-chain/chain-config/sequencer/timeboost',
    '/docs/launch-arbitrum-chain/configuration/sequencer/timeboost-for-arbitrum-chains',
  ],
  [
    '/launch-arbitrum-chain/chain-config/validation/assertion-control',
    '/docs/launch-arbitrum-chain/configuration/sequencer/batch-posting-assertion-control',
  ],
  [
    '/launch-arbitrum-chain/chain-config/validation/bond-and-validator',
    '/docs/launch-arbitrum-chain/configuration/validation/stake-and-validator-configurations',
  ],
  [
    '/launch-arbitrum-chain/chain-config/validation/challenge-period',
    '/docs/launch-arbitrum-chain/configuration/validation/customizable-challenge-period',
  ],
  // `arbos` = "How to customize ArbOS on your Arbitrum chain", a how-to. Without this the basename
  // sends it to how-arbitrum-works/deep-dives/arbos, which is the ArbOS concept page.
  [
    '/launch-arbitrum-chain/extend-the-protocol/arbos',
    '/docs/launch-arbitrum-chain/configuration/core/customize-arbos',
  ],
  [
    '/launch-arbitrum-chain/extend-the-protocol/da-api-guide',
    '/docs/launch-arbitrum-chain/integrations/da-api-integration-guide',
  ],

  // --- upstream `configure-your-chain/*` (an earlier shape) still referenced by old entries ---
  [
    '/launch-arbitrum-chain/configure-your-chain/common/data-availability/data-availability-committees/deploy-a-das',
    '/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/deploy-das',
  ],
  [
    '/launch-arbitrum-chain/configure-your-chain/common/data-availability/data-availability-committees/deploy-a-mirror-das',
    '/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/deploy-mirror-das',
  ],

  // --- deploy / quickstart / operate. Titles are verbatim-identical across both sites. ---
  [
    '/launch-arbitrum-chain/deploy-an-arbitrum-chain/customize-deployment-configuration',
    '/docs/launch-arbitrum-chain/deploy/deploying-an-arbitrum-chain',
  ],
  // Upstream typo, kept verbatim so the lookup matches: "arbiturm".
  [
    '/launch-arbitrum-chain/deploy-an-arbitrum-chain/deploying-an-arbiturm-chain',
    '/docs/launch-arbitrum-chain/deploy/deploying-an-arbitrum-chain',
  ],
  // = "How to configure your Arbitrum chain's node using the Chain SDK"
  [
    '/launch-arbitrum-chain/deploy/configure-node',
    '/docs/launch-arbitrum-chain/arbitrum-chain-sdk-preparing-node-config',
  ],
  // = "How to deploy an Arbitrum chain using the Chain SDK"
  [
    '/launch-arbitrum-chain/deploy/deploy-chain',
    '/docs/launch-arbitrum-chain/deploy/deploying-an-arbitrum-chain',
  ],
  [
    '/launch-arbitrum-chain/deploy/token-bridge',
    '/docs/launch-arbitrum-chain/deploy/deploying-token-bridge',
  ],
  // = "Run an L3 rollup from scratch"
  [
    '/launch-arbitrum-chain/quickstart/l3-rollup-from-scratch',
    '/docs/launch-arbitrum-chain/quickstart/deploy-your-first-rollup',
  ],
  // = "Run testnet infrastructure on your first rollup (product-level testnet)"
  [
    '/launch-arbitrum-chain/quickstart/l3-rollup-testnet',
    '/docs/launch-arbitrum-chain/quickstart/run-testnet-infrastructure-first-rollup',
  ],
  [
    '/launch-arbitrum-chain/quickstart/sdk-introduction',
    '/docs/launch-arbitrum-chain/overview/arbitrum-chain-sdk-introduction',
  ],
  [
    '/launch-arbitrum-chain/operate/monitoring',
    '/docs/launch-arbitrum-chain/operate/monitoring-tools-and-considerations',
  ],
  // = "Ownership structure and access control"
  [
    '/launch-arbitrum-chain/operate/ownership-and-access',
    '/docs/launch-arbitrum-chain/operate/ownership-access-control',
  ],
  [
    '/launch-arbitrum-chain/operate/post-launch-deployments',
    '/docs/launch-arbitrum-chain/operate/post-launch-contract-deployments',
  ],
  [
    '/launch-arbitrum-chain/migrate/between-raases',
    '/docs/launch-arbitrum-chain/migrate/migrate-between-raases',
  ],
  [
    '/launch-arbitrum-chain/migrate/from-another-stack',
    '/docs/launch-arbitrum-chain/migrate/migrate-from-another-stack',
  ],
  [
    '/launch-arbitrum-chain/integrations/bridged-usdc',
    '/docs/launch-arbitrum-chain/integrations/bridged-usdc-standard',
  ],
  [
    '/launch-arbitrum-chain/integrations/infrastructure-providers',
    '/docs/launch-arbitrum-chain/third-party-integrations/third-party-providers',
  ],
  // = "Overview of Arbitrum chains". overview/index.mdx is a different page, titled "Concepts".
  [
    '/launch-arbitrum-chain/overview/introduction',
    '/docs/launch-arbitrum-chain/overview/a-gentle-introduction',
  ],
  ['/launch-arbitrum-chain/overview/license', '/docs/launch-arbitrum-chain/overview/aep-license'],
  [
    '/launch-arbitrum-chain/overview/public-preview',
    '/docs/launch-arbitrum-chain/overview/public-preview-expectations',
  ],
  [
    '/launch-arbitrum-chain/overview/faq',
    '/docs/launch-arbitrum-chain/troubleshooting-building-arbitrum-chain',
  ],
  // The node how-tos live under run-a-node here, not under launch-arbitrum-chain.
  [
    '/launch-arbitrum-chain/run-a-node/high-availability-sequencer',
    '/docs/run-a-node/high-availability-sequencer-docs',
  ],
  [
    '/launch-arbitrum-chain/run-a-node/split-validator-node',
    '/docs/run-a-node/run-split-validator-node',
  ],
  [
    '/run-arbitrum-node/data-availability-committees/get-started',
    '/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/get-started',
  ],
  // Upstream records this as a path but wrote an absolute URL with a stray leading slash. The page
  // it names exists here, so serve ours rather than sending readers off-site.
  [
    '/https://docs.arbitrum.foundation/calculate-aep-fees',
    '/docs/launch-arbitrum-chain/configuration/costs/calculate-aep-fees',
  ],

  // --- outside launch-arbitrum-chain ---
  [
    '/build-decentralized-apps/token-bridging/overview',
    '/docs/arbitrum-essentials/bridging/overview',
  ],
  [
    '/build-decentralized-apps/precompiles/reference#arbsys',
    '/docs/arbitrum-essentials/precompiles/reference#arbsys',
  ],
  [
    '/how-arbitrum-works/deep-dives/arbos#stylus-specific-differences',
    '/docs/how-arbitrum-works/deep-dives/arbos#stylus-specific-differences',
  ],
  [
    '/how-arbitrum-works/deep-dives/gas-and-fees#parent-chain-gas-pricing',
    '/docs/how-arbitrum-works/deep-dives/gas-and-fees#parent-chain-gas-pricing',
  ],
  // The gentle intro was folded into the STF page here; see the GUTTED entry in `pnpm drift`.
  ['/how-arbitrum-works/deep-dives/stf-gentle-intro', '/docs/how-arbitrum-works/deep-dives/stf'],
  ['/for-devs/contribute', '/docs/contribute'],
  ['/stylus/cli-tools-overview', '/docs/stylus/cli-tools/overview'],
  // = "How to verify Stylus contracts". The Arbiscan how-to is a different page.
  ['/stylus/how-tos/verifying-contracts', '/docs/stylus/cli-tools/verify-contracts'],
  // Upstream has no /stylus/overview page either; the section landing is the honest target.
  ['/stylus/overview', '/docs/stylus'],
  // `/faqs/protocol-faqs` does not exist upstream — these three anchors 404 on the live site
  // today. Each question has a page here that actually answers it, so route to that page.
  [
    '/faqs/protocol-faqs#q-rollup-vs-anytrust',
    '/docs/how-arbitrum-works/deep-dives/anytrust-protocol',
  ],
  ['/faqs/protocol-faqs#q-seq-vs-val', '/docs/how-arbitrum-works/deep-dives/sequencer'],
  ['/faqs/protocol-faqs#q-dispute-reorg', '/docs/how-arbitrum-works/bold/gentle-introduction'],

  // --- canonical upstream URLs the basename rule cannot see ---
  // Upstream's `id` frontmatter renames the last URL segment away from the file name, so the URL
  // upstream serves shares no basename with the file this site ported. Nothing mechanical can
  // bridge that; the page is the same page in each pair.
  // = "Supra, price feed oracle"
  ['/for-devs/oracles/supra/supras-price-feed', '/docs/oracles/supra/use-supras-price-feed-oracle'],
  // = "Supra, VRF"
  ['/for-devs/oracles/supra/supras-vrf', '/docs/oracles/supra/use-supras-vrf'],
  // = "Oracles providers", a provider index. `/docs/oracles` is that index here; the basename
  // `oracles-content-map` exists nowhere in this tree because the nav moved into meta.json.
  ['/for-devs/oracles/oracles-content-map', '/docs/oracles'],
  // = "Contribute third-party docs". The basename alone is ambiguous with `/docs/contribute`,
  // which is the general "Contribute docs" page, so the fallback rightly declined.
  ['/for-devs/third-party-docs/contribute', '/docs/third-party-docs/contribute'],
]);

/**
 * Last resort: the nearest live section landing, for a canonical upstream URL whose page this site
 * has not ported.
 *
 * These are not equivalences and must never be treated as such. Each names a page that exists
 * upstream and nowhere here. Almost all were added upstream after the port window closed, so
 * `pnpm drift` reports them as work still to do. Sending the reader to the section they were
 * heading for is better than a 404 at cutover, and it is the same judgement already recorded for
 * `/stylus/overview` in `MANUAL_DESTINATIONS`.
 *
 * Consulted only after every mechanical rule has declined, and *after* the self-URL rule in
 * particular. So the day one of these pages is ported, the self-URL rule matches first and the
 * entry below goes inert on its own rather than pinning readers to a landing page forever.
 *
 * Each comment records the upstream frontmatter title and the date the page appeared upstream.
 */
export const SECTION_LANDINGS = new Map([
  // "BoLD FAQ", upstream 2026-08-26.
  ['/how-arbitrum-works/bold/bold-faq', '/docs/how-arbitrum-works/bold'],
  // "Batch Poster", upstream 2026-06-05. Batch-poster configuration lives under this landing here.
  [
    '/launch-arbitrum-chain/chain-config/batch-poster/config-batch-poster',
    '/docs/launch-arbitrum-chain/configuration/sequencer',
  ],
  // "Sequencer configuration reference", upstream 2026-08-17.
  [
    '/launch-arbitrum-chain/chain-config/sequencer/sequencer-config-reference',
    '/docs/launch-arbitrum-chain/configuration/sequencer',
  ],
  // "Tune parent chain data fee pricing", upstream 2026-08-20.
  [
    '/launch-arbitrum-chain/chain-config/costs/parent-chain-data-fee-pricing',
    '/docs/launch-arbitrum-chain/configuration/costs',
  ],
  // "Priority fees collection", upstream 2026-08-04.
  [
    '/launch-arbitrum-chain/chain-config/costs/priority-fees',
    '/docs/launch-arbitrum-chain/configuration/costs',
  ],
  // "Configure a test Arbitrum chain", upstream 2026-08-03.
  [
    '/launch-arbitrum-chain/chain-config/validation/test-chain-configuration',
    '/docs/launch-arbitrum-chain/configuration/validation',
  ],
  // "Token bridge troubleshooting", upstream 2026-07-29.
  [
    '/launch-arbitrum-chain/deploy/token-bridge-troubleshooting',
    '/docs/launch-arbitrum-chain/deploy',
  ],
  // "Common error messages", upstream 2026-08-03.
  ['/launch-arbitrum-chain/operate/error-index', '/docs/launch-arbitrum-chain/operate'],
  // "Sequencer troubleshooting", upstream 2026-08-17.
  [
    '/launch-arbitrum-chain/operate/sequencer-troubleshooting',
    '/docs/launch-arbitrum-chain/operate',
  ],
  // "ArbOS 61 Elara", upstream 2026-07-16. The releases index here is `overview`, not an `index`.
  ['/run-arbitrum-node/arbos-releases/arbos61', '/docs/run-a-node/arbos-releases/overview'],
  // "Sequencer", a Docusaurus <Card> grid. `pnpm drift` records it as a standing non-item: the
  // sequencer nav lives in meta.json here, so the section landing is all there is to point at.
  ['/node-running/sequencer-content-map', '/docs/run-a-node'],
]);

/**
 * Every routable doc URL on this site, derived from the content tree, keyed by lowercased URL.
 *
 * The legacy corpus has casing drift (`/sdk/assetbridger` next to `/sdk/assetBridger`), and this
 * tree has mixed-case directories (`oracles/DIA`, `third-party-docs/Circle`). Matching
 * case-sensitively would report a destination that exists as "not in tree". The map value is the
 * real casing, which is what must be emitted — a redirect to the wrong case still 404s.
 */
export function collectValidUrls(contentDir) {
  const urls = new Map();
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}/${entry}`);
      } else if (entry.endsWith('.mdx') && !entry.startsWith('_')) {
        const base = entry.slice(0, -'.mdx'.length);
        const url = base === 'index' ? `/docs${prefix}` : `/docs${prefix}/${base}`;
        const key = url.toLowerCase();
        const clash = urls.get(key);
        if (clash && clash !== url) {
          throw new Error(
            `generate-legacy-redirects: two pages differ only by case (${clash} vs ${url}); ` +
              `case-insensitive matching cannot pick between them.`,
          );
        }
        urls.set(key, url);
      }
    }
  };
  walk(contentDir, '');
  return urls;
}

/** Resolve a URL to its real casing on this site, or undefined when no page serves it. */
export const resolveUrl = (valid, url) => valid.get(url.toLowerCase());

/** `/(a/b/?)` and `/a/b/` both normalise to `/a/b`. */
export function normaliseSource(source) {
  const group = source.match(/^\/\((.*)\)$/);
  const bare = group ? `/${group[1]}` : source;
  return bare.replace(/\/\?$/, '').replace(/\/+$/, '') || '/';
}

export const isAbsolute = (value) => /^https?:\/\//.test(value);

/**
 * Destinations the legacy corpus records as paths but that are not paths: an absolute URL with a
 * stray leading slash (`/https://…`) or a doubled root (`//launch-…`). Slug-matching these would
 * find a real page and emit a confidently-wrong redirect, so they are rejected outright.
 */
export const isMalformed = (value) => value.startsWith('//') || /^\/https?:/.test(value);

/**
 * Page basename, reduced for comparison: lowercase, punctuation dropped. `Gas-Fees.mdx` and
 * `gas_fees.mdx` collapse to the same key.
 */
export const slugKey = (url) =>
  url
    .replace(/\/+$/, '')
    .split('/')
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** slug -> every routable URL ending in that slug. Built once from the same page inventory. */
export function indexBySlug(valid) {
  const bySlug = new Map();
  for (const url of valid.values()) {
    const key = slugKey(url);
    if (!bySlug.has(key)) bySlug.set(key, []);
    bySlug.get(key).push(url);
  }
  return bySlug;
}

/**
 * How many legacy pages carried each slug, read from the sibling repo's `docs/` tree.
 *
 * The slug fallback assumes a basename identifies a page. That holds only if the basename was
 * unique upstream too. It was not always: upstream had both
 * `launch-arbitrum-chain/chain-config/costs/gas-optimization` and
 * `stylus/best-practices/gas-optimization`, and only the Stylus one was ported — so matching on
 * basename alone sends a chain-config page to a Stylus page. Where the legacy path was doing the
 * disambiguating, the fallback cannot, and must decline.
 *
 * Returns null when the tree is unavailable, which makes the fallback decline everything rather
 * than match unverified.
 */
export function countUpstreamSlugs(docsDir) {
  const counts = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.mdx?$/.test(entry) && !entry.startsWith('_')) {
        const key = slugKey(entry.replace(/\.mdx?$/, ''));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  };
  try {
    walk(docsDir);
  } catch {
    return null;
  }
  return counts;
}

/**
 * Follow the legacy corpus's own redirect chain to its terminal destination.
 *
 * 219 of the upstream redirects point at a URL that is itself a redirect source, up to three hops
 * deep — upstream restructured after those entries were written and never collapsed them, relying
 * on the browser to follow. So a `destination` is often not where a reader ends up. Resolving the
 * chain first turns a guess into upstream's own answer, and is far stronger evidence than matching
 * a basename.
 */
export function followChain(destination, bySource) {
  const seen = new Set();
  let current = destination;
  while (bySource.has(current) && !seen.has(current)) {
    seen.add(current);
    current = bySource.get(current);
  }
  return current;
}

/** Candidate destinations, most-literal first. */
export function candidateDestinations(destination) {
  const base = destination.replace(/\/+$/, '');
  const out = [`/docs${base}`];
  for (const [from, to] of SECTION_RENAMES) {
    if (base === from || base.startsWith(`${from}/`)) {
      out.push(`/docs${to}${base.slice(from.length)}`);
    }
  }
  return out;
}

/**
 * Resolve one legacy URL to a page on this site, declining rather than guessing.
 *
 * `source` is the inbound URL; `target` is where the reader was trying to land. For an upstream
 * redirect that is the end of upstream's own chain, and for a canonical upstream URL the two are
 * the same, because the page was live there. The order below is the whole policy:
 *
 *  1. `MANUAL_DESTINATIONS`: hand-verified, so it beats everything.
 *  2. Self-URL: the legacy path names a live page here under `/docs`. Serving our own copy beats
 *     following upstream anywhere else, and is the rule that resolves nearly every canonical URL.
 *  3. Section renames: whole sections that moved wholesale.
 *  4. Basename fallback: only when exactly one page here carries that slug *and* the basename was
 *     unique upstream too.
 *  5. `SECTION_LANDINGS`: the section the reader was heading for, for a page this site has not
 *     ported. Last, so it never masks a page that does exist here.
 *
 * Returns `{ destination, via }` or `{ reason, ... }`, where `reason` is the todo entry's reason.
 */
export function resolveTarget(args) {
  const result = resolveMechanically(args);
  if (!result.reason) return result;

  const landing = SECTION_LANDINGS.get(args.target.replace(/\/+$/, ''));
  if (!landing) return result;
  const resolved = resolveUrl(args.valid, landing);
  if (!resolved) {
    throw new Error(
      `generate-legacy-redirects: SECTION_LANDINGS points at a missing page: ${landing}`,
    );
  }
  return { destination: resolved, via: 'landing' };
}

function resolveMechanically({ source, target, valid, bySlug, upstreamSlugs }) {
  const manual = MANUAL_DESTINATIONS.get(target.replace(/\/+$/, ''));
  if (manual) {
    const [manualPage, anchor] = manual.split('#');
    const resolved = resolveUrl(valid, manualPage);
    if (!resolved) {
      throw new Error(
        `generate-legacy-redirects: MANUAL_DESTINATIONS points at a missing page: ${manual}`,
      );
    }
    return { destination: anchor ? `${resolved}#${anchor}` : resolved, via: 'manual' };
  }

  const self = resolveUrl(valid, `/docs${source}`);
  if (self) return { destination: self, via: 'self' };

  if (isMalformed(target)) return { reason: 'malformed-destination', legacyDestination: target };

  const candidates = candidateDestinations(target);
  const index = candidates.findIndex((candidate) => resolveUrl(valid, candidate));
  if (index !== -1) {
    // Emit the tree's real casing, not the legacy corpus's.
    return {
      destination: resolveUrl(valid, candidates[index]),
      via: index > 0 ? 'rename' : 'direct',
    };
  }

  // No prefix rule resolved it. The page may still exist under a path SECTION_RENAMES does not
  // describe — the deep restructures moved pages individually, so no prefix rule can. Fall back to
  // the basename, and accept it only when exactly one page carries that slug: two candidates means
  // the generator would be picking, and a plausible-but-wrong redirect is worse than none.
  const key = slugKey(target);
  const hits = bySlug.get(key) ?? [];
  if (hits.length !== 1) {
    return {
      reason: hits.length === 0 ? 'destination-not-in-tree' : 'ambiguous-slug',
      legacyDestination: target,
      ...(hits.length > 1 ? { candidates: hits } : {}),
    };
  }
  // The basename only identifies a page if it was unique upstream too.
  if (!upstreamSlugs || (upstreamSlugs.get(key) ?? 0) > 1) {
    return {
      reason: upstreamSlugs ? 'ambiguous-upstream-slug' : 'slug-fallback-unverifiable',
      legacyDestination: target,
      ...(upstreamSlugs ? { wouldMatch: hits[0] } : {}),
    };
  }
  return { destination: hits[0], via: 'slug' };
}

/**
 * Gather every inbound URL worth mapping, most-authoritative first.
 *
 * Upstream's redirect entries come first because they carry a destination, upstream's own answer
 * to where the page went. A canonical URL that is also a redirect source (upstream redirecting a
 * page it still serves) is therefore deduplicated in favour of the redirect entry, and counted.
 */
export function collectSources({ legacy, canonicalUrls }) {
  const inputs = [];
  for (const entry of legacy.redirects ?? []) {
    if (entry.source.includes('__redirects-autogen')) continue;
    // The SDK reference was never ported and has no on-site home: arbitrum-docs deleted its
    // /sdk section and links readers to the GitHub repo from the sidebar. These legacy entries
    // are not a gap to close, so drop them instead of parking them in the worklist forever.
    if (entry.destination === '/sdk' || entry.destination.startsWith('/sdk/')) continue;
    inputs.push({
      kind: 'redirect',
      source: normaliseSource(entry.source),
      destination: entry.destination,
      // Upstream records all but one of its redirects as temporary; matching that keeps the two
      // halves of the emitted map consistent while the content tree is still moving.
      permanent: !!entry.permanent,
    });
  }
  for (const url of canonicalUrls) {
    inputs.push({
      kind: 'canonical',
      source: normaliseSource(url),
      destination: null,
      permanent: false,
    });
  }
  return inputs;
}

/**
 * Build the redirect map.
 *
 * `upstreamDocsDir` is optional only in tests; the CLI always passes it, and without it no
 * canonical URLs are seeded and the basename fallback declines everything.
 */
export function build({ sourcePath, contentDir, upstreamDocsDir, sidebarsPath }) {
  const legacy = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const valid = collectValidUrls(contentDir);
  const bySlug = indexBySlug(valid);
  const upstreamSlugs = upstreamDocsDir ? countUpstreamSlugs(upstreamDocsDir) : null;
  const canonicalUrls = upstreamDocsDir
    ? deriveCanonicalUrls({ docsDir: upstreamDocsDir, sidebarsPath })
    : [];

  const bySource = new Map();
  for (const entry of legacy.redirects ?? []) {
    const key = normaliseSource(entry.source);
    if (!bySource.has(key)) bySource.set(key, entry.destination);
  }

  const redirects = [];
  const todo = [];
  const renamed = [];
  const slugMatched = [];
  const landings = [];
  const shadowed = [];
  const seen = new Set();
  let duplicates = 0;
  let canonicalAlreadyMapped = 0;
  let canonicalEmitted = 0;

  for (const input of collectSources({ legacy, canonicalUrls })) {
    const { kind, source } = input;
    if (seen.has(source)) {
      if (kind === 'canonical') canonicalAlreadyMapped += 1;
      else duplicates += 1;
      continue;
    }
    seen.add(source);

    // A source that names a live route here must never be redirected: Next runs `redirects()`
    // before anything renders, so the redirect would win and the route would become unreachable.
    // Two ways to be live: a reserved root-level route or asset, or a real page under `/docs`.
    const reserved = reservedRouteReason(source) ?? (resolveUrl(valid, source) && 'live doc page');
    if (reserved) {
      shadowed.push({ source, kind, reason: reserved });
      continue;
    }

    if (kind === 'redirect' && isAbsolute(input.destination)) {
      redirects.push({ source, destination: input.destination, permanent: input.permanent });
      continue;
    }

    // For a canonical URL the reader was already where they meant to be, so the target is the
    // source itself. For a redirect, follow upstream's own chain to its terminal destination.
    const target = kind === 'canonical' ? source : followChain(input.destination, bySource);

    const result = resolveTarget({ source, target, valid, bySlug, upstreamSlugs });
    if (result.reason) {
      todo.push({
        source,
        kind,
        legacyDestination: result.legacyDestination,
        reason: result.reason,
        ...(result.candidates ? { candidates: result.candidates } : {}),
        ...(result.wouldMatch ? { wouldMatch: result.wouldMatch } : {}),
      });
      continue;
    }

    if (result.via === 'rename') renamed.push({ source, from: target, to: result.destination });
    if (result.via === 'slug') slugMatched.push({ source, from: target, to: result.destination });
    if (result.via === 'landing') landings.push({ source, to: result.destination });
    if (kind === 'canonical') canonicalEmitted += 1;

    redirects.push({ source, destination: result.destination, permanent: input.permanent });
  }

  redirects.sort((a, b) => a.source.localeCompare(b.source));
  todo.sort((a, b) => a.source.localeCompare(b.source));
  shadowed.sort((a, b) => a.source.localeCompare(b.source));
  return {
    redirects,
    todo,
    renamed,
    slugMatched,
    landings,
    shadowed,
    duplicates,
    canonicalCount: canonicalUrls.length,
    canonicalAlreadyMapped,
    canonicalEmitted,
    validCount: valid.size,
  };
}

/** The committed `redirects.legacy.mjs`, as text. */
export function render(redirects) {
  const body = redirects
    .map(
      (r) =>
        `  {\n    source: '${r.source}',\n    destination: '${r.destination}',\n` +
        `    permanent: ${r.permanent},\n  },`,
    )
    .join('\n');
  return (
    `// GENERATED by scripts/generate-legacy-redirects.mjs — do not edit by hand.\n` +
    `// Regenerate with \`pnpm redirects:legacy\`.\n` +
    `//\n` +
    `// Legacy docs.arbitrum.io URLs (root-level) -> this site's /docs paths. Seeded from both\n` +
    `// upstream's own redirect sources and every canonical upstream page URL.\n` +
    `// Unportable entries are listed in redirects.legacy.todo.json.\n` +
    `/** @type {{ source: string, destination: string, permanent: boolean }[]} */\n` +
    `export const legacyRedirects = [\n${body}\n];\n`
  );
}
