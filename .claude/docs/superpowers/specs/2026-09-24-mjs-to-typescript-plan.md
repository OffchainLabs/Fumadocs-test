# Convert every `.mjs` file to TypeScript

Date: 2026-09-24. Branch: `convert-mjs-to-typescript`, worktree
`/Users/fionna/offchain/Fumadocs-wt/convert-mjs-to-typescript`, cut from `main` at `8d37f11`.

Request: "convert all the mjs to typescript. set up correctly. i dont want to have any mjs!"

## Scope

92 `.mjs` files at `8d37f11` (21,310 lines, of which 4,459 are `redirects.config.mjs` and 4,425 are
`redirects.legacy.mjs`, both data). Four kinds:

| Kind                   | Files | Becomes                                                                                           |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| `scripts/**` and tests | 78    | `.ts` run directly by Node                                                                        |
| `lib/*.mjs`            | 5     | `lib/*.ts`, imported by app code and by Node                                                      |
| Root data              | 2     | `redirects.config.ts`, `redirects.legacy.ts`                                                      |
| Root config            | 7     | `next.config.ts`, `prettier.config.ts`, `.lintstagedrc.ts`, `svgo.config.ts`, `postcss.config.ts` |

Not in scope: the untracked `.claude/docs/superpowers/specs/*.md` and `code-review-*.md` notes at the
repo root, which are history, and the three `.mjs` names in `content/` (`deploy-token-bridge.mjs`,
`prepare-node-config.mjs`, `deploy.mjs`), which are a reader's own files in a third-party tutorial.

The main checkout carries another in-progress effort (staged deletions of `redirects.legacy.mjs`
and the four `scripts/lib/legacy-*` files, plus a `2026-09-24-script-deletion-audit.md`). This
branch converts what is on `main`; when that deletion lands first, the rebase resolves each of
those files as deleted and the converted copy is dropped.

## Runtime decision: Node's own type stripping

Node 22.18 and later run a `.ts` file directly, stripping types and nothing else. The repo already
relies on it: `scripts/lib/llms-tracking.test.mjs` and five other tests import `lib/*.ts` today.
No `tsx`, `ts-node` or `jiti`, no build step for scripts.

Consequences, each enforced somewhere:

- **`engines.node` becomes `>=22.18.0 <23.0.0`.** `.node-version` stays `22`, which nvm, fnm,
  asdf, Vercel and `actions/setup-node` all resolve to the newest 22.x. Vercel runs `pnpm build`,
  whose first two steps are Node scripts, so its 22.x must be 22.18 or later, which it is.
- **`"type": "module"` in `package.json`.** With no `type` field Node has to sniff every `.ts`
  file's module format and prints `MODULE_TYPELESS_PACKAGE_JSON` (CLAUDE.md records this warning on
  `lib/docs-navigation.ts` today). There is no `.js` or `.cjs` file outside `node_modules`, so
  nothing changes meaning.
- **Only erasable syntax.** Node strips types; it does not compile enums, namespaces, parameter
  properties or `import x = require()`. `erasableSyntaxOnly: true` in `tsconfig.json` makes `tsc`
  reject them, so `types:check` fails before Node would.
- **Type-only imports must say so.** Node leaves `import { Foo } from './x.ts'` in place, and if
  `Foo` is only a type the import throws at runtime. `verbatimModuleSyntax: true` makes `tsc`
  require `import type` for those, so the gate catches it.
- **Relative imports carry the `.ts` extension.** Node resolves nothing else. `tsconfig.json` gets
  `allowImportingTsExtensions: true` (legal because `noEmit` is set). App code keeps its bare
  `@/lib/x` specifiers, because Turbopack resolves both.
- **`allowJs` goes.** Nothing is JavaScript any more.

## What each config loader accepts (checked in `node_modules`, not assumed)

- `next.config.ts`: Next transpiles it with SWC and evaluates it with a require hook that also
  transpiles the `.ts` files it imports (`lib/site-url.ts`, `redirects.config.ts`). Proved by
  `next build` on this branch.
- `prettier.config.ts`: listed in Prettier 3.9.6's config search (`prettier/index.mjs`).
- `.lintstagedrc.ts`: lint-staged 17.5.1 maps `.ts` to dynamic `import` (`lib/loadConfig.js`).
- `postcss.config.ts`: **not** in Next's `findConfig` list (`.json`, `.js`, `.mjs`, `.cjs`), and
  that loader reads the `postcss` key of `package.json` first. The plugin list moves there. A
  `postcss.config.ts` would be silently ignored and Tailwind would stop compiling.
- `svgo.config.ts`: svgo is not a dependency; the skill runs `pnpm dlx svgo --config <file>`, and
  svgo loads an explicit `--config` path with dynamic `import`, which Node type-strips. The skill's
  command line is updated to name the `.ts` file.

## Test runner

`"test": "node --test \"scripts/**/*.test.ts\""`. Node's `--test` glob handles it and the
`--experimental-strip-types` flag is not needed on 22.18+.

## Typing standard

`tsconfig.json` already includes `**/*.ts` and sets `strict: true`, so every converted script is
type-checked by `pnpm types:check`, the blocking gate. The standard for the conversion:

- Real types, from the JSDoc that most files already carry. No `any` unless a library forces it
  and a comment says which; prefer `unknown` plus narrowing.
- No `@ts-ignore` or `@ts-expect-error` to make a file pass.
- Exported functions get explicit parameter and return types. Local inference is fine.
- `JSON.parse`, `RegExp` match groups, `Object.entries` and `process.argv` are the usual sources
  of `unknown`/`undefined`; narrow them where they are read, not with a cast at the call.
- Comments that explain why a file was `.mjs` (`lib/site-url.mjs` has one, CLAUDE.md and
  INTERNALS.md restate it) are rewritten to the new reason, not deleted.

## Renames that ripple into generated output and docs

- `scripts/generate-precompile-tables.mjs` is written into every precompile partial's do-not-edit
  marker (16 files), `scripts/data/contract-addresses.data.mjs` into the contract-address partial,
  and `scripts/generate-partials-catalog.mjs` into `CATALOG.md`. Change the generator, regenerate,
  and `precompiles:check`, `contracts:check` and `partials:check` prove the output matches.
- `move-doc` writes between markers in `redirects.config.mjs` and `legacy-destinations` rewrites
  two literals in `scripts/lib/legacy-redirects.mjs`; both name their target by path.
- 45 non-import string references to `.mjs` paths inside `scripts/` and `lib/` (test fixtures,
  usage text, generator markers), listed by `grep -rn "\.mjs" scripts lib`.
- `.github/workflows/ci.yml` (2 commands) and `upstream-refresh.yml` (2 commands).
- `.lintstagedrc` globs, `.prettierignore`, `.husky/pre-commit` comments.
- README.md, INTERNALS.md, CONTRIBUTE.md and CLAUDE.md: every repo path ending in `.mjs`.
- `.claude/skills/arbitrum-brand-svg-diagrams/SKILL.md`: the svgo command line.

## Work split

Phase 1 (this session, on the branch): infrastructure and proof. `tsconfig.json`, `package.json`,
`next.config.ts`, `lib/site-url.ts` with its test, `prettier.config.ts`, `.lintstagedrc.ts`,
`svgo.config.ts`, the `postcss` key. Gate: `pnpm types:check`, `pnpm test`, `pnpm build`.

Phase 2 (seven parallel agents, each in its own worktree cut from the phase 1 commit, converting a
disjoint cluster; a cross-cluster import keeps its `.mjs` specifier until phase 3, and a renamed
file that an outside importer still names keeps a one-line `export * from './x.ts'` shim at its
old path, committed separately, so each worktree stays green; phase 3 deletes the shims):

| Cluster | Files                                                                                                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1      | `strip-code`, `partials`, `lib/var-links`, `lib/mdx-comments`, `lib/mdx-options`, their tests, `fonts.test`, `contribute-repo-links.test`, `partials-check`, `generate-partials-catalog`, `references-check`          |
| A2      | `doc-links`, `doc-anchors`, `check-links`, `inventory-links`, `move-doc`, `restructure`, their tests                                                                                                                  |
| B       | `content-lint` (lib + script + test), `remote-images` (lib + script + test), `vars-audit`, `announcement-link`, `vars-check`, their tests                                                                             |
| C       | `generated-partial`, `line-diff`, `contract-addresses` (+ generator, data, test), `precompile-tables` (+ generator, data, test), `nitro-node-image`, `check-nitro-release`, `fetch-edge-challenge-data`, their tests  |
| D       | `go-source`, `nitro-cli-flags`, `cli-reference-page`, `generate-cli-reference` (+ data, test), `stylus-examples`, `generate-stylus-examples` (+ data, test)                                                           |
| E1      | `lib/docs-navigation-rules`, `nav`, `nav-check`, `docs-navigation.test`, `versions-registry`, `versioned-docs-comparison`, `versioned-docs-check`, `versions-routing.test`, `faq-data`, `faq-data-check`, their tests |
| E2      | `redirects-check` (lib + script + test), `legacy-redirects` (+ test), `legacy-destinations` (+ test), `shared.test`, `llms-tracking.test`, `static-docs-http.test`                                                    |

Phase 3 (this session): merge the seven branches, flip every remaining `.mjs` import specifier to
`.ts`, drop `allowJs`, fix cross-cluster type errors, regenerate the three generated outputs,
update workflows and the four docs, and run the full `Gates` list plus `pnpm build` and the HTTP
suite against `next start`.

## Verification

The `Gates` job's list, in order: `types:check`, `test`, `vars:check`, `nav:check`,
`partials:check`, `versioned-docs-check`, `references:check`, `faq:check`, `images:presence`,
`check-links`, `contracts:check`, `format:check`, `content:lint`. Then `pnpm build`, `next start`,
`redirects:check` and `scripts/static-docs-http.test.ts` against it. Then `find . -name '*.mjs'`
outside `node_modules`, `.next` and `.source` returns nothing.
