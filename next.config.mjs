import { createMDX } from 'fumadocs-mdx/next';

import { redirects } from './redirects.config.mjs';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async redirects() {
    return redirects;
  },
};

export default withMDX(config);
