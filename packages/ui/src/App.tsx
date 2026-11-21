import { useEffect, useState } from 'react';
import { invoke } from './shared/ipc/index.ts';
import './App.css';

export function App() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    void invoke('app.getVersion', undefined).then((result) => {
      setVersion(result.ok ? result.value : result.error.message);
    });
  }, []);

  return (
    <main className="app">
      <h1>Notes</h1>
      <p className="app__version">Version {version}</p>
    </main>
  );
}
