'use client';

import { useState, type ReactNode } from 'react';
import {
  useFloating,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  offset,
  flip,
  shift,
  autoUpdate,
  useMergeRefs,
} from '@floating-ui/react';
import './styles.css';

/**
 * Generic hover/focus popover built on `@floating-ui/react`. The single interaction primitive behind
 * both `<Reference>`/`<Term>` (tooltip variant) and `FloatingHoverModal` (modal variant). Owns open
 * state, positioning, dismissal, and the portal; consumers pass a trigger (`children`) and prebuilt
 * `content` (typically server-rendered).
 *
 * - `tooltip` — inline, opens on hover/focus, closes on leave/blur. For glossary-style term hovers.
 * - `modal` — larger, scrollable, with a close button. For the feature-selector modal.
 */
export function HoverPopover({
  children,
  content,
  title,
  variant = 'tooltip',
}: {
  children: ReactNode;
  content: ReactNode;
  title?: string;
  variant?: 'tooltip' | 'modal';
}) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [offset(10), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 5 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, { move: false, delay: { open: 150, close: 150 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: variant === 'modal' ? 'dialog' : 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  const triggerRef = useMergeRefs([refs.setReference]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="hover-popover__trigger"
        {...getReferenceProps()}
      >
        {children}
      </button>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className={`hover-popover__content hover-popover__content--${variant}`}
            {...getFloatingProps()}
          >
            {variant === 'modal' && (
              <div className="hover-popover__header">
                <button
                  type="button"
                  className="hover-popover__close"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            )}
            <div className="hover-popover__body">
              {title && <p className="hover-popover__title">{title}</p>}
              {content}
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
