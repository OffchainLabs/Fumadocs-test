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

Design notes: [`docs/superpowers/specs/2026-07-09-partials-registry-design.md`](docs/superpowers/specs/2026-07-09-partials-registry-design.md).

## Conventions

- Global variables live in `content/vars.json` (writer-edited), validated by `content/vars.ts` (Zod), rendered via `<Var name="..." />`.
- Theme tokens are `--color-fd-*` (Fumadocs) — never `--ifm-*` (legacy Docusaurus).

## Reference

Fumadocs docs · Next.js App Router · MDX 3.
