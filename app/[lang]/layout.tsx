import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { InkeepChatButton } from '@/components/inkeep/inkeep-chat-button';
import InkeepSearchDialog from '@/components/inkeep/inkeep-search';
import { i18nUI } from '@/lib/layout.shared';

import '../global.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  // Icons live in public/ (not app/, which would recreate the app/favicon.ico
  // route that broke the Vercel build). Declared explicitly so Next emits the
  // <link> tags. `sizes: 'any'` on the .ico mirrors Next's app/favicon.ico
  // convention and lets browsers reliably pick the multi-size icon. The white
  // Offchain hexagon on a charcoal tile stays visible on both light and dark
  // tab strips.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-icon.png',
  },
};

const geist = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
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
    <html lang={lang} className={`${geist.variable} ${mono.variable}`} suppressHydrationWarning>
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
