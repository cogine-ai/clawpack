# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-03-19

### Added

- `import --dry-run` mode to preview the import plan without writing files (#10)
- Package manifest metadata: `createdAt`, `createdBy`, `platform`, `contentHash` (#12)
- Discriminated import plan types: `BlockedImportPlan` / `ExecutableImportPlan` for safer plan handling (#15)
- GitHub Actions CI workflow for master and develop branches (#6)
- Biome as unified linter/formatter toolchain (#8)

### Changed

- Package format upgraded to v2; older v1 packages remain readable (`MIN_READABLE_FORMAT_VERSION = 1`) (#33)
- Workspace scanning switched from allowlist to blacklist model — all files are included except excluded directories (`.git`, `.openclaw`, `node_modules`) and patterns (`memory/*.md`), including files in subdirectories (#33)
- Agent config extraction expanded to full portable slice including tools, skills, heartbeat, sandbox, runtime, params, and subagents (#33)
- OpenClaw config aligned with actual spec: supports `agent` (single) and `agents.list` (multi-agent) formats, `OPENCLAW_CONFIG_PATH` env var, default path changed to `~/.openclaw/openclaw.json` (#32)

### Fixed

- Enforce manifest-declared file reads and add `formatVersion` type validation (#33)
- OpenClaw config parsing aligned with actual OpenClaw spec (#32)

## [0.1.0] - 2026-03-17

Initial alpha release of clawpacker — a portability CLI for OpenClaw agents and workspaces.

### Added

- `inspect` command to analyze workspace portability before packaging
- `export` command to write `.ocpkg/` directory packages from a source workspace
- `import` command to restore a package into a target workspace with collision detection
- `validate` command to verify an imported workspace matches its source package
- `.ocpkg` package format with manifest, workspace files, config slice, and metadata
- `.ocpkg.tar.gz` archive format for single-file distribution (#7)
- SHA-256 checksum generation on export and integrity verification on validate
- OpenClaw config discovery (`openclaw-config.json`, `.jsonc`, `~/.openclaw/`)
- Portable agent config extraction — minimal slice of agent definition without secrets or bindings
- Config upsert on import with collision blocking (requires `--force` to overwrite)
- Skill reference detection from workspace files (manifest-only, no bundling)
- JSONC config parsing via `strip-json-comments` (#2)
- Human-readable terminal output by default, `--json` flag for machine-readable output (#13)
- Branded CLI error output for blocked operations (#3)
- Import planning with clear reporting of what will be created, skipped, or blocked
- `prepublishOnly` guard requiring passing build and tests before publish

### Fixed

- Reduced false positives in skill reference detection by requiring backtick quoting (#5)
- Unified CLI output format across export/import/validate commands (#13)
- Cleaned up blocked-import failure output for operator readability (#3)

[Unreleased]: https://github.com/cogine-ai/clawpack/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/cogine-ai/clawpack/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cogine-ai/clawpack/releases/tag/v0.1.0
