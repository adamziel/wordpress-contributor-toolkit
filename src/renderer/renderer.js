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

		// Add npm script buttons row after existing controls
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


