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

The following top-level files are recognized by current OpenClaw docs as **bootstrap files** and are flagged in the manifest when present:

`AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `MEMORY.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`

`BOOT.md` is also a documented workspace file, but it is **not** treated as a bootstrap file. If present, clawpacker includes it as a normal workspace file.

For validation purposes, clawpacker only requires the core workspace contract:

`AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`

The following OpenClaw workspace files are treated as **optional** and their absence does not make a workspace invalid:

`BOOT.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`, `MEMORY.md`, `memory.md`, `memory/*.md`

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

The `memory/*.md` exclusion is a **clawpacker product policy**, not an OpenClaw workspace requirement. It exists to keep exports conservative and portable by default.

These rules only apply to contents **within** the scanned workspace directory. The parent `~/.openclaw/` installation and its config files are not part of the workspace scan — OpenClaw config is read separately via `--config` or config discovery.

Beyond file-level exclusions, Clawpacker never exports or restores:

- secrets, auth state, cookies, API keys, credentials
- session/runtime state
- live channel bindings / routing state
- live cron scheduling / scheduled-job registration
- globally installed skills or extensions
- machine-specific absolute-path behavior that is not portable

### Skills model

Skills are **manifest-only** right now.

That means Clawpacker records detected skill references (using backtick-quoted references like `` `skill-name` ``), but it does not bundle or install skill implementations for you.

### Runtime layer (optional)

In addition to workspace files, OpenClaw agents often have runtime configuration stored in a separate **agentDir**. Clawpacker can optionally package a narrow, labeled slice of this runtime layer alongside the workspace.

This is an **optional portability convenience**, not a full backup of the agent runtime directory.

#### Runtime evidence levels

Clawpacker classifies detected runtime files by evidence level:

| Evidence | Meaning | Current files |
|----------|---------|---------------|
| `grounded` | Source-backed and aligned with the current runtime contract | `models.json` |
| `inferred` | Useful convenience files, but not a strong current OpenClaw portability contract | `settings.json`, `prompts/**`, `themes/**` |
| `unsupported` | Not currently treated as canonical portable per-agent artifacts | `skills/**`, `extensions/**` |

`inspect` and `export` report these buckets explicitly so the runtime layer does not overstate what is officially portable.

#### The three modes

| Mode | What gets packaged | When to use |
|------|-------------------|-------------|
| `none` | Nothing from agentDir | You only need workspace files |
| `default` | Only `grounded` runtime artifacts | Honest default for portability checks and packaging |
| `full` | `grounded` plus `inferred` runtime artifacts | When you intentionally want extra convenience files and understand they are not an official capability contract |

Use `--runtime-mode <mode>` on `inspect` and `export`. When omitted, `inspect` defaults to `default`; `export` skips the runtime layer unless the flag is explicitly provided.

`full` does **not** include `skills/**` or `extensions/**`. Those are reported as `unsupported`, not packaged.

#### What is always excluded

Regardless of mode, Clawpacker never packages these from agentDir:

- `auth.json`, `auth-profiles.json` — authentication state
- `sessions/**` — session data
- `.git/**`, `node_modules/**`, `npm/**`, `bin/**` — toolchain artifacts
- `tools/**`, `caches/**`, `logs/**` — ephemeral runtime state
- Files with extensions `.log`, `.lock`, `.tmp`, `.bak`, `.swp`, `.pid`

These exclusions exist because auth and session state is inherently non-portable and should be established fresh on the target instance.

#### models.json sanitization

When `models.json` is included, Clawpacker **sanitizes** it before packaging:

- API keys, secrets, and `$secretRef` objects are stripped
- Secret-bearing HTTP headers are removed
- Non-sensitive fields (model id, provider, max tokens, temperature) are preserved

If sanitization removes everything useful, the file is excluded entirely and a warning is emitted.

#### settings.json path analysis

`settings.json` is an `inferred` artifact, so this analysis runs only when `settings.json` is actually included, for example with `--runtime-mode full`.

Clawpacker analyzes path-like values in `settings.json` and classifies them:

| Classification | Meaning | On import |
|---------------|---------|-----------|
| `package-internal-workspace` | Points inside the source workspace | Rewritten to target workspace path |
| `package-internal-agentDir` | Points inside the source agentDir | Rewritten to target agentDir path |
| `relative` | Relative path (e.g. `./data`) | Preserved as-is |
| `external-absolute` | Absolute path outside workspace/agentDir | Preserved (may need manual update) |
| `host-bound` | Platform-specific path (e.g. `C:\...`, `/proc/...`) | Preserved (warning emitted) |

#### Runtime import behavior

When importing a package that includes a runtime layer:

- **`--target-agent-dir`** specifies where runtime files should be written. If omitted, Clawpacker attempts to resolve it from the target OpenClaw config.
- If no target agentDir can be resolved, import **blocks** and tells you what is needed.
- If runtime files already exist at the target agentDir, import **blocks** unless `--force` is passed. Only allowlisted runtime files are overwritten — auth and session files are never written.
- If a target OpenClaw config is provided, the agent entry is upserted with the agentDir path.
- `settings.json` paths referencing the source workspace or agentDir are automatically rewritten to the target paths when `settings.json` is present in the package.

Use `--dry-run` to preview the full import plan (including runtime file list, path rewrites, and collision detection) before committing.

#### agentDir resolution

The agentDir is resolved from the OpenClaw config by matching the agent entry that owns the source workspace. This requires:

1. A readable OpenClaw config (via `--config`, `OPENCLAW_CONFIG_PATH`, or `~/.openclaw/openclaw.json`)
2. An agent entry with an `agentDir` field

If the config is missing or the agent entry has no `agentDir`, the runtime layer is skipped on inspect, and export errors out with a clear message.

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

With runtime layer inspection:

```bash
node dist/cli.js inspect \
  --workspace ./tests/fixtures/source-workspace \
  --config ./tests/fixtures/openclaw-config/source-config.jsonc \
  --runtime-mode default
```

Machine-readable JSON report:

```bash
node dist/cli.js inspect \
  --workspace ./tests/fixtures/source-workspace \
  --config ./tests/fixtures/openclaw-config/source-config.jsonc \
  --runtime-mode default \
  --json
```

What `inspect` tells you:

- which workspace files are included
- which files are excluded or ignored
- whether a portable agent definition could be derived
- which fields are portable vs import-time inputs
- which skills were detected
- runtime layer contents grouped as `grounded`, `inferred`, and `unsupported` (when `--runtime-mode` is `default` or `full`)
- warnings you should expect on export/import

### 2) Export a package

Directory package (workspace only):

```bash
node dist/cli.js export \
  --workspace ./tests/fixtures/source-workspace \
  --out ./tests/tmp/example-supercoder.ocpkg \
  --name supercoder-template \
  --runtime-mode none
```

Directory package with runtime layer:

```bash
node dist/cli.js export \
  --workspace ./tests/fixtures/source-workspace \
  --config ./tests/fixtures/openclaw-config/source-config.jsonc \
  --out ./tests/tmp/example-supercoder.ocpkg \
  --name supercoder-template \
  --runtime-mode default
```

Single-file archive:

```bash
node dist/cli.js export \
  --workspace ./tests/fixtures/source-workspace \
  --config ./tests/fixtures/openclaw-config/source-config.jsonc \
  --out ./tests/tmp/example-supercoder.ocpkg \
  --name supercoder-template \
  --runtime-mode default \
  --archive
```

The `--archive` flag produces a `.ocpkg.tar.gz` file for easier transport.

Output defaults to human-readable text. Add `--json` for machine-readable output:

```json
{
  "status": "ok",
  "packageRoot": ".../example-supercoder.ocpkg",
  "manifestPath": ".../example-supercoder.ocpkg/manifest.json",
  "fileCount": 12,
  "runtimeMode": "default",
  "runtimeFiles": ["models.json"],
  "runtimeGroundedFiles": ["models.json"],
  "runtimeInferredFiles": ["settings.json", "prompts/system.md"],
  "runtimeUnsupportedFiles": ["skills/review/SKILL.md"]
}
```

For directory exports, `manifestPath` points to the generated `manifest.json` inside the package directory.
For archive exports, `manifestPath` is set to the archive file path itself so JSON output never points at a deleted staging path.

### 3) Import a package

Accepts both `.ocpkg/` directories and `.ocpkg.tar.gz` archives:

```bash
node dist/cli.js import \
  ./tests/tmp/example-supercoder.ocpkg \
  --target-workspace ./tests/tmp/workspace-supercoder-imported \
  --agent-id supercoder-imported \
  --config ./tests/tmp/target-openclaw-config.json
```

Import with runtime layer targeting a specific agentDir:

```bash
node dist/cli.js import \
  ./tests/tmp/example-supercoder.ocpkg \
  --target-workspace ./tests/tmp/workspace-supercoder-imported \
  --agent-id supercoder-imported \
  --target-agent-dir ~/.openclaw/agents/supercoder-imported \
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
- `--target-agent-dir` is required when the package includes a runtime layer and no agentDir is discoverable from the target config
- `--dry-run` prints the import plan (including runtime details, path rewrites, and collision info) and exits without writing files
- if the target workspace or target agent already exists, import blocks unless you pass `--force`
- if runtime files already exist at the target agentDir, import blocks unless `--force` is passed; auth and session files are never written even with `--force`
- if no config is found, import can still restore workspace files, but config registration and runtime import become limited

### 4) Validate the imported result

```bash
node dist/cli.js validate \
  --target-workspace ./tests/tmp/workspace-supercoder-imported \
  --agent-id supercoder-imported \
  --config ./tests/tmp/target-openclaw-config.json
```

When a runtime layer was imported, validate also checks runtime file integrity:

```bash
node dist/cli.js validate \
  --target-workspace ./tests/tmp/workspace-supercoder-imported \
  --agent-id supercoder-imported \
  --target-agent-dir ~/.openclaw/agents/supercoder-imported \
  --config ./tests/tmp/target-openclaw-config.json
```

The `--target-agent-dir` flag can be omitted — validate auto-infers it from import metadata when available.

Output defaults to human-readable text. Add `--json` for a structured report with:

- `passed` — checks that succeeded (including runtime file presence and agentDir consistency)
- `warnings` — non-blocking observations (e.g. auth files found at agentDir)
- `failed` — checks that failed (e.g. missing runtime files, agentDir mismatch)
- `nextSteps` — recommended actions

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
3. a nearby config discovered from `cwd` by checking `./.openclaw/openclaw.json`, `./openclaw.json`, and then the same two locations in up to four parent directories
4. `~/.openclaw/openclaw.json` (default)

Notes:
- if you pass `--config`, Clawpacker does **not** fall through to env / nearby / default discovery when that path is missing
- relative `workspace` and `agentDir` values inside config are resolved relative to the config file directory
- workspace matching prefers exact resolved paths; basename-only fallback is used only when it is unambiguous

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
- daily memory logs (`memory/*.md`) are excluded by default as a clawpacker portability policy
- package contents are declared in a manifest instead of hidden in opaque state
- checksums are generated for integrity verification
- runtime layer is opt-in via `--runtime-mode`
- `models.json` is sanitized before packaging — API keys, secrets, and `$secretRef` objects are removed
- auth and session files are never included in the runtime layer regardless of mode

### Import safety

- import is planned before it executes
- existing workspace collisions block by default
- existing config agent collisions block by default
- existing runtime file collisions block by default
- `--force` is required to overwrite existing targets (workspace and runtime files); workspace files are replaced in-place without removing unrelated files
- `--force` never writes auth or session files — these are always excluded
- `settings.json` paths referencing the source workspace or agentDir are automatically rewritten to the target paths
- import writes local metadata so validation can confirm what happened later

### Post-import safety expectations

Even after a successful import, you should still:

- review `USER.md` and `TOOLS.md`, plus `MEMORY.md` if present
- reinstall any required skills manually
- reconfigure channel bindings and cron jobs manually
- run `openclaw doctor`
- verify model/provider availability on the target instance

Today, clawpacker does not restore live channel bindings or scheduled jobs. A future version may support portable placeholder-based representations for these areas, but that is different from raw instance-state migration.

Clawpacker packages a portable workspace template plus an optional runtime slice. For full-instance moves or environment repair, follow the official OpenClaw migration flow rather than treating clawpacker as a complete instance backup.

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
  runtime/                  # present when --runtime-mode is default or full
    manifest.json
    checksums.json
    path-rewrites.json
    settings-analysis.json  # present when inferred settings.json was included
    files/
      models.json           # sanitized — no API keys or secrets
      settings.json         # present only when inferred files are included
      prompts/              # present only when inferred files are included
        system.md
      themes/               # present only when inferred files are included
        dark.json
```

The `workspace/` directory mirrors the source workspace structure. All non-excluded files are included, so the contents vary depending on what lives in the source workspace.

The `runtime/` subtree is only present when `--runtime-mode default` or `--runtime-mode full` is used on export. Its `manifest.json` records the mode, source agentDir, the `grounded` / `inferred` / `unsupported` classification, and which files were included or excluded. The `files/` subdirectory contains only the runtime files that the selected mode is allowed to package.

Packages can also be distributed as single-file `.ocpkg.tar.gz` archives.

## What is intentionally out of scope

- full OpenClaw instance backup (the runtime layer is a portable slice, not a full agentDir copy)
- secret migration (API keys and auth tokens are stripped on export)
- auth/session migration (auth files are always excluded)
- raw channel binding export/import
- raw cron export/import or scheduler registration
- zero-touch import across mismatched environments

## Roadmap / known limitations

Near-term likely improvements:

- richer import guidance when models or inferred runtime files are missing
- better package compatibility/version negotiation

Current limitations to be aware of:

- package format should still be treated as early-stage (currently v2)
- skills are detected in workspace content, but runtime `skills/**` and `extensions/**` are currently classified as unsupported and are not bundled
- `--force` uses file-level replacement semantics — only files present in the package are overwritten; unrelated files in the target workspace are preserved
- OpenClaw config support is minimal by design
- runtime layer path rewriting only handles inferred `settings.json` — other config files with embedded paths require manual update

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
node dist/cli.js export --workspace ./tests/fixtures/source-workspace --out ./tests/tmp/readme-demo.ocpkg --runtime-mode none
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
