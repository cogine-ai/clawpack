# Clawpacker

> Portable OpenClaw agent/workspace templates for sharing, cloning, and rehydrating on another instance.

Clawpacker is a small TypeScript CLI for exporting the portable parts of an OpenClaw agent workspace into a declarative package, then importing that package into another OpenClaw setup.

## Why this exists

OpenClaw agents often live inside a workspace with persona files, conventions, and a bit of agent config glue. Recreating that setup by hand is annoying, error-prone, and easy to drift.

Clawpacker focuses on the reusable part of that problem:

- capture the workspace files that define an agent's behavior
- extract a portable slice of agent config
- restore that template somewhere else
- clearly tell you what still needs manual setup

This is **template portability**, not full-instance backup.

## Status

**Internal alpha.** The current CLI is usable for early experiments (package format v2), but the format and UX should still be treated as early-stage.

Use it when you want to:

- package an existing OpenClaw workspace as a reusable template
- move a persona/operator setup between instances with minimal manual work
- validate what was imported

Do **not** treat it as a production-grade backup, archival, or disaster-recovery tool yet.

## What Clawpacker does

### Included

Clawpacker uses a **blacklist model** — it includes all files in the workspace (including subdirectories) except those matching explicit exclusion rules.

The following files are recognized as **bootstrap files** and flagged in the manifest:

`AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `MEMORY.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

All other workspace files are included as well, preserving directory structure.

The package also contains metadata:

- `manifest.json`
- `config/agent.json`
- `config/import-hints.json`
- `config/skills-manifest.json`
- `meta/checksums.json`
- `meta/export-report.json`

### Excluded

Clawpacker excludes the following subdirectories if they appear inside the workspace:

- `.git`
- `.openclaw`
- `node_modules`

And these file patterns:

- `memory/*.md` daily logs

These rules only apply to contents **within** the scanned workspace directory. The parent `~/.openclaw/` installation and its config files are not part of the workspace scan — OpenClaw config is read separately via `--config` or config discovery.

Beyond file-level exclusions, Clawpacker never exports or restores:

- secrets, auth state, cookies, API keys, credentials
- session/runtime state
- channel bindings / routing state
- globally installed skills or extensions
- machine-specific absolute-path behavior that is not portable

### Skills model

Skills are **manifest-only** right now.

That means Clawpacker records detected skill references (using backtick-quoted references like `` `skill-name` ``), but it does not bundle or install skill implementations for you.

## Install

### Published package

```bash
npm install -g @cogineai/clawpacker
clawpacker --help
```

### From source

```bash
npm install
npm run build
```

Run the built CLI:

```bash
node dist/cli.js --help
```

### Node requirement

- Node.js `>= 20`

## Command overview

After building, the CLI exposes four commands:

- `inspect` — analyze a workspace before packaging
- `export` — write a `.ocpkg/` directory or `.ocpkg.tar.gz` archive
- `import` — restore a package into a target workspace
- `validate` — verify an imported workspace target

If you install the published package, the CLI command is:

```bash
clawpacker
```

For local source usage, you can still run:

```bash
node dist/cli.js
```

## Usage

### 1) Inspect a source workspace

Human-readable report:

```bash
node dist/cli.js inspect \
  --workspace ./tests/fixtures/source-workspace
```

Machine-readable JSON report:

```bash
node dist/cli.js inspect \
  --workspace ./tests/fixtures/source-workspace \
  --config ./tests/fixtures/openclaw-config/source-config.jsonc \
  --json
```

What `inspect` tells you:

- which workspace files are included
- which files are excluded or ignored
- whether a portable agent definition could be derived
- which fields are portable vs import-time inputs
- which skills were detected
- warnings you should expect on export/import

### 2) Export a package

Directory package:

```bash
node dist/cli.js export \
  --workspace ./tests/fixtures/source-workspace \
  --config ./tests/fixtures/openclaw-config/source-config.jsonc \
  --out ./tests/tmp/example-supercoder.ocpkg \
  --name supercoder-template
```

Single-file archive:

```bash
node dist/cli.js export \
  --workspace ./tests/fixtures/source-workspace \
  --config ./tests/fixtures/openclaw-config/source-config.jsonc \
  --out ./tests/tmp/example-supercoder.ocpkg \
  --name supercoder-template \
  --archive
```

The `--archive` flag produces a `.ocpkg.tar.gz` file for easier transport.

Output defaults to human-readable text. Add `--json` for machine-readable output:

```json
{
  "status": "ok",
  "packageRoot": ".../example-supercoder.ocpkg",
  "manifestPath": ".../example-supercoder.ocpkg/manifest.json",
  "fileCount": 12
}
```

### 3) Import a package

Accepts both `.ocpkg/` directories and `.ocpkg.tar.gz` archives:

```bash
node dist/cli.js import \
  ./tests/tmp/example-supercoder.ocpkg \
  --target-workspace ./tests/tmp/workspace-supercoder-imported \
  --agent-id supercoder-imported \
  --config ./tests/tmp/target-openclaw-config.json
```

Preview the import plan without writing anything:

```bash
node dist/cli.js import \
  ./tests/tmp/example-supercoder.ocpkg \
  --target-workspace ./tests/tmp/workspace-supercoder-imported \
  --agent-id supercoder-imported \
  --dry-run
```

Notes:

- `--target-workspace` is required
- `--agent-id` is strongly recommended and becomes required in practice for collision-safe import planning
- `--dry-run` prints the import plan and exits without writing files
- if the target workspace or target agent already exists, import blocks unless you pass `--force`
- if no config is found, import can still restore workspace files, but config registration becomes limited

### 4) Validate the imported result

```bash
node dist/cli.js validate \
  --target-workspace ./tests/tmp/workspace-supercoder-imported \
  --agent-id supercoder-imported \
  --config ./tests/tmp/target-openclaw-config.json
```

Output defaults to human-readable text. Add `--json` for a structured report with:

- `passed`
- `warnings`
- `failed`
- `nextSteps`

## OpenClaw config awareness

Clawpacker is OpenClaw-aware, but intentionally narrow.

When you provide `--config`, or when import can discover a nearby OpenClaw config, Clawpacker can:

- derive a portable agent definition from an existing config entry
- classify config fields as portable, excluded, or requiring import-time input
- upsert the imported agent into the target OpenClaw config
- validate that the imported workspace path matches the target config entry

### Config discovery behavior

Config is resolved in this order:

1. explicit `--config` flag
2. `OPENCLAW_CONFIG_PATH` environment variable
3. `~/.openclaw/openclaw.json` (default)

### Portable config philosophy

Clawpacker does **not** export raw OpenClaw config wholesale.

Instead, it extracts a portable slice of agent config, including:

- agent id and display name
- workspace basename suggestion
- identity name
- default model, when present
- tools, skills, heartbeat, sandbox, and runtime settings

And it explicitly excludes things like:

- channel bindings
- secrets
- provider/account-specific runtime state

## Safety model

Clawpacker is designed to be conservative.

### Export safety

- all workspace files are included except explicitly excluded directories and patterns
- daily memory logs (`memory/*.md`) are excluded by default
- package contents are declared in a manifest instead of hidden in opaque state
- checksums are generated for integrity verification

### Import safety

- import is planned before it executes
- existing workspace collisions block by default
- existing config agent collisions block by default
- `--force` is required to overwrite existing targets
- import writes local metadata so validation can confirm what happened later

### Post-import safety expectations

Even after a successful import, you should still:

- review `USER.md`, `TOOLS.md`, and `MEMORY.md`
- reinstall any required skills manually
- recreate channel bindings manually
- verify model/provider availability on the target instance

## Package structure

A typical package looks like this:

```text
supercoder-template.ocpkg/
  manifest.json
  workspace/
    AGENTS.md
    SOUL.md
    IDENTITY.md
    USER.md
    TOOLS.md
    MEMORY.md
    HEARTBEAT.md
    custom-prompts/
      review.md
    ...                     # any other workspace files
  config/
    agent.json
    import-hints.json
    skills-manifest.json
  meta/
    checksums.json
    export-report.json
```

The `workspace/` directory mirrors the source workspace structure. All non-excluded files are included, so the contents vary depending on what lives in the source workspace.

Packages can also be distributed as single-file `.ocpkg.tar.gz` archives.

## What is intentionally out of scope

- full OpenClaw instance backup
- secret migration
- auth/session migration
- channel binding export/import
- packaging globally installed skill implementations
- zero-touch import across mismatched environments

## Roadmap / known limitations

Near-term likely improvements:

- richer import guidance when models or skills are missing
- optional packaging for workspace-local skill folders
- better package compatibility/version negotiation

Current limitations to be aware of:

- package format should still be treated as early-stage (currently v2)
- skills are detected, but not bundled
- import assumes conservative file-level replacement semantics via `--force`
- OpenClaw config support is minimal by design

## Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run the CLI directly in dev:

```bash
npm run dev -- --help
```

## Verifying the examples locally

A practical smoke path is:

```bash
npm run build
node dist/cli.js inspect --workspace ./tests/fixtures/source-workspace --json
node dist/cli.js export --workspace ./tests/fixtures/source-workspace --out ./tests/tmp/readme-demo.ocpkg
node dist/cli.js import ./tests/tmp/readme-demo.ocpkg --target-workspace ./tests/tmp/readme-demo-target --agent-id readme-demo
node dist/cli.js validate --target-workspace ./tests/tmp/readme-demo-target --agent-id readme-demo
npm test
```

## Naming

The npm package name is **`@cogineai/clawpacker`** while the GitHub repository remains **`cogine-ai/clawpack`**.

Why this naming split:

- short and memorable
- feels native to the OpenClaw ecosystem
- communicates portability/transport clearly
- keeps the repository path stable while making the published package name explicit

---

If you are evaluating this repo for internal alpha use: treat it as a practical portability prototype with a conservative safety model, not as a finished backup product.
