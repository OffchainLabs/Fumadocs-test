# Fumadocs-test

Arbitrum documentation portal — Next.js 16 / Fumadocs migration of [`OffchainLabs/arbitrum-docs`](https://github.com/OffchainLabs/arbitrum-docs).

**Status:** Phase 0 MVP. Single-committer, local-only; Vercel + CI follow in Phase 0.5.

## Dev

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm types:check
```

Node 22 LTS · pnpm 10 · TypeScript strict · Tailwind 4.

Search and the "Ask AI" chat button are powered by [Inkeep](https://inkeep.com). Set the
publishable key in a local `.env` (gitignored):

```bash
NEXT_PUBLIC_INKEEP_API_KEY=<inkeep-search-key>
```

Config lives in `lib/inkeep.ts`; the widgets mount in `components/inkeep/` and are wired into
`RootProvider` in `app/[lang]/layout.tsx` (Inkeep replaces the built-in Fumadocs search dialog).

## Layout

| Path                   | Purpose                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `app/[lang]/docs/`     | Localized docs routes (en, zh-CN, ja).                                                |
| `content/docs/<lang>/` | MDX content + `meta.json` sidebars.                                                   |
| `content/partials/`    | Reusable `_`-prefixed fragments + generated `CATALOG.md` (see [Partials](#partials)). |
| `components/mdx/`      | Custom MDX components (registered in `components/mdx.tsx`).                           |
| `lib/source.ts`        | Fumadocs source adapter.                                                              |
| `proxy.ts`             | i18n routing + static-asset bypass list.                                              |
| `scripts/codemods/`    | One-shot porting + landing-page generators.                                           |
| `source.config.ts`     | Fumadocs MDX config (Zod-typed frontmatter).                                          |

## Partials

Reusable content fragments live in `content/partials/` — a single source of truth you can inline
anywhere. They are `_`-prefixed and sit outside the doc collection, so they are never routed.

### Find one before writing

**Before writing a banner, note, config table, or troubleshooting block, search
[`content/partials/CATALOG.md`](content/partials/CATALOG.md)** (⌘F by intent — title, summary, tags)
and reuse it instead of duplicating prose. The catalog gives you a copy-paste snippet per partial.
`CATALOG.md` and `manifest.json` (the machine-readable index for agents) are generated — never edit
them by hand.

### Use one

Two ways to pull a partial into a page:

```mdx
<!-- From a doc page: root-anchored, so moving the page never breaks it -->

<include cwd>content/partials/launch-arbitrum-chain/_raas-providers-notice.mdx</include>
```

```mdx
<!-- From another partial: MUST be file-relative, not cwd -->

<include>../_hardware-requirements.mdx</include>
```

```tsx
// As a React component (e.g. an interactive selector):
import RollupProsCons from '@/content/partials/launch-arbitrum-chain/features/_rollup-pc.mdx';
```

Why the split: a `cwd` include resolves from the repo root and is invariant under page moves, but it
only works in the docs pipeline — a partial compiled outside it (when ESM-imported) has no `cwd`
context and crashes the build. So **partial→partial includes are always relative.** `partials:check`
enforces this.

### Add or change one

1. Create `content/partials/<area>/_your-partial.mdx`. No frontmatter — `<include>` strips it.
2. Reference it (see above), then run `pnpm partials:catalog` to refresh the catalog + manifest.
3. Optionally curate its title/summary/tags/scope in `content/partials/registry.json`:
   ```json
   {
     "content/partials/<area>/_your-partial.mdx": {
       "summary": "…",
       "tags": ["…"],
       "scope": "neutral"
     }
   }
   ```

### Commands

```bash
pnpm partials:catalog   # regenerate content/partials/CATALOG.md + manifest.json
pnpm partials:check     # validate include/import resolution, no routing leak, catalog freshness
```

`partials:check` fails on: an unresolved include or partial import, a `_`-prefixed file left under
`content/docs/`, a `cwd` include inside a partial, a bad `registry.json` entry, or a stale catalog.

Design notes: [`.claude/docs/superpowers/specs/2026-07-09-partials-registry-design.md`](.claude/docs/superpowers/specs/2026-07-09-partials-registry-design.md).

## Variables

Values that move on a release cadence — version tags, chain parameters, node image names — live in
one JSON file instead of being retyped across pages. Edit the value once and every page that
references it follows. This replaces Docusaurus's `@@varName@@` preprocessing.

### Use one

```mdx
The current Nitro release is <Var name="nitroVersionTag" />.
```

`Var` is a server component registered globally in `components/mdx.tsx`, so pages need no import. It
works inside partials too.

### Update one

1. Edit the value in [`content/vars.json`](content/vars.json).
2. Run `pnpm vars:check`.

Adding a **new** variable takes both files: the key in `content/vars.json` **and** its type in the
`varsSchema` in [`content/vars.ts`](content/vars.ts). Miss either side and the gate fails.

### Why two files

`vars.json` is plain JSON, so writing a value needs no TypeScript. `vars.ts` validates it with a Zod
`strictObject` at module load, so a missing or mistyped key throws immediately with a field-level
error — in the `pnpm dev` console and in CI.

The strictness is load-bearing. A plain `z.object` silently strips keys that are present in the JSON
but absent from the schema, so `<Var>` renders the literal string `undefined` into the page; that is
how 27 variables once came to render `undefined` across 85 sites.

`.mdx` never passes through `tsc`, so the `VarKey` type does not protect MDX callers and
`pnpm types:check` exits 0 on a page full of broken variables. **`pnpm vars:check` is the only gate
that catches a `<Var name>` with no matching key** — it blocks in CI.

### Commands

```bash
pnpm vars:check           # fail if any <Var name> cannot resolve; also lists unreferenced keys
pnpm vars:check --json    # machine-readable audit; exits 0
pnpm nitro:check-release  # bump the pinned Nitro release values to the newest tag
```

Values mirror upstream [`arbitrum-docs/src/resources/globalVars.js`](https://github.com/OffchainLabs/arbitrum-docs/blob/master/src/resources/globalVars.js).
Keep them in sync while that site is still live.

## Conventions

- Global variables: see [Variables](#variables) — edit `content/vars.json`, never hardcode a version
  or chain parameter into a page.
- Theme tokens are `--color-fd-*` (Fumadocs) — never `--ifm-*` (legacy Docusaurus).

## Reference

Fumadocs docs · Next.js App Router · MDX 3.
