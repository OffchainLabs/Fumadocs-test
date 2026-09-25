import type { Configuration } from 'lint-staged';

/**
 * Pre-commit checks, scoped to staged files only. Run via `.husky/pre-commit`.
 *
 * - Prettier formats every staged file type it understands, except `meta.json` (see below).
 * - Staged MDX under content/ gets prettier, then scripts/content-lint.ts, restricted to those
 *   files (see the `files` option on `lintContent` in scripts/lib/content-lint.ts) so a
 *   single-file commit does not pay for a full content-tree walk. The two run as one array entry,
 *   in sequence, because lint-staged runs separate glob entries concurrently by default (see
 *   `runParallelTasks` in lint-staged), and prettier and content-lint would otherwise race on the
 *   same file: content-lint could read the file mid-rewrite, or prettier could get killed
 *   part-way through a write when content-lint fails first.
 * - content-lint runs its full rule set, with no `--rule=` filter. It was restricted to
 *   `A1,A3,A4` while `A2` and `A5` still had pre-existing findings: enforcing a rule here that CI
 *   itself did not enforce would have rejected a commit over a defect the contributor did not
 *   introduce, with `--no-verify` as the only way out. Both rules reached zero on 2026-09-15 and
 *   `content:lint` moved into the blocking `gates` job, so the hook and CI now agree. Leaving the
 *   filter off means a rule added later is enforced here from its first commit; if a new rule
 *   lands with pre-existing findings, name the clean rules explicitly again until it reaches zero.
 * - A staged .ts/.tsx file triggers one full `pnpm types:check` for the whole project, the
 *   `() => …` function form runs once regardless of how many files matched, not once per file.
 *   Plain `tsc --noEmit` is not enough here: Next's route-handler types (e.g. `RouteContext`) and
 *   the fumadocs-mdx `.source/` collection are both generated files, and `tsc` alone fails on a
 *   fresh checkout with no `.next/types` yet. `types:check` runs `fumadocs-mdx && next typegen`
 *   first for exactly that reason (see package.json), so the hook reuses it rather than
 *   re-deriving a shorter, subtly wrong command. This is also the slow path: it regenerates
 *   `.source/`, runs `next typegen`, then type-checks the whole project, so even a one-line `.ts`
 *   edit pays for a full run, not just for the file you touched.
 */
const config: Configuration = {
  '*.{ts,tsx,md,yml,yaml,css}': 'prettier --write',
  // Every *.json file except meta.json. meta.json is generator output (`stringifyMeta` in
  // scripts/lib/doc-links.ts), which writes one array entry per line on purpose; Prettier
  // collapses a short array onto one line, so formatting it here would fight `pnpm move-doc` on
  // every run, each undoing the other's style. `.prettierignore` excludes them repo-wide for the
  // same reason, so `format:check` does not report them either and nothing is hidden here.
  '!(meta).json': 'prettier --write',
  'content/**/*.mdx': (files: readonly string[]) => [
    `prettier --write ${files.map((f) => `"${f}"`).join(' ')}`,
    `node scripts/content-lint.ts ${files.map((f) => `"${f}"`).join(' ')}`,
  ],
  '*.{ts,tsx}': () => 'pnpm run types:check',
};

export default config;
