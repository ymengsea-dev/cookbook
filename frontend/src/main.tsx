import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, listen } from './shared/ipc/index.ts';
import { flushBeforeQuit } from './shared/lifecycle.ts';
import { SettingsProvider } from './shared/settings/index.ts';
import { VaultProvider } from './shared/vault/index.ts';
import { AppShell } from './shell/AppShell.tsx';
import { ViewsProvider } from './views/index.ts';

// Closing the window or pressing ⌘Q waits for open notes to save (E-5).
void listen('before-quit', () => {
  void flushBeforeQuit().then(() => invoke('app_quit', {}));
});

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <VaultProvider>
      <SettingsProvider>
        <ViewsProvider>
          <AppShell />
        </ViewsProvider>
      </SettingsProvider>
    </VaultProvider>
  </StrictMode>,
);
