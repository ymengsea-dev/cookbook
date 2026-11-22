import { useEffect, useState } from 'react';
import { invoke } from './shared/ipc/index.ts';
import './App.css';

export function App() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    invoke('app_info', {}).then(
      (info) => {
        setVersion(info.version);
      },
      (error: unknown) => {
        setVersion(`unknown (${String(error)})`);
      },
    );
  }, []);

  return (
    <main className="app">
      <h1>Notes</h1>
      <p className="app__version">Version {version}</p>
    </main>
  );
}
