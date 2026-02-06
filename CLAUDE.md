# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

openclaw-secure is a hardware-gated secret management tool for AI agents. It secures OpenClaw API keys by storing them in pluggable secret backends (macOS Keychain, 1Password, Bitwarden, AWS Secrets Manager, etc.) and replacing config file values with placeholders so AI agents with file access cannot read plain-text secrets.

## Commands

```bash
npm run build          # Build with tsup (ESM, targeting node22)
npm test               # Run all tests (vitest)
npm run test:watch     # Run tests in watch mode
npm run lint           # Type-check with tsc --noEmit
npx vitest run tests/paths.test.ts   # Run a single test file
```

## Architecture

The codebase has two entry points built by tsup: `src/cli.ts` (CLI binary) and `src/index.ts` (programmatic API).

**Core flow:** Read secrets from `~/.openclaw/openclaw.json` -> store in backend -> replace values with `[STORED_IN_KEYCHAIN]` placeholders. The `start` command temporarily restores real keys in memory for the gateway process, then scrubs them back to placeholders.

**Backend plugin system:** All 10 backends implement the `SecretBackend` interface (`src/backends/types.ts`) with methods: `available()`, `get()`, `set()`, `delete()`, `list()`. New backends are registered in `src/backends/index.ts` via the `createBackend` factory and `BACKEND_NAMES` array. Each backend shells out to its respective CLI tool (e.g., `/usr/bin/security` for Keychain, `op` for 1Password).

**Key modules:**
- `src/config.ts` — Read/write/backup of openclaw.json config files
- `src/paths.ts` — Dot-notation JSON path access (`getByPath`, `setByPath`)
- `src/launchagent.ts` — macOS LaunchAgent plist patching for boot-time security (custom regex-based plist parser, no XML library)
- `src/preferences.ts` — User preferences from `~/.openclaw-secure.json`
- `src/constants.ts` — Default config path, secret map, placeholder string, timeout

## Code Conventions

- ESM-only (`"type": "module"`), all imports use `.js` extensions
- Zero runtime dependencies — uses only Node.js built-in APIs
- Strict TypeScript: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` enabled
- Node.js >=22.0.0 required (ES2024 target)
- Tests mirror source structure in `tests/` directory; backends have a `tests/backends/` subdirectory
- Tests use vitest built-in mocking (`vi.mock`, `vi.fn`) with no additional mocking libraries
