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
 * Exclude partial files (prefix `_`) from the doc collection.
 * Partials are content fragments meant to be inlined via the Fumadocs
 * `<include>` directive — they have no frontmatter and must not be routed.
 */
const partialExclusions = ['**/_*.mdx', '**/_*.md'];

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: arbitrumPageSchema,
    files: ['**/*.{md,mdx}', ...partialExclusions.map((p) => `!${p}`)],
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
    files: ['**/meta.json', ...partialExclusions.map((p) => `!${p}`)],
  },
});

export default defineConfig({
  mdxOptions: {
    // Fumadocs-mdx already wires `remark-include` internally (verified in
    // dist/build-mdx-*.js). The `<include>` MDX directive works out of the box
    // — no additional remark plugins required for partial inclusion.
  },
});
