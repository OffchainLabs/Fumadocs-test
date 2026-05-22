import { vars, type VarKey } from '@/content/vars';

/**
 * Server component that renders a global variable inline in MDX.
 *
 * Usage in MDX:
 *   <Var name="latestNitroVersion" />
 *
 * TypeScript narrows `name` to the keys of `vars`, so typos fail at build
 * time. Values are read at render time from the typed `vars` module (single
 * source of truth = `content/vars.json`).
 */
export function Var({ name }: { name: VarKey }) {
  return <>{String(vars[name])}</>;
}
