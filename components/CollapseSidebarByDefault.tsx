'use client';

import { useSidebar } from 'fumadocs-ui/layouts/notebook/slots/sidebar';
import { useEffect, useRef } from 'react';

/**
 * Collapses the notebook sidebar once on initial load, so the docs open with
 * the sidebar hidden. The collapse toggle still lets readers open it, and we
 * only force the state on first mount so we don't fight later user interaction.
 *
 * Fumadocs has no prop to start the sidebar collapsed (its provider hardcodes
 * `collapsed = useState(false)`), so we drive it through the public hook.
 */
export function CollapseSidebarByDefault() {
  const { setCollapsed } = useSidebar();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    setCollapsed(true);
  }, [setCollapsed]);

  return null;
}
