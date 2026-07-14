import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { CSSProperties, ReactNode } from 'react';

import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  const base = baseOptions(lang);
  return (
    <DocsLayout
      {...base}
      tree={source.pageTree[lang]}
      links={base.links?.filter((item) => item.type === 'icon')}
      tabs={{
        transform(option, node) {
          if (!node.icon) return option;
          return {
            ...option,
            icon: (
              <div
                className="[&_svg]:size-full size-full rounded-md border p-1.5 text-fd-primary max-md:bg-fd-primary/10"
                style={{ '--tab-color': 'var(--color-fd-primary)' } as CSSProperties}
              >
                {node.icon}
              </div>
            ),
          };
        },
      }}
    >
      {children}
    </DocsLayout>
  );
}
