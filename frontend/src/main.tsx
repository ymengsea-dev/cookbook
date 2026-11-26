import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppearanceProvider } from './shared/appearance/index.ts';
import { flushBeforeQuit } from './shared/lifecycle.ts';
import { SettingsProvider } from './shared/settings/index.ts';
import { VaultProvider } from './shared/vault/index.ts';
import { AppShell, onQuitRequested, quitApp } from './shell/index.ts';
import { ViewsProvider } from './views/index.ts';

// Closing the window or pressing ⌘Q waits for open notes to save (E-5).
void onQuitRequested(() => {
  void flushBeforeQuit().then(() => quitApp());
});

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <VaultProvider>
      <SettingsProvider>
        <AppearanceProvider>
          <ViewsProvider>
            <AppShell />
          </ViewsProvider>
        </AppearanceProvider>
      </SettingsProvider>
    </VaultProvider>
  </StrictMode>,
);
