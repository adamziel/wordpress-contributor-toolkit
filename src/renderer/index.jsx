import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

function useSites() {
  const [sites, setSites] = useState([]);
  const refresh = useCallback(async () => {
    const list = await window.api.getSites();
    setSites(list);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { sites, refresh };
}

function LogPanel({ title, bg = '#111', color = '#eee' }) {
  const [lines, setLines] = useState([]);
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; });
  return (
    <>
      <h3>{title}</h3>
      <div ref={ref} style={{ whiteSpace: 'pre-wrap', background: bg, color, padding: 12, borderRadius: 6, height: 220, overflow: 'auto' }}>
        {lines.join('')}
      </div>
    </>
  );
}

function SiteRow({ sitePath, onServerLog }) {
  const [serverUrl, setServerUrl] = useState('');
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);

  const runInstall = useCallback(() => {
    window.api.runNpmInstall(sitePath, ({ type, data }) => {
      onServerLog(`[install ${type}] ${data}`);
    }, ({ code }) => {
      onServerLog(`\ninstall exited with code ${code}\n`);
    });
  }, [sitePath, onServerLog]);

  const runScript = useCallback((name) => {
    window.api.runNpmScript(sitePath, name, [], ({ type, data }) => {
      onServerLog(`[${name} ${type}] ${data}`);
    }, ({ code }) => {
      onServerLog(`\n${name} exited with code ${code}\n`);
    });
  }, [sitePath, onServerLog]);

  const toggleServer = useCallback(async () => {
    if (!running) {
      setStarting(true);
      await window.api.startServer(
        sitePath,
        (payload) => onServerLog(`[${payload.sitePath} ${payload.type}] ${payload.data}`),
        (url) => {
          const displayUrl = url.replace(/\/$/, '/');
          setServerUrl(displayUrl);
          window.api.openExternal(displayUrl);
          setRunning(true);
          setStarting(false);
        },
        () => {
          setRunning(false);
          setServerUrl('');
        }
      );
    } else {
      await window.api.stopServer(sitePath);
    }
  }, [running, sitePath, onServerLog]);

  return (
    <div className="site" style={{ border: '1px solid #ddd', padding: 8, marginBottom: 8, borderRadius: 6 }}>
      <div className="path" style={{ fontFamily: 'Menlo, monospace', fontSize: 12, color: '#333', wordBreak: 'break-all' }}>{sitePath}</div>
      <div style={{ marginTop: 6 }}>
        <button onClick={runInstall}>npm install</button>
        <button onClick={() => window.api.openDirectory(sitePath)}>open directory</button>
        <span style={{ marginLeft: 8 }}>
          {starting ? 'Starting...' : serverUrl ? <a href={serverUrl} onClick={(e) => { e.preventDefault(); window.api.openExternal(serverUrl); }}>{serverUrl}</a> : null}
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        <button onClick={toggleServer}>{running ? 'Stop server' : 'Run server'}</button>
      </div>
      <div style={{ marginTop: 6 }}>
        {['build', 'build:dev', 'dev', 'test', 'watch', 'grunt'].map((name) => (
          <button key={name} onClick={() => runScript(name)} style={{ marginRight: 8 }}>npm run {name}</button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const { sites, refresh } = useSites();
  const [logs, setLogs] = useState('');
  const [serverLogs, setServerLogs] = useState('');
  const appendLog = useCallback((s) => setLogs((v) => v + s), []);
  const appendServerLog = useCallback((s) => setServerLogs((v) => v + s), []);

  const chooseAndSetup = useCallback(async () => {
    const dir = await window.api.chooseDirectory();
    if (!dir) return;
    try {
      await window.api.setupWordPress(dir);
      await refresh();
    } catch (e) {
      appendLog(String(e));
    }
  }, [refresh, appendLog]);

  return (
    <div style={{ margin: 16, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' }}>
      <h2>WordPress Core Setup</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button onClick={chooseAndSetup}>Setup WordPress file structure…</button>
      </div>

      <h3>Sites</h3>
      <div id="sites">
        {sites.map((s) => (
          <SiteRow key={s} sitePath={s} onServerLog={appendServerLog} />
        ))}
      </div>

      <h3>Logs</h3>
      <div style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6, height: 220, overflow: 'auto' }}>{logs}</div>

      <h3>Server Logs</h3>
      <div style={{ whiteSpace: 'pre-wrap', background: '#0b1', color: '#001', padding: 12, borderRadius: 6, height: 180, overflow: 'auto' }}>{serverLogs}</div>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);


