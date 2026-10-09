# Contributing

Thanks for your interest in NC Viewer. This is a Tauri 2 desktop app with a React 19 +
TypeScript frontend and a small Rust backend for large files.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Rust stable (for the desktop shell and backend)
- Python 3 + `netCDF4` + `numpy` — only to regenerate `test-data/` samples

Linux additionally needs the Tauri system libraries:

```sh
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

## Getting started

```sh
npm install
npm run dev        # web preview at http://localhost:5173
npx tauri dev      # desktop shell
```

Open a `.nc` file by dragging it onto the window, or click **Open file**.

## Before you commit

Run the same checks CI does:

```sh
npm run build      # tsc -b && vite build (type-checks everything)
npm run lint       # oxlint
npm run test       # unit tests
```

When you touch Rust:

```sh
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Line endings are normalized to LF via `.gitattributes` (`.bat`/`.cmd`/`.ps1` stay CRLF).

## Conventions

- **UI strings** live in `src/lib/i18n.ts` and are read through `useI18n().t('key')`.
  Add a key to the `zh` catalogue first (it is the type source), then translate it in `en`.
  Both locales must have identical keys and placeholders — a unit test enforces this.
- **Colormaps** have a single source of truth in `src/lib/colormap.ts`; never redefine one
  in a component.
- **Types** have a single source of truth in `src/lib/ncTypes.ts`.
- Keep the light theme tokens (`canvas/surface/line/ink/…`) and shared control classes
  (`.btn`, `.field`, `.view-tab`) instead of hardcoding colors.
- Preserve keyboard `focus-visible` rings and `aria-pressed` on toggles; inputs need labels.

## Tests

Unit tests cover pure logic and run in plain Node (no browser):

```sh
npm run test
```

`src/lib/*.test.ts` and `src/components/*.test.ts` assert behavior; `bench/**/*.bench.ts`
measure performance (`npm run bench`). Prefer testing pure functions — if a helper inside a
component needs coverage, export it.

## Documentation

- `README.md` (English) and `README.zh.md` (简体中文) must stay in sync; each links to the other at the top.
- `AGENTS.md` documents the architecture and conventions for AI agents — update it when you
  change structure, commands or workflows.

## Releases

Maintainers cut a release by tagging:

```sh
git tag -a v0.1.0 -m "NC Viewer v0.1.0"
git push origin v0.1.0
```

This triggers the release workflow, which builds installers on Windows, macOS and Linux and
publishes a GitHub Release. Bump the version in `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` and `package.json` beforehand.
