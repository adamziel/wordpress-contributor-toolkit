// This script runs inside Electron's Node runtime (ELECTRON_RUN_AS_NODE=1)
// It programmatically executes npm install without using a shell.

const path = require('path');

async function main() {
	const targetDir = process.argv[2];
	if (!targetDir) {
		console.error('No target directory provided');
		process.exit(1);
	}

	process.chdir(path.resolve(targetDir));

	try {
		// Resolve npm root via its package.json, then invoke its CLI entry directly.
		// Using absolute path avoids package "exports" subpath restrictions.
		const npmPkgJsonPath = require.resolve('npm/package.json');
		const npmRootDir = path.dirname(npmPkgJsonPath);
		const npmCliAbsPath = path.join(npmRootDir, 'bin', 'npm-cli.js');

		// Prepare argv for the CLI: [node, npm, install]
		process.argv = [process.execPath, 'npm', 'install'];
		process.env.npm_config_loglevel = process.env.npm_config_loglevel || 'verbose';
		process.env.npm_config_progress = 'false';

		require(npmCliAbsPath);
	} catch (err) {
		console.error(err && err.stack ? err.stack : String(err));
		process.exit(1);
	}
}

main();


