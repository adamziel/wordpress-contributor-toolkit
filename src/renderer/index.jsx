import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  TabPanel,
  Card,
  CardBody,
  Flex,
  FlexItem,
  DropdownMenu
} from '@wordpress/components';
import { plus, chevronDown } from '@wordpress/icons';
import '@wordpress/components/build-style/style.css';

function useSites() {
  const [sites, setSites] = useState([]);
  const [siteMeta, setSiteMeta] = useState({});
  const refresh = useCallback(async () => {
    const { sites: list, siteMeta: meta } = await window.api.getSitesWithMeta();
    setSites(list);
    setSiteMeta(meta || {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { sites, siteMeta, refresh, setSiteMeta, setSites };
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

function SiteRow({ sitePath, initialized, createdAt, onInitialized, onServerLog, onWpLog, onForget, onDelete }) {
  const [serverUrl, setServerUrl] = useState('');
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [installing, setInstalling] = useState(false);

  const siteName = sitePath.split('/').pop();
  const createdLabel = createdAt ? new Date(createdAt).toLocaleString() : '';

  const runInstall = useCallback(() => {
    setInstalling(true);
    window.api.runNpmInstall(sitePath, ({ type, data }) => {
      onServerLog(`[install ${type}] ${data}`);
    }, async ({ code }) => {
      onServerLog(`\ninstall exited with code ${code}\n`);
      setInstalling(false);
      if (code === 0) {
        await window.api.markSiteInitialized(sitePath);
        onInitialized(sitePath);
      }
    });
  }, [sitePath, onServerLog, onInitialized]);

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
      window.api.startWpDebug(sitePath, (data) => onWpLog(`[${sitePath}] ${data}`));
    } else {
      await window.api.stopServer(sitePath);
      window.api.stopWpDebug(sitePath);
    }
  }, [running, sitePath, onServerLog, onWpLog]);

  const toggleDevServer = async () => {
    if (!running) {
      runScript('watch');
    }
    toggleServer();
  }

  const confirmAnd = async (message, action) => {
    if (window.confirm(message)) {
      await action();
    }
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <CardBody>
        <Flex align="center" justify="space-between">
          <div style={{ fontWeight: 600 }}>{siteName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#666' }}>
              {initialized ? 'Initialized' : 'Uninitialized'}
              {createdLabel ? ` • Created ${createdLabel}` : ''}
            </div>
            <DropdownMenu
              label="More"
              text="⋮"
              controls={[
                { title: 'Forget this site', onClick: () => confirmAnd('Remove this site from the list?', () => onForget(sitePath)) },
                { title: 'Delete this site', onClick: () => confirmAnd('Delete this site from disk? This cannot be undone.', () => onDelete(sitePath)) },
              ]}
            />
          </div>
        </Flex>
        <div className="path" style={{ marginTop: 4, fontFamily: 'Menlo, monospace', fontSize: 12, color: '#333', wordBreak: 'break-all' }}>
          <span style={{ color: '#666' }}>Path:</span> {sitePath}
        </div>
        <Flex style={{ marginTop: 8, gap: 8, justifyContent: 'flex-start' }}>
          {!initialized ? (
            <FlexItem>
              <Button isBusy={installing} variant="primary" onClick={runInstall}>Install dependencies</Button>
            </FlexItem>
          ) : null}
          <FlexItem>
            <Button variant="secondary" onClick={() => window.api.openDirectory(sitePath)}>Open directory</Button>
          </FlexItem>
          {initialized ? (
            <>
              <FlexItem>
                <DropdownMenu
                  icon={chevronDown}
                  label="Run command"
                  text="Run command"
                  controls={[
                    { title: 'npm run build', onClick: () => runScript('build') },
                    { title: 'npm run build:dev', onClick: () => runScript('build:dev') },
                    { title: 'npm run dev', onClick: () => runScript('dev') },
                    { title: 'npm run test', onClick: () => runScript('test') },
                    { title: 'npm run watch', onClick: () => runScript('watch') },
                    { title: 'npm run grunt', onClick: () => runScript('grunt') },
                  ]}
                />
              </FlexItem>
              <FlexItem isBlock>
                <Button variant={running ? 'secondary' : 'primary'} onClick={toggleDevServer}>{running ? 'Stop dev server' : 'Start dev server'}</Button>
                <span style={{ marginLeft: 8 }}>
                  {starting ? 'Starting...' : serverUrl ? (
                    <a href={serverUrl} onClick={(e) => { e.preventDefault(); window.api.openExternal(serverUrl); }}>{serverUrl}</a>
                  ) : null}
                </span>
              </FlexItem>
            </>
          ) : null}
        </Flex>
      </CardBody>
    </Card>
  );
}

function App() {
  const { sites, siteMeta, refresh, setSiteMeta, setSites } = useSites();
  const [logs, setLogs] = useState('');
  const [serverLogs, setServerLogs] = useState('');
  const [wpLogs, setWpLogs] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0);
  const [downloadPhase, setDownloadPhase] = useState('');
  const [pendingSite, setPendingSite] = useState(null); // { targetDir, sitePath? }
  const appendLog = useCallback((s) => setLogs((v) => v + s), []);
  const appendServerLog = useCallback((s) => setServerLogs((v) => v + s), []);
  const appendWpLog = useCallback((s) => setWpLogs((v) => v + s), []);

  useEffect(() => {
    const progressHandler = (_e, p) => {
      if (!p || typeof p.percent !== 'number') return;
      setDownloading(true);
      setDownloadPct(Math.round(p.percent));
      setPendingSite((prev) => prev || { targetDir: p.target });
    };
    const statusHandler = (_e, s) => {
      if (!s) return;
      setPendingSite((prev) => prev || { targetDir: s.target });
      if (s.phase === 'downloading') setDownloadPhase('Downloading WordPress…');
      if (s.phase === 'unzipping') setDownloadPhase('Unzipping…');
      if (s.phase === 'done') {
        setDownloading(false);
        setDownloadPct(100);
        setDownloadPhase('');
        setPendingSite(null);
      }
    };
    const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: null };
    ipcRenderer?.on?.('download:progress', progressHandler);
    ipcRenderer?.on?.('download:status', statusHandler);
    return () => {
      ipcRenderer?.removeListener?.('download:progress', progressHandler);
      ipcRenderer?.removeListener?.('download:status', statusHandler);
    };
  }, []);

  const chooseAndSetup = useCallback(async () => {
    const dir = await window.api.chooseDirectory();
    if (!dir) return;
    try {
      setDownloading(true);
      setDownloadPct(0);
      setPendingSite({ targetDir: dir });
      const sitePath = await window.api.setupWordPress(dir);
      await refresh();
    } catch (e) {
      setDownloading(false);
      setPendingSite(null);
      appendLog(String(e));
    }
  }, [refresh, appendLog]);

  const onInitialized = useCallback((sitePath) => {
    setSiteMeta((m) => ({ ...(m || {}), [sitePath]: { ...(m?.[sitePath] || {}), initialized: true } }));
  }, [setSiteMeta]);

  const onForget = useCallback(async (sitePath) => {
    await window.api.forgetSite(sitePath);
    await refresh();
  }, [refresh]);

  const onDelete = useCallback(async (sitePath) => {
    await window.api.deleteSite(sitePath);
    await refresh();
  }, [refresh]);

  return (
    <div style={{ margin: 16, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' }}>
      <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>WordPress Core Sites</h2>
        {sites.length > 0 ? (
          <Button icon={plus} variant="primary" onClick={chooseAndSetup}>Setup another site</Button>
        ) : null}
      </Flex>

      <div id="sites">
        {pendingSite && (
          <Card style={{ marginBottom: 12 }}>
            <CardBody>
              <div style={{ fontWeight: 600 }}>Setting up new site…</div>
              <div style={{ marginTop: 8, background: '#eee', borderRadius: 4, overflow: 'hidden', height: 10 }}>
                <div style={{ width: `${downloadPct}%`, height: '100%', background: '#007cba', transition: 'width 0.2s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{downloadPhase || `Downloading… ${downloadPct}%`}</div>
            </CardBody>
          </Card>
        )}

        {sites.length > 0 ? (
          sites.map((s) => (
            <SiteRow
              key={s}
              sitePath={s}
              initialized={Boolean(siteMeta?.[s]?.initialized)}
              createdAt={siteMeta?.[s]?.createdAt}
              onInitialized={onInitialized}
              onServerLog={appendServerLog}
              onWpLog={appendWpLog}
              onForget={onForget}
              onDelete={onDelete}
            />
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


