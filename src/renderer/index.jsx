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

function SiteRow({ sitePath, initialized, createdAt, onInitialized, onForget, onDelete }) {
  const [serverUrl, setServerUrl] = useState('');
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [selectedTab, setSelectedTab] = useState('npm');
  const [npmLogs, setNpmLogs] = useState('');
  const [serverLogs, setServerLogs] = useState('');
  const [wpLogs, setWpLogs] = useState('');

  // Sticky auto-scroll management with a single state for the active tab
  const npmRef = useRef(null);
  const serverRef = useRef(null);
  const wpRef = useRef(null);
  const [stick, setStick] = useState(true);
  const threshold = 8; // px from bottom

  // Scroll-to-bottom when sticky for the active tab
  useEffect(() => {
    const ref = selectedTab === 'npm' ? npmRef : selectedTab === 'server' ? serverRef : wpRef;
    if (stick && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [npmLogs, serverLogs, wpLogs, selectedTab, stick]);

  // Handlers only disable sticky when user scrolls up in the active tab; re-enable at bottom
  const makeOnScroll = (tabName) => (e) => {
    const el = e.currentTarget;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    if (atBottom) setStick(true);
    else if (selectedTab === tabName && stick) setStick(false);
  };

  const siteName = sitePath.split('/').pop();
  const createdLabel = createdAt ? new Date(createdAt).toLocaleString() : '';

  const appendNpm = useCallback((s) => setNpmLogs((v) => v + s), []);
  const appendServer = useCallback((s) => setServerLogs((v) => v + s), []);
  const appendWp = useCallback((s) => setWpLogs((v) => v + s), []);

  const runInstall = useCallback(() => {
    setInstalling(true);
    setSelectedTab('npm');
    setStick(true);
    window.api.runNpmInstall(sitePath, ({ type, data }) => {
      appendNpm(data);
    }, async ({ code }) => {
      appendNpm(`\ninstall exited with code ${code}\n`);
      setInstalling(false);
      if (code === 0) {
        await window.api.markSiteInitialized(sitePath);
        onInitialized(sitePath);
      }
    });
  }, [sitePath, appendNpm, onInitialized]);

  const runScript = useCallback((name) => {
    setSelectedTab('npm');
    setStick(true);
    window.api.runNpmScript(sitePath, name, [], ({ type, data }) => {
      appendNpm(data);
    }, ({ code }) => {
      appendNpm(`\n${name} exited with code ${code}\n`);
    });
  }, [sitePath, appendNpm]);

  const killCurrent = useCallback(async () => {
    await window.api.npmKill({ directoryPath: sitePath });
  }, [sitePath]);

  const toggleServer = useCallback(async () => {
    if (!running) {
      setStarting(true);
      setSelectedTab('server');
      setStick(true);
      await window.api.startServer(
        sitePath,
        (payload) => appendServer(payload.data),
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
      window.api.startWpDebug(sitePath, (data) => appendWp(data));
    } else {
      await window.api.stopServer(sitePath);
      window.api.stopWpDebug(sitePath);
      await window.api.npmKill({ directoryPath: sitePath });
    }
  }, [running, sitePath, appendServer, appendWp]);

  const toggleDevServer = async () => {
    if (!running) {
      runScript('dev');
    }
    await toggleServer();
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
                    { title: 'Kill running command', onClick: killCurrent },
                  ]}
                />
              </FlexItem>
              <FlexItem>
                <Button isBusy={starting} variant={running ? 'secondary' : 'primary'} onClick={toggleDevServer}>{running ? 'Stop dev server' : 'Start dev server'}</Button>
                <span style={{ marginLeft: 8 }}>
                  {starting ? 'Starting...' : serverUrl ? (
                    <a href={serverUrl} onClick={(e) => { e.preventDefault(); window.api.openExternal(serverUrl); }}>{serverUrl}</a>
                  ) : null}
                </span>
              </FlexItem>
            </>
          ) : null}
        </Flex>

        <div style={{ marginTop: 12 }}>
          <TabPanel
            className="log-tabs"
            activeClass="is-active"
            onSelect={(name) => {
              setSelectedTab(name);
              setStick(true); // reset stickiness on tab switch
            }}
            tabs={[
              { name: 'npm', title: 'Npm logs' },
              { name: 'server', title: 'Server logs' },
              { name: 'wp', title: 'WordPress logs' },
            ]}
          >
            {(tab) => (
              <div>
                {tab.name === 'npm' && (
                  <div ref={npmRef} onScroll={makeOnScroll('npm')} style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6, height: 180, overflow: 'auto' }}>{npmLogs}</div>
                )}
                {tab.name === 'server' && (
                  <div ref={serverRef} onScroll={makeOnScroll('server')} style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6, height: 180, overflow: 'auto' }}>{serverLogs}</div>
                )}
                {tab.name === 'wp' && (
                  <div ref={wpRef} onScroll={makeOnScroll('wp')} style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 6, height: 180, overflow: 'auto' }}>{wpLogs}</div>
                )}
              </div>
            )}
          </TabPanel>
        </div>
      </CardBody>
    </Card>
  );
}

function App() {
  const { sites, siteMeta, refresh, setSiteMeta, setSites } = useSites();
  const [downloadPhase, setDownloadPhase] = useState('');
  const [pendingSite, setPendingSite] = useState(null);
  const [terminalMsgs, setTerminalMsgs] = useState('');

  useEffect(() => {
    const unsubProg = window.api.subscribeSetupProgress((p) => {
      if (p && p.message) setTerminalMsgs((v) => v + p.message + '\n');
      if (p && p.target) setPendingSite((prev) => prev || { targetDir: p.target });
    });
    const unsubStat = window.api.subscribeSetupStatus((s) => {
      if (!s) return;
      setPendingSite((prev) => prev || { targetDir: s.target });
      if (s.phase === 'cloning') setDownloadPhase('Cloning repository…');
      else if (s.phase === 'unzipping') setDownloadPhase('Unzipping…');
      else if (s.phase === 'downloading') setDownloadPhase('Downloading…');
      else if (s.phase === 'done') {
        setDownloadPhase('');
        setPendingSite(null);
        setTerminalMsgs('');
      }
    });
    return () => { unsubProg && unsubProg(); unsubStat && unsubStat(); };
  }, []);

  const chooseAndSetup = useCallback(async () => {
    const dir = await window.api.chooseDirectory();
    if (!dir) return;
    try {
      setTerminalMsgs('');
      setPendingSite({ targetDir: dir });
      await window.api.setupWordPress(dir);
      await refresh();
    } catch (e) {
      setPendingSite(null);
      alert(String(e));
    }
  }, [refresh]);

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
              {downloadPhase && <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>{downloadPhase}</div>}
              <div style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 8, borderRadius: 6, height: 120, overflow: 'auto' }}>{terminalMsgs}</div>
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
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);


