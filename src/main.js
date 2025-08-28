const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fse = require('fs-extra');
const https = require('https');
const extract = require('extract-zip');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const JsDiff = require('diff');
const { spawn } = require('child_process');

const WORDPRESS_ZIP_URL = 'https://github.com/WordPress/wordpress-develop/archive/refs/heads/trunk.zip';
const WORDPRESS_GIT_URL = 'https://github.com/WordPress/wordpress-develop.git';

let store; // initialized asynchronously due to ESM-only module
const storeReady = import('electron-store').then((m) => {
	const Store = m.default || m;
	store = new Store({
		name: 'settings',
		defaults: { sites: [], siteMeta: {} }
	});
});

async function getStore() {
	if (!store) await storeReady;
	return store;
}

/** @type {Record<string, import('child_process').ChildProcess>} */
const runningInstalls = {};
/** @type {Record<string, import('child_process').ChildProcess>} */
const runningScripts = {};
/** @type {Record<string, string>} */
const runIdByDirectory = {};
/** @type {Record<string, { child: import('child_process').ChildProcess, url?: string }>} */
const playgroundServers = {};
/** @type {Record<string, { filePath: string, fileWatcher?: import('fs').FSWatcher, dirWatcher?: import('fs').FSWatcher, lastSize: number }>} */
const wpDebugWatchers = {};

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1000,
		height: 700,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});

	mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
function buildPatchHtml(content) {
    return `<!doctype html><html><head><meta charset="utf-8"/><title>Patch</title>
    <style>body{font-family:Menlo,monospace;padding:12px;} pre{white-space:pre-wrap;background:#111;color:#eee;padding:12px;border-radius:6px;height:85vh;overflow:auto} .bar{position:sticky;top:0;background:#fff;padding:8px 0} button{padding:6px 10px}</style>
    </head><body>
    <div class="bar"><button id="copy">Copy</button></div>
    <pre id="pre"></pre>
    <script>
    const pre=document.getElementById('pre');
    pre.textContent = ${JSON.stringify(content)};
    document.getElementById('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(pre.textContent); } catch {} });
    </script>
    </body></html>`;
}

async function createMinimalPatchForDir(dir) {
    // Ensure we have origin/trunk and HEAD reference
    try { await git.resolveRef({ fs, dir, ref: 'refs/remotes/origin/trunk' }); }
    catch { await git.fetch({ fs, http, dir, url: WORDPRESS_GIT_URL, depth: 1, singleBranch: true, ref: 'trunk' }); }
    let headOid = null;
    try { headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' }); } catch {}
    if (!headOid) {
        // fallback to local trunk if HEAD missing
        try { headOid = await git.resolveRef({ fs, dir, ref: 'refs/heads/trunk' }); } catch {}
    }

    // Compare working tree vs HEAD (which points to trunk tip after clone)
    const matrix = await git.statusMatrix({ fs, dir });
    const changed = matrix.filter(([filepath, head, workdir, stage]) => head !== workdir);
    let patch = '';
    for (const [filepath, head, workdir] of changed) {
        const abs = require('path').join(dir, filepath);
        const workBuf = workdir ? await fs.promises.readFile(abs).catch(() => null) : null;
        const base = head && headOid ? await git.readBlob({ fs, dir, oid: headOid, filepath }).catch(() => null) : null;
        const a = base ? Buffer.from(base.blob).toString('utf8') : '';
        const b = workBuf ? workBuf.toString('utf8') : a;
        if (a === b) continue;
        // Skip likely-binary
        if ((a.indexOf('\0') !== -1) || (b.indexOf('\0') !== -1)) continue;
        const filePatch = JsDiff.createTwoFilesPatch(`a/${filepath}`, `b/${filepath}`, a, b, '', '', { context: 3 });
        patch += filePatch + '\n';
    }
    return patch || 'No changes.';
}

ipcMain.handle('git:get-patch', async (_e, sitePath) => {
    try {
        const patch = await createMinimalPatchForDir(sitePath);
        return { ok: true, patch };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('git:create-patch', async (_e, sitePath) => {
    try {
        const patch = await createMinimalPatchForDir(sitePath);
        const win = new BrowserWindow({ width: 900, height: 700, webPreferences: { contextIsolation: true, nodeIntegration: false } });
        win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildPatchHtml(patch || 'No changes.')));
        return { ok: true };
    } catch (e) {
        const win = new BrowserWindow({ width: 900, height: 700, webPreferences: { contextIsolation: true, nodeIntegration: false } });
        win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildPatchHtml('Failed to generate diff: ' + String(e))));
        return { ok: false, error: String(e) };
    }
});

app.whenReady().then(() => {
	createWindow();

	app.on('activate', function () {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('sites:get', async () => {
	const s = await getStore();
	return s.get('sites');
});

ipcMain.handle('sites:getAll', async () => {
	const s = await getStore();
	return { sites: s.get('sites'), siteMeta: s.get('siteMeta') };
});

ipcMain.handle('sites:add', async (_e, sitePath) => {
	const s = await getStore();
	const sites = s.get('sites');
	if (!sites.includes(sitePath)) {
		sites.push(sitePath);
		s.set('sites', sites);
		const meta = s.get('siteMeta');
		meta[sitePath] = meta[sitePath] || { initialized: false, createdAt: new Date().toISOString() };
		s.set('siteMeta', meta);
	}
	return sites;
});

ipcMain.handle('dialog:choose-dir', async () => {
	const result = await dialog.showOpenDialog({
		properties: ['openDirectory', 'createDirectory']
	});
	if (result.canceled || result.filePaths.length === 0) return null;
	return result.filePaths[0];
});

ipcMain.handle('wordpress:setup', async (event, destDir) => {
	if (!destDir) {
		throw new Error('No destination directory specified');
	}

	await fse.ensureDir(destDir);

	// Perform shallow clone of trunk into a subfolder named 'wordpress-develop-trunk'
	const siteDir = path.join(destDir, 'wordpress-develop-trunk');
	await fse.ensureDir(siteDir);
	event.sender.send('download:status', { phase: 'cloning', target: destDir });
	try {
		await git.clone({
			http,
			fs,
			url: WORDPRESS_GIT_URL,
			dir: siteDir,
			singleBranch: true,
			depth: 1,
			ref: 'trunk',
			onProgress: (evt) => {
				// evt: {phase,total,loaded,lengthComputable} - forward as terminal-like output
				const msg = `${evt.phase || 'clone'} ${evt.loaded || 0}/${evt.total || 0}`;
				event.sender.send('download:progress', { target: destDir, message: msg });
			}
		});
	} catch (e) {
		// Fallback/error
		throw e;
	}

	const s = await getStore();
	const sites = s.get('sites');
	if (!sites.includes(siteDir)) {
		sites.push(siteDir);
		s.set('sites', sites);
		const meta = s.get('siteMeta');
		meta[siteDir] = { initialized: false, createdAt: new Date().toISOString() };
		s.set('siteMeta', meta);
	}
	event.sender.send('download:status', { phase: 'done', target: destDir, sitePath: siteDir });
	return siteDir;
});

ipcMain.handle('sites:mark-initialized', async (_e, sitePath) => {
	const s = await getStore();
	const meta = s.get('siteMeta');
	meta[sitePath] = { ...(meta[sitePath] || {}), initialized: true };
	s.set('siteMeta', meta);
	return true;
});

ipcMain.handle('sites:forget', async (_e, sitePath) => {
	const s = await getStore();
	const sites = s.get('sites').filter((p) => p !== sitePath);
	s.set('sites', sites);
	const meta = s.get('siteMeta');
	delete meta[sitePath];
	s.set('siteMeta', meta);
	return true;
});

ipcMain.handle('sites:delete', async (_e, sitePath) => {
	const s = await getStore();
	const sites = s.get('sites').filter((p) => p !== sitePath);
	s.set('sites', sites);
	const meta = s.get('siteMeta');
	delete meta[sitePath];
	s.set('siteMeta', meta);
	try { await fse.remove(sitePath); } catch {}
	return true;
});

ipcMain.handle('dir:open', async (_e, directoryPath) => {
	if (!directoryPath) return false;
	const result = await shell.openPath(directoryPath);
	return result === '';
});

ipcMain.handle('url:open', async (_e, url) => {
	if (!url) return false;
	await shell.openExternal(url);
	return true;
});

ipcMain.handle('npm:install', async (event, directoryPath) => {
	if (!directoryPath) throw new Error('directoryPath is required');

	const installId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const runnerPath = path.join(__dirname, 'install-runner.js');

	const child = spawn(process.execPath, [runnerPath, directoryPath], {
		cwd: directoryPath,
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: '1'
		},
		shell: false
	});

	runningInstalls[installId] = child;

	child.stdout.on('data', (data) => {
		event.sender.send('npm:install:log', { installId, type: 'stdout', data: data.toString() });
	});
	child.stderr.on('data', (data) => {
		event.sender.send('npm:install:log', { installId, type: 'stderr', data: data.toString() });
	});
	child.on('close', (code) => {
		event.sender.send('npm:install:done', { installId, code });
		delete runningInstalls[installId];
	});

	return { installId };
});

ipcMain.handle('npm:run-script', async (event, directoryPath, scriptName, scriptArgs = []) => {
	if (!directoryPath) throw new Error('directoryPath is required');
	if (!scriptName) throw new Error('scriptName is required');

	const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const runnerPath = path.join(__dirname, 'script-runner.js');

	const child = spawn(process.execPath, [runnerPath, directoryPath, scriptName, ...scriptArgs], {
		cwd: directoryPath,
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		shell: false
	});

	runningScripts[runId] = child;
	runIdByDirectory[directoryPath] = runId;

	child.stdout.on('data', (data) => {
		event.sender.send('npm:run-script:log', { runId, type: 'stdout', data: data.toString() });
	});
	child.stderr.on('data', (data) => {
		event.sender.send('npm:run-script:log', { runId, type: 'stderr', data: data.toString() });
	});
	child.on('close', (code) => {
		event.sender.send('npm:run-script:done', { runId, code });
		delete runningScripts[runId];
		if (runIdByDirectory[directoryPath] === runId) {
			delete runIdByDirectory[directoryPath];
		}
	});

	return { runId };
});

ipcMain.handle('npm:kill', async (_event, { runId, directoryPath }) => {
	let child;
	if (runId && runningScripts[runId]) {
		child = runningScripts[runId];
	} else if (directoryPath && runIdByDirectory[directoryPath]) {
		const id = runIdByDirectory[directoryPath];
		child = runningScripts[id];
	}
	if (!child) return { ok: false, error: 'No running script' };
	try {
		child.kill('SIGTERM');
		setTimeout(() => child.kill('SIGKILL'), 3000);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: String(e) };
	}
});

ipcMain.handle('playground:start', async (event, sitePath) => {
	const buildDir = path.join(sitePath, 'build');
	if (playgroundServers[sitePath]?.child) {
		return { ok: true, url: playgroundServers[sitePath].url };
	}
	const runnerPath = path.join(__dirname, 'server-runner.js');
	const child = spawn(process.execPath, [runnerPath, buildDir], {
		cwd: buildDir,
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		shell: false
	});
	playgroundServers[sitePath] = { child };
	let resolved = false;
	let pendingResolve = null;
	let timeoutId = null;
	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', (data) => {
		const text = String(data);
		console.log("STDOUT", text);
		event.sender.send('playground:log', { sitePath, type: 'stdout', data: text });
		const match = text.match(/SERVER_URL:(.*)/);
		if (match && !resolved) {
			resolved = true;
			playgroundServers[sitePath].url = match[1].trim();
			console.log("URL", playgroundServers[sitePath].url);
			event.sender.send('playground:url', { sitePath, url: playgroundServers[sitePath].url });
			if (typeof pendingResolve === 'function') {
				clearTimeout(timeoutId);
				pendingResolve({ ok: true, url: playgroundServers[sitePath].url });
				pendingResolve = null;
			}
		}
	});
	child.stderr.on('data', (data) => {
		console.log("STDERR", data);
		event.sender.send('playground:log', { sitePath, type: 'stderr', data: String(data) });
	});
	child.on('error', (err) => {
		console.log("ERROR", err);
		event.sender.send('playground:log', { sitePath, type: 'stderr', data: String(err) + '\n' });
	});
	child.on('close', (code) => {
		delete playgroundServers[sitePath];
		event.sender.send('playground:stopped', { sitePath, code });
		// Stop WP debug tail if running
		stopWpDebugTail(sitePath);
	});

	return new Promise((resolve) => {
		pendingResolve = resolve;
		timeoutId = setTimeout(() => {
			if (!resolved && typeof pendingResolve === 'function') {
				pendingResolve({ ok: false, error: 'Timed out starting server' });
				pendingResolve = null;
			}
		}, 20000);
	});
});

ipcMain.handle('playground:stop', async (_event, sitePath) => {
	const server = playgroundServers[sitePath];
	if (!server?.child) return { ok: true };
	try {
		server.child.kill();
		return { ok: true };
	} catch (e) {
		return { ok: false, error: String(e) };
	}
});

// --- WordPress debug.log tailing ---
function startWpDebugTail(sitePath, webContents) {
	const wpContentDir = path.join(sitePath, 'build', 'wp-content');
	const filePath = path.join(wpContentDir, 'debug.log');
	if (wpDebugWatchers[sitePath]?.fileWatcher || wpDebugWatchers[sitePath]?.dirWatcher) {
		return true;
	}
	wpDebugWatchers[sitePath] = { filePath, lastSize: 0 };
	const state = wpDebugWatchers[sitePath];

	function attachFileWatcher() {
		try {
			const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
			if (!stat) return false;
			// Send initial tail (cap to last 256KB)
			const maxInitial = 256 * 1024;
			const start = stat.size > maxInitial ? stat.size - maxInitial : 0;
			state.lastSize = stat.size;
			if (stat.size > 0) {
				const rs = fs.createReadStream(filePath, { start });
				rs.on('data', (chunk) => {
					webContents.send('wp:debug-log:data', { sitePath, data: chunk.toString() });
				});
			}
			state.fileWatcher = fs.watch(filePath, (evt) => {
				if (evt !== 'change') return;
				try {
					const s = fs.statSync(filePath);
					if (s.size > state.lastSize) {
						const rs2 = fs.createReadStream(filePath, { start: state.lastSize });
						rs2.on('data', (chunk) => {
							webContents.send('wp:debug-log:data', { sitePath, data: chunk.toString() });
						});
						state.lastSize = s.size;
					}
				} catch {}
			});
			return true;
		} catch {
			return false;
		}
	}

	// Watch directory for creation if the file doesn't exist yet
	if (!attachFileWatcher()) {
		try {
			state.dirWatcher = fs.watch(wpContentDir, () => {
				if (attachFileWatcher() && state.dirWatcher) {
					state.dirWatcher.close();
					state.dirWatcher = undefined;
				}
			});
		} catch {}
	}
	return true;
}

function stopWpDebugTail(sitePath) {
	const state = wpDebugWatchers[sitePath];
	if (!state) return;
	try { state.fileWatcher?.close(); } catch {}
	try { state.dirWatcher?.close(); } catch {}
	delete wpDebugWatchers[sitePath];
}

ipcMain.handle('wp-debug:start', async (event, sitePath) => {
	startWpDebugTail(sitePath, event.sender);
	return true;
});

ipcMain.handle('wp-debug:stop', async (_event, sitePath) => {
	stopWpDebugTail(sitePath);
	return true;
});

function downloadFile(url, dest, onProgress) {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(dest);
		let receivedBytes = 0;
		let totalBytes = 0;

		https.get(url, (response) => {
			if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				// handle redirect
				return https.get(response.headers.location, (res2) => handleResponse(res2));
			}
			handleResponse(response);
		}).on('error', (err) => {
			fs.unlink(dest, () => reject(err));
		});

		function handleResponse(response) {
			if (response.statusCode !== 200) {
				fs.unlink(dest, () => reject(new Error(`Failed to get '${url}' (${response.statusCode})`)));
				return;
			}
			totalBytes = parseInt(response.headers['content-length'] || '0', 10);
			response.on('data', (chunk) => {
				receivedBytes += chunk.length;
				if (onProgress && totalBytes) {
					onProgress({ receivedBytes, totalBytes, percent: (receivedBytes / totalBytes) * 100 });
				}
			});
			response.pipe(file);
			file.on('finish', () => file.close(resolve));
		}
	});
}


