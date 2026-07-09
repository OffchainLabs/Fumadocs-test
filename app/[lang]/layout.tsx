import type { Metadata } from 'next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Geist, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { i18nUI } from '@/lib/layout.shared';
import '../global.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  ),
  // favicon.ico lives in public/ (not app/, which would recreate the
  // app/favicon.ico route that broke the Vercel build). Declare it
  // explicitly so Next emits <link rel="icon"> rather than relying on the
  // implicit browser request.
  icons: { icon: '/favicon.ico' },
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
    <html
      lang={lang}
      className={`${geist.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen font-sans">
        <RootProvider
          i18n={i18nUI.provider(lang)}
          theme={{ attribute: 'class', defaultTheme: 'light' }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
