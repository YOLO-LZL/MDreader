# Repository Guidelines

## Project Structure & Module Organization

MDreader is a React 19, TypeScript, and Vite frontend packaged as a Tauri 2 desktop application.

- `src/` contains the UI, application state, shared document helpers, and frontend tests.
- `src/editor/` owns the Milkdown editor component and its styles.
- `src/assets/` and `public/` contain bundled and directly served images/icons.
- `src-tauri/src/` contains Rust commands for opening, saving, and receiving associated Markdown files.
- `src-tauri/tauri.conf.json` and `src-tauri/capabilities/` define desktop packaging and permissions.

Keep browser-independent parsing and path helpers in `src/document.ts`; keep native filesystem behavior behind Tauri commands.

## Build, Test, and Development Commands

- `npm install`: install locked JavaScript dependencies.
- `npm run dev`: start the browser development server, normally on `http://127.0.0.1:5173/`.
- `npm run tauri:dev`: run the desktop app with hot reload; requires Rust and platform build tools.
- `npm run lint`: run Oxlint with React and TypeScript rules.
- `npm run test`: execute frontend Vitest tests once.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust unit tests.
- `npm run build`: type-check and create the production web bundle.
- `npm run tauri:build`: build native installers.

Before opening a PR, run lint, both test suites, and the web build.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, and no semicolons in TypeScript/TSX, matching existing files. Components and exported types use `PascalCase`; functions, variables, hooks, and test helpers use `camelCase`; constants use `UPPER_SNAKE_CASE`. Keep CSS class names lowercase and hyphenated. Let `cargo fmt` format Rust, and use `snake_case` for Rust functions and commands. Avoid broad refactors in feature or bug-fix changes.

## Testing Guidelines

Vitest tests are colocated as `*.test.ts`; Rust unit tests live in a `#[cfg(test)]` module near the implementation. Add focused regression tests for document parsing, path normalization, save behavior, and file-extension validation. There is no stated coverage threshold, so prioritize observable behavior and failure cases.

## Commit & Pull Request Guidelines

Recent history primarily follows Conventional Commit subjects such as `feat: add ...`, `fix: read ...`, and `build: add ...`. Use an imperative, concise subject with the appropriate prefix. PRs should explain user-visible behavior, note browser versus Tauri impact, link related issues, and include screenshots for UI changes. Report the commands run and call out any platform-specific validation, especially Windows packaging or file association behavior.
