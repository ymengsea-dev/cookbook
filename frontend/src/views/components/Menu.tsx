import { useEffect, useRef, useState, type ReactNode } from 'react';
import { classNames, Icon, styles } from '../../shared/ui/index.ts';

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
}

interface MenuProps {
  /** Accessible name of the button that opens the menu. */
  readonly label: string;
  readonly items: readonly MenuItem[];
  /** Extra controls under the items, such as a type picker. */
  readonly children?: ReactNode;
  /** Extra classes for where the menu sits in its parent. */
  readonly className?: string;
}

/** A "⋯" button with a small menu. Closes on Escape, on a click outside, or after a choice. */
export function Menu({ label, items, children, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (!(event.target instanceof Node) || root.current?.contains(event.target) !== true) setOpen(false);
    }
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open]);

  return (
    <div
      className={classNames('relative inline-flex', className)}
      ref={root}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <button
        type="button"
        className={`${styles.iconButtonShape} size-6`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div
          className="absolute z-5 top-[calc(100%+var(--space-1))] right-0 flex flex-col min-w-[calc(var(--space-14)*3)] p-1 border border-rule rounded-md bg-surface font-regular"
          role="menu"
          aria-label={label}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="py-1 px-2 border-0 rounded-sm bg-transparent text-left enabled:hover:bg-hover disabled:text-ink-secondary disabled:opacity-60"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}
