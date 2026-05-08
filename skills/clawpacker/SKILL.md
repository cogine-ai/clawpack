---
name: clawpacker
description: >
  Guide for using the clawpacker CLI to export, import, inspect, and validate portable OpenClaw agent packages.
  Use this skill whenever the user wants to migrate, share, clone, package, export, import, restore, or move an OpenClaw agent between instances.
  Also use when the user mentions clawpacker, .ocpkg, agent portability, agent templates, workspace packaging, or asks how to transfer an OpenClaw agent to another machine or environment.
  Even if the user just says "package my agent" or "move this agent" or "set up a new instance from an existing agent" — this skill applies.
---

# Clawpacker — OpenClaw Agent Portability CLI

clawpacker exports the portable parts of an OpenClaw agent into a `.ocpkg` package and imports that package into another OpenClaw setup. The core entity is the agent; the workspace travels as part of the agent package. This is template portability, not full-instance backup.

**CLI command:** `clawpacker` (via `npm install -g @cogineai/clawpacker`)
**From source:** `node dist/cli.js` (after `npm install && npm run build` in the clawpack repo)

## Core Workflow

The standard workflow has four steps. Always follow this order when doing a full migration:

```
inspect → export → import → validate
```

You can skip `inspect` if time is tight, but never skip `validate` after import.

---

## 1. Inspect — Assess Portability Before Export

Inspect analyzes a workspace and reports what is portable, what gets excluded, and what needs attention. Run it to preview before committing to an export.

```bash
clawpacker inspect \
  --workspace <source-workspace-path> \
  --config <openclaw-config-path> \
  --agent-id <agent-id> \
  --runtime-mode <none|default|full> \
  --json
```

| Flag | Required | Description |
|------|----------|-------------|
| `--workspace <path>` | Yes | Source workspace directory |
| `--config <path>` | No | OpenClaw config path (auto-discovered if omitted) |
| `--agent-id <id>` | No | Override which agent to extract from config |
| `--runtime-mode <mode>` | No | Inspect runtime portability too; `inspect` defaults to `default` when the flag is omitted |
| `--json` | No | Output machine-readable JSON instead of text |

**What the report tells you:**
- Which workspace files will be included
- Which files are excluded (and why)
- Which files are recognized as bootstrap files (AGENTS.md, SOUL.md, etc.)
- Whether a portable agent definition was extracted from config
- Which config fields are portable vs. need input on import vs. excluded
- Skills topology snapshot and portability labels
- Runtime compatibility labels (`official`, `inferred`, `manual`, `unsupported`) when runtime inspection is enabled

**When to use inspect:**
- Before a first-time export, to verify nothing unexpected is included/excluded
- When troubleshooting why a certain file didn't appear in the package
- When the user wants to understand an agent's portability without actually exporting

---

## 2. Export — Create the Package

Export writes a `.ocpkg/` directory or a `.ocpkg.tar.gz` archive from the source workspace.

```bash
clawpacker export \
  --workspace <source-workspace-path> \
  --out <output-path> \
  --config <openclaw-config-path> \
  --name <package-name> \
  --agent-id <agent-id> \
  --runtime-mode <none|default|full> \
  --archive \
  --json
```

| Flag | Required | Description |
|------|----------|-------------|
| `--workspace <path>` | Yes | Source workspace directory |
| `--out <path>` | Yes | Output path for the package |
| `--name <name>` | No | Override package name (defaults to output directory basename) |
| `--config <path>` | No | OpenClaw config path |
| `--agent-id <id>` | No | Override which agent to extract from config |
| `--runtime-mode <mode>` | No | Include an optional runtime layer; `export` skips runtime files unless this is provided |
| `--archive` | No | Produce a single `.ocpkg.tar.gz` file instead of a directory |
| `--json` | No | Output machine-readable JSON report |

**Key decisions for the user:**

1. **Directory vs. archive?** Use `--archive` when the package needs to be transferred as a single file (email, download, copy to remote). Skip it if both source and target are on the same filesystem.

2. **With or without `--config`?** Providing `--config` extracts a portable agent definition from the OpenClaw config. Without it, the package still contains workspace files but loses the structured agent metadata.

**What gets included:**
- All workspace files except `.git/`, `.openclaw/`, `node_modules/`, and `memory/*.md`
- Bootstrap files are flagged: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `MEMORY.md`, `HEARTBEAT.md`, `BOOTSTRAP.md`
- Agent config (portable fields only), skills manifest, checksums, export report
- Optional runtime subtree when `--runtime-mode` is `default` or `full`
- Optional `meta/binding-hints.json` when source config contains matching top-level `bindings[]` entries for the exported agent

**What is always excluded:**
- Secrets, auth state, API keys, credentials
- Session/runtime state
- Live channel bindings / routing state
- Scheduled jobs / cron registration
- Globally installed skills or extensions
- Daily memory logs (`memory/*.md`)

---

## 3. Import — Restore the Package

Import reads a `.ocpkg/` directory or `.ocpkg.tar.gz` archive and writes it into a target workspace.

```bash
clawpacker import <package-path> \
  --target-workspace <target-workspace-path> \
  --agent-id <target-agent-id> \
  --config <target-openclaw-config-path> \
  --target-agent-dir <target-agent-dir> \
  --force \
  --dry-run \
  --json
```

| Flag | Required | Description |
|------|----------|-------------|
| `<package-path>` | Yes | Path to `.ocpkg/` directory or `.ocpkg.tar.gz` archive (positional argument) |
| `--target-workspace <path>` | Yes | Where to write the workspace files |
| `--agent-id <id>` | Strongly recommended | Target agent id for the imported definition |
| `--config <path>` | No | Target OpenClaw config path |
| `--target-agent-dir <path>` | No | Where runtime files should be restored when the package includes a runtime layer |
| `--force` | No | Overwrite existing workspace or agent config entry |
| `--dry-run` | No | Print the import plan without writing anything |
| `--json` | No | Output machine-readable JSON report |

**Always run `--dry-run` first** when the target environment is not empty. This previews exactly what will happen without making changes.

**Import blocks (refuses to proceed) when:**
- `--target-workspace` is missing
- `--agent-id` is missing
- The target workspace directory already exists (unless `--force`)
- The target agent id already exists in the OpenClaw config (unless `--force`)

When import is blocked, the CLI prints a structured report showing what's blocking and what steps to take. It does not write any files.

**When `--config` is provided**, import upserts the agent definition into the target OpenClaw config. It handles both single-agent (`agent`) and multi-agent (`agents.list`) config formats automatically. Without `--config`, workspace files are still restored but config registration is skipped.

If the package includes a runtime layer, import either needs `--target-agent-dir` or a resolvable target agentDir from the target config. Runtime file collisions also block by default unless `--force` is passed.

---

## 4. Validate — Verify the Import

Validate checks that the imported workspace and config are consistent and complete.

```bash
clawpacker validate \
  --target-workspace <target-workspace-path> \
  --agent-id <expected-agent-id> \
  --config <target-openclaw-config-path> \
  --target-agent-dir <target-agent-dir> \
  --json
```

| Flag | Required | Description |
|------|----------|-------------|
| `--target-workspace <path>` | Yes | The imported workspace path |
| `--agent-id <id>` | No | Expected agent id to verify against |
| `--config <path>` | No | Target OpenClaw config path for consistency checks |
| `--target-agent-dir <path>` | No | Override runtime validation target when the package includes a runtime layer |
| `--json` | No | Output machine-readable JSON report |

**Validation checks:**
- Workspace directory exists
- Required workspace files present: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`
- Import metadata (`.openclaw-agent-package/agent-definition.json`) exists and matches agent id
- If `--config` + `--agent-id`: agent exists in OpenClaw config and workspace path matches
- If runtime metadata exists: runtime files, checksums, agentDir consistency, auth exclusion, and `settings.json` validity are verified too

**After validation passes, remind the user to manually:**
- Review `USER.md`, `TOOLS.md`, and `MEMORY.md` for target-specific adjustments
- Install required skills (skills are manifest-only, not bundled)
- Review `.openclaw-agent-package/binding-hints.json` if present and reapply any routing bindings manually
- Reconfigure any scheduled jobs manually on the target instance
- Verify model/provider availability

---

## Config Discovery

When no `--config` flag is given, clawpacker discovers the OpenClaw config in this order:

1. `OPENCLAW_CONFIG_PATH` environment variable
2. `OPENCLAW_STATE_DIR/openclaw.json`
3. `~/.openclaw/openclaw.json` (default)
4. legacy `clawdbot.json` fallback paths when the canonical file is absent

Config loading follows current OpenClaw semantics:
- JSON5 parsing is supported
- `$include` chains are resolved relative to each included file
- both single-agent (`agent`) and multi-agent (`agents.list`) formats are supported

---

## Typical End-to-End Example

```bash
# 1. Check what's portable
clawpacker inspect \
  --workspace ~/openclaw-workspaces/my-agent \
  --config ~/.openclaw/openclaw.json \
  --runtime-mode default

# 2. Export as archive
clawpacker export \
  --workspace ~/openclaw-workspaces/my-agent \
  --config ~/.openclaw/openclaw.json \
  --out ./my-agent-template.ocpkg \
  --runtime-mode default \
  --archive

# 3. Transfer my-agent-template.ocpkg.tar.gz to target machine, then:

# 4. Preview the import
clawpacker import ./my-agent-template.ocpkg.tar.gz \
  --target-workspace ~/.openclaw/workspace-my-agent \
  --agent-id my-agent \
  --config ~/.openclaw/openclaw.json \
  --target-agent-dir ~/.openclaw/agents/my-agent \
  --dry-run

# 5. Execute the import
clawpacker import ./my-agent-template.ocpkg.tar.gz \
  --target-workspace ~/.openclaw/workspace-my-agent \
  --agent-id my-agent \
  --config ~/.openclaw/openclaw.json \
  --target-agent-dir ~/.openclaw/agents/my-agent

# 6. Validate
clawpacker validate \
  --target-workspace ~/.openclaw/workspace-my-agent \
  --agent-id my-agent \
  --config ~/.openclaw/openclaw.json \
  --target-agent-dir ~/.openclaw/agents/my-agent
```

---

## Troubleshooting

### Import blocked: "Target workspace already exists"

The target directory is not empty. Either:
- Choose a different `--target-workspace` path, or
- Re-run with `--force` (this overwrites package-managed files in place while preserving unrelated files)

After re-importing with `--force`, always run `validate` to confirm the overwrite landed correctly.

### Import blocked: "Target agent already exists in OpenClaw config"

An agent with the same id exists in the config. Either:
- Choose a different `--agent-id`, or
- Re-run with `--force` (this overwrites the config entry)

After re-importing with `--force`, always run `validate` to confirm the config entry is consistent.

### Import blocked: missing `--agent-id`

clawpacker needs a target agent id to register in the config and write import metadata. Always provide `--agent-id` explicitly.

### "OpenClaw config not found"

No config file was discovered. Either:
- Provide `--config` explicitly, or
- Set `OPENCLAW_CONFIG_PATH`, or
- Create `~/.openclaw/openclaw.json`

Import can still proceed without config — workspace files will be restored, but config registration is skipped. A warning is emitted.

### Validation fails: "Missing required workspace file"

A core required workspace file (`AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, or `TOOLS.md`) is missing from the target workspace. Optional files like `MEMORY.md`, `BOOT.md`, `BOOTSTRAP.md`, and `HEARTBEAT.md` do not fail validation on their own.

### Validation fails: "OpenClaw config workspace mismatch"

The workspace path recorded in the OpenClaw config for this agent id doesn't match the `--target-workspace` you provided. Re-import with the correct paths, or manually fix the config entry.

### Skills not working after import

Skills are manifest-only — clawpacker records skill references but does not bundle or install skill implementations. After import, install any referenced skills manually on the target instance.

---

## Package Format Reference

A `.ocpkg` package has this structure:

```
<name>.ocpkg/
├── manifest.json              # Package metadata (format version, source info, includes/excludes)
├── workspace/                 # Mirror of source workspace files
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── USER.md
│   ├── TOOLS.md
│   ├── MEMORY.md
│   └── ...
├── config/
│   ├── agent.json             # Portable agent definition
│   ├── import-hints.json      # Required inputs and warnings for import
│   ├── skills-manifest.json   # Detected skill references
├── meta/
│   ├── binding-hints.json     # Optional source-backed routing hints; metadata only
│   ├── checksums.json         # SHA-256 per-file checksums
│   └── export-report.json     # Export summary
└── runtime/                   # Optional runtime slice when --runtime-mode is used
    ├── manifest.json
    ├── checksums.json
    ├── path-rewrites.json
    ├── settings-analysis.json # Present when inferred settings.json is included
    └── files/
        └── ...
```

Current format version is **2** (backward-compatible reading of v1 packages).

---

## What clawpacker Does NOT Do

Understanding scope prevents confusion:

- **No secrets migration** — API keys, tokens, credentials are never exported
- **No live binding restore** — routing/binding state is metadata-only and must be reconfigured manually
- **No cron portability contract** — there is no `config/cron.json`; scheduled jobs must be recreated manually
- **No skill bundling** — only skill references are recorded, not implementations
- **No full-instance backup** — this is agent template portability, not disaster recovery
- **No auth/session migration** — auth files and session data are always excluded
- **No zero-touch import** — some manual steps are always expected after import
