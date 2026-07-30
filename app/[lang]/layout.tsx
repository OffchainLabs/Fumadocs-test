import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import { InkeepChatButton } from '@/components/inkeep/inkeep-chat-button';
import InkeepSearchDialog from '@/components/inkeep/inkeep-search';
import { i18nUI } from '@/lib/layout.shared';

import 'katex/dist/katex.css';

import '../global.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  // Icons live in public/ (not app/, which would recreate the app/favicon.ico
  // route that broke the Vercel build). Declared explicitly so Next emits the
  // <link> tags. `sizes: 'any'` on the .ico mirrors Next's app/favicon.ico
  // convention and lets browsers reliably pick the multi-size icon. The Arbitrum
  // mark sits on an opaque #213147 tile so its white internal elements stay
  // visible on both light and dark tab strips.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-icon.png',
  },
};

// Aeonik is the Arbitrum brand typeface, self-hosted from arbitrum-docs.
// Only 400 and 500 exist — there is no Bold or Black face. Heading weights are
// clamped to 500 in global.css so nothing requests a weight the browser would
// have to synthesize. Fallback stack copied from arbitrum-docs _variables.scss.
const sans = localFont({
  variable: '--font-sans',
  display: 'swap',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
  src: [
    { path: '../../public/fonts/aeonik-regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/aeonik-medium.woff2', weight: '500', style: 'normal' },
  ],
});

const mono = localFont({
  variable: '--font-mono',
  display: 'swap',
  fallback: [
    'ui-monospace',
    'SF Mono',
    'Cascadia Code',
    'Segoe UI Mono',
    'Menlo',
    'Monaco',
    'Consolas',
    'monospace',
  ],
  src: [{ path: '../../public/fonts/aeonik-fono-regular.woff2', weight: '400', style: 'normal' }],
});

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  return (
    <html lang={lang} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen font-sans" suppressHydrationWarning>
        <RootProvider
          i18n={i18nUI.provider(lang)}
          theme={{ attribute: 'class', defaultTheme: 'light' }}
          search={{ SearchDialog: InkeepSearchDialog }}
        >
          {children}
          <InkeepChatButton />
        </RootProvider>
      </body>
    </html>
  );
}
