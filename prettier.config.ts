import offchainConfig from '@offchainlabs/prettier-config';
import type { Config } from 'prettier';

/**
 * Offchain Labs shared Prettier config, plus the @trivago import-sort plugin it configures. The
 * shared config supplies the `importOrder*` options; Prettier 3 requires the plugin itself to be
 * registered explicitly, which the shared config does not do.
 */
const config: Config = {
  ...offchainConfig,
  plugins: ['@trivago/prettier-plugin-sort-imports'],
};

export default config;
