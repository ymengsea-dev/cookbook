/** Work that must finish before the app quits, such as saving the open note. */
type Flush = () => Promise<void>;

const flushes = new Set<Flush>();

/** Registers work to run before quitting. Returns a function that removes it. */
export function onBeforeQuit(flush: Flush): () => void {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

/** Runs every registered flush. A failing flush does not stop the others. */
export async function flushBeforeQuit(): Promise<void> {
  await Promise.allSettled([...flushes].map((flush) => flush()));
}
