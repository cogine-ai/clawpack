# OpenClaw Agent Package CLI v1 Spec

- Date: 2026-03-16
- Status: Draft for review
- Project type: exploratory
- Goal: package and restore a portable OpenClaw agent/workspace template across instances

## 1. Summary

This project defines a CLI for exporting an OpenClaw workspace and its associated portable agent definition into a declarative package, then importing that package into another OpenClaw instance.

The v1 product goal is **template-first portability**, not full-instance backup.

The package should let a user:

1. export a reusable agent/workspace template from a source OpenClaw instance
2. import that template into another OpenClaw instance
3. recreate the target workspace files and agent definition with minimal manual work
4. explicitly avoid migrating secrets, auth state, session history, and environment-bound bindings by default

## 2. Product Goal

### Primary goal

Enable a user to package an existing OpenClaw agent/workspace as a reusable template that another OpenClaw user can import and adapt.

### Non-goals

v1 is **not** intended to:

- back up an entire OpenClaw installation
- migrate auth tokens, secrets, session stores, or credentials
- reproduce exact runtime history
- automatically recreate channel bindings
- copy globally installed skills/extensions/binaries
- guarantee zero-touch import across different machines and providers

## 3. Target User Stories

### Story A: shareable persona template

A user has built a specialized OpenClaw workspace with custom persona files and wants to export it as a reusable package for another OpenClaw instance.

### Story B: repeatable setup

A user wants to create a new agent on a different OpenClaw instance without manually reconstructing `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `MEMORY.md`, and agent-level configuration.

### Story C: guided import

A user wants the import process to restore what is portable, then tell them exactly what still needs manual setup.

## 4. Design Principles

1. **Template-first**: prefer portability and reuse over machine-specific fidelity.
2. **Safe by default**: exclude secrets, auth state, session state, and environment-bound bindings unless explicitly supported later.
3. **Declarative package format**: use a manifest-driven bundle, not an opaque file copy.
4. **Transparent import**: show what will be created, skipped, or requested from the user.
5. **Compatibility-aware**: capture enough metadata to validate import feasibility.
6. **Extensible format**: allow future support for richer skills/config migration without breaking v1 packages.

## 5. v1 Scope Decisions

### Chosen product direction

- Export mode priority: **shareable template**
- Import target: **workspace + agent definition**
- `MEMORY.md`: **included by default**
- `memory/*.md`: **excluded by default**
- Skills: **manifest-only** in v1

### Included by default

Workspace files:

- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `TOOLS.md`
- `MEMORY.md`
- `HEARTBEAT.md` if present

Config artifacts:

- portable agent definition slice
- package manifest
- import hints
- skills manifest
- export report
- checksums

### Excluded by default

- `memory/*.md`
- session history/session store
- auth tokens, API keys, cookies, credentials
- channel bindings and routing rules
- host/node-specific runtime state
- globally installed extensions/skills
- non-portable absolute-path configuration

### Optional future inclusions

- `memory/*.md` via explicit flag
- workspace-local `skills/` packaging
- channel binding draft export
- environment mapping templates

## 6. Package Format

## 6.1 Package identity

The package format is a declarative OpenClaw agent template bundle.

Suggested logical package type:

- `openclaw-agent-template`

Suggested file extension options:

- directory form: `.ocpkg/`
- archive form: `.ocpkg.tar.gz`

The implementation may treat the archive as a transport wrapper around a stable directory structure.

## 6.2 Package directory layout

```text
<name>.ocpkg/
  manifest.json
  workspace/
    AGENTS.md
    SOUL.md
    IDENTITY.md
    USER.md
    TOOLS.md
    MEMORY.md
    HEARTBEAT.md
  config/
    agent.json
    import-hints.json
    skills-manifest.json
  meta/
    checksums.json
    export-report.json
```

### Notes

- `workspace/` contains the portable file payload.
- `config/agent.json` contains only the portable subset of the agent definition.
- `config/import-hints.json` describes fields that must or may be provided during import.
- `config/skills-manifest.json` records skill dependencies; it does not package skill implementations in v1.
- `meta/checksums.json` supports integrity checks.
- `meta/export-report.json` records export decisions for audit/debugging.

## 7. Manifest Specification

`manifest.json` is the root contract for package readers.

### Required fields

- `formatVersion`
- `packageType`
- `name`
- `exportMode`
- `source`
- `includes`
- `excludes`
- `compatibility`

### Example shape

```json
{
  "formatVersion": 1,
  "packageType": "openclaw-agent-template",
  "name": "supercoder-template",
  "exportMode": "template",
  "source": {
    "agentId": "supercoder",
    "workspaceName": "workspace-supercoder",
    "openclawVersion": "unknown"
  },
  "includes": {
    "workspaceFiles": [
      "AGENTS.md",
      "SOUL.md",
      "IDENTITY.md",
      "USER.md",
      "TOOLS.md",
      "MEMORY.md",
      "HEARTBEAT.md"
    ],
    "dailyMemory": false,
    "skills": "manifest-only",
    "agentDefinition": true
  },
  "excludes": {
    "secrets": true,
    "sessionState": true,
    "channelBindings": true,
    "globalExtensions": true
  },
  "compatibility": {
    "minFormatVersion": 1,
    "notes": []
  }
}
```

## 8. Agent Definition Export Model

The CLI must not export raw OpenClaw configuration wholesale. It must instead extract a **portable agent definition slice**.

## 8.1 Field classification model

Every candidate field falls into one of three classes:

1. `portable`
   - safe to recreate directly on import
2. `requiresInputOnImport`
   - meaningful to preserve semantically, but needs target-specific input or remapping
3. `excluded`
   - not appropriate for v1 package export

## 8.2 Portable fields

Examples of fields that are likely portable in principle:

- agent id or suggested agent id
- agent name/display name
- workspace naming suggestion (not raw host-specific absolute path)
- identity-related metadata that can be recreated safely
- model/default model when not obviously instance-bound
- stable agent-level behavioral configuration that is not channel- or host-specific

## 8.3 Requires-input fields

Examples:

- target workspace path or workspace name override
- agent id override when collision exists
- model override when unavailable on target instance
- any field referencing target-local capabilities that may differ

## 8.4 Excluded fields

Examples:

- provider account bindings
- channel routing rules
- auth state
- credentials/secrets
- ephemeral runtime state
- host/node-specific paths
- absolute source machine paths unless explicitly transformed

## 8.5 `agent.json` structure

`config/agent.json` should represent the portable target definition, not the raw source config fragment.

Illustrative structure:

```json
{
  "agent": {
    "suggestedId": "supercoder",
    "suggestedName": "Supercoder",
    "workspace": {
      "suggestedBasename": "workspace-supercoder"
    },
    "identity": {
      "name": "Supercoder"
    },
    "model": {
      "default": "openai-codex/gpt-5.4"
    }
  },
  "fieldClassification": {
    "agent.suggestedId": "requiresInputOnImport",
    "agent.suggestedName": "portable",
    "agent.workspace.suggestedBasename": "requiresInputOnImport",
    "agent.identity.name": "portable",
    "agent.model.default": "portable"
  }
}
```

## 9. Import Hints Model

`config/import-hints.json` tells the importer what to ask, validate, or warn about.

### Responsibilities

- identify required inputs
- provide default suggestions
- explain skipped or environment-bound items
- generate post-import guidance

### Example categories

- target workspace name
- target agent id
- potential model incompatibility
- skill installation reminders
- channel binding not restored warning

Illustrative structure:

```json
{
  "requiredInputs": [
    {
      "key": "agentId",
      "reason": "Target instance may already contain the source agent id"
    },
    {
      "key": "workspaceName",
      "reason": "Workspace path must be resolved on the target instance"
    }
  ],
  "warnings": [
    "Channel bindings are not included in v1 packages",
    "Skills are manifest-only and may require manual installation"
  ]
}
```

## 10. Skills Manifest Model

v1 supports **manifest-only** skill handling.

### Purpose

- record workspace-local skill references if detectable
- record known skill dependencies referenced by the workspace payload
- help the importer present post-import steps

### Explicit v1 limitation

The package does **not** contain actual skill implementations in v1.

### Suggested `skills-manifest.json` structure

```json
{
  "mode": "manifest-only",
  "workspaceSkills": [],
  "referencedSkills": [
    "brainstorming",
    "writing-plans",
    "github"
  ],
  "notes": [
    "Install or verify referenced skills on the target OpenClaw instance."
  ]
}
```

## 11. CLI Surface

Suggested command set:

```bash
ocport inspect
ocport export
ocport import
ocport validate
```

The final tool name may change, but v1 should provide these behaviors.

## 11.1 `inspect`

Purpose:

- analyze a source workspace and agent
- detect exportable files and config
- classify risky/non-portable items
- preview package content

Expected outputs:

- included files
- excluded files/categories
- config portability notes
- detected skill references
- warnings/errors

## 11.2 `export`

Purpose:

- create a package directory or archive
- emit manifest/config/meta artifacts
- optionally include extra payload categories if explicitly requested in future

Illustrative usage:

```bash
ocport export --agent supercoder --out ./dist/supercoder.ocpkg
```

Possible future flags:

- `--workspace <path>`
- `--name <package-name>`
- `--archive`
- `--include-daily-memory`

## 11.3 `import`

Purpose:

- validate package compatibility
- request target-specific inputs
- create target workspace payload
- create/update agent definition from portable slice
- emit next-step guidance

Illustrative usage:

```bash
ocport import ./supercoder.ocpkg --wizard
```

And non-interactive form:

```bash
ocport import ./supercoder.ocpkg --agent-id supercoder2 --workspace-name workspace-supercoder2
```

## 11.4 `validate`

Purpose:

- verify an imported package was applied successfully
- report missing follow-up steps
- check structural completeness

Checks may include:

- workspace exists
- required files exist
- agent definition exists
- agent points at expected workspace
- referenced skills are unresolved or not
- known warnings remain outstanding

## 12. Import Flow

## 12.1 High-level flow

1. open and validate package
2. verify package format compatibility
3. inspect target OpenClaw environment
4. collect required import inputs
5. resolve collisions and target paths
6. write workspace files
7. create or update agent definition
8. run validation
9. print post-import guidance

## 12.2 Interactive import flow

The `--wizard` mode should:

1. show package summary
2. show what is included/excluded
3. ask for target agent id
4. ask for target workspace name
5. warn about non-imported categories
6. ask for confirmation before writing
7. complete import and print follow-up checklist

## 12.3 Non-interactive import flow

The non-interactive mode should:

- require all mandatory inputs up front
- fail fast on missing required inputs
- refuse destructive overwrite by default
- produce machine-readable and human-readable output if feasible

## 13. Safety Rules

v1 safety defaults:

1. do not export secrets or auth state
2. do not export session history
3. do not export channel bindings
4. do not overwrite target workspace or agent silently
5. do not assume target models, channels, or nodes match source
6. do not package global extensions/skills in v1
7. do not claim full reproducibility when environment-bound pieces were intentionally excluded

## 14. Error Handling

### Export-time errors

- workspace not found
- agent not found
- unsupported config layout
- required files unreadable
- output path conflict

### Import-time errors

- invalid package structure
- unsupported format version
- corrupted or mismatched checksums
- target agent id conflict
- target workspace already exists and overwrite not allowed
- insufficient permissions
- incompatible target OpenClaw config assumptions

### Warning conditions

- referenced skill not available on target
- target model unavailable or unknown
- optional workspace files missing in source
- source package lacks some metadata due to export environment limitations

## 15. Validation Output Model

Validation should separate:

- `passed`
- `warnings`
- `failed`
- `nextSteps`

Example next steps:

- install or verify referenced skills
- set up channel bindings manually
- adjust model selection if target lacks source model
- review imported `IDENTITY.md` / `USER.md` / `MEMORY.md`

## 16. Compatibility Model

v1 should assume package format versioning is required from the start.

### Rules

- readers must check `formatVersion`
- writers must emit `formatVersion`
- incompatible major format changes must fail loudly
- additive future fields should be ignored safely where possible

## 17. Internal Module Decomposition

Suggested implementation modules:

1. **workspace scanner**
   - detects supported files
   - determines inclusion/exclusion
2. **agent extractor**
   - reads source config and derives portable agent slice
3. **manifest builder**
   - writes `manifest.json`, checksums, export report
4. **skills detector**
   - records skill references and workspace skill presence
5. **package writer**
   - writes directory or archive output
6. **package reader**
   - opens and validates package contents
7. **import planner**
   - resolves target inputs, collisions, and write plan
8. **import executor**
   - writes workspace files and agent definition
9. **validator**
   - checks post-import completeness

This decomposition keeps config inference, package IO, and import mutation clearly separated.

## 18. Open Questions Deferred Beyond v1

These are intentionally out of scope for the first implementation cycle:

- should v2 package workspace-local `skills/` content?
- should there be a `snapshot` mode in addition to `template` mode?
- should channel binding configs be exportable as draft-only templates?
- should packages support secret placeholders or setup schemas?
- should import integrate with OpenClaw doctor/setup flows?
- should packages become publishable/shareable artifacts with metadata registries?

## 19. Success Criteria

v1 is successful if it can:

1. export a valid declarative package from a source workspace/agent
2. include the default workspace core files and `MEMORY.md`
3. exclude `memory/*.md`, secrets, session state, and channel bindings by default
4. reconstruct a target workspace and agent definition on another OpenClaw instance
5. clearly report what was restored versus what still needs manual setup
6. do all of the above with safe defaults and explicit validation

## 20. Recommended v1 Positioning

This tool should be described as:

> a portability CLI for packaging and restoring reusable OpenClaw agent/workspace templates

It should **not** be positioned as a full backup/restore tool in v1.
