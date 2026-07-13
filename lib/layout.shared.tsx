import { defineI18nUI } from 'fumadocs-ui/i18n';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

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

export function baseOptions(locale: string): BaseLayoutProps {
  const prefix = locale === i18n.defaultLanguage ? '' : `/${locale}`;
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
      { text: 'Get started', url: `${prefix}${docsRoute}/get-started` },
      { text: 'Launch a chain', url: `${prefix}${docsRoute}/launch-arbitrum-chain` },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    i18n: true,
  };
}
