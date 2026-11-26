import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CardDrop } from '../logic/board.ts';

// A press must move this far before it counts as a drag, so plain clicks still open the card.
const DRAG_THRESHOLD_PX = 4;

/** Where the card would land if dropped now. */
export interface DropTarget {
  readonly column: string;
  readonly beforeKey: string | null;
}

export interface CardDrag {
  /** The card being dragged, or null. */
  readonly draggingKey: string | null;
  readonly target: DropTarget | null;
  readonly startPress: (event: ReactPointerEvent, cardKey: string) => void;
  /** True right after a drag, so the click that ends it doesn't open the note. */
  readonly endedDrag: () => boolean;
}

interface Press {
  readonly cardKey: string;
  readonly x: number;
  readonly y: number;
  dragging: boolean;
}

/**
 * Drags cards with pointer events rather than HTML drag and drop, which the Tauri
 * window can intercept for file drops. Columns carry `data-board-column`, cards `data-card-key`.
 */
export function useCardDrag(onDrop: (drop: CardDrop) => void): CardDrag {
  const press = useRef<Press | null>(null);
  const justDragged = useRef(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const dropHandler = useRef(onDrop);
  useEffect(() => {
    dropHandler.current = onDrop;
  });

  const onMove = useCallback((event: PointerEvent) => {
    const current = press.current;
    if (current === null) return;
    if (!current.dragging) {
      const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
      if (distance < DRAG_THRESHOLD_PX) return;
      current.dragging = true;
      setDraggingKey(current.cardKey);
    }
    setTarget(targetAt(event.clientX, event.clientY));
  }, []);

  const onUp = useCallback(
    (event: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      const current = press.current;
      press.current = null;
      setDraggingKey(null);
      setTarget(null);
      if (current === null || !current.dragging) return;
      justDragged.current = true;
      const dropAt = targetAt(event.clientX, event.clientY);
      // Dropping a card just above itself leaves it where it was.
      if (dropAt === null || dropAt.beforeKey === current.cardKey) return;
      dropHandler.current({ cardKey: current.cardKey, toColumn: dropAt.column, beforeKey: dropAt.beforeKey });
    },
    [onMove],
  );

  const startPress = useCallback(
    (event: ReactPointerEvent, cardKey: string) => {
      if (event.button !== 0) return;
      press.current = { cardKey, x: event.clientX, y: event.clientY, dragging: false };
      justDragged.current = false;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [onMove, onUp],
  );

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  const endedDrag = useCallback(() => {
    const ended = justDragged.current;
    justDragged.current = false;
    return ended;
  }, []);

  return { draggingKey, target, startPress, endedDrag };
}

/** The column under the pointer, and the card the drop goes above (null for the bottom). */
function targetAt(x: number, y: number): DropTarget | null {
  const element = document.elementFromPoint(x, y);
  const column = element?.closest<HTMLElement>('[data-board-column]');
  const value = column?.dataset.boardColumn;
  if (column === undefined || column === null || value === undefined) return null;

  const card = element?.closest<HTMLElement>('[data-card-key]');
  if (card === undefined || card === null) return { column: value, beforeKey: null };
  const box = card.getBoundingClientRect();
  if (y < box.top + box.height / 2) return { column: value, beforeKey: card.dataset.cardKey ?? null };

  // Below the middle of a card means above the next card, skipping the drop line.
  let next = card.nextElementSibling;
  while (next instanceof HTMLElement && next.dataset.cardKey === undefined) next = next.nextElementSibling;
  const nextKey = next instanceof HTMLElement ? next.dataset.cardKey : undefined;
  return { column: value, beforeKey: nextKey ?? null };
}
