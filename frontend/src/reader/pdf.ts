import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist';
import { invoke } from '../shared/ipc/index.ts';
import { usableTitle } from './bookText.ts';

export type { PDFDocumentProxy, PDFPageProxy, RenderTask };

/** Covers are drawn this wide, in pixels: sharp on a Retina library card, still small. */
const COVER_WIDTH = 320;
const COVER_QUALITY = 0.82;

/**
 * Hands PDF.js its character maps and standard fonts over IPC, from files bundled with
 * the app. The CSP allows no `fetch`, so PDF.js can't load them itself.
 */
class IpcDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    let dataKind: 'cMap' | 'standardFont';
    if (kind === 'cMapUrl') {
      dataKind = 'cMap';
    } else if (kind === 'standardFontDataUrl') {
      dataKind = 'standardFont';
    } else {
      throw new Error(`The reader has no ${kind} files.`);
    }
    const bytes = await invoke('reader_data', { kind: dataKind, name: filename });
    return new Uint8Array(bytes);
  }
}

function distUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

/** Opens a PDF from the vault in PDF.js (R-3). Pass it to `closePdf` when done. */
export async function openPdf(path: string): Promise<PDFDocumentProxy> {
  // Copied into dist/pdfjs by scripts/build.mjs.
  GlobalWorkerOptions.workerSrc = distUrl('pdfjs/pdf.worker.mjs');
  const bytes = await invoke('book_read', { path });
  const task = getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    BinaryDataFactory: IpcDataFactory,
    // Only names: IpcDataFactory loads the files, but PDF.js asks only when these are set.
    cMapUrl: 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'standard_fonts/',
    // Scanned books use the plain-JS image decoders, because the CSP blocks wasm.
    useWasm: false,
    wasmUrl: distUrl('pdfjs/wasm/'),
  });
  return task.promise;
}

/** Frees the book's memory and its worker. */
export function closePdf(doc: PDFDocumentProxy): void {
  void doc.loadingTask.destroy();
}

export interface BookDetails {
  readonly title: string | null;
  readonly pages: number;
  readonly cover: Uint8Array;
}

/** The title, page count and a cover image of page one (R-1). */
export async function readDetails(doc: PDFDocumentProxy): Promise<BookDetails> {
  const { info } = await doc.getMetadata();
  const title = 'Title' in info ? usableTitle(info.Title) : null;
  const cover = await renderCover(await doc.getPage(1));
  return { title, pages: doc.numPages, cover };
}

async function renderCover(page: PDFPageProxy): Promise<Uint8Array> {
  const natural = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: COVER_WIDTH / natural.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', COVER_QUALITY);
  });
  if (blob === null) throw new Error('The cover could not be drawn.');
  return new Uint8Array(await blob.arrayBuffer());
}
