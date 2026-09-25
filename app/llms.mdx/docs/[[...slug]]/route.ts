import { notFound } from 'next/navigation';

import {
  archiveMarkdownParams,
  getArchiveLLMText,
  getLLMText,
  getPageMarkdownUrl,
  resolveDocsPath,
  source,
} from '@/lib/source';

export const revalidate = false;
/**
 * The same static-routing contract the HTML route carries (`app/docs/[[...slug]]/page.tsx`): a path
 * outside `generateStaticParams` is a 404 Next answers by itself, before this handler runs.
 * `dynamicParams` applies to a route handler that has a `generateStaticParams`, not only to a page.
 *
 * Without it, every miss costs an invocation and, worse, hands an arbitrary URL segment to the
 * resolver chain. That is how a slug naming an `Object.prototype` key reached `getArchive` and
 * turned a 404 into an unhandled 500. `versionSources` now guards that lookup, so this is the
 * second half of a two-part fix rather than the whole of it: the guard is where the invariant
 * belongs, and this is what keeps the next defect in the resolver chain off the public path too.
 */
export const dynamicParams = false;

export async function GET(_req: Request, { params }: RouteContext<'/llms.mdx/docs/[[...slug]]'>) {
  const { slug } = await params;
  // Dropping the trailing `content.md` leaves the docs slug this mirror belongs to. For an archive
  // that slug still carries its version id, which is what `resolveDocsPath` reads: live page
  // first, so a real page can never be answered with somebody's archive.
  const resolved = resolveDocsPath(slug?.slice(0, -1));
  if (!resolved) notFound();

  const { page, archive } = resolved;

  return new Response(archive ? await getArchiveLLMText(page, archive) : await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown',
      // This response also serves negotiated /docs URLs. Keep the variant marker on the
      // prerendered response itself so it survives Next's rewrite response handling.
      Vary: 'Accept',
      // An archive's HTML carries `robots: { index: false, follow: true }` plus a canonical to the
      // live page (FS-2698: an outdated node-operator guide outranking the live one gets stale
      // operational instructions followed in production). A markdown body can hold neither tag, so
      // the same decision is stated in the only place a plain-text response has for it. Live pages
      // send no such header, exactly as before.
      ...(archive ? { 'X-Robots-Tag': 'noindex, follow' } : {}),
    },
  });
}

export function generateStaticParams() {
  return [
    ...source.getPages().map((page) => ({ slug: getPageMarkdownUrl(page).segments })),
    // Archived versions get the same three request shapes live pages have (FS-2711). Prerendering
    // them here is what puts `/docs/<slug>/<id>.md` and the negotiated archive URL on a built file
    // rather than a render per request, since both rewrite onto this route.
    ...archiveMarkdownParams(),
  ];
}
