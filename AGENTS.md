# AGENTS.md

This file is for human contributors and coding agents working on **clawpack**.

Keep it short. Keep it operational. Do not turn this into a second README.

## Project Identity

- **Repo name:** `clawpack`
- **npm package:** `@cogineai/clawpacker`
- **CLI command:** `clawpacker`

clawpack is a **portability CLI for OpenClaw agents and workspaces**.

Its job is to help users:
- inspect portability
- export reusable packages
- import them into another OpenClaw setup
- validate the restored result

## Scope

Build and refine:
- workspace/package inspection
- package export/import
- validation
- conservative OpenClaw config awareness
- safe packaging and migration workflows

Do **not** casually expand this project into:
- full-instance backup/restore
- secret migration
- auth/session history migration
- aggressive channel binding automation
- “copy everything from ~/.openclaw” behavior

If a feature starts pushing the project in that direction, stop and narrow it.

## Safety Defaults

This project should be **safe by default**.

That means:
- prefer explicit user action over silent mutation
- prefer warnings and next steps over guessing
- prefer dry-run / preflight style visibility when practical
- do not perform destructive writes without clear intent
- do not write more OpenClaw config than necessary

When integrating with OpenClaw config:
- extract a **portable slice**, not the whole world
- write back only the minimum scoped agent definition needed
- degrade gracefully when config is missing or ambiguous

## CLI UX Principles

CLI behavior should stay consistent:
- default output should favor **human-readable terminal use**
- machine-readable output should be available via flags like `--json`
- blocked operations should produce clean operator-facing output, not stack-trace soup
- import-related flows should clearly show what will be created, skipped, blocked, or required from the user

Do not make one command human-friendly and the others raw/internal by accident.

## Dependency Philosophy

Be conservative about “clever” homegrown parsing logic.

Prefer mature, focused dependencies when they reduce correctness risk, especially for:
- JSONC parsing
- archive handling
- integrity/format handling

Avoid brittle regex-heavy implementations for critical config behavior when a small stable library would be safer.

## Package / Format Principles

The package format should remain:
- explicit
- inspectable
- versioned
- backwards-aware where reasonable

When extending the format:
- prefer additive changes
- keep old packages readable when possible
- avoid unnecessary churn in internal metadata paths unless there is a clear user-facing benefit

## Release Hygiene

Before publishing or cutting a release, at minimum run:

```bash
npm test
npm run build
npm pack
```

Do not publish if build/test/package verification is failing or stale.

Keep these aligned before release:
- CHANGELOG.md — update `[Unreleased]` with all notable changes, then promote to a versioned section on release
- README examples
- CLI behavior
- npm package metadata
- GitHub release text when relevant

### CHANGELOG Maintenance

CHANGELOG.md follows [Keep a Changelog](https://keepachangelog.com/) format.

When merging a PR with user-facing impact:
- add an entry under `## [Unreleased]` in the appropriate category (`Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`)
- reference the issue/PR number when applicable (e.g. `(#42)`)

When cutting a release:
- rename `## [Unreleased]` contents to `## [x.y.z] - YYYY-MM-DD`
- add a fresh empty `## [Unreleased]` section above it
- update the comparison links at the bottom of the file

## Contribution Bias

Prefer work that improves one of these:
- portability correctness
- safety
- output clarity
- config conservatism
- test confidence
- release reliability

Be skeptical of work that mainly adds scope without improving those.
