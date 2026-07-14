import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

import { AddressExplorerLink } from '@/components/mdx/AddressExplorerLink';
import { CustomDetails } from '@/components/mdx/CustomDetails';
import FAQStructuredData from '@/components/mdx/FAQStructuredData';
import { FloatingHoverModal } from '@/components/mdx/FloatingHoverModal';
import { ImageZoom } from '@/components/mdx/ImageZoom';
import { PendingWidget } from '@/components/mdx/PendingWidget';
import { Reference } from '@/components/mdx/Reference';
import { ReferenceList } from '@/components/mdx/ReferenceList';
import { Term } from '@/components/mdx/Term';
import { VanillaAdmonition } from '@/components/mdx/VanillaAdmonition';
import { Var } from '@/components/mdx/Var';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    AddressExplorerLink,
    AEL: AddressExplorerLink,
    CustomDetails,
    FAQStructuredData,
    FAQStructuredDataJsonLd: FAQStructuredData,
    FloatingHoverModal,
    ImageZoom,
    ImageWithCaption: ImageZoom,
    Reference,
    ReferenceList,
    Tab,
    Tabs,
    Term,
    VanillaAdmonition,
    Var,
    // Placeholders for not-yet-ported interactive widgets (see PendingWidget).
    VendingMachine: () => <PendingWidget name="VendingMachine" />,
    EdgeChallengeFlow: () => <PendingWidget name="EdgeChallengeFlow" />,
    FlowChart: () => <PendingWidget name="FlowChart" />,
    MultiDimensionalContentWidget: () => <PendingWidget name="MultiDimensionalContentWidget" />,
    GenerateTroubleshootingReportWidget: () => (
      <PendingWidget name="GenerateTroubleshootingReportWidget" />
    ),
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
