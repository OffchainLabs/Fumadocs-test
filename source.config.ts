import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';

/**
 * Per PRD §4.1, every doc page requires:
 *   title, description, content_type, author, sme
 * Optional:
 *   sidebar_label, user_story, draft
 *
 * The PRD's frontmatter contract is enforced at build time by Zod.
 * Build/validate fails on any MDX file missing a required field.
 */
const arbitrumPageSchema = pageSchema.extend({
  description: z.string(),
  sidebar_label: z.string().optional(),
  user_story: z.string().optional(),
  content_type: z.enum([
    'how-to',
    'concept',
    'quickstart',
    'tutorial',
    'reference',
    'troubleshooting',
    'faq',
  ]),
  author: z.string(),
  sme: z.string(),
  draft: z.boolean().default(false),
});

/**
 * Partials live in `content/partials/` — outside the doc collection `dir` entirely — so they can
 * never be routed and need no glob exclusion here. They are inlined via `<include cwd>…</include>`.
 * `scripts/partials-check.mjs` enforces that no `_`-prefixed file reappears under content/docs.
 */
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: arbitrumPageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    // Fumadocs-mdx already wires `remark-include` internally (verified in
    // dist/build-mdx-*.js). The `<include>` MDX directive works out of the box
    // — no additional remark plugins required for partial inclusion.
  },
});
