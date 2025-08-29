import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  TabPanel,
  Card,
  CardBody,
  Flex,
  FlexItem,
  DropdownMenu,
  Modal
} from '@wordpress/components';
import { plus, chevronDown, copy as copyIcon } from '@wordpress/icons';
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

function App() {
  const { sites, siteMeta, refresh, setSiteMeta, setSites } = useSites();
  const [downloadPhase, setDownloadPhase] = useState('');
  const [pendingSite, setPendingSite] = useState(null);
  const [terminalMsgs, setTerminalMsgs] = useState('');
  const termRef = useRef(null);
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [terminalMsgs]);
  const [webStarting, setWebStarting] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [webLogs, setWebLogs] = useState('');
  const [webError, setWebError] = useState('');
  const webLogRef = useRef(null);
  useEffect(() => { if (webLogRef.current) webLogRef.current.scrollTop = webLogRef.current.scrollHeight; }, [webLogs]);
  const [webAvailable, setWebAvailable] = useState(false);
  useEffect(() => { (async () => { try { setWebAvailable(Boolean(await window.api.playgroundWebAvailable())); } catch {} })(); }, []);

  useEffect(() => {
    const unsubProg = window.api.subscribeSetupProgress((p) => {
      if (p && p.message) setTerminalMsgs((v) => v + p.message + '\n');
      if (p && p.target) setPendingSite((prev) => prev || { targetDir: p.target });
    });
    const unsubStat = window.api.subscribeSetupStatus((s) => {
      if (!s) return;
      setPendingSite((prev) => prev || { targetDir: s.target });
      if (s.phase === 'cloning') setDownloadPhase('Cloning repository…');
      else if (s.phase === 'done') { setDownloadPhase(''); setPendingSite(null); setTerminalMsgs(''); }
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

  const togglePlaygroundWeb = useCallback(async () => {
    if (!webUrl) {
      setWebStarting(true);
      setWebError('');
      setWebLogs('');
      try {
        const res = await window.api.startPlaygroundWeb(
          ({ data }) => setWebLogs((v) => v + String(data)),
          (url) => { const u = (url || 'http://127.0.0.1:39372/').replace(/\/$/,'/'); setWebUrl(u); setWebStarting(false); },
          (payload) => { setWebUrl(''); if (payload && typeof payload.code === 'number' && payload.code !== 0) setWebError(`Server exited with code ${payload.code}`); }
        );
        if (res && res.ok && res.url) {
          const u = String(res.url).replace(/\/$/,'/');
          setWebUrl(u);
          setWebStarting(false);
        } else if (!res || !res.ok) {
          setWebStarting(false);
          if (res && res.error) { setWebError(String(res.error)); }
        }
      } catch (e) {
        setWebStarting(false);
        setWebError(String(e));
      }
    } else {
      try { await window.api.stopPlaygroundWeb(); } catch {}
      setWebUrl('');
    }
  }, [webUrl]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sites.length > 0 ? (
            <Button icon={plus} variant="primary" onClick={chooseAndSetup}>Create WordPress Core site</Button>
          ) : null}
          {webAvailable ? (<>
            <Button
              isBusy={webStarting}
              variant={webUrl ? 'secondary' : 'primary'}
              onClick={togglePlaygroundWeb}
            >{webUrl ? 'Stop Playground web server' : 'Start Playground web server'}</Button>
            {webStarting || webUrl ? (
            <span style={{ marginLeft: 4, fontSize: 12 }}>
              {webStarting ? 'Starting…' : (
                <a href={webUrl || 'http://127.0.0.1:39372/'} onClick={(e) => { e.preventDefault(); window.api.openExternal(webUrl || 'http://127.0.0.1:39372/'); }}>{webUrl || 'http://127.0.0.1:39372/'}</a>
              )}
            </span>
            ) : null}
          </>) : null}
        </div>
      </Flex>

      {/* Playground web server status + logs */}
      {(webStarting || webUrl || webError || webLogs) ? (
        <Card style={{ marginBottom: 12 }}>
          <CardBody>
            <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'space-between' }}>
              <div style={{ fontWeight: 600 }}>Playground web server</div>
              <div style={{ fontSize:12, color:'#666' }}>
                {webStarting ? 'Starting…' : (webUrl ? (
                  <a href={webUrl} onClick={(e)=>{ e.preventDefault(); window.api.openExternal(webUrl); }}>{webUrl}</a>
                ) : 'Stopped')}
              </div>
            </div>
            {webError ? (<div style={{ marginTop:6, color:'#C00', fontSize:12 }}>{webError}</div>) : null}
            <div ref={webLogRef} style={{ marginTop:8, whiteSpace:'pre-wrap', background:'#111', color:'#eee', padding:8, borderRadius:6, height:140, overflow:'auto' }}>{webLogs}</div>
          </CardBody>
        </Card>
      ) : null}

      <div id="sites">
        {pendingSite && (
          <Card style={{ marginBottom: 12 }}>
            <CardBody>
              <div style={{ fontWeight: 600 }}>Setting up new site…</div>
              {downloadPhase && <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>{downloadPhase}</div>}
              <div ref={termRef} style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 8, borderRadius: 6, height: 140, overflow: 'auto' }}>{terminalMsgs}</div>
            </CardBody>
          </Card>
        )}

        {sites.length > 0 ? (
          sites.sort((a, b) => (siteMeta?.[b]?.createdAt || 0) - (siteMeta?.[a]?.createdAt || 0)).map((s) => (
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

function SiteRow({ sitePath, initialized, createdAt, onInitialized, onForget, onDelete }) {
  // state
  const [serverUrl, setServerUrl] = useState('');
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [selectedTab, setSelectedTab] = useState('npm');
  const [npmLogs, setNpmLogs] = useState('');
  const [serverLogs, setServerLogs] = useState('');
  const [wpLogs, setWpLogs] = useState('');
  const [isPatchOpen, setIsPatchOpen] = useState(false);
  const [patchText, setPatchText] = useState('');
  const [emails, setEmails] = useState([]);
  const [smtpPort, setSmtpPort] = useState(0);
  const newEmailUnsubRef = useRef(null);
  const smtpStartedUnsubRef = useRef(null);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [activeEmail, setActiveEmail] = useState(null);
  const [emailViewTab, setEmailViewTab] = useState('rendered');
  const [building, setBuilding] = useState(false);
  const [hasNodeModules, setHasNodeModules] = useState(false);
  const [hasBuilt, setHasBuilt] = useState(false);
  const [skipInit, setSkipInit] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  // sticky refs
  const npmRef = useRef(null); const serverRef = useRef(null); const wpRef = useRef(null);
  const [stick, setStick] = useState(true); const threshold = 8;
  useEffect(() => { const ref = selectedTab==='npm'?npmRef:selectedTab==='server'?serverRef:wpRef; if (stick && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [npmLogs,serverLogs,wpLogs,selectedTab,stick]);
  const makeOnScroll = (tab) => (e) => { const el=e.currentTarget; const atBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-threshold; if(atBottom) setStick(true); else if(selectedTab===tab && stick) setStick(false); };

  const siteName = sitePath.split('/').pop();
  const createdLabel = createdAt ? new Date(createdAt).toLocaleString() : '';

  const appendNpm = (s)=>setNpmLogs(v=>v+s); const appendServer=(s)=>setServerLogs(v=>v+s); const appendWp=(s)=>setWpLogs(v=>v+s);
  const sortEmails = useCallback((list)=>[...list].sort((a,b)=>new Date(b.sentAt||b.date||0)-new Date(a.sentAt||a.date||0)),[]);
  const openEmail = useCallback((m)=>{ setActiveEmail(m); setEmailViewTab('rendered'); setIsEmailOpen(true); },[]);
  const clearEmails = useCallback(async ()=>{ await window.api.clearEmails(sitePath); setEmails([]); }, [sitePath]);
  const loadStatus = useCallback(async ()=>{
    try {
      setStatusLoading(true);
      const s = await window.api.getSiteStatus(sitePath);
      setHasNodeModules(Boolean(s?.hasNodeModules));
      setHasBuilt(Boolean(s?.hasBuilt));
      setSkipInit(Boolean(s?.skipInitWizard));
    } catch {}
    finally { setStatusLoading(false); }
  }, [sitePath]);
  useEffect(()=>{ loadStatus(); }, [loadStatus]);

  const runInstall = () => {
    setInstalling(true); setSelectedTab('npm'); setStick(true); window.api.runNpmInstall(sitePath, ({ data }) => appendNpm(data), async ({ code }) => {
      appendNpm(`\ninstall exited with code ${code}\n`); setInstalling(false);
      /**
       * Still let us through when this happens on Windows:
       * 
       * npm verbose stack Error: command failed
       * npm verbose stack     at promiseSpawn (C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\@npmcli\promise-spawn\lib\index.js:22:22)
       * npm verbose stack     at spawnWithShell (C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\@npmcli\promise-spawn\lib\index.js:124:10)
       * npm verbose stack     at promiseSpawn (C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\@npmcli\promise-spawn\lib\index.js:12:12)
       * npm verbose stack     at runScriptPkg (C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\@npmcli\run-script\lib\run-script-pkg.js:79:13)
       * npm verbose stack     at runScript (C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\@npmcli\run-script\lib\run-script.js:9:12)
       * npm verbose stack     at C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\@npmcli\arborist\lib\arborist\rebuild.js:329:17
       * npm verbose stack     at run (C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\promise-call-limit\dist\commonjs\index.js:67:22)
       * npm verbose stack     at C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\promise-call-limit\dist\commonjs\index.js:84:9
       * npm verbose stack     at new Promise (<anonymous>)
       * npm verbose stack     at callLimit (C:\Users\Adam\AppData\Local\Programs\electron-setup-wordpress-core\resources\app.asar\node_modules\npm\node_modules\promise-call-limit\dist\commonjs\index.js:35:69)
       * npm verbose pkgid core-js-pure@3.35.1
       * npm error code 1
       * npm error path C:\wp\wordpress-develop-trunk\node_modules\core-js-pure
       * 
       * @TODO: Do not mark as initialized if the installation fails.
       */
      if (1 || code === 0) { try { await window.api.markSiteInitialized(sitePath); } catch {} onInitialized(sitePath); }
      try { await loadStatus(); } catch {}
    });
  };
  const runScript = (name)=>{ setSelectedTab('npm'); setStick(true); if (name === 'build') setBuilding(true); window.api.runNpmScript(sitePath,name,[],({data})=>appendNpm(data),async ({code})=>{ appendNpm(`\n${name} exited with code ${code}\n`); if (name === 'build') { setBuilding(false); try { await loadStatus(); } catch {} } }); };
  const killCurrent = async ()=>{ await window.api.npmKill({ directoryPath: sitePath }); };
  const toggleServer = async ()=>{
    if(!running){
      if (!skipInit && !hasBuilt) { alert('Please complete the first full build before starting the dev server. You can also skip the wizard.'); return; }
      setStarting(true); setSelectedTab('server'); setStick(true);
      // Subscribe to SMTP events before starting to avoid missing early events
      if (!smtpStartedUnsubRef.current) smtpStartedUnsubRef.current = window.api.onSmtpStarted(sitePath, (port)=>setSmtpPort(port||0));
      if (!newEmailUnsubRef.current) newEmailUnsubRef.current = window.api.onNewEmail(sitePath, (msg)=>setEmails((prev)=>sortEmails([msg, ...prev])));
      await window.api.startServer(sitePath, (p)=>appendServer(p.data), (url)=>{ const u=url.replace(/\/$/,'/'); setServerUrl(u); window.api.openExternal(u); setRunning(true); setStarting(false); }, ()=>{ setRunning(false); setServerUrl(''); });
      window.api.startWpDebug(sitePath,(d)=>appendWp(d));
      try { const { port, emails } = await window.api.getEmails(sitePath); if (port) setSmtpPort(port); setEmails(emails||[]); } catch {}
    } else {
      await window.api.stopServer(sitePath);
      window.api.stopWpDebug(sitePath);
      await window.api.npmKill({ directoryPath: sitePath });
      try { if (newEmailUnsubRef.current) { newEmailUnsubRef.current(); newEmailUnsubRef.current=null; } } catch {}
      try { if (smtpStartedUnsubRef.current) { smtpStartedUnsubRef.current(); smtpStartedUnsubRef.current=null; } } catch {}
      setSmtpPort(0);
    }
  };
  const toggleDevServer = async ()=>{ if(!running){ runScript('dev'); } await toggleServer(); };
  const confirmAnd = async (m,a)=>{ if(window.confirm(m)) await a(); };

  const openPatchModal = async ()=>{
    setIsPatchOpen(true);
    setPatchText('Generating patch…');
    try {
      const res = await window.api.getPatch(sitePath);
      if (res && res.ok) setPatchText((res.patch && res.patch.trim().length) ? res.patch : 'No changes.');
      else setPatchText(res && res.error ? `Error: ${res.error}` : 'Failed to generate patch');
    } catch (e) {
      setPatchText(`Error: ${e && e.message ? e.message : String(e)}`);
    }
  };

  const copyPatch = async ()=>{
    try { await navigator.clipboard.writeText(patchText); } catch {}
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <CardBody>
        <Flex align="center" justify="space-between">
          <div style={{ fontWeight: 600 }}>{siteName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#666' }}>
              {initialized ? 'Initialized' : 'Uninitialized'}{createdLabel ? ` • Created ${createdLabel}` : ''}
            </div>
            <DropdownMenu label="More" text="" controls={[{ title:'Forget this site', onClick:()=>confirmAnd('Remove this site from the list?', ()=>onForget(sitePath)) },{ title:'Delete this site', onClick:()=>confirmAnd('Delete this site from disk? This cannot be undone.', ()=>onDelete(sitePath)) }]} />
          </div>
        </Flex>
        <div className="path" style={{ marginTop: 4, fontFamily: 'Menlo, monospace', fontSize: 12, color: '#333', wordBreak: 'break-all' }}><span style={{ color: '#666' }}>Path:</span> {sitePath}</div>
        {!skipInit ? (
          <div style={{ marginTop: 8, padding: 8, border: '1px solid #eee', borderRadius: 6, background: '#fafafa' }}>
            <div style={{ marginBottom: 6, color: '#333' }}>First, install the dependencies, then run a full build. After that, start the dev server.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Button
                isBusy={installing}
                variant={hasNodeModules ? 'secondary' : 'primary'}
                onClick={runInstall}
                disabled={installing || hasNodeModules}
              >{hasNodeModules ? 'Dependencies installed' : 'Install dependencies'}</Button>
              <span style={{ color: '#999' }}>→</span>
              <Button
                isBusy={building}
                variant={hasBuilt ? 'secondary' : 'primary'}
                onClick={()=>runScript('build')}
                disabled={building || (!hasNodeModules) || hasBuilt}
              >{hasBuilt ? 'First build complete' : 'First full build'}</Button>
              <span style={{ color: '#999' }}>→</span>
              <Button
                isBusy={starting}
                variant={running ? 'secondary' : 'primary'}
                onClick={async () => {
                  await window.api.setSkipInitWizard(sitePath, true);
                  setSkipInit(true);
                  toggleDevServer();
                }}
                disabled={starting || (!hasBuilt)}
              >{running ? 'Stop dev server' : 'Start dev server and finish the wizard'}</Button>
              <div style={{ marginLeft: 'auto' }}>
                <Button variant="link" onClick={async ()=>{ await window.api.setSkipInitWizard(sitePath, true); setSkipInit(true); }} style={{ textDecoration: 'underline' }}>Skip initialization wizard</Button>
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
              <span>node_modules: {hasNodeModules ? '✓' : '✗'}</span>
              <span style={{ marginLeft: 12 }}>dist present: {hasBuilt ? '✓' : '✗'}</span>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8, padding: 8, border: '1px solid #eee', borderRadius: 6, background: '#fafafa', color: '#555', fontSize: 12 }}>
            Initialization finished. Use the Run command menu for installs/builds.
          </div>
        )}
        {skipInit ? (
          <Flex style={{ marginTop: 8, gap: 8, justifyContent: 'flex-start' }}>
            <FlexItem><Button variant="secondary" onClick={()=>window.api.openDirectory(sitePath)}>Open directory</Button></FlexItem>
            <FlexItem>
              <Button isBusy={starting} variant={running ? 'secondary' : 'primary'} onClick={toggleDevServer}>{running ? 'Stop dev server' : 'Start dev server'}</Button>
              {starting || serverUrl ? (
                <span style={{ marginLeft: 8 }}>{starting ? 'Starting...' : serverUrl ? (<a href={serverUrl} onClick={(e) => { e.preventDefault(); window.api.openExternal(serverUrl); }}>{serverUrl}</a>) : null}</span>
              ) : null}
            </FlexItem>
            <FlexItem><Button variant="secondary" onClick={openPatchModal}>Create patch</Button></FlexItem>
            <FlexItem><DropdownMenu icon={chevronDown} label="Run command" text="Run command" controls={[{title:'npm run build',onClick:()=>runScript('build')},{title:'npm run build:dev',onClick:()=>runScript('build:dev')},{title:'npm run dev',onClick:()=>runScript('dev')},{title:'npm run test',onClick:()=>runScript('test')},{title:'npm run watch',onClick:()=>runScript('watch')},{title:'npm run grunt',onClick:()=>runScript('grunt')},{title:'Kill running command',onClick:killCurrent}]}/></FlexItem>
          </Flex>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <TabPanel className="log-tabs" activeClass="is-active" onSelect={(n)=>{setSelectedTab(n);setStick(true);}} tabs={[{name:'npm',title:'Npm logs'},{name:'server',title:'Server logs'},{name:'wp',title:'WordPress logs'},{name:'mail',title:'Mail'}]}>
            {(tab)=>(<div>
              {tab.name==='npm' && (<div ref={npmRef} onScroll={makeOnScroll('npm')} style={{ whiteSpace:'pre-wrap', background:'#111', color:'#eee', padding:12, borderRadius:6, height:180, overflow:'auto' }}>{npmLogs}</div>)}
              {tab.name==='server' && (<div ref={serverRef} onScroll={makeOnScroll('server')} style={{ whiteSpace:'pre-wrap', background:'#111', color:'#eee', padding:12, borderRadius:6, height:180, overflow:'auto' }}>{serverLogs}</div>)}
              {tab.name==='wp' && (<div ref={wpRef} onScroll={makeOnScroll('wp')} style={{ whiteSpace:'pre-wrap', background:'#111', color:'#eee', padding:12, borderRadius:6, height:180, overflow:'auto' }}>{wpLogs}</div>)}
              {tab.name==='mail' && (
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ fontSize:12, color:'#666' }}>{smtpPort ? `SMTP listening on 127.0.0.1:${smtpPort}` : 'SMTP will start with the dev server.'}</div>
                    <div><Button size="small" variant="secondary" onClick={clearEmails}>Clear emails</Button></div>
                  </div>
                  <div style={{ border:'1px solid #ddd', borderRadius:6, maxHeight:220, overflow:'auto' }}>
                    {emails && emails.length ? emails.map((m)=>{
                      const when = m.sentAt || m.date; const whenStr = when ? new Date(when).toLocaleString() : '';
                      return (
                        <div key={m.id}
                          onClick={()=>openEmail(m)}
                          style={{ padding:'8px 10px', cursor:'pointer', borderBottom:'1px solid #eee', display:'flex', gap:8 }}
                        >
                          <div style={{ flex:'0 0 180px', color:'#555', fontSize:12 }}>{whenStr}</div>
                          <div style={{ flex:'0 0 220px', color:'#333', fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.from || ''}</div>
                          <div style={{ flex:'1 1 auto', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.subject || '(no subject)'}</div>
                        </div>
                      );
                    }) : (
                      <div style={{ padding:12, color:'#666' }}>No emails yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>)}
          </TabPanel>
        </div>
        {isPatchOpen && (
          <Modal
            title="Patch"
            onRequestClose={()=>setIsPatchOpen(false)}
            shouldCloseOnClickOutside
            isFullScreen
          >
            <div style={{ position:'relative', height:'80vh' }}>
              <Button
                icon={copyIcon}
                label="Copy"
                onClick={copyPatch}
                style={{
                  position:'absolute', top:8, right:8, zIndex:2,
                  background:'#fff', border:'1px solid #ddd', color:'#111', boxShadow:'none'
                }}
              />
              <pre style={{ margin:0, whiteSpace:'pre-wrap', background:'#111', color:'#eee', padding:12, borderRadius:6, height:'100%', overflow:'auto' }}>
                {patchText && patchText.trim().length ? patchText : 'No changes.'}
              </pre>
            </div>
          </Modal>
        )}
        {isEmailOpen && activeEmail && (
          <Modal
            title={activeEmail.subject || 'Email'}
            onRequestClose={()=>{ setIsEmailOpen(false); setActiveEmail(null); }}
            shouldCloseOnClickOutside
            isFullScreen
          >
            <div style={{ padding: 8 }}>
              <div style={{ marginBottom: 8, fontSize:12, color:'#444' }}>
                <div><strong>From:</strong> {activeEmail.from || ''}</div>
                <div><strong>To:</strong> {activeEmail.to || ''}</div>
                {activeEmail.cc ? (<div><strong>CC:</strong> {activeEmail.cc}</div>) : null}
                <div><strong>Date:</strong> {activeEmail.sentAt ? new Date(activeEmail.sentAt).toLocaleString() : (activeEmail.date ? new Date(activeEmail.date).toLocaleString() : '')}</div>
              </div>
              <TabPanel className="email-tabs" activeClass="is-active" onSelect={(n)=>setEmailViewTab(n)} tabs={[{name:'rendered',title:'Rendered'},{name:'raw',title:'Raw'}]}>
                {(tab)=> tab.name==='rendered' ? (
                  <div style={{ border:'1px solid #ddd', borderRadius:6, padding:12, minHeight:'60vh', background:'#fff' }}>
                    {activeEmail.html ? (
                      <div dangerouslySetInnerHTML={{ __html: String(activeEmail.html) }} />
                    ) : (
                      <pre style={{ whiteSpace:'pre-wrap', margin:0 }}>{activeEmail.text || ''}</pre>
                    )}
                  </div>
                ) : (
                  <pre style={{ whiteSpace:'pre-wrap', margin:0, background:'#111', color:'#eee', padding:12, borderRadius:6, minHeight:'60vh', overflow:'auto' }}>{activeEmail.raw || activeEmail.text || ''}</pre>
                )}
              </TabPanel>
            </div>
          </Modal>
        )}
      </CardBody>
    </Card>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);


