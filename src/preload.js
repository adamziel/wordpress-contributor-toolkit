const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	getSites: () => ipcRenderer.invoke('sites:get'),
	addSite: (dir) => ipcRenderer.invoke('sites:add', dir),
	chooseDirectory: () => ipcRenderer.invoke('dialog:choose-dir'),
	setupWordPress: (dir) => ipcRenderer.invoke('wordpress:setup', dir),
	openDirectory: (dir) => ipcRenderer.invoke('dir:open', dir),
	runNpmInstall: async (dir, onLog, onDone) => {
		const { installId } = await ipcRenderer.invoke('npm:install', dir);
		const logHandler = (_e, payload) => {
			if (payload.installId === installId && onLog) onLog(payload);
		};
		const doneHandler = (_e, payload) => {
			if (payload.installId === installId) {
				ipcRenderer.removeListener('npm:install:log', logHandler);
				ipcRenderer.removeListener('npm:install:done', doneHandler);
				if (onDone) onDone(payload);
			}
		};
		ipcRenderer.on('npm:install:log', logHandler);
		ipcRenderer.on('npm:install:done', doneHandler);
	}
,
	runNpmScript: async (dir, scriptName, scriptArgs, onLog, onDone) => {
		const { runId } = await ipcRenderer.invoke('npm:run-script', dir, scriptName, scriptArgs || []);
		const logHandler = (_e, payload) => {
			if (payload.runId === runId && onLog) onLog(payload);
		};
		const doneHandler = (_e, payload) => {
			if (payload.runId === runId) {
				ipcRenderer.removeListener('npm:run-script:log', logHandler);
				ipcRenderer.removeListener('npm:run-script:done', doneHandler);
				if (onDone) onDone(payload);
			}
		};
		ipcRenderer.on('npm:run-script:log', logHandler);
		ipcRenderer.on('npm:run-script:done', doneHandler);
	}
,
	openExternal: (url) => ipcRenderer.invoke('url:open', url)
,
	startServer: async (sitePath, onLog, onUrl, onStopped) => {
		const logHandler = (_e, payload) => {
			if (payload.sitePath === sitePath) onLog && onLog(payload);
		};
		const urlHandler = (_e, payload) => {
			if (payload.sitePath === sitePath) onUrl && onUrl(payload.url);
		};
		const stoppedHandler = (_e, payload) => {
			if (payload.sitePath === sitePath) {
				ipcRenderer.removeListener('playground:log', logHandler);
				ipcRenderer.removeListener('playground:url', urlHandler);
				ipcRenderer.removeListener('playground:stopped', stoppedHandler);
				onStopped && onStopped();
			}
		};
		ipcRenderer.on('playground:log', logHandler);
		ipcRenderer.on('playground:url', urlHandler);
		ipcRenderer.on('playground:stopped', stoppedHandler);

		// Invoke AFTER listeners are attached so early logs/URL are captured
		return await ipcRenderer.invoke('playground:start', sitePath);
	},
	stopServer: async (sitePath) => {
		return await ipcRenderer.invoke('playground:stop', sitePath);
	}
});


