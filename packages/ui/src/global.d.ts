import type { RendererApi } from '@notes/ipc-contract';

declare global {
  interface Window {
    readonly api: RendererApi;
  }
}
