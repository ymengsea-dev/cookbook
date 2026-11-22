import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../shared/ui/index.ts';

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
}

/** A "⋯" button with a small menu. Closes on Escape, on a click outside, or after a choice. */
export function Menu({ label, items, children }: MenuProps) {
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
      className="view-menu"
      ref={root}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <button
        type="button"
        className="icon-button view-menu__button"
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
        <div className="view-menu__panel" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="view-menu__item"
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
