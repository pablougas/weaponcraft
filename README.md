# Weaponcraft

Weaponcraft is a browser-game starter built with TypeScript, Phaser, Three.js,
and Vite. It includes a small playable 2D game and a separate 3D scene to use
as starting points. The game runs in your browser; no game engine, GPU server,
or backend is required.

## Requirements

- **Node.js 22.12 or newer** and npm. npm is included with Node.js.
- **Git** to clone the project and save changes.
- A current browser. The 3D demo needs WebGL 2 and hardware acceleration for
  best performance.

Check your installed versions in a terminal:

```sh
node --version
npm --version
git --version
```

The Node version must be `v22.12.0` or newer. If `node` or `npm` is not
recognized after installation, restart your terminal (or editor) so it picks
up the updated PATH. Install Node.js from [nodejs.org](https://nodejs.org/) and
Git from [git-scm.com](https://git-scm.com/downloads) if needed.

## Run locally

Open Terminal (macOS/Linux), PowerShell or Windows Terminal (Windows), or the
integrated terminal in your editor. Clone the repository and enter its folder:

```sh
git clone https://github.com/pablougas/weaponcraft.git
cd weaponcraft
```

Install the exact dependency versions recorded in `package-lock.json`:

```sh
npm ci
```

Start the development server:

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Keep the
terminal open while you play; Vite refreshes the page when you save most source
changes. Stop the server with **Ctrl+C** in that terminal.

The development server binds to all network interfaces so it also works in
Codespaces. On a shared network, do not expose or forward port 5173 publicly;
Codespaces configures the forwarded port as private.

## Play the demos

The default page opens the Phaser 2D game. Collect the five glowing ore pieces:

- Move with **arrow keys** or **W A S D**.
- Click or tap a location in the game to move there.
- Select **Restart game** to start over.

Choose **Three.js 3D demo** in the page navigation to open the 3D scene. Drag
inside the scene to rotate it and scroll to zoom. Select **Phaser 2D game** to
return to the game. Both demos run from the same development server.

## Commands

Run these from the project directory:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server at `http://localhost:5173`. |
| `npm test` | Run the Node.js test suite for the game ZIP packager. |
| `npm run build` | Type-check the TypeScript and create the production site in `dist/`. |
| `npm run preview` | Serve the latest production build at `http://localhost:4173`. Run `npm run build` first. |
| `npm run package` | Build the game and create `artifacts/game.zip` for itch.io. |
| `npm run doctor` | Check required tools, Node.js version, and installed dependencies. |

For a complete local check before sharing changes, run:

```sh
npm test
npm run build
```

The tests use Node's built-in test runner; no separate test framework or browser
installation is needed. They verify that packaging puts `index.html` at the
root of the ZIP and rejects a build without a root `index.html`. There are
currently no automated browser-interaction tests.

To try the optimized build in a browser:

```sh
npm run build
npm run preview
```

Open [http://localhost:4173](http://localhost:4173), then stop the preview
server with **Ctrl+C**.

## Make and package a game

- `src/game.ts` — Phaser 2D scene, movement, and collecting ore.
- `src/three-game.ts` — Three.js 3D scene.
- `src/main.ts` — Selects which demo to load from the page navigation.
- `index.html` and `src/style.css` — Page content and styling.
- `public/` — Static images, audio, and other game assets.
- `public/ASSETS.md` — Record asset creators, source links, licenses, and required credits.

Run `npm run package` to type-check and build the project, then write
`artifacts/game.zip`. The ZIP has `index.html` at its root, as expected for an
itch.io browser game. Upload it to an itch.io project configured as **HTML** and
**playable in the browser**, then test the published page and its controls.

For assets loaded by game code, use paths that continue to work when the game
is hosted below a URL subdirectory. Vite's `import.meta.env.BASE_URL` is
available for constructing those paths; avoid hard-coded root paths such as
`/images/item.png`.

## Git and collaboration

Check which files changed before saving a milestone:

```sh
git status
```

Stage, commit, and push your work:

```sh
git add .
git commit -m "Describe the change"
git push
```

For a team project, coordinate changes and commits with teammates. Do not commit
`node_modules/`, build output, credentials, API keys, or login codes. Those
files and secrets should stay out of the repository.

## GitHub Codespaces

The repository includes `.devcontainer/devcontainer.json` for Codespaces. Create
a Codespace for this repository; it installs dependencies with `npm ci` and
forwards port 5173. Run `npm run dev` in its terminal and open forwarded port
5173 from the **Ports** tab. Codespaces uses Node.js 22. The browser preview
address is temporary; commit and push changes to save them in GitHub.

## Troubleshooting

- **`npm` or `node` is not recognized:** install Node.js 22.12+, then restart
  the terminal or editor and check `node --version`.
- **Node version or Vite engine error:** this project needs Node.js 22.12 or
  newer. Select or install a supported version, then run `npm ci`.
- **Dependencies are missing or inconsistent:** from the project directory,
  run `npm ci`.
- **Port 5173 or 4173 is already in use:** stop the other server using that
  port, then retry. These scripts use strict ports and will not silently choose
  another one.
- **No game preview:** make sure `npm run dev` is still running and open
  `http://localhost:5173` (or the forwarded port in Codespaces).
- **Blank or broken production/itch.io page:** run `npm run build`, check the
  browser console for errors, and confirm assets use relative/base-aware paths.
  The ZIP's `index.html` must be at its root.
- **3D scene is slow or missing:** use a current browser with WebGL 2 and
  hardware acceleration enabled. Try the 2D demo on older devices.
- **Tests or build fail:** start with the first reported error, verify the Node
  version, and run `npm ci` before asking for help. Include the command and
  error output, but remove any credentials or other secrets.

AI coding tools are optional. If you use one, sign in with your own account and
never put credentials or API keys in the project files.
