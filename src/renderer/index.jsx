import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  TabPanel,
  Card,
  CardBody,
  Flex,
  FlexItem
} from '@wordpress/components';
import { plus } from '@wordpress/icons';
import '@wordpress/components/build-style/style.css';

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

function SiteRow({ sitePath, onServerLog, onWpLog }) {
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
      // Start tailing WP debug log
      window.api.startWpDebug(sitePath, (data) => onWpLog(`[${sitePath}] ${data}`));
    } else {
      await window.api.stopServer(sitePath);
      window.api.stopWpDebug(sitePath);
    }
  }, [running, sitePath, onServerLog]);

  return (
    <Card style={{ marginBottom: 12 }}>
      <CardBody>
        <div className="path" style={{ fontFamily: 'Menlo, monospace', fontSize: 12, color: '#333', wordBreak: 'break-all' }}>{sitePath}</div>
        <Flex style={{ marginTop: 8, gap: 8 }}>
          <FlexItem>
            <Button variant="secondary" onClick={runInstall}>npm install</Button>
          </FlexItem>
          <FlexItem>
            <Button variant="secondary" onClick={() => window.api.openDirectory(sitePath)}>open directory</Button>
          </FlexItem>
          <FlexItem isBlock>
            <span style={{ marginLeft: 8 }}>
              {starting ? 'Starting...' : serverUrl ? (
                <a href={serverUrl} onClick={(e) => { e.preventDefault(); window.api.openExternal(serverUrl); }}>{serverUrl}</a>
              ) : null}
            </span>
          </FlexItem>
        </Flex>
        <div style={{ marginTop: 8 }}>
          <Button variant={running ? 'secondary' : 'primary'} onClick={toggleServer}>{running ? 'Stop server' : 'Run server'}</Button>
        </div>
        <div style={{ marginTop: 8 }}>
          {['build', 'build:dev', 'dev', 'test', 'watch', 'grunt'].map((name) => (
            <Button key={name} onClick={() => runScript(name)} style={{ marginRight: 8 }}>npm run {name}</Button>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function App() {
  const { sites, refresh } = useSites();
  const [logs, setLogs] = useState('');
  const [serverLogs, setServerLogs] = useState('');
  const [wpLogs, setWpLogs] = useState('');
  const appendLog = useCallback((s) => setLogs((v) => v + s), []);
  const appendServerLog = useCallback((s) => setServerLogs((v) => v + s), []);
  const appendWpLog = useCallback((s) => setWpLogs((v) => v + s), []);

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
      <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>WordPress Core Sites</h2>
        {sites.length > 0 ? (
          <Button icon={plus} variant="primary" onClick={chooseAndSetup}>Setup another site</Button>
        ) : null}
      </Flex>

      <div id="sites">
        {sites.length > 0 ? (
          sites.map((s) => (
            <SiteRow key={s} sitePath={s} onServerLog={appendServerLog} onWpLog={appendWpLog} />
          ))
        ) : (
          <Card>
            <CardBody>
              <div style={{ marginBottom: 8 }}>No sites yet.</div>
              <Button icon={plus} variant="primary" onClick={chooseAndSetup}>Setup your first site</Button>
            </CardBody>
          </Card>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <h3>Logs</h3>
        <TabPanel
          className="log-tabs"
          activeClass="is-active"
          tabs={[
            { name: 'npm', title: 'Npm logs' },
            { name: 'server', title: 'Playground CLI logs' },
            { name: 'wp', title: 'WordPress logs' },
          ]}
        >
          { (tab) => (
            <div>
              {tab.name === 'npm' && (
                <div style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6, height: 220, overflow: 'auto' }}>{logs}</div>
              )}
              {tab.name === 'server' && (
                <div style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6, height: 220, overflow: 'auto' }}>{serverLogs}</div>
              )}
              {tab.name === 'wp' && (
                <div style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6, height: 220, overflow: 'auto' }}>{wpLogs}</div>
              )}
            </div>
          )}
        </TabPanel>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);


