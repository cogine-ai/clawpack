# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/cogine-ai/clawpack/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cogine-ai/clawpack/releases/tag/v0.1.0
