import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { NextRequest, NextResponse } from 'next/server';

import { docsContentRoute, docsRoute } from '@/lib/shared';

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.md`,
  `${docsContentRoute}{/*path}/content.md`,
);

export default function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Routes served verbatim — skip markdown content-negotiation entirely.
  if (
    path.startsWith('/_next/') ||
    path.startsWith('/img/') ||
    path === '/favicon.ico' ||
    path === '/icon.png' ||
    path === '/apple-icon.png' ||
    path === '/nitro-whitepaper.pdf' ||
    path.startsWith('/audit-reports/') ||
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

  return NextResponse.next();
}
