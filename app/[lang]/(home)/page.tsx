import { Card, Cards } from 'fumadocs-ui/components/card';
import { BookOpen, Boxes, Rocket, Server } from 'lucide-react';
import Link from 'next/link';

import { i18n } from '@/lib/i18n';
import { docsRoute, gitConfig } from '@/lib/shared';

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const prefix = lang === i18n.defaultLanguage ? '' : `/${lang}`;
  const docs = (path: string) => `${prefix}${docsRoute}${path}`;

  return (
    <main className="flex flex-col flex-1">
      <section className="flex flex-col items-center justify-center text-center px-4 py-24 gap-6 bg-linear-to-b from-black to-[#565656] text-white">
        <h1 className="text-4xl font-semibold tracking-tight">Arbitrum docs</h1>
        <p className="text-white/70 max-w-xl">
          Build on the finance-native platform — apps, tokenization, and dedicated chains.
        </p>
        <div className="flex gap-3">
          <Link
            href={docs('/get-started')}
            className="rounded-md bg-fd-primary text-fd-primary-foreground px-5 py-2 font-medium"
          >
            Get started
          </Link>
          <Link
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
            className="rounded-md border border-white/30 px-5 py-2 font-medium"
          >
            GitHub
          </Link>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-4 py-16 flex flex-col gap-12">
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Get started</h2>
          <Cards>
            <Card
              icon={<Rocket />}
              title="Get started with Arbitrum"
              description="Quickstarts, guides, and reference docs for building on Arbitrum."
              href={docs('/get-started')}
            />
            <Card
              icon={<BookOpen />}
              title="Arbitrum introduction"
              description="A FAQ-style overview of Arbitrum, the finance-native platform."
              href={docs('/get-started/arbitrum-introduction')}
            />
          </Cards>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Launch an Arbitrum chain</h2>
          <Cards>
            <Card
              icon={<Boxes />}
              title="Launch an Arbitrum chain"
              description="Configure, deploy, maintain, and operate your own Arbitrum chain."
              href={docs('/launch-arbitrum-chain')}
            />
            <Card
              icon={<Rocket />}
              title="Run an L3 rollup from scratch"
              description="A simple A-Z guide to deploy a default-configured L3 Rollup chain."
              href={docs('/launch-arbitrum-chain/quickstart/deploy-your-first-rollup')}
            />
            <Card
              icon={<Server />}
              title="Run testnet infrastructure"
              description="Run your Arbitrum chain infrastructure as a production-level testnet."
              href={docs(
                '/launch-arbitrum-chain/quickstart/run-testnet-infrastructure-first-rollup',
              )}
            />
          </Cards>
        </section>
      </div>
    </main>
  );
}
