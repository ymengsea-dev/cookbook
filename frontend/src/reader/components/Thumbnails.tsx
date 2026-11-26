import { useEffect, useRef, useState } from 'react';
import { classNames } from '../../shared/ui/index.ts';
import type { PDFDocumentProxy } from '../pdf/pdf.ts';
import { PdfPage } from './PdfPage.tsx';
import { PAGE_GAP, stackHeight, visiblePages, type PageSize } from '../logic/readerLayout.ts';

/** Thumbnails are this wide, in pixels; the panel is `--reader-panel-width`. */
const THUMBNAIL_WIDTH = 120;
/** Room under each thumbnail for its page number. */
const LABEL_HEIGHT = 20;

interface ThumbnailsProps {
  readonly doc: PDFDocumentProxy;
  readonly pageCount: number;
  readonly pageSize: PageSize;
  readonly current: number;
  readonly onPick: (page: number) => void;
}

/** A strip of small pages; only the ones in view are drawn (R-5). */
export function Thumbnails({ doc, pageCount, pageSize, current, onPick }: ThumbnailsProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const scale = THUMBNAIL_WIDTH / pageSize.width;
  const itemHeight = pageSize.height * scale + LABEL_HEIGHT;

  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      setHeight(element.clientHeight);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Keep the page being read in view.
  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const top = PAGE_GAP + (current - 1) * (itemHeight + PAGE_GAP);
    const outOfView = top < element.scrollTop || top + itemHeight > element.scrollTop + element.clientHeight;
    if (outOfView) element.scrollTop = top - PAGE_GAP;
  }, [current, itemHeight]);

  const { first, last } = visiblePages(pageCount, itemHeight, scrollTop, height);
  const shown: number[] = [];
  for (let page = first; page <= last; page++) shown.push(page);

  return (
    <div
      ref={scroller}
      className="h-full overflow-y-auto"
      onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop); }}
    >
      {/* Sizes come from the PDF, so they can't be tokens. */}
      <div className="relative" style={{ height: stackHeight(pageCount, itemHeight) }}>
        {shown.map((page) => (
          <button
            key={page}
            type="button"
            className={classNames(
              'absolute inset-x-0 flex flex-col items-center gap-1 p-0 border-0 bg-transparent text-xs tabular-nums',
              page === current ? 'text-ink font-semibold' : 'text-ink-secondary',
            )}
            style={{ top: PAGE_GAP + (page - 1) * (itemHeight + PAGE_GAP), height: itemHeight }}
            aria-label={`Page ${String(page)}`}
            aria-current={page === current ? 'page' : undefined}
            onClick={() => { onPick(page); }}
          >
            <span className={classNames('block rounded-sm', page === current && 'outline-2 outline-accent')}>
              <PdfPage doc={doc} pageNumber={page} scale={scale} />
            </span>
            {page}
          </button>
        ))}
      </div>
    </div>
  );
}
