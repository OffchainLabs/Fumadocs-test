'use client';

import { type ReactNode } from 'react';
import { MDXProvider } from '@mdx-js/react';
import { HoverPopover } from '@/components/HoverPopover';
import './styles.css';

// Static imports of partial MDX files — keeps partials at their canonical v2
// location (single source of truth). Works because next.config.mjs uses
// createMDX() from fumadocs-mdx/next, which configures the webpack loader to
// compile .mdx as React component modules.
import ConfigCustomGasToken from '@/content/partials/launch-arbitrum-chain/features/_custom-gas-token-pc.mdx';
import ConfigAltDa from '@/content/partials/launch-arbitrum-chain/features/_alt-da-pc.mdx';
import ConfigDedicatedThroughput from '@/content/partials/launch-arbitrum-chain/_config-dedicated-throughput.mdx';
import ConfigNativeEth from '@/content/partials/launch-arbitrum-chain/features/_native-eth-pc.mdx';
import ConfigHardware from '@/content/partials/launch-arbitrum-chain/_config-hardware.mdx';
import ConfigRollup from '@/content/partials/launch-arbitrum-chain/features/_rollup-pc.mdx';
import ConfigAnytrust from '@/content/partials/launch-arbitrum-chain/features/_anytrust-pc.mdx';
import ConfigFastwithdrawals from '@/content/partials/launch-arbitrum-chain/features/_fast-withdrawals-pc.mdx';
import ConfigTimeboost from '@/content/partials/launch-arbitrum-chain/features/_timeboost-pc.mdx';
import ConfigBold from '@/content/partials/launch-arbitrum-chain/features/_bold-pc.mdx';
import ConfigPermissionedValidators from '@/content/partials/launch-arbitrum-chain/features/_permissioned-validators-pc.mdx';
import ConfigL1ChallengePeriod from '@/content/partials/launch-arbitrum-chain/_config-l1-challenge-period.mdx';
import ConfigForceInclusion from '@/content/partials/launch-arbitrum-chain/_config-force-inclusion.mdx';
import ConfigAccountAbstraction from '@/content/partials/launch-arbitrum-chain/_config-account-abstraction.mdx';
import ConfigCustomizableGovernance from '@/content/partials/launch-arbitrum-chain/_config-customizable-governance.mdx';
import ConfigDataPostingCosts from '@/content/partials/launch-arbitrum-chain/_config-data-posting-costs.mdx';
import ConfigEVMCompatibility from '@/content/partials/launch-arbitrum-chain/_config-evm-compatbility.mdx';
import ConfigOtherLanguageSupport from '@/content/partials/launch-arbitrum-chain/_config-other-language-support.mdx';

const contentMap: Record<string, React.ComponentType> = {
  'config-custom-gas-token': ConfigCustomGasToken,
  'config-alt-da': ConfigAltDa,
  'config-dedicated-throughput': ConfigDedicatedThroughput,
  'config-native-eth': ConfigNativeEth,
  'config-hardware': ConfigHardware,
  'config-rollup': ConfigRollup,
  'config-anytrust': ConfigAnytrust,
  'config-fast-withdrawals': ConfigFastwithdrawals,
  'config-timeboost': ConfigTimeboost,
  'config-bold': ConfigBold,
  'config-permissioned-validators': ConfigPermissionedValidators,
  'config-l1-challenge-period': ConfigL1ChallengePeriod,
  'config-force-inclusion': ConfigForceInclusion,
  'config-account-abstraction': ConfigAccountAbstraction,
  'config-customizable-governance': ConfigCustomizableGovernance,
  'config-data-posting-costs': ConfigDataPostingCosts,
  'config-evm-compatibility': ConfigEVMCompatibility,
  'config-other-language-support': ConfigOtherLanguageSupport,
};

const mdxComponents = {
  h1: ({ children }: { children?: ReactNode }) => <h1 className="floating-modal__title">{children}</h1>,
  h2: ({ children }: { children?: ReactNode }) => <h2 className="floating-modal__subtitle">{children}</h2>,
  p: ({ children }: { children?: ReactNode }) => <p className="floating-modal__paragraph">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="floating-modal__list">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="floating-modal__list">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="floating-modal__list-item">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="floating-modal__strong">{children}</strong>,
  code: ({ children }: { children?: ReactNode }) => <code className="floating-modal__inline-code">{children}</code>,
  table: ({ children }: { children?: ReactNode }) => <table className="floating-modal__table">{children}</table>,
  thead: ({ children }: { children?: ReactNode }) => <thead>{children}</thead>,
  tbody: ({ children }: { children?: ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: ReactNode }) => <tr>{children}</tr>,
  th: ({ children }: { children?: ReactNode }) => <th className="floating-modal__th">{children}</th>,
  td: ({ children }: { children?: ReactNode }) => <td className="floating-modal__td">{children}</td>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} className="floating-modal__link" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

export function FloatingHoverModal({ href, children }: { href: string; children: ReactNode }) {
  const extractContentKey = (h: string): string | null => {
    const match = h.match(/\/partials\/_?([\w-]+)\.mdx?$/) ?? h.match(/\/partials\/([\w-]+)$/);
    return match ? match[1] : null;
  };

  const contentKey = extractContentKey(href);
  const ContentComponent = contentKey ? contentMap[contentKey] : undefined;

  const content = ContentComponent ? (
    <MDXProvider components={mdxComponents}>
      <ContentComponent />
    </MDXProvider>
  ) : (
    <div className="floating-modal__error">
      <h2 className="floating-modal__subtitle">Content not available</h2>
      <p className="floating-modal__paragraph">The content for &quot;{contentKey}&quot; is not currently available.</p>
    </div>
  );

  return (
    <HoverPopover variant="modal" content={content}>
      {children}
    </HoverPopover>
  );
}
