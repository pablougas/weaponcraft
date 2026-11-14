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

The default page is the **Weaponcraft 3D game**
([http://localhost:5173](http://localhost:5173)). It fills the browser window,
shows a loading screen while the physics engine starts, then a
**WEAPONCRAFT** title screen. Click it (or press **Enter**) to start. The first
click unlocks audio and captures the mouse (pointer lock); press **Esc** to
release the mouse. The world behind the title is a placeholder until the
meadow scene arrives in milestone M2 (see `docs/ROADMAP.md`).

The original Phaser 2D starter is still available at
[http://localhost:5173/?demo=2d](http://localhost:5173/?demo=2d). Collect the
five glowing ore pieces:

- Move with **arrow keys** or **W A S D**.
- Click or tap a location in the game to move there.
- Select **Restart game** to start over.

Choose **3D game** in that page's navigation to go back. Both run from the same
development server.

The game saves to your browser automatically (every 10 seconds and when you
leave the page). When a save exists, the title screen shows **Continue** and
**New game**; New game wipes the save and starts the prologue again.

Press **`** (backtick) to open the **dev menu**: tick rate, tick count, world
time, entity count and seed, plus a time-of-day lock, a time scrub slider, a
test spawn button, Save now and New game. It's always available in development;
in a production build, add `#dev` to the URL.

Add `#test` to the URL (for example `http://localhost:4173/#test`) to expose
the `window.wc` test API in a production build; development builds always
expose it. Combine flags with `&`, e.g. `#test&dev`.

## Commands

Run these from the project directory:

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server at `http://localhost:5173`. |
| `npm test` | Run the fast unit tests: Node's runner (`tests/*.test.mjs`) and Vitest (`src/**/*.test.ts`). |
| `npm run build` | Type-check the TypeScript and create the production site in `dist/`. |
| `npm run preview` | Serve the latest production build at `http://localhost:4173`. Run `npm run build` first. |
| `npm run package` | Build the game and create `artifacts/game.zip` for itch.io. |
| `npm run test:e2e` | Run all Playwright browser tests against the dev server (starts it if needed). |
| `npm run test:ship` | Build, serve `dist/` like itch.io does, and run the smoke suite. Run before every upload. |
| `npm run test:visual:update` | Re-record screenshot baselines. Only after the team approves the new look. |
| `npm run doctor` | Check required tools, Node.js version, and installed dependencies. |

For a complete local check before sharing changes, run:

```sh
npm test
npm run build
```

Browser tests need Playwright's Chromium once per machine (the devcontainer
installs it automatically):

```sh
npx playwright install chromium
```

The smoke suite (`tests/e2e/smoke.spec.ts`) checks that the game loads with no
console errors, makes no requests outside its own origin (no CDNs), draws a
non-blank canvas, starts on click, follows window resizes, and that the 2D demo
still loads. Chromium runs headless with SwiftShader WebGL at 1280×720. After a
failure, open the report with `npx playwright show-report`.

To try the optimized build in a browser:

```sh
npm run build
npm run preview
```

Open [http://localhost:4173](http://localhost:4173), then stop the preview
server with **Ctrl+C**.

## Make and package a game

- `docs/SPEC.md` and `docs/ROADMAP.md` — The game design and the build order.
- `src/main.ts` — Loads the 3D game, or the Phaser demo for `?demo=2d`.
- `src/engine/` — Boot sequence, renderer, Rapier physics, audio unlock, pointer lock, test API.
- `src/sim/` — Game state and rules (from milestone M1).
- `src/view/` — Three.js scenes, materials, and effects.
- `src/content/` — Content registries (biomes, gods, spirits, weapons, enemies, mechs, structures).
- `src/ui/` — Loading screen, title screen, and later the HUD and menus.
- `src/demo2d/` — The Phaser 2D starter game and its page styling.
- `index.html` — Page shell with the inline loading screen.
- `tests/e2e/` — Playwright browser tests and screenshot baselines.
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

## Use Claude Code (optional)

Claude Code is a terminal-based coding assistant. On macOS or Linux, install it
using Anthropic's [official instructions](https://code.claude.com/docs/en/setup):

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Open a new terminal and verify the installation:

```sh
claude --version
```

If the installer says `~/.local/bin` is not on your PATH, add it to zsh and
reload the shell:

```sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

From the Weaponcraft project directory, start Claude Code and follow its
interactive sign-in prompts in your browser:

```sh
cd weaponcraft
claude
```

Claude Code reads the repository's `CLAUDE.md` for project-specific development
guidance. On Windows or for other installation methods, use the
[official setup guide](https://code.claude.com/docs/en/setup). Claude Code
requires an eligible Anthropic account or supported provider; check the
[authentication guide](https://code.claude.com/docs/en/authentication) for
current account options. Each developer signs in with their own account.
Never paste passwords, login codes, or API keys into project files or chat.
