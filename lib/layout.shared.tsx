import { defineI18nUI } from 'fumadocs-ui/i18n';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BookOpen, Braces, Code } from 'lucide-react';

import { OffchainMark } from '@/components/OffchainMark';

import { i18n } from './i18n';
import { appName, docsRoute, gitConfig } from './shared';

/**
 * UI translations + display names for each locale.
 * Wired into RootProvider via `i18nUI.provider(lang)` in the root layout.
 * `en` entries act as defaults for other locales when a key is missing.
 */
export const i18nUI = defineI18nUI(i18n, {
  'en': { displayName: 'English' },
  'zh-CN': { displayName: '简体中文', search: '搜索文档' },
  'ja': { displayName: '日本語', search: 'ドキュメントを検索' },
});

/** Shared styling for the secondary icons in the "Build apps" menu. */
const menuIconClass = 'bg-fd-primary text-fd-primary-foreground mb-2 rounded-md p-1';

export function baseOptions(locale: string): BaseLayoutProps {
  const prefix = locale === i18n.defaultLanguage ? '' : `/${locale}`;
  const docHref = (section: string) => `${prefix}${docsRoute}/${section}`;
  return {
    nav: {
      title: (
        <>
          <OffchainMark className="h-5 w-auto" />
          {appName}
        </>
      ),
    },
    links: [
      // Primary entry points only. Run a chain, Run a node, How Arbitrum works,
      // Bridge, and Notices are reached through the root:true sidebar tabs
      // (content/docs/en/*/meta.json), so they are intentionally not mirrored here.
      { text: 'Get started', url: docHref('get-started') },
      {
        type: 'menu',
        text: 'Build apps',
        items: [
          {
            icon: <Code />,
            text: 'Solidity',
            description: 'Deploy Solidity smart contracts to Arbitrum chains.',
            url: docHref('build-decentralized-apps'),
            menu: {
              className: 'md:row-span-2',
              banner: (
                <div className="-mx-3 -mt-3 flex flex-col justify-end rounded-t-lg bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 p-4 pt-20 text-white">
                  <p className="text-base font-semibold">Build apps on Arbitrum</p>
                  <p className="text-sm text-white/80">
                    Deploy smart contracts and decentralized apps.
                  </p>
                </div>
              ),
            },
          },
          {
            icon: <Braces className={menuIconClass} />,
            text: 'Stylus',
            description: 'Write contracts in Rust, C, and C++ that compile to WebAssembly.',
            url: docHref('stylus'),
            menu: { className: 'lg:col-start-2' },
          },
          {
            icon: <BookOpen className={menuIconClass} />,
            text: 'Arbitrum essentials',
            description: 'Bridging, precompiles, the NodeInterface, and platform reference.',
            url: docHref('arbitrum-essentials'),
            menu: { className: 'lg:col-start-2' },
          },
        ],
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    i18n: true,
  };
}
