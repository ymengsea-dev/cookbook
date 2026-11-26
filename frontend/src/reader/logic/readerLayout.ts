// Page layout for the reader (R-3): zoom, where each page sits, which pages are on screen,
// and how a scroll position turns into a page and a position on it (R-4).

/** A page's size at 100% zoom, in CSS pixels. */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export type Zoom = { readonly kind: 'fitWidth' } | { readonly kind: 'fitPage' } | { readonly kind: 'custom'; readonly scale: number };

export type Layout = 'scroll' | 'single';

/** Where reading stopped: a page counting from 1, and how far down it, from 0 to 1. */
export interface ReadingSpot {
  readonly page: number;
  readonly position: number;
}

/** Space between pages and around them, in pixels. Matches `--space-4`. */
export const PAGE_GAP = 16;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.25;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** The scale a zoom setting gives for a page shown in a viewport. */
export function zoomScale(zoom: Zoom, page: PageSize, viewport: PageSize): number {
  if (zoom.kind === 'custom') return clampScale(zoom.scale);
  const fitWidth = (viewport.width - PAGE_GAP * 2) / page.width;
  if (zoom.kind === 'fitWidth') return clampScale(fitWidth);
  const fitHeight = (viewport.height - PAGE_GAP * 2) / page.height;
  return clampScale(Math.min(fitWidth, fitHeight));
}

export function zoomIn(scale: number): Zoom {
  return { kind: 'custom', scale: clampScale(scale * ZOOM_STEP) };
}

export function zoomOut(scale: number): Zoom {
  return { kind: 'custom', scale: clampScale(scale / ZOOM_STEP) };
}

/** The top of every page in a scrolling stack where each page is `pageHeight` tall. */
export function pageTops(pages: number, pageHeight: number): number[] {
  const tops: number[] = [];
  for (let index = 0; index < pages; index++) {
    tops.push(PAGE_GAP + index * (pageHeight + PAGE_GAP));
  }
  return tops;
}

export function stackHeight(pages: number, pageHeight: number): number {
  return PAGE_GAP + pages * (pageHeight + PAGE_GAP);
}

/** The first and last page (from 1) with any part on screen, plus one page either side. */
export function visiblePages(pages: number, pageHeight: number, scrollTop: number, viewportHeight: number) {
  const step = pageHeight + PAGE_GAP;
  const first = Math.floor((scrollTop - PAGE_GAP) / step) + 1;
  const last = Math.floor((scrollTop + viewportHeight - PAGE_GAP) / step) + 1;
  return { first: clampPage(first - 1, pages), last: clampPage(last + 1, pages) };
}

/** The page at the top edge of the viewport, and how far down it that edge is. */
export function spotAt(pages: number, pageHeight: number, scrollTop: number): ReadingSpot {
  const step = pageHeight + PAGE_GAP;
  const offset = Math.max(0, scrollTop - PAGE_GAP);
  const page = clampPage(Math.floor(offset / step) + 1, pages);
  const intoPage = offset - (page - 1) * step;
  const position = Math.min(1, Math.max(0, intoPage / pageHeight));
  return { page, position: Math.round(position * 1000) / 1000 };
}

/** The scroll position that puts `spot` at the top edge of the viewport. */
export function scrollTopFor(spot: ReadingSpot, pageHeight: number): number {
  const top = PAGE_GAP + (spot.page - 1) * (pageHeight + PAGE_GAP);
  return top + spot.position * pageHeight;
}

export function clampPage(page: number, pages: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.round(page)), Math.max(1, pages));
}

/** Percent read, as shown in the library and the reader: page 120 of 300 is 40%. */
export function percentRead(page: number, pages: number): number {
  if (pages <= 0) return 0;
  return Math.round((clampPage(page, pages) / pages) * 100);
}
