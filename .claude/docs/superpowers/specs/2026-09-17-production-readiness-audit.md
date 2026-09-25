# Production readiness audit (FS-2677)

Date: 2026-09-17. Plan M-50, Wave 3.

## Summary verdict

**Not ready, but close.** Every one of the thirteen blocking gates passes, the build prerenders all 349
docs pages, `redirects:check` is green over 857 redirects, and 102 anchor fragments on the twenty
most-linked pages all resolve in the rendered HTML. Three things block a clean cutover: the home page
ships with no `<title>`, no meta description, no canonical and no social tags; eighteen docs pages hit a
React hydration failure from invalid HTML nesting; and Lighthouse performance is 80 to 84 on all three
sampled pages against the ticket's bar of 90.

## Environment

| Item              | Value                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch            | `fs-2677-readiness-audit`. Every measurement below was taken at base commit `606e174` (`fork/main`); this report is committed on top of it |
| Worktree          | `/Users/fionna/offchain/Fumadocs-wt/fs-2677-readiness-audit`                                                                               |
| Node              | v22.23.1, pnpm 10.29.3                                                                                                                     |
| Upstream checkout | `/Users/fionna/offchain/arbitrum-docs`, HEAD `d0182a487` (declared freeze commit was `6a2738f`)                                            |
| Server under test | local `pnpm build` then `npx next start -p 3136`                                                                                           |

**Local, not a Vercel preview.** No preview deployment was available, so every check below ran against a
local production build. `NEXT_PUBLIC_SITE_URL` was unset, so `getSiteUrl()` fell back to
`http://localhost:3000` and every absolute URL in the output (canonical, `og:image`, sitemap `<loc>`,
robots `Sitemap:`) carries that origin. The worktree is a full clone, so `hasFullGitHistory()` returned
true and last-modified dates rendered; a Vercel build at depth 10 will not. See "Checks that must be
repeated on a Vercel preview" for the full list.

## 1. Upstream drift and the post-freeze change list

`pnpm drift` exits 1 with **3 absent, 0 gutted**. All three are the post-freeze Priority Gas Auction
feature set, so the tree is at parity with the declared freeze commit `6a2738f` and behind `d0182a48`
only by that one feature.

```
upstream-drift: 3 absent, 0 gutted

  ABSENT  DRIFT  added 2026-09-03  how-arbitrum-works/priority-gas-auction/fast-feed.mdx
  ABSENT  DRIFT  added 2026-09-03  launch-arbitrum-chain/chain-config/sequencer/pga.mdx
  ABSENT  DRIFT  added 2026-09-01  how-arbitrum-works/priority-gas-auction/pga.md

upstream-drift: 5 allowlisted page(s) not reported.
```

The five allowlisted entries are the four pre-existing `guttedAllowlist` pairs plus
`node-running/sequencer-content-map.mdx`, none of them new.

The upstream working tree is dirty (untracked `stylus-by-example/` and `submodules/` directories). Drift
warns about this but the warning does not affect tracked-file comparison.

### What changed upstream between `6a2738f` and `d0182a48`

One merged feature branch stack (PRs #3559 "pga", #3563 "pga-setup-guidance", #3564 "fast-feed"), 582
insertions and no deletions across 16 files.

| Upstream path                                                                                          | Change                               | Present on this site?                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `docs/how-arbitrum-works/priority-gas-auction/pga.md`                                                  | new, 154 lines                       | No                                                                                                    |
| `docs/how-arbitrum-works/priority-gas-auction/fast-feed.mdx`                                           | new, 132 lines                       | No                                                                                                    |
| `docs/launch-arbitrum-chain/chain-config/sequencer/pga.mdx`                                            | new, 92 lines                        | No                                                                                                    |
| `docs/run-arbitrum-node/sequencer/02-read-sequencer-feed.mdx`                                          | +2 lines (Fast Feed cross-reference) | Page exists as `content/docs/run-a-node/sequencer/read-sequencer-feed.mdx`, without the new paragraph |
| `docs/partials/glossary/_eip-1559.mdx`                                                                 | new                                  | No                                                                                                    |
| `docs/partials/glossary/_eip-4844.mdx`                                                                 | new                                  | No                                                                                                    |
| `docs/partials/glossary/_fast-feed.mdx`                                                                | new                                  | No                                                                                                    |
| `docs/partials/glossary/_priority-fee.mdx`                                                             | new                                  | No                                                                                                    |
| `docs/partials/glossary/_propamm.mdx`                                                                  | new                                  | No                                                                                                    |
| `docs/partials/glossary/_searcher.mdx`                                                                 | new                                  | No                                                                                                    |
| `docs/partials/_glossary-partial.mdx`, `static/glossary.json`                                          | +26 / +24 lines, the six terms above | No                                                                                                    |
| `static/img/haw-pga-three-components.svg`, `haw-pga-tie-breaking.svg`, `haw-pga-two-stage-mempool.svg` | new                                  | No                                                                                                    |
| `static/img/pga-rounds-animation-brand.mp4`                                                            | new, 3.1 MB                          | No                                                                                                    |

Glossary count: **159 entries here, 165 upstream**, the difference being exactly those six terms.

Note that drift reports only absent and gutted pages, so the two-line edit to the sequencer feed page is
invisible to it. A page ported at parity that later gains a paragraph upstream does not re-flag.

Nothing was ported. This is a report only.

## 2. `PendingWidget`

```
grep -rn PendingWidget --include='*.mdx' --include='*.tsx' --include='*.ts' . | grep -v node_modules
```

No matches. FS-2662 removed it and nothing reintroduced it.

## 3. Gate audit

### `ci.yml` structure

`.github/workflows/ci.yml` defines three jobs. Confirmed by reading the file:

- **`gates` (blocking).** No `continue-on-error` on the job or on any of its thirteen steps: `types:check`,
  `test`, `vars:check`, `nav:check`, `partials:check`, `node scripts/versioned-docs-check.mjs`,
  `references:check`, `faq:check`, `images:presence`, `check-links`, `contracts:check`, `format:check`,
  `content:lint`. All thirteen listed in CLAUDE.md are present and none is exempted.
- **`network-checks` (non-blocking).** One step, `precompiles:check`, carrying `continue-on-error: true`.
  The in-file comment states the reason: it fetches around thirty Solidity sources from
  `raw.githubusercontent` per run, so a GitHub outage reddens it for reasons unrelated to the change under
  review. Reaching zero findings would not promote it; losing the network dependency would.
- **`build` (non-blocking).** `continue-on-error: true` on the job. Runs `pnpm build` and then, against
  `next start` on localhost, `pnpm redirects:check` and `STATIC_DOCS_TEST_URL=... node --test
scripts/static-docs-http.test.mjs`. The comment records that the original reason for non-blocking status
  (remote image fetches at build time) is gone since FS-2681, so promotion is now possible and is
  deliberately deferred to its own change because a full build is the slowest job here.

The `Content debt` tier described in older notes no longer exists; `format:check` and `content:lint` moved
into `gates` on 2026-09-15.

### All thirteen gates run locally on this branch

| Gate                   | Result | Note                                                                                                                                                                                                                                                                             |
| ---------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types:check`          | pass   |                                                                                                                                                                                                                                                                                  |
| `test`                 | pass   | 446 tests, 19 suites, 445 pass, 0 fail, 1 skipped                                                                                                                                                                                                                                |
| `vars:check`           | pass   | 58 variables resolve, 39 referenced in MDX; warns about 19 configured-but-unreferenced keys (expected, they are read by code) and one `<Var>` with no static name attribute at `content/docs/launch-arbitrum-chain/configuration/data-availability/das-docker-deployment.mdx:72` |
| `nav:check`            | pass   | no navigation defects                                                                                                                                                                                                                                                            |
| `partials:check`       | pass   | 208 warnings, all R3 ("uses `<X>` which is not globally registered or imported in-file")                                                                                                                                                                                         |
| `versioned-docs-check` | pass   | silent                                                                                                                                                                                                                                                                           |
| `references:check`     | pass   | 159 glossary entries                                                                                                                                                                                                                                                             |
| `faq:check`            | pass   |                                                                                                                                                                                                                                                                                  |
| `images:presence`      | pass   | no remote markdown images                                                                                                                                                                                                                                                        |
| `check-links`          | pass   | no broken internal links                                                                                                                                                                                                                                                         |
| `contracts:check`      | pass   |                                                                                                                                                                                                                                                                                  |
| `format:check`         | pass   |                                                                                                                                                                                                                                                                                  |
| `content:lint`         | pass   | but prints "3 A7 finding(s) exist but A7 is excluded from the default rule set pending cleanup"                                                                                                                                                                                  |

Non-blocking: `precompiles:check` passes ("precompile tables: up to date"), `pnpm build` exits 0.

**The A7 exclusion is load-bearing.** `content:lint` is green only because `DEFAULT_RULES` filters out A7.
Running `node scripts/content-lint.mjs --rule=A7` reports three broken local images on
`content/docs/stylus/cli-tools/verify-contracts.mdx` (lines 177, 189, 199). Confirmed in the browser: those
three `<img>` elements have `naturalWidth === 0` and the network log shows three 404s. Already tracked as
**FS-2709**.

## 4. Build

`pnpm build` from a removed `.next`, exit 0.

| Measure                            | Value                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Wall time                          | 43.1 s                                                                                                 |
| Compile                            | 22.9 s                                                                                                 |
| Static generation                  | 8.7 s for 1058 pages across 9 workers                                                                  |
| Prerendered routes in the manifest | 1057                                                                                                   |
| Under `/docs/`                     | 352                                                                                                    |
| Under `/llms.mdx/`                 | 349                                                                                                    |
| Under `/og/`                       | 349                                                                                                    |
| Other static routes                | 7 (`/`, `/_global-error`, `/_not-found`, `/llms-full.txt`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`) |

No warnings or errors in the log.

**The docs route is now `● (SSG)`, not `ƒ (Dynamic)`.** FS-2698 landed, so 349 live docs pages plus three
archived-version paths prerender. The "Known trade-off (not a bug)" section of CLAUDE.md, which states that
docs pages are never prerendered and that `export const dynamic = 'force-dynamic'` is load-bearing, is now
stale and describes the pre-FS-2698 world. **No ticket is proposed for it**: the in-flight FS-2688 branch
`fs-2688-server-render-docs-404` already renames that heading to "Static routing under `/docs`", replaces
the body, and rewrites the matching INTERNALS.md section (169 insertions, 116 deletions). See "Already covered, no new ticket".

The 352 versus 349 difference is exactly the three archived paths, `/docs/run-a-node/start-here/v1`,
`/docs/run-a-node/run-batch-poster/v1` and `/docs/run-a-node/nitro/build-nitro-locally/v1`. All three serve 200. None of them has an OG image or a markdown mirror (`/og/...` and `/...v1.md` both 404), which is
tracked as **FS-2711**.

## 5. Lighthouse

Run with `npx lighthouse@latest`, `CHROME_PATH` pointed at the Playwright Chrome for Testing build
(`chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/...`), flags `--headless=new --no-sandbox
--disable-gpu`, categories performance, accessibility, best-practices, seo. The headless _shell_ was not
used; Lighthouse accepted the full Chrome for Testing binary. A fourth intended page,
`/docs/how-arbitrum-works/a-gentle-introduction`, does not exist on this site (404), so
`/docs/run-a-node/nitro/cli-flags-reference` and `/docs/stylus` were used instead.

**Settings, read back from the saved report JSON** (`configSettings` and `environment`), since no preset
flag was passed and these are all Lighthouse defaults:

| Setting             | Value                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| Lighthouse version  | 13.4.1                                                                               |
| Form factor         | `mobile` (the default; **not** desktop)                                              |
| Screen emulation    | 412 x 823 CSS px at DPR 1.75, mobile emulation enabled                               |
| Emulated user agent | `Chrome/136.0.0.0 Mobile Safari/537.36` on `Android 11; moto g power (2022)`         |
| Throttling method   | `simulate` (Lighthouse's simulated slow 4G, not the DevTools or provided methods)    |
| Throttling values   | RTT 150 ms, throughput 1638.4 Kbps, request latency 562.5 ms, CPU slowdown 4x        |
| Runs per page       | 1 (CLI default; the three scores are single runs, not a median)                      |
| Host benchmark      | `benchmarkIndex` 2824.5 to 2891 across the runs, on HeadlessChrome 149 / macOS arm64 |
| Locale / channel    | `en-US`, `cli`, `gatherMode: navigation`                                             |

**A preview rerun must use these same settings to produce a comparable number.** The mobile default with
4x CPU slowdown is far harsher than the desktop preset, and the gap between the two presets is routinely
larger than the ten points between 80 and the bar of 90. The exact invocation to repeat:

```bash
CHROME_PATH="<Chrome for Testing binary>" npx lighthouse@13.4.1 <preview-origin>/<path> \
  --output=json --output-path=<file>.json \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu"
```

| Page                                         | Performance | Accessibility | Best practices | SEO |
| -------------------------------------------- | ----------- | ------------- | -------------- | --- |
| `/`                                          | 81          | 96            | 100            | 83  |
| `/docs/stylus`                               | 84          | 98            | 100            | 100 |
| `/docs/run-a-node/nitro/cli-flags-reference` | 80          | 100           | 100            | 100 |

Metrics:

| Page                | FCP   | LCP   | TBT    | CLS   | Speed Index |
| ------------------- | ----- | ----- | ------ | ----- | ----------- |
| `/`                 | 1.2 s | 4.4 s | 220 ms | 0.002 | 1.6 s       |
| `/docs/stylus`      | 1.4 s | 3.9 s | 220 ms | 0.002 | 1.8 s       |
| cli-flags-reference | 1.7 s | 4.0 s | 290 ms | 0.002 | 1.7 s       |

**No page clears the ticket's bar of 90 on performance.** LCP is the dominant cost on all three, at 3.9 to
4.4 seconds. The three largest contributors are consistent across pages: around 345 KiB of unused
JavaScript (one chunk alone accounts for 190 KiB), 450 to 600 ms of render-blocking resources, and roughly
1.2 MB total page weight. Main-thread work and script bootup both score 1, so this is payload and
render-blocking, not execution.

These numbers come from a local server on a loaded developer machine and will differ on a Vercel edge
deployment serving prerendered HTML with a CDN. The measurement must be repeated on a preview before the
bar is judged met or missed.

Two scored defects worth their own note:

- `/` scores 83 on SEO because `document-title` and `meta-description` both fail. See item 10.
- `/docs/stylus` fails `heading-order` on `<h3 class="not-prose mb-1 text-sm font-medium">`, a card title
  rendered at h3 without an intervening h2.

## 6. Browser checks, light and dark

### Method

Playwright 1.56.1 from `~/.npm/_npx/d537ee5ee2a13f03/node_modules/playwright`, launched with
`executablePath` pointing at `chromium_headless_shell-1228`. One context per theme; dark set with
`context.addInitScript(() => localStorage.setItem('theme','dark'))` because next-themes defaults to light
and `colorScheme: 'dark'` does nothing. Navigation `waitUntil: 'networkidle'`, full-page screenshots at
1440x900.

### Page set

Section landings, derived from `content/docs/meta.json`'s top-level `pages` array plus the home page:
`/`, `/docs`, `/docs/get-started`, `/docs/build-decentralized-apps`, `/docs/stylus`,
`/docs/arbitrum-essentials`, `/docs/launch-arbitrum-chain`, `/docs/run-a-node`, `/docs/how-arbitrum-works`,
`/docs/arbitrum-bridge`, `/docs/notices`, `/docs/audit-reports`, `/docs/oracles`, `/docs/third-party-docs`,
`/docs/chain-info`, `/docs/glossary`, `/docs/contribute`. Seventeen pages.

The home page's own section cards were checked and add nothing outside that list; the rendered home page
links to twenty-three `/docs` URLs, all of which are either in the list above or deep pages.

Ten deep pages, seeded random pick. Seed `2677`, LCG `x = (x * 1103515245 + 12345) mod 2^31`, Fisher-Yates
shuffle over the sorted list of the 333 pages with at least three path segments after `/docs`:

1. `/docs/how-arbitrum-works/deep-dives/transaction-lifecycle`
2. `/docs/arbitrum-essentials/bridging/configure-token-gateway/standard`
3. `/docs/stylus/troubleshooting-building-stylus`
4. `/docs/third-party-docs/contribute`
5. `/docs/how-arbitrum-works/deep-dives`
6. `/docs/launch-arbitrum-chain/operate/ownership-access-control`
7. `/docs/stylus/how-tos/exporting-abi`
8. `/docs/third-party-docs/Reactive/reactive`
9. `/docs/build-decentralized-apps/quickstart-solidity-remix`
10. `/docs/arbitrum-essentials/arbitrum-vs-ethereum`

Fifty-four page-theme combinations. All returned HTTP 200. Screenshots are in the scratchpad at
`.../scratchpad/fs-2677/shots/`.

### Whole-site sweep

Because the 27-page sample found runtime errors, the check was widened to **all 350 routes** (349 docs
pages plus the home page), six pages in parallel, collecting `pageerror` and console errors, scanning
`main` innerText for `:::`, `[object Object]`, `<Var` and `{/*`, and flagging `img` elements with
`naturalWidth === 0`.

**Nineteen of 350 pages are defective.** Every one returns HTTP 200; the failures are client-side.

### Defect A: React hydration failure on 18 pages

```
Minified React error #418 (Hydration failed because the server rendered HTML didn't match the client)
```

Affected pages:

```
/docs/arbitrum-bridge/usdc-arbitrum-one
/docs/build-decentralized-apps/quickstart-solidity-remix
/docs/contribute
/docs/how-arbitrum-works/reference/arbos-reference
/docs/how-arbitrum-works/reference/geth
/docs/launch-arbitrum-chain/configuration/data-availability/das-docker-deployment
/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/deploy-das
/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/deploy-mirror-das
/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/get-started
/docs/run-a-node/arbos-releases/arbos40
/docs/run-a-node/arbos-releases/arbos51
/docs/run-a-node/nitro/build-nitro-locally
/docs/run-a-node/run-local-full-chain-simulation
/docs/run-a-node/run-nitro-dev-node
/docs/stylus/cli-tools/overview
/docs/stylus/reference/rust-sdk-guide
/docs/third-party-docs/Openfort/openfort
/docs/third-party-docs/Venly/venly
```

Root causes, established by rerunning the same pages against `next dev` on the same port to get the
unminified React message with its component stack. Three distinct causes, all invalid HTML nesting:

**A1. A link inside a heading, producing nested `<a>` (13 pages).** Fumadocs wraps heading content in its
own anchor, so a heading whose markdown already contains a link renders as an anchor inside an anchor.
From `/docs/third-party-docs/Venly/venly`, whose source line 10 is `## [Venly](https://venly.io/)`:

```html
<h2 id="venly" class="group/heading ...">
  <a data-card="" href="#venly"
    ><a href="https://venly.io/" rel="noreferrer noopener" target="_blank">Venly</a></a
  >
</h2>
```

The HTML parser cannot nest anchors, so it splits them and the client tree no longer matches the server
tree. Sixty-nine heading lines across twelve source files carry a markdown link, counted with

```
grep -rEn '^#{1,6} .*\[.*\]\(' content/docs content/partials --include='*.mdx'
```

which returns 69 matching lines in 12 files. `/docs/build-decentralized-apps/quickstart-solidity-remix`
adds a thirteenth affected page through a bare autolinked URL in a heading
(`1. Load Remix: https://remix.ethereum.org`), which that grep does not match.

Files:

```
content/docs/how-arbitrum-works/reference/arbos-reference.mdx
content/docs/how-arbitrum-works/reference/geth.mdx
content/docs/run-a-node/arbos-releases/arbos40.mdx
content/docs/run-a-node/arbos-releases/arbos51.mdx
content/docs/run-a-node/nitro/build-nitro-locally.mdx
content/docs/run-a-node/run-local-full-chain-simulation.mdx
content/docs/run-a-node/run-nitro-dev-node.mdx
content/docs/stylus/cli-tools/overview.mdx
content/docs/stylus/reference/rust-sdk-guide.mdx
content/docs/third-party-docs/Openfort/openfort.mdx
content/docs/third-party-docs/Venly/venly.mdx
content/partials/_contribute-docs-partial.mdx
content/docs/build-decentralized-apps/quickstart-solidity-remix.mdx
```

**A2. A raw `<p>` wrapping markdown that the pipeline wraps again (4 pages).** React reports `<p>` cannot be
a descendant of `<p>`. The four DAC and DAS pages each open with a hand-written `<p>` element containing
markdown prose, which remark then wraps in its own paragraph. Example,
`content/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/get-started.mdx:10`.
`content/docs/run-a-node/run-local-full-chain-simulation.mdx:21` has the same shape but is already counted
under A1.

**A3. A raw `<table>` whose rows are not in a `<tbody>` (1 page).** React reports `<tr>` cannot be a child of
`<table>`, and names `<table className="small-table">`.
`content/docs/arbitrum-bridge/usdc-arbitrum-one.mdx:17` opens a table and puts `<tr>` directly inside it;
the browser parser inserts the missing `<tbody>` and the trees diverge. The other three files with raw
tables (`run-a-node/troubleshooting.mdx`, `third-party-docs/LayerZero/layerzero.mdx`, the generated
precompile partials) all include `<tbody>` and none of them errors.

No gate catches any of the three. `types:check`, `check-links` and `content:lint` all pass on every one of
these pages.

### Defect B: three broken images

`/docs/stylus/cli-tools/verify-contracts` shows three `<img>` elements with `naturalWidth === 0` and three
404s in the network log, for `/img/stylus/standard-json-input.webp`, `/img/stylus/verification-success.webp`
and `/img/stylus/already-verified.webp`. This is the A7 finding above, already tracked as **FS-2709**.

### Defect C: a stale contribute guide

`/docs/contribute` renders the literal text `:::caution UNDER CONSTRUCTION` in its main content. This is a
false positive for the `:::` detector in the strict sense, because the text sits inside a fenced code
block. It is still a real content defect: the contribute guide instructs contributors to write Docusaurus
admonition syntax, which this site does not support and which `content:lint` rule A1 rejects. Source is
`content/partials/_contribute-docs-partial.mdx:204` and the two blocks that follow it.

### Defect D: wrong sidebar root label on eight pages

Eight docs URLs render a sidebar root switcher whose label names a section they do not belong to. Measured
by reading the `<aside>` root button text:

| URL                     | Switcher label shown | Correct |
| ----------------------- | -------------------- | ------- |
| `/docs`                 | Build apps           | no      |
| `/docs/chain-info`      | Third-party docs     | no      |
| `/docs/audit-reports`   | Third-party docs     | no      |
| `/docs/contribute`      | Third-party docs     | no      |
| `/docs/glossary`        | Build apps           | no      |
| `/docs/oracles`         | Build apps           | no      |
| `/docs/notices`         | Build apps           | no      |
| `/docs/arbitrum-bridge` | Build apps           | no      |

On `/docs/audit-reports` the switcher reads "Third-party docs" while the tree below it is the Get started
tree, which is visibly contradictory in the screenshot. The cause is structural: eight directories carry
`"root": true` in their `meta.json`, and these eight URLs sit outside all of them
(`content/docs/audit-reports.mdx`, `chain-info.mdx`, `contribute.mdx`, `glossary.mdx`, `index.mdx` are
top-level files, and `arbitrum-bridge/`, `notices/`, `oracles/` are directories with no root flag), so
Fumadocs falls back to an arbitrary root. `nav:check` passes.

### Defect E: sidebar titles

Hand-written `meta.json` titles that read wrong in the rendered sidebar:

- `content/docs/launch-arbitrum-chain/meta.json`: `"Launch arbitrum chain"`, lowercase brand name.
- `content/docs/stylus/cli-tools/meta.json`: `"Cli tools"`, should be "CLI tools".
- `content/docs/stylus/how-tos/meta.json`: `"How tos"`, should be "How-tos".

### Non-defects confirmed

- No page shows `[object Object]`, `<Var` or `{/*` in rendered content.
- No horizontal overflow on any of the seventeen landings at either 1440 px or 390 px.
- **Ten of the 54 captures were read by eye**, five pages in both themes: `/`, `/docs/stylus`,
  `/docs/run-a-node`, `/docs/audit-reports` and `/docs/third-party-docs`. On those ten, light and dark
  both render correctly and the announcement banner, hero, card grids, sidebar, table of contents and
  footer all invert cleanly. The other 44 captures were not looked at; those page-theme combinations were
  checked programmatically only, for HTTP status, `pageerror` and console errors, the `:::`,
  `[object Object]`, `<Var` and `{/*` text signals, and `img` elements with `naturalWidth === 0`. A theme
  defect that produces none of those signals would not have been caught outside the ten.
- Dev mode also surfaces `Each child in a list should have a unique "key" prop. Check the render method of
Header. It was passed a child from Layout.` on every page. React emits key warnings in development only,
  so this does not reach production users, but it is a real code defect somewhere in the navbar children
  passed through `lib/layout.shared.tsx`.

## 7. Anchors on the twenty most-linked pages

The link graph was built from all 349 `content/docs/**/*.mdx` files by counting `](/docs/...)` targets that
resolve to a real page, excluding self-links. Partials are not counted as sources of their own, but a
partial's links land in the including page and are counted there through the doc tree.

Top twenty targets by inbound link count:

| Inbound | Page                                                                                                  | Distinct fragments |
| ------- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| 74      | `/docs/arbitrum-essentials/precompiles/reference`                                                     | 7                  |
| 48      | `/docs/how-arbitrum-works/deep-dives/l1-to-l2-messaging`                                              | 8                  |
| 43      | `/docs/launch-arbitrum-chain/configuration/sequencer/batch-poster-troubleshooting`                    | 34                 |
| 41      | `/docs/how-arbitrum-works/deep-dives/sequencer`                                                       | 5                  |
| 37      | `/docs/how-arbitrum-works/deep-dives/token-bridging`                                                  | 5                  |
| 30      | `/docs/run-a-node/run-full-node`                                                                      | 4                  |
| 24      | `/docs/how-arbitrum-works/deep-dives/l2-to-l1-messaging`                                              | 1                  |
| 21      | `/docs/how-arbitrum-works/deep-dives/anytrust-protocol`                                               | 2                  |
| 20      | `/docs/how-arbitrum-works/bold/gentle-introduction`                                                   | 1                  |
| 20      | `/docs/how-arbitrum-works/deep-dives/gas-and-fees`                                                    | 5                  |
| 20      | `/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/deploy-das` | 8                  |
| 19      | `/docs/launch-arbitrum-chain/configuration/sequencer/bold-adoption-for-arbitrum-chains`               | 7                  |
| 19      | `/docs/launch-arbitrum-chain/operate/arbos-upgrade`                                                   | 4                  |
| 18      | `/docs/launch-arbitrum-chain/third-party-integrations/third-party-providers`                          | 2                  |
| 18      | `/docs/run-a-node/arbos-releases/arbos51`                                                             | 1                  |
| 17      | `/docs/stylus/quickstart`                                                                             | 0                  |
| 16      | `/docs/how-arbitrum-works/bold/bold-technical-deep-dive`                                              | 6                  |
| 16      | `/docs/how-arbitrum-works/deep-dives/assertions`                                                      | 0                  |
| 16      | `/docs/run-a-node/more-types/run-validator-node`                                                      | 2                  |
| 15      | `/docs/how-arbitrum-works/timeboost/gentle-introduction`                                              | 0                  |

Every fragment used in a link to one of these pages was fetched from the running server and matched
against the `id` attributes in the rendered HTML.

**102 fragments checked, 0 missing.** The rendered HTML agrees with what `check-links` validates
statically. FS-2707 held.

## 8. `redirects:check`

`pnpm redirects:check` defaults to `http://localhost:3000` and fails against it, so the audit ran
`node scripts/redirects-check.mjs --base-url http://localhost:3136`.

```
redirects-check: 857 redirects against 349 routable pages (http://localhost:3136)

  21 external destination(s) not verified
  ok — every destination resolves, no source shadows a live page
```

Exit 0. The companion test in the same CI step also passes:
`STATIC_DOCS_TEST_URL=http://localhost:3136 node --test scripts/static-docs-http.test.mjs` reports 7 tests,
7 pass, 0 fail.

## 9. Legacy redirect spot check

`redirects.legacy.mjs` exports 853 entries. Ten were picked with a seeded shuffle (LCG seed `26772677`,
same generator as above) and followed with `curl -L --max-redirs 10`.

| Legacy source                                                                          | Final status | Final URL                                                                                                |
| -------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| `/launch-arbitrum-chain/maintain-your-chain/guidance/post-launch-contract-deployments` | 200          | `/docs/launch-arbitrum-chain/operate/post-launch-contract-deployments`                                   |
| `/fraud-proofs/challenge-manager`                                                      | 200          | `/docs/how-arbitrum-works/bold/gentle-introduction`                                                      |
| `/dispute_resolution`                                                                  | 200          | `/docs/how-arbitrum-works/bold/gentle-introduction`                                                      |
| `/arbitrum-bridge/usdc-arbitrum-one`                                                   | 200          | `/docs/arbitrum-bridge/usdc-arbitrum-one`                                                                |
| `/launch-arbitrum-chain/features/common/configure-aep/configure-aep-fees`              | 200          | `https://docs.arbitrum.foundation/calculate-aep-fees` (external, by design)                              |
| `/node-running/how-tos/data-availability-committee/introduction`                       | 200          | `/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/get-started`   |
| `/launch-orbit-chain/how-tos/customize-arbos`                                          | 200          | `/docs/launch-arbitrum-chain/configuration/core/customize-arbos`                                         |
| `/stylus/cli-tools/verify-contracts`                                                   | 200          | `/docs/stylus/cli-tools/verify-contracts`                                                                |
| `/notices/arbos51-arbsepolia-upgrade-notice`                                           | 200          | `/docs/notices/arbos51-upgrade-notice`                                                                   |
| `/launch-arbitrum-chain/chain-config/data-availability/configure-dac`                  | 200          | `/docs/launch-arbitrum-chain/configuration/data-availability/data-availability-committees/configure-dac` |

All ten land on 200. Nine on a docs page, one on the intended external destination.

## 10. Metadata

|                    | `/`              | `/docs/get-started`       | `/docs/stylus`           | `/docs/run-a-node/nitro/cli-flags-reference` |
| ------------------ | ---------------- | ------------------------- | ------------------------ | -------------------------------------------- |
| `<title>`          | **missing**      | Get started with Arbitrum | Build apps with Stylus   | CLI flags reference                          |
| `meta description` | **missing**      | present                   | present                  | present                                      |
| `rel=canonical`    | **missing**      | present                   | present                  | present                                      |
| `og:image`         | **missing**      | 200, image/png, 73198 B   | 200, image/png, 62396 B  | 200, image/png, 64007 B                      |
| `twitter:card`     | **missing**      | summary_large_image       | summary_large_image      | summary_large_image                          |
| `twitter:site`     | **missing**      | @arbitrum                 | @arbitrum                | @arbitrum                                    |
| `<time dateTime>`  | absent (correct) | 2026-08-19T00:25:50.000Z  | 2026-08-19T00:25:50.000Z | 2026-09-15T12:26:49.000Z                     |

Docs pages are complete. Every OG image fetches as a real PNG.

**The home page carries no page metadata at all.** Its only `<meta name>` tags are `viewport` and
`next-size-adjust`. `app/layout.tsx` sets `metadataBase` and `icons` but no `title` or `description`, and
`app/(home)/page.tsx` exports no `metadata` object. CLAUDE.md records that `app/(home)/page.tsx` has no
canonical, which is deliberate, but the absence of a title and description is not the same decision and is
what drives the Lighthouse SEO score of 83.

**On `<time dateTime>`:** `source.config.ts` gates `lastModified` behind `hasFullGitHistory()`, which runs
`git rev-parse --is-shallow-repository` and returns true only for a full clone. This worktree is full, so
dates render. Vercel clones at depth 10, so on a preview or production build the field is `undefined`, the
"Last updated on ..." line disappears and the sitemap emits no `<lastmod>`, unless `VERCEL_DEEP_CLONE=true`
is set in the project's environment variables. The type never moves, because the guard picks between `true`
and a resolver returning `undefined`, both truthy.

## 11. Site-level endpoints

| URL                                 | Status | Content-Type    | Size      |
| ----------------------------------- | ------ | --------------- | --------- |
| `/sitemap.xml`                      | 200    | application/xml | 49464 B   |
| `/robots.txt`                       | 200    | text/plain      | 121 B     |
| `/llms.txt`                         | 200    | text/plain      | 69709 B   |
| `/llms-full.txt`                    | 200    | text/plain      | 4527732 B |
| `/.well-known/mcp/server-card.json` | 404    | text/html       | 82424 B   |

The MCP server card 404 is expected: **FS-2704** is in progress and has not landed.

`/sitemap.xml` holds 350 `<url>` entries (349 docs pages plus `/`) and 349 `<lastmod>` values, the home page
correctly having none. The three archived `v1` paths are absent, which is correct. Every `<loc>` reads
`http://localhost:3000/...` because `NEXT_PUBLIC_SITE_URL` was unset at build.

`/robots.txt` emits the `Content-Signal: search=yes, ai-input=yes, ai-train=no` line and names the sitemap,
again at the localhost origin.

Other observations from the same sweep:

- `/docs/this-page-does-not-exist` returns 404 with an 82424-byte body, so the empty-bodied 404 described in
  FS-2688 no longer reproduces on a built site. That ticket is in progress and should confirm.
- Markdown negotiation works in both shapes: `/docs/stylus.md` and `Accept: text/markdown` on `/docs/stylus`
  both return 200 with `content-type: text/markdown`.
- Prerendered HTML carries `Cache-Control: s-maxage=31536000` and `x-nextjs-cache: HIT`. The negotiated
  markdown response carries the same `s-maxage` together with `vary: Accept`. The HTML response also lists
  `Accept` in its `Vary`. Whether Vercel's edge honours `Vary: Accept` as a cache key for this rewrite is
  the open question recorded in CLAUDE.md and in FS-2705 item 5, and it cannot be answered locally.

## Checks that must be repeated on a Vercel preview

Everything above ran against a local `next start`. These specific results do not transfer:

1. **Every absolute URL.** Canonicals, `og:image` URLs, `metadataBase`, sitemap `<loc>` and the robots
   `Sitemap:` line all read `http://localhost:3000` here. On a preview they come from
   `NEXT_PUBLIC_SITE_URL`, and a production build with that variable unset is designed to throw. Confirm the
   throw fires and that the configured value is the real origin.
2. **Last-modified dates.** Absent on Vercel unless `VERCEL_DEEP_CLONE=true` is set. Verify the "Last updated
   on ..." line appears and that `<lastmod>` is present in the sitemap.
3. **Edge cache keying for markdown negotiation.** Confirm that requesting `/docs/<slug>` with
   `Accept: text/html` and then with `Accept: text/markdown` returns the right body each time through the
   CDN, and that a cached HTML response is never served to a markdown request. This is the one finding here
   that could silently corrupt responses in production.
4. **`Cache-Control` and `x-vercel-cache` on prerendered routes.** The `s-maxage=31536000` seen locally needs
   to be confirmed as an actual edge HIT, and the docs route's `private, no-cache, no-store` behaviour
   re-checked now that FS-2698 made the route static.
5. **Lighthouse.** Rerun all three pages against the preview. Local numbers include no CDN and a loaded
   developer machine, so the 80 to 84 performance scores are a floor, not the verdict.
6. **Request tracking.** `proxy.ts` only fires PostHog events when `VERCEL_ENV === 'production'`, so nothing
   was exercised locally. Verify `llms_file_fetched` arrives for `/llms.txt`, `/llms-full.txt`,
   `/docs/<slug>.md` and `Accept: text/markdown`, and that a revoked token would be logged rather than read
   as no traffic.
7. **Inkeep search and chat.** Every page logs `Inkeep API key is missing` three times here.
   `NEXT_PUBLIC_INKEEP_API_KEY` must be set on the project and the widget exercised. Fumadocs' own
   `/api/search` works without it and returns results, so search degrades rather than disappearing.
8. **`redirects:check` against the preview.** Not needed as a gate (CLAUDE.md explains why it must not move
   back onto a preview, since that requires `VERCEL_AUTOMATION_BYPASS_SECRET`), but one manual run against
   the preview origin confirms Next's `redirects()` behaves the same behind the edge.
9. **Node version.** `.node-version` pins the build to 22, but the Vercel project's Node.js Version setting
   is a separate control with no gate. Confirm it reads 22.x.

## Proposed tickets

Listed highest severity first. None was filed; the orchestrator files them.

### 1. Give the home page a title, description and social metadata

**Severity: high.** `/` ships with no `<title>`, no `meta description`, no canonical and no Open Graph or
Twitter tags. Confirmed by fetching `http://localhost:3136/` on a production build: the only `<meta name>`
tags present are `viewport` and `next-size-adjust`, and `grep -c '<title'` returns 0. `app/layout.tsx`
defines `metadata` with only `metadataBase` and `icons`, and `app/(home)/page.tsx` exports no `metadata`.
Lighthouse scores the home page 83 on SEO with `document-title` and `meta-description` both failing, while
every docs page scores 100. The site root is the page most likely to be shared and indexed. Not a duplicate
of any open ticket; FS-2668 completed social metadata for docs pages only.

### 2. Fix the invalid HTML nesting that breaks hydration on eighteen pages

**Severity: high.** Eighteen of 350 routes throw React error #418 (hydration failure) in a production build,
which makes React discard and re-render the affected subtree on the client. Reproduce by loading any page
in the list in section 6 with a console open. Three causes: a markdown or autolinked URL inside a heading
produces nested `<a>` (thirteen pages, sixty-nine heading lines across twelve files), a hand-written `<p>`
around markdown prose produces `<p>` inside `<p>` (four DAC and DAS pages), and a raw `<table>` with `<tr>`
children and no `<tbody>` (`content/docs/arbitrum-bridge/usdc-arbitrum-one.mdx:17`). No gate catches any of
them; `types:check`, `check-links` and `content:lint` all pass. The fix is editorial in the content plus a
new `content:lint` rule so the class stays fixed. Not a duplicate.

### 3. Raise Lighthouse performance to 90 on the three sampled pages

**Severity: medium.** Measured locally against a production build: `/` scores 81, `/docs/stylus` 84,
`/docs/run-a-node/nitro/cli-flags-reference` 80, against the M-50 bar of 90. LCP is 3.9 to 4.4 seconds on
all three and is the dominant cost; the three consistent contributors are about 345 KiB of unused
JavaScript (one chunk alone is 190 KiB), 450 to 600 ms of render-blocking resources, and roughly 1.2 MB
total page weight. Main-thread work and script bootup both score 1, so this is payload, not execution.
**Remeasure on a Vercel preview first**, because a local server has no CDN and these numbers are a floor.
Not a duplicate.

### 4. Give the eight rootless docs URLs a correct sidebar root

**Severity: medium.** `/docs`, `/docs/chain-info`, `/docs/audit-reports`, `/docs/contribute`,
`/docs/glossary`, `/docs/oracles`, `/docs/notices` and `/docs/arbitrum-bridge` all render a sidebar root
switcher naming a section they do not belong to, four of them reading "Third-party docs" and four reading
"Build apps". On `/docs/audit-reports` the label says "Third-party docs" while the tree below is the Get
started tree. Eight `meta.json` files carry `"root": true` and these eight URLs sit outside all of them, so
Fumadocs falls back to an arbitrary root. `nav:check` passes, so the fix should add a check as well as a
root assignment. Not a duplicate.

### 5. Fix three sidebar section titles

**Severity: low.** `content/docs/launch-arbitrum-chain/meta.json` reads `"Launch arbitrum chain"` with the
brand name lowercased, `content/docs/stylus/cli-tools/meta.json` reads `"Cli tools"` and
`content/docs/stylus/how-tos/meta.json` reads `"How tos"`. All three are visible in the rendered sidebar and
in the root switcher. Verified by reading the three files and by screenshotting `/docs/stylus`. Not a
duplicate.

### 6. Rewrite the admonition section of the contribute guide for Fumadocs

**Severity: low.** `/docs/contribute` still teaches contributors Docusaurus admonition syntax. Under the
"Banner conventions" heading of `content/partials/_contribute-docs-partial.mdx`, two fenced `markdown`
code blocks present that syntax as the way to write a banner: `:::caution UNDER CONSTRUCTION` at lines 204
to 208, and `:::info Community member contribution` at lines 223 to 227. Line 190 of the same file calls
banners "admonitions" and links to `https://docusaurus.io/docs/markdown-features/admonitions`. That syntax
does not render on this site and `content:lint` rule A1 rejects it, so the guide instructs contributors to
write something CI will refuse.

**Not a duplicate, and no overlap with FS-2708.** FS-2708 ("Port the editorial style guide and fix
CONTRIBUTE.md's stale pointer") touches only `STYLE-GUIDE.md`, `CONTRIBUTE.md`, `CLAUDE.md`, `README.md`,
`INTERNALS.md` and one skill file, and its scope explicitly excludes `content/docs/`. The defect here is in
`content/partials/`, on the reader-facing page `/docs/contribute`. Different file, different surface. This
stands alone as its own ticket; sequence it after FS-2708 so the two contribute-facing documents agree.

### 7. Remove the React key warning from the header

**Severity: low.** Every page in `next dev` logs `Each child in a list should have a unique "key" prop. Check
the render method of Header. It was passed a child from Layout.` React only emits key warnings in
development, so production users are unaffected, but it is a genuine defect in the navbar children built by
`lib/layout.shared.tsx` and it adds noise that hides real warnings. Reproduce by loading any page under
`pnpm dev` with a console open. Not a duplicate.

### Already covered, no new ticket

Each entry was checked against the specific ticket named, not against the ticket list in general.

- **CLAUDE.md's "Known trade-off" section, which FS-2698 made false.** Already covered by **FS-2688**
  (in flight, branch `fs-2688-server-render-docs-404`), which renames that heading to "Static routing
  under `/docs`", replaces the body, and rewrites the matching INTERNALS.md section (169 insertions, 116 deletions). Confirmed by
  reading that branch's diff against `fork/main`. Filing a ticket here would put a second agent into the
  same paragraphs of the file every agent in this repo reads first.
- **Three broken Stylus verification images.** Confirmed in the browser (three `naturalWidth === 0`, three
  404s) and by `content-lint --rule=A7`. Exactly **FS-2709**, which also covers promoting A7 into the
  default rule set.
- **Archived version pages have no markdown mirror or OG image.** `/docs/run-a-node/start-here/v1.md` and
  `/og/docs/run-a-node/start-here/v1/image.png` both 404 while the page itself serves 200. **FS-2711**.
- **`/.well-known/mcp/server-card.json` 404s.** **FS-2704**.
- **`Vary: Accept` on HTML responses and shared-cache correctness.** **FS-2705** item 5.
- **Production environment variables** (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_INKEEP_API_KEY`,
  `NEXT_PUBLIC_POSTHOG_KEY`, `VERCEL_DEEP_CLONE`, Node 22.x project setting). **FS-2678**.
- **Porting the three PGA pages and six glossary terms.** A content decision for the freeze window, covered
  by the cutover runbook in **FS-2679**. Nothing was ported here.
