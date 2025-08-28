/* global api */

const chooseDirBtn = document.getElementById('chooseDirBtn');
const sitesContainer = document.getElementById('sites');
const logEl = document.getElementById('log');
const downloadStatus = document.getElementById('downloadStatus');

function appendLog(message, type = 'stdout') {
	const prefix = type === 'stderr' ? 'ERR ' : '';
	logEl.textContent += `${prefix}${message}`;
	logEl.scrollTop = logEl.scrollHeight;
}

const serverLogEl = (() => {
	let el = document.getElementById('serverLog');
	if (!el) {
		el = document.createElement('div');
		el.id = 'serverLog';
		el.style.whiteSpace = 'pre-wrap';
		el.style.background = '#0b1';
		el.style.color = '#001';
		el.style.padding = '12px';
		el.style.borderRadius = '6px';
		el.style.height = '180px';
		el.style.overflow = 'auto';
		const header = document.createElement('h3');
		header.textContent = 'Server Logs';
		sitesContainer.parentElement.appendChild(header);
		sitesContainer.parentElement.appendChild(el);
	}
	return el;
})();

function appendServerLog(sitePath, message, type = 'stdout') {
	const prefix = type === 'stderr' ? 'ERR ' : '';
	serverLogEl.textContent += `[${sitePath}] ${prefix}${message}`;
	serverLogEl.scrollTop = serverLogEl.scrollHeight;
}

async function refreshSites() {
	const sites = await window.api.getSites();
	sitesContainer.innerHTML = '';
	sites.forEach((sitePath) => {
		const div = document.createElement('div');
		div.className = 'site';
		div.innerHTML = `
			<div class="path">${sitePath}</div>
			<div style="margin-top:6px;">
				<button class="npmInstall">npm install</button>
				<button class="openDir">open directory</button>
				<span class="serverUrl"></span>
			</div>
		`;
		div.querySelector('.npmInstall').addEventListener('click', async () => {
			appendLog(`\nRunning npm install in ${sitePath}\n`);
			await window.api.runNpmInstall(sitePath, ({ type, data }) => {
				appendLog(data, type);
			}, ({ code }) => {
				appendLog(`\nExited with code ${code}\n`);
			});
		});
		div.querySelector('.openDir').addEventListener('click', async () => {
			await window.api.openDirectory(sitePath);
		});

		// Server toggle per site
		const serverControls = document.createElement('div');
		serverControls.style.marginTop = '6px';
		const toggleBtn = document.createElement('button');
		toggleBtn.textContent = 'Run server';
		const serverUrlSpan = div.querySelector('.serverUrl');
		serverControls.appendChild(toggleBtn);
		div.appendChild(serverControls);

		let running = false;
		toggleBtn.addEventListener('click', async () => {
			if (!running) {
				toggleBtn.disabled = true;
				serverUrlSpan.textContent = 'Starting...';
				await window.api.startServer(
					sitePath,
					(payload) => {
						appendServerLog(payload.sitePath, payload.data, payload.type);
					},
					(url) => {
						// Update UI and open externally (no '/wordpress' suffix)
						serverUrlSpan.innerHTML = '';
						const displayUrl = url.replace(/\/$/, '/');
						const a = document.createElement('a');
						a.href = displayUrl;
						a.textContent = displayUrl;
						a.addEventListener('click', (e) => {
							e.preventDefault();
							window.api.openExternal(displayUrl);
						});
						serverUrlSpan.appendChild(a);
						window.api.openExternal(displayUrl);
						running = true;
						toggleBtn.textContent = 'Stop server';
						toggleBtn.disabled = false;
					},
					() => {
						running = false;
						serverUrlSpan.textContent = 'Stopped';
						toggleBtn.textContent = 'Run server';
					}
				);
			} else {
				await window.api.stopServer(sitePath);
			}
		});

		// Add npm script buttons row
		const scripts = [
			{ name: 'build', label: 'npm run build' },
			{ name: 'build:dev', label: 'npm run build:dev' },
			{ name: 'dev', label: 'npm run dev' },
			{ name: 'test', label: 'npm run test' },
			{ name: 'watch', label: 'npm run watch' },
			{ name: 'grunt', label: 'npm run grunt' }
		];
		const scriptsContainer = document.createElement('div');
		scriptsContainer.style.marginTop = '6px';
		scripts.forEach((s) => {
			const btn = document.createElement('button');
			btn.textContent = s.label;
			btn.addEventListener('click', async () => {
				appendLog(`\nRunning ${s.label} in ${sitePath}\n`);
				await window.api.runNpmScript(sitePath, s.name, [], ({ type, data }) => {
					appendLog(data, type);
				}, ({ code }) => {
					appendLog(`\n${s.label} exited with code ${code}\n`);
				});
			});
			scriptsContainer.appendChild(btn);
		});
		div.appendChild(scriptsContainer);

		sitesContainer.appendChild(div);
	});
}

chooseDirBtn.addEventListener('click', async () => {
	const dir = await window.api.chooseDirectory();
	if (!dir) return;
	downloadStatus.textContent = 'Downloading…';
	try {
		await window.api.setupWordPress(dir);
		downloadStatus.textContent = 'Done';
		await refreshSites();
	} catch (e) {
		downloadStatus.textContent = 'Failed';
		appendLog(String(e));
	}
});

window.addEventListener('DOMContentLoaded', refreshSites);


