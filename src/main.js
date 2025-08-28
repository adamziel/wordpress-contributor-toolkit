const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fse = require('fs-extra');
const https = require('https');
const extract = require('extract-zip');
const { spawn } = require('child_process');

const WORDPRESS_ZIP_URL = 'https://github.com/WordPress/wordpress-develop/archive/refs/heads/trunk.zip';

let store; // initialized asynchronously due to ESM-only module
const storeReady = import('electron-store').then((m) => {
	const Store = m.default || m;
	store = new Store({
		name: 'settings',
		defaults: { sites: [] }
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
/** @type {Record<string, { child: import('child_process').ChildProcess, url?: string }>} */
const playgroundServers = {};

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

ipcMain.handle('sites:add', async (_e, sitePath) => {
	const s = await getStore();
	const sites = s.get('sites');
	if (!sites.includes(sitePath)) {
		sites.push(sitePath);
		s.set('sites', sites);
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

	const tmpZipPath = path.join(os.tmpdir(), `wordpress-develop-trunk-${Date.now()}.zip`);

	await downloadFile(WORDPRESS_ZIP_URL, tmpZipPath, (progress) => {
		event.sender.send('download:progress', progress);
	});

	await extract(tmpZipPath, { dir: destDir });

	try {
		fs.unlinkSync(tmpZipPath);
	} catch {}

	// The zip extracts into 'wordpress-develop-trunk'
	const extractedDir = path.join(destDir, 'wordpress-develop-trunk');
	if (fs.existsSync(extractedDir)) {
		// remember extracted dir
		const s = await getStore();
		const sites = s.get('sites');
		if (!sites.includes(extractedDir)) {
			sites.push(extractedDir);
			s.set('sites', sites);
		}
		return extractedDir;
	}
	return destDir;
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

	child.stdout.on('data', (data) => {
		event.sender.send('npm:run-script:log', { runId, type: 'stdout', data: data.toString() });
	});
	child.stderr.on('data', (data) => {
		event.sender.send('npm:run-script:log', { runId, type: 'stderr', data: data.toString() });
	});
	child.on('close', (code) => {
		event.sender.send('npm:run-script:done', { runId, code });
		delete runningScripts[runId];
	});

	return { runId };
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


