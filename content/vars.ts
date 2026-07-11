import { z } from 'zod';

import varsJson from './vars.json';

/**
 * Build-time global variables (replaces Docusaurus's `globalVars.js` +
 * `markdown-preprocessor.js` @@varName@@ substitution).
 *
 * Writers edit `vars.json` (pure JSON, no TypeScript knowledge required).
 * This module validates the JSON against the schema and exports typed values
 * consumed by the `<Var>` MDX component.
 *
 * On schema mismatch, `parse()` throws at module-load time with a precise
 * field-level error message — surfaces immediately in `pnpm dev` console and
 * in CI typecheck.
 */
const varsSchema = z.object({
  latestNitroVersion: z.string(),
  latestArbOS: z.string(),
  arbOneChainId: z.number(),
  novaChainId: z.number(),
  nitroDocsRepo: z.url(),
  latestNitroNodeImage: z.string(),
  nitroVersionTag: z.string(),
  nitroRepositorySlug: z.string(),
  nitroPathToArbos: z.string(),
  nitroPathToArbosState: z.string(),
  nitroPathToPrecompiles: z.string(),
  nitroPathToStorage: z.string(),
});

export const vars = varsSchema.parse(varsJson);

export type VarKey = keyof typeof vars;
