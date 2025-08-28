const path = require('path');

async function main() {
	const buildDir = process.argv[2];
	if (!buildDir) {
		console.error('No build directory provided');
		process.exit(1);
	}
	const absBuild = path.resolve(buildDir);

	try {
		const { runCLI } = require('@wp-playground/cli');
		console.log("Running CLI");
		const result = await runCLI({
			command: 'server',
			// Mount the build directory before install as /wordpress to use existing build
			'mount-before-install': [ { hostPath: absBuild, vfsPath: '/wordpress' } ],
			skipWordPressSetup: true,
			verbosity: 'debug'
		});

		const address = result.server.address();
		const port = typeof address === 'object' && address ? address.port : 0;
		const url = `http://127.0.0.1:${port}/`;
		console.log(`SERVER_URL:${url}`);

		// Keep process alive until parent kills it
		process.stdin.resume();
	} catch (err) {
		console.error(err && err.stack ? err.stack : String(err));
		process.exit(1);
	}
}

main();


