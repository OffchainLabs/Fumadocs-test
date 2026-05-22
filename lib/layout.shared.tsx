import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { appName, gitConfig } from './shared';
import { i18n } from './i18n';

/**
 * UI translations + display names for each locale.
 * Wired into RootProvider via `i18nUI.provider(lang)` in the root layout.
 * `en` entries act as defaults for other locales when a key is missing.
 */
export const i18nUI = defineI18nUI(i18n, {
  en: { displayName: 'English' },
  'zh-CN': { displayName: '简体中文', search: '搜索文档' },
  ja: { displayName: '日本語', search: 'ドキュメントを検索' },
});

export function baseOptions(_locale: string): BaseLayoutProps {
  return {
    nav: {
      title: appName,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    i18n: true,
  };
}

