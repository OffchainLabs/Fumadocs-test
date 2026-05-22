import { NextRequest, NextResponse, NextFetchEvent } from 'next/server';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware';
import { docsContentRoute, docsRoute } from '@/lib/shared';
import { i18n } from '@/lib/i18n';

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.md`,
  `${docsContentRoute}{/*path}/content.md`,
);

const i18nMiddleware = createI18nMiddleware(i18n);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const path = request.nextUrl.pathname;
  // Site-wide routes that are NOT locale-prefixed. Skip i18n + content-negotiation.
  if (
    path.startsWith('/_next/') ||
    path.startsWith('/img/') ||
    path === '/favicon.ico' ||
    path === '/llms.txt' ||
    path === '/llms-full.txt' ||
    path.startsWith('/llms.mdx/') ||
    path.startsWith('/og/') ||
    path.startsWith('/api/')
  ) {
    return NextResponse.next();
  }

  // 1. Explicit `.md` suffix: rewrite to the markdown route.
  const suffixResult = rewriteSuffix(request.nextUrl.pathname);
  if (suffixResult) {
    return NextResponse.rewrite(new URL(suffixResult, request.nextUrl));
  }

  // 2. Content negotiation: `Accept: text/markdown` rewrites to the .md route.
  if (isMarkdownPreferred(request)) {
    const negResult = rewriteDocs(request.nextUrl.pathname);
    if (negResult) {
      return NextResponse.rewrite(new URL(negResult, request.nextUrl));
    }
  }

  // 3. Locale handling (en | zh-CN | ja). With `hideLocale: 'default-locale'`,
  // English keeps clean paths; non-default locales get a `/zh-CN/...` or
  // `/ja/...` prefix.
  return i18nMiddleware(request, event);
}
