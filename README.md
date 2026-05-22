# arbitrum-docs-v2

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

| Path | Purpose |
|---|---|
| `app/[lang]/docs/` | Localized docs routes (en, zh-CN, ja). |
| `content/docs/<lang>/` | MDX content + `meta.json` sidebars. |
| `components/mdx/` | Custom MDX components (registered in `components/mdx.tsx`). |
| `lib/source.ts` | Fumadocs source adapter. |
| `proxy.ts` | i18n routing + static-asset bypass list. |
| `scripts/codemods/` | One-shot porting + landing-page generators. |
| `source.config.ts` | Fumadocs MDX config (Zod-typed frontmatter, partial-exclusion glob). |

## Conventions

- Partials are `_`-prefixed and excluded from routing; consumed via Fumadocs's `<include>` directive or imported directly from a client component.
- Global variables live in `content/vars.json` (writer-edited), validated by `content/vars.ts` (Zod), rendered via `<Var name="..." />`.
- Theme tokens are `--color-fd-*` (Fumadocs) — never `--ifm-*` (legacy Docusaurus).

## Reference

Fumadocs docs · Next.js App Router · MDX 3.
