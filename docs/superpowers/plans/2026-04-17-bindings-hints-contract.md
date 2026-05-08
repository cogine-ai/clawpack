# Bindings Hints Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unsupported package-level bindings portability surface with source-backed, read-only binding hints metadata.

**Architecture:** Remove `bindings` from the portable package contract, add an optional metadata file for source OpenClaw top-level `bindings[]` entries that match the exported agent, and keep import/validate flows manual-only for routing reapplication. The change stays additive for old package reads where practical, but new packages stop advertising bindings as portable content.

**Tech Stack:** Node.js, TypeScript, existing filesystem/package IO helpers, node:test.

---

## File Structure

- Modify: `src/core/types.ts` for package and read-result contract changes
- Modify: `src/core/package-write.ts` to stop writing `config/bindings.json` and optionally write `meta/binding-hints.json`
- Modify: `src/core/package-read.ts` to stop exposing package-level bindings payload and optionally read binding hints metadata
- Modify: inspect/export plumbing and docs where bindings wording is surfaced
- Modify: `tests/manifest.test.ts`, `tests/package-roundtrip.test.ts`, and related tests for new metadata semantics

### Task 1: Lock the package contract with failing tests

**Files:**
- Modify: `tests/manifest.test.ts`
- Modify: `tests/package-roundtrip.test.ts`
- Modify: any inspect/export tests that mention bindings

- [ ] **Step 1: Write the failing tests**

Add assertions that new manifests do not contain `includes.bindings`, exported packages do not require `config/bindings.json`, and packages may optionally expose binding hints metadata without implying automatic restore.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="manifest|package roundtrip"`
Expected: FAIL because the current package writer still emits bindings payload semantics.

- [ ] **Step 3: Write minimal implementation**

Update manifest/package expectations to the new hints-only contract.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern="manifest|package roundtrip"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/manifest.test.ts tests/package-roundtrip.test.ts src/core/types.ts src/core/package-write.ts src/core/package-read.ts
git commit -m "refactor: replace bindings package surface with hints contract"
```

### Task 2: Implement optional binding hints metadata

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/package-write.ts`
- Modify: `src/core/package-read.ts`

- [ ] **Step 1: Write the failing test**

Add a package IO test that writes a package with binding hints and verifies `meta/binding-hints.json` is checksummed and readable as metadata, while `manifest.includes.bindings` stays absent.

- [ ] **Step 2: Run test to verify it fails**

Run the focused package IO test.
Expected: FAIL because binding hints metadata is not yet written/read.

- [ ] **Step 3: Write minimal implementation**

Introduce a `BindingHint[]` type alias or reuse the existing binding shape as metadata, write `meta/binding-hints.json` only when hints exist, checksum it, and expose it from package reads as optional metadata.

- [ ] **Step 4: Run test to verify it passes**

Run the focused package IO test.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/package-write.ts src/core/package-read.ts tests
git commit -m "feat: add source-backed binding hints metadata"
```

### Task 3: Update operator messaging and docs

**Files:**
- Modify: `README.md`
- Modify: inspect/export docs or command output files that mention bindings
- Modify: tests that assert warning/next-step wording

- [ ] **Step 1: Write the failing test**

Add or update assertions so user-facing text says bindings must be manually reapplied and no longer says clawpack packages live bindings.

- [ ] **Step 2: Run test to verify it fails**

Run the focused docs/output tests.
Expected: FAIL because current wording still references packaged bindings.

- [ ] **Step 3: Write minimal implementation**

Revise README and user-facing text to describe top-level OpenClaw routing bindings as manual-only, with optional source-backed hints metadata.

- [ ] **Step 4: Run test to verify it passes**

Run the focused tests again.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md src tests
git commit -m "docs: clarify bindings are hints-only"
```

### Task 4: Full verification

**Files:**
- Modify: none unless failures require fixes

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Fix any regressions minimally**

Only patch files required by failing tests or build output.

- [ ] **Step 4: Re-run verification**

Run:
- `npm test`
- `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verify bindings hints contract end-to-end"
```
