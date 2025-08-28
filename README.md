## WordPress Contributor Toolkit (Electron)

This is a **rough, experimental** Electron app to get started with WordPress Core development. It's meant to work on Windows, macOS, and Linux with zero system dependencies.

It handles the following tasks:

- **Clones** the `wordpress-develop` repository into a local folder – without requiring a system install of `git`.
- **Runs** `npm install`, `npm run build`, `npm run dev` – without requiring a system install of `node` or `npm`.
- **Launches** a local WordPress dev server – without requiring a system install of `apache`, `php` or `mysql`.
- **Generates** a Core patch from your local changes

See *[How does it work?](#how-does-it-work)* for more details.

### Why

Getting a Core dev environment running (Node, npm, git, PHP/MySQL or an alternative) is a common source of friction for new contributors. This app removes most of that friction by bundling the tooling and using WordPress Playground locally for the server.

### Screenshots

#### Video demo

![Video demo](docs/video.mp4)

#### UI

<img src="docs/1.%20UI.png" width="300" alt="UI">

#### Choosing a destination folder for the site

<img src="docs/2.%20Create%20first%20site.png" width="300" alt="UI">

#### Cloning the git repository

<img src="docs/3.%20Cloned%20git%20repo.png" width="300" alt="UI">

#### Running `npm install`

<img src="docs/4.%20npm%20install.png" width="300" alt="UI">

#### Starting the dev server

<img src="docs/5.%20dev%20server.png" width="300" alt="UI">

#### Generating a patch

<img src="docs/6.%20patch.png" width="300" alt="UI">

## Getting started

### Just using the app

1) Download the latest packaged build for your platform from the [workflows page](https://github.com/adamziel/wordpress-contributor-toolkit/actions/workflows/build.yml).
2) Open the app
3) Click "Create WordPress Core site" and choose a destination folder for your site.
4) Click "Install dependencies"
5) Click "Run command > npm run build"
6) Click "Start dev server"
7) A browser window should open automatically. If not, you can manually open it by clicking "Launch site".
8) Make changes in the code
9) Click "Generate patch" to create a diff of your changes.

### Build from source

Requirements: a recent Node.js to build the Electron app itself (runtime for the app is bundled).

```bash
npm install
npm run build:once   # bundle renderer
npm start            # run Electron + renderer in watch mode

# Package installers (no publishing):
npm run dist         # all configured targets
npm run dist:win     # Windows (x64 by default)
npm run dist:win:arm64
```

Output goes to `dist/` (e.g., Windows installer `.exe`).

## Technical notes

### How does it work?

* Git operations are handled by the `isomorphic-git` npm package. It is a pure JS implementation of Git that works in the browser and Node.js.
* Node scripts and npm commands are run using the Node.js runtime bundled with the Electron app. A small shim directory is injected into the PATH so subprocesses can find `node`, `npm`, and `npx` without requiring a system install.
* WordPress server is run using the `@wp-playground/cli` npm package from [WordPress Playground](https://w.org/playground/).
* Patches are generated using the `diff` npm package.

### Why Electron?

* WordPress core relies on Node.js, npm, and webpack for its build system. Electron is an easy way to install Node.js on all major platforms.
* It's a single, self-contained file. It's easy to distribute and install – it can be distributed on a USB sticks if everything else fails.

### Is SQLite enough for WordPress?

SQLite should suffice for most new contributors. The SQLite support is miles ahead of where it used to be (e.g. most plugins and core unit tests work, query monitor works, we track failures and missing features and, thanks to the query parser, we can improve things fairly easily).

For cases when MySQL is required, local Playground can work with MySQL. The only missing part is shipping the MySQL server with the app.

### Ideas and future work

- Integrate Playground's XDebug.
- Built‑in SMTP catcher for local email testing.
- Explore bundling MySQL server with the app.
- Migrate to the PHP Git client in https://github.com/wordpress/php-toolkit.
- Potentially integrate with Studio to benefit from PHP version selector, wp-cli integration and other Studio features.

### License

GPLv2.


