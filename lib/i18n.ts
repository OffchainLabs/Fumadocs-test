import { defineI18n } from 'fumadocs-core/i18n';

/**
 * Fumadocs i18n configuration.
 *
 * - `parser: 'dir'` — content lives under `content/docs/{locale}/...`.
 * - `hideLocale: 'default-locale'` — English (default) has no locale prefix
 *   (`/docs/...`); other locales are prefixed (`/zh-CN/docs/...`, `/ja/docs/...`).
 *   Avoids the `Vary: Cookie` cache-buster that `'always'` would force.
 */
export const i18n = defineI18n({
  defaultLanguage: 'en',
  languages: ['en', 'zh-CN', 'ja'],
  hideLocale: 'default-locale',
  parser: 'dir',
});
