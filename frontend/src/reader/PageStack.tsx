import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { PDFDocumentProxy } from './pdf.ts';
import { PdfPage } from './PdfPage.tsx';
import {
  PAGE_GAP,
  clampPage,
  scrollTopFor,
  spotAt,
  stackHeight,
  visiblePages,
  zoomScale,
  type Layout,
  type PageSize,
  type ReadingSpot,
  type Zoom,
} from './readerLayout.ts';

interface PageStackProps {
  readonly doc: PDFDocumentProxy;
  readonly pageCount: number;
  /** Page one's size. Every slot uses it, so the stack's height is known up front. */
  readonly pageSize: PageSize;
  readonly layout: Layout;
  readonly zoom: Zoom;
  readonly spot: ReadingSpot;
  /** Scrolls to `spot` whenever this number changes, such as after "go to page". */
  readonly jumpId: number;
  readonly onSpotChange: (spot: ReadingSpot) => void;
  readonly onScaleChange: (scale: number) => void;
}

/** The pages. In scroll layout only the pages on screen are drawn, so 500 pages stay smooth (R-3). */
export function PageStack(props: PageStackProps) {
  const { doc, pageCount, pageSize, layout, zoom, spot, jumpId, onSpotChange, onScaleChange } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<PageSize | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const latestSpot = useRef(spot);

  // Declared before the jump effect below, so that effect reads the newest spot.
  useLayoutEffect(() => {
    latestSpot.current = spot;
  });

  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const scale = viewport === null ? null : zoomScale(zoom, pageSize, viewport);
  const pageHeight = scale === null ? 0 : pageSize.height * scale;

  useEffect(() => {
    if (scale !== null) onScaleChange(scale);
  }, [scale, onScaleChange]);

  // After a jump, a zoom or a layout change, put the reading spot back at the top.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null || pageHeight === 0) return;
    element.scrollTop = layout === 'scroll' ? scrollTopFor(latestSpot.current, pageHeight) : 0;
    setScrollTop(element.scrollTop);
  }, [jumpId, pageHeight, layout]);

  function onScroll() {
    const element = scroller.current;
    if (element === null || layout !== 'scroll' || pageHeight === 0) return;
    setScrollTop(element.scrollTop);
    onSpotChange(spotAt(pageCount, pageHeight, element.scrollTop));
  }

  function onKeyDown(event: KeyboardEvent) {
    if (layout !== 'single') return;
    const step = pageStep(event.key);
    if (step === 0) return;
    event.preventDefault();
    onSpotChange({ page: clampPage(spot.page + step, pageCount), position: 0 });
  }

  return (
    <div
      ref={scroller}
      className="flex-1 min-h-0 min-w-0 overflow-auto bg-paper focus-visible:outline-none"
      tabIndex={0}
      aria-label="Book pages"
      onScroll={onScroll}
      onKeyDown={onKeyDown}
    >
      {scale !== null && viewport !== null && layout === 'scroll' && (
        <ScrollPages doc={doc} pageCount={pageCount} scale={scale} pageHeight={pageHeight} pageWidth={pageSize.width * scale} scrollTop={scrollTop} viewportHeight={viewport.height} />
      )}
      {scale !== null && layout === 'single' && (
        <div className="flex justify-center p-4">
          <PdfPage doc={doc} pageNumber={spot.page} scale={scale} />
        </div>
      )}
    </div>
  );
}

interface ScrollPagesProps {
  readonly doc: PDFDocumentProxy;
  readonly pageCount: number;
  readonly scale: number;
  readonly pageHeight: number;
  readonly pageWidth: number;
  readonly scrollTop: number;
  readonly viewportHeight: number;
}

function ScrollPages({ doc, pageCount, scale, pageHeight, pageWidth, scrollTop, viewportHeight }: ScrollPagesProps) {
  const { first, last } = visiblePages(pageCount, pageHeight, scrollTop, viewportHeight);
  const shown: number[] = [];
  for (let page = first; page <= last; page++) shown.push(page);

  return (
    // Sizes come from the PDF and the zoom, so they can't be tokens.
    <div className="relative" style={{ height: stackHeight(pageCount, pageHeight), minWidth: pageWidth + PAGE_GAP * 2 }}>
      {shown.map((page) => (
        <div
          key={page}
          className="absolute inset-x-0 flex justify-center"
          style={{ top: PAGE_GAP + (page - 1) * (pageHeight + PAGE_GAP), height: pageHeight }}
        >
          <PdfPage doc={doc} pageNumber={page} scale={scale} />
        </div>
      ))}
    </div>
  );
}

function pageStep(key: string): number {
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown' || key === ' ') return 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp') return -1;
  return 0;
}
