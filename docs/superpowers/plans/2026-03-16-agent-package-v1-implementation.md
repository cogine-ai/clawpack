# OpenClaw Agent Package CLI v1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a template-first portability CLI that exports a portable OpenClaw workspace + agent definition package and imports it into another OpenClaw instance with validation.

**Architecture:** Implement a small Node.js CLI around a declarative package format. Keep package scanning, config extraction, package IO, import planning, and validation in separate modules so v1 can ship safely and later grow into richer packaging modes.

**Tech Stack:** Node.js, TypeScript, filesystem APIs, tar/gzip archive support (or directory-first writer with optional archive wrapper), JSON schema-lite validation, test runner chosen by repo bootstrap.

---

## File Structure

### Proposed files

**Project root**
- Create: `package.json` — package metadata, scripts, dependency list
- Create: `tsconfig.json` — TypeScript configuration
- Create: `.gitignore` — ignore build outputs and temporary fixtures
- Create: `README.md` — usage and scope summary (expand existing placeholder)

**CLI entry + command layer**
- Create: `src/cli.ts` — process entrypoint
- Create: `src/commands/inspect.ts` — inspect command handler
- Create: `src/commands/export.ts` — export command handler
- Create: `src/commands/import.ts` — import command handler
- Create: `src/commands/validate.ts` — validate command handler

**Core domain modules**
- Create: `src/core/constants.ts` — package format constants, default file allowlists, defaults
- Create: `src/core/types.ts` — shared TypeScript interfaces for manifest, plans, reports
- Create: `src/core/workspace-scan.ts` — detect workspace files and inclusion/exclusion decisions
- Create: `src/core/agent-extract.ts` — derive portable agent definition slice from source config
- Create: `src/core/skills-detect.ts` — detect workspace skill presence and referenced skill names
- Create: `src/core/manifest.ts` — build manifest and export metadata
- Create: `src/core/checksums.ts` — checksum generation/verification
- Create: `src/core/package-write.ts` — write package directory and optional archive
- Create: `src/core/package-read.ts` — read and validate package contents
- Create: `src/core/import-plan.ts` — resolve required inputs, collisions, and write plan
- Create: `src/core/import-exec.ts` — perform import writes safely
- Create: `src/core/validate.ts` — post-import validation logic

**Adapters / utilities**
- Create: `src/adapters/openclaw-config.ts` — locate and parse OpenClaw config needed for agent extraction/import
- Create: `src/utils/fs.ts` — file helpers
- Create: `src/utils/json.ts` — JSON read/write helpers
- Create: `src/utils/output.ts` — human-readable output and warning formatting
- Create: `src/utils/errors.ts` — typed errors

**Fixtures / tests**
- Create: `tests/fixtures/source-workspace/AGENTS.md`
- Create: `tests/fixtures/source-workspace/SOUL.md`
- Create: `tests/fixtures/source-workspace/IDENTITY.md`
- Create: `tests/fixtures/source-workspace/USER.md`
- Create: `tests/fixtures/source-workspace/TOOLS.md`
- Create: `tests/fixtures/source-workspace/MEMORY.md`
- Create: `tests/fixtures/source-workspace/memory/2026-03-16.md`
- Create: `tests/fixtures/packages/` — generated or static package fixtures
- Create: `tests/workspace-scan.test.ts`
- Create: `tests/agent-extract.test.ts`
- Create: `tests/skills-detect.test.ts`
- Create: `tests/manifest.test.ts`
- Create: `tests/package-roundtrip.test.ts`
- Create: `tests/import-plan.test.ts`
- Create: `tests/validate.test.ts`

**Docs**
- Existing: `docs/specs/2026-03-16-agent-package-v1.md` — source spec
- Existing: `docs/superpowers/plans/2026-03-16-agent-package-v1-implementation.md` — this plan

### Responsibility boundaries

- `workspace-scan.ts` decides file inclusion and exclusion only; it must not know about package IO.
- `agent-extract.ts` translates OpenClaw config into a portable slice and classification report.
- `manifest.ts` builds metadata from scanner + extractor outputs.
- `package-write.ts` and `package-read.ts` handle only package serialization concerns.
- `import-plan.ts` decides what would be written and what input is required.
- `import-exec.ts` mutates the target filesystem/config only after a complete plan exists.
- `validate.ts` verifies structure and reports warnings/next steps.

## Chunk 1: Bootstrap the exploratory CLI project

### Task 1: Establish package metadata and TypeScript scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Modify: `README.md`
- Test: `package.json` scripts via local run

- [ ] **Step 1: Write the failing bootstrap check**

Create a minimal smoke command expectation in `README.md` notes or a future test placeholder describing that `npm run build` and `npm run test` must exist and currently fail because project metadata is missing.

- [ ] **Step 2: Run bootstrap command to verify it fails**

Run: `npm run build`
Expected: FAIL because `package.json` does not yet exist or has no build script.

- [ ] **Step 3: Write minimal project metadata**

Create `package.json` with:
- package name
- private flag if desired for exploration
- scripts: `build`, `test`, `lint` (optional), `dev`
- dependencies only for CLI argument parsing and archive support if used
- dev dependencies for TypeScript and test runner

Create `tsconfig.json` targeting current Node runtime.

Create `.gitignore` for:
- `node_modules/`
- `dist/`
- generated package outputs
- temporary test output directories

Expand `README.md` with:
- project purpose
- current scope
- how to install deps
- how to run commands

- [ ] **Step 4: Run bootstrap commands to verify they now execute**

Run:
- `npm install`
- `npm run build`
Expected:
- install completes
- build either succeeds or fails only because source files are still missing, in which case add the minimal source placeholder in Task 2

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore README.md
git commit -m "chore: bootstrap agent package cli project"
```

### Task 2: Add CLI entrypoint skeleton and command registration

**Files:**
- Create: `src/cli.ts`
- Create: `src/commands/inspect.ts`
- Create: `src/commands/export.ts`
- Create: `src/commands/import.ts`
- Create: `src/commands/validate.ts`
- Test: basic CLI smoke test or direct command invocation

- [ ] **Step 1: Write the failing CLI smoke test**

Create a test or scripted assertion that running the CLI with `--help` exits successfully and lists `inspect`, `export`, `import`, and `validate`.

- [ ] **Step 2: Run test to verify it fails**

Run the chosen test command or `node dist/cli.js --help` after build.
Expected: FAIL because the CLI entrypoint is not implemented.

- [ ] **Step 3: Write minimal CLI implementation**

Implement `src/cli.ts` to:
- register four commands
- wire each to a placeholder handler
- print structured placeholder output like `NOT_IMPLEMENTED_YET`

Implement each command file as a thin async wrapper.

- [ ] **Step 4: Run test to verify it passes**

Run:
- `npm run build`
- CLI help command
Expected: PASS and commands are visible.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/commands/inspect.ts src/commands/export.ts src/commands/import.ts src/commands/validate.ts
git commit -m "feat: add cli command skeleton"
```

## Chunk 2: Implement source analysis and package metadata generation

### Task 3: Implement workspace scanning with safe default inclusion rules

**Files:**
- Create: `src/core/constants.ts`
- Create: `src/core/types.ts`
- Create: `src/core/workspace-scan.ts`
- Create: `tests/workspace-scan.test.ts`
- Create: `tests/fixtures/source-workspace/*`

- [ ] **Step 1: Write the failing tests for workspace inclusion/exclusion**

Cover at least:
- core files are included when present
- `HEARTBEAT.md` is optional
- `memory/*.md` is excluded by default
- missing optional files do not fail the scan
- unknown files are ignored unless future policy says otherwise

- [ ] **Step 2: Run test to verify it fails**

Run: chosen test runner against `tests/workspace-scan.test.ts`
Expected: FAIL because scanner does not exist.

- [ ] **Step 3: Write minimal scanner implementation**

Implement:
- allowlist of default portable files
- optional-file handling
- exclusion report for `memory/*.md`
- normalized scan result object for manifest generation

- [ ] **Step 4: Run test to verify it passes**

Run the workspace scan test suite.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/constants.ts src/core/types.ts src/core/workspace-scan.ts tests/workspace-scan.test.ts tests/fixtures/source-workspace
git commit -m "feat: add workspace scan for portable files"
```

### Task 4: Implement skill detection in manifest-only mode

**Files:**
- Create: `src/core/skills-detect.ts`
- Create: `tests/skills-detect.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- empty skill result when no workspace skills exist
- detection of workspace-local `skills/` presence
- heuristic extraction of referenced skill names from workspace markdown content when possible
- explicit `mode: manifest-only` output

- [ ] **Step 2: Run test to verify it fails**

Run: chosen test runner against `tests/skills-detect.test.ts`
Expected: FAIL because detector does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement a detector that:
- checks whether `skills/` exists locally
- scans markdown for likely skill references
- returns manifest-only result with notes

Avoid overengineering NLP; simple deterministic extraction is enough for v1.

- [ ] **Step 4: Run test to verify it passes**

Run the skills detector tests.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/skills-detect.ts tests/skills-detect.test.ts
git commit -m "feat: add manifest-only skill detection"
```

### Task 5: Implement portable agent extraction and field classification

**Files:**
- Create: `src/adapters/openclaw-config.ts`
- Create: `src/core/agent-extract.ts`
- Create: `tests/agent-extract.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- extraction of suggested agent id/name
- extraction of workspace basename suggestion instead of raw absolute path where possible
- classification into `portable`, `requiresInputOnImport`, `excluded`
- exclusion of channel bindings and obvious secrets

Use fixture config samples rather than live user config.

- [ ] **Step 2: Run test to verify it fails**

Run: chosen test runner against `tests/agent-extract.test.ts`
Expected: FAIL because extractor does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:
- config adapter capable of reading a provided config fixture
- extraction rules based on spec
- portable output structure for `config/agent.json`

Keep extraction conservative: when in doubt, classify as excluded.

- [ ] **Step 4: Run test to verify it passes**

Run the agent extraction tests.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/openclaw-config.ts src/core/agent-extract.ts tests/agent-extract.test.ts
git commit -m "feat: extract portable agent definition"
```

### Task 6: Implement manifest, checksums, and export report builders

**Files:**
- Create: `src/core/manifest.ts`
- Create: `src/core/checksums.ts`
- Create: `tests/manifest.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- `manifest.json` required fields
- package includes/excludes reflect scan and extraction results
- checksums generated for exported files
- export report records exclusions and warnings

- [ ] **Step 2: Run test to verify it fails**

Run: chosen test runner against `tests/manifest.test.ts`
Expected: FAIL because builders do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement:
- manifest builder
- deterministic checksum generation
- export report summary object

- [ ] **Step 4: Run test to verify it passes**

Run the manifest tests.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/manifest.ts src/core/checksums.ts tests/manifest.test.ts
git commit -m "feat: generate package manifest and checksums"
```

## Chunk 3: Implement package IO and export flow

### Task 7: Implement package writer and directory export flow

**Files:**
- Create: `src/core/package-write.ts`
- Modify: `src/commands/export.ts`
- Test: `tests/package-roundtrip.test.ts`

- [ ] **Step 1: Write the failing export test**

Cover:
- export command creates target package directory
- workspace payload written to `workspace/`
- `config/` and `meta/` files exist
- excluded daily memory is not copied by default

- [ ] **Step 2: Run test to verify it fails**

Run the package roundtrip test focused on export.
Expected: FAIL because export flow is placeholder-only.

- [ ] **Step 3: Write minimal implementation**

Implement directory-first package writer that:
- creates package root
- copies included workspace files
- writes config and meta JSON artifacts
- returns export summary

Update `export` command to call scanner, extractor, detector, manifest builder, and writer.

Archive creation can be deferred unless easy to add after directory export passes.

- [ ] **Step 4: Run test to verify it passes**

Run export-related tests.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/package-write.ts src/commands/export.ts tests/package-roundtrip.test.ts
git commit -m "feat: export declarative agent package"
```

### Task 8: Implement package reader and structural validation

**Files:**
- Create: `src/core/package-read.ts`
- Modify: `tests/package-roundtrip.test.ts`

- [ ] **Step 1: Write the failing reader tests**

Cover:
- valid package can be opened
- missing `manifest.json` fails loudly
- invalid `formatVersion` is rejected
- checksum mismatch is reported

- [ ] **Step 2: Run test to verify it fails**

Run the package read tests.
Expected: FAIL because reader does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement package reader to:
- load JSON artifacts
- verify required paths exist
- verify checksums if present
- return a normalized package object

- [ ] **Step 4: Run test to verify it passes**

Run the package reader tests.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/package-read.ts tests/package-roundtrip.test.ts
git commit -m "feat: validate and read package contents"
```

## Chunk 4: Implement import planning, execution, and validation

### Task 9: Implement import planning and collision handling

**Files:**
- Create: `src/core/import-plan.ts`
- Create: `tests/import-plan.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- required input detection for missing target agent id/workspace name
- collision detection for existing target workspace or agent id
- warning generation for skills manifest and channel-binding omissions
- safe default refusal to overwrite without force

- [ ] **Step 2: Run test to verify it fails**

Run: chosen test runner against `tests/import-plan.test.ts`
Expected: FAIL because planner does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement planner that:
- merges package hints with CLI args
- produces required inputs / warnings / write plan
- refuses unsafe overwrites by default

- [ ] **Step 4: Run test to verify it passes**

Run the import plan tests.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/import-plan.ts tests/import-plan.test.ts
git commit -m "feat: add safe import planning"
```

### Task 10: Implement import execution for workspace files and agent definition

**Files:**
- Create: `src/core/import-exec.ts`
- Modify: `src/commands/import.ts`
- Test: `tests/package-roundtrip.test.ts`

- [ ] **Step 1: Write the failing import test**

Cover:
- import writes workspace files into target path
- import writes or appends agent definition through config adapter abstraction
- import does not write excluded categories
- import result returns warnings and next steps

- [ ] **Step 2: Run test to verify it fails**

Run import-focused roundtrip tests.
Expected: FAIL because import command is placeholder-only.

- [ ] **Step 3: Write minimal implementation**

Implement executor that:
- consumes a validated package + resolved import plan
- writes workspace files safely
- writes portable agent definition via config adapter abstraction
- returns a structured import result

Update `import` command to support:
- `--wizard` placeholder or real prompt flow if simple
- non-interactive flags for `--agent-id` and `--workspace-name`

If full interactive prompting is too much for first pass, implement a minimal prompt layer after non-interactive flow is working.

- [ ] **Step 4: Run test to verify it passes**

Run the import roundtrip tests.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/import-exec.ts src/commands/import.ts tests/package-roundtrip.test.ts
git commit -m "feat: import workspace and portable agent definition"
```

### Task 11: Implement validation command and post-import reporting

**Files:**
- Create: `src/core/validate.ts`
- Modify: `src/commands/validate.ts`
- Create: `src/utils/output.ts`
- Create: `tests/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- validation reports passed/warnings/failed/nextSteps sections
- missing required workspace file is a failure
- unresolved skill dependencies are warnings
- missing channel binding setup is a next step, not a hard failure

- [ ] **Step 2: Run test to verify it fails**

Run: chosen test runner against `tests/validate.test.ts`
Expected: FAIL because validator does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement validator and output formatter that:
- checks workspace structure
- checks agent presence through config adapter
- returns structured validation report
- prints concise operator-friendly CLI output

- [ ] **Step 4: Run test to verify it passes**

Run validation tests.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/validate.ts src/commands/validate.ts src/utils/output.ts tests/validate.test.ts
git commit -m "feat: validate imported agent package"
```

## Chunk 5: Polish docs, end-to-end verification, and release readiness

### Task 12: Add fixture-backed end-to-end roundtrip verification

**Files:**
- Modify: `tests/package-roundtrip.test.ts`
- Modify: fixture/config files as needed

- [ ] **Step 1: Write the failing end-to-end assertions**

Cover a full directory-based flow:
- inspect source fixture
- export package
- read package
- import into temp target
- validate target
- assert warnings align with v1 scope decisions

- [ ] **Step 2: Run test to verify it fails**

Run the full test suite.
Expected: FAIL until all pieces are wired correctly.

- [ ] **Step 3: Implement minimal wiring changes**

Patch command and module integration issues found by the roundtrip test.
Do not add extra features beyond what the spec requires.

- [ ] **Step 4: Run test to verify it passes**

Run:
- `npm test`
- `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/package-roundtrip.test.ts tests/fixtures src
git commit -m "test: verify end-to-end package roundtrip"
```

### Task 13: Final documentation and operator guidance

**Files:**
- Modify: `README.md`
- Optionally create: `docs/usage.md`

- [ ] **Step 1: Write the failing doc checklist**

Document required README sections:
- project purpose
- v1 scope and non-goals
- command examples
- safety defaults
- known limitations

- [ ] **Step 2: Verify docs are incomplete**

Review README against checklist.
Expected: missing sections.

- [ ] **Step 3: Write the docs**

Add:
- install/run steps
- example `inspect`, `export`, `import`, `validate` flows
- explanation of what is and is not migrated
- warning that this is not full-instance backup

- [ ] **Step 4: Verify docs and commands align**

Run:
- `npm run build`
- manually compare README examples with actual CLI flags
Expected: docs match implemented behavior.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/usage.md
git commit -m "docs: add usage and safety guidance"
```

## Verification Checklist

Before declaring implementation complete, run all applicable verification commands and capture output:

- [ ] `npm install`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `node dist/cli.js --help`
- [ ] fixture-backed roundtrip export/import/validate test

Expected outcome:
- build succeeds
- tests pass
- CLI help lists the four commands
- roundtrip test confirms v1 portability contract

## Notes for the implementing agent

- Keep v1 conservative. If config extraction is ambiguous, exclude rather than guess.
- Directory-first package output is sufficient for v1. Archive wrapping is optional.
- Do not expand scope into secrets migration, session backup, or channel binding automation.
- Ensure user-facing output clearly distinguishes restored state from manual follow-up.
- If OpenClaw config access is too environment-specific, isolate it behind `src/adapters/openclaw-config.ts` and use fixtures heavily in tests.

Plan complete and saved to `docs/superpowers/plans/2026-03-16-agent-package-v1-implementation.md`. Ready to execute?
