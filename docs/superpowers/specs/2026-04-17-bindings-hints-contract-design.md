# Bindings Hints Contract Design

- Date: 2026-04-17
- Status: Approved for implementation
- Issue: #56

## Summary

clawpack currently exposes a package-level `bindings` surface that is not wired to OpenClaw's real routing contract. OpenClaw's current routing surface is top-level `bindings: []` in `openclaw.json`, while clawpack only reads and writes an internal `config/bindings.json` file and simultaneously warns that bindings are not really restored.

This design replaces the pseudo-portability surface with a source-backed, read-only hints surface.

## Goal

Preserve useful operator context about source-instance routing bindings without implying that clawpack can package or restore real OpenClaw routing automatically.

## Non-goals

- Automatic export/import of live OpenClaw routing bindings
- Automatic write-back into target `openclaw.json`
- ACP session restoration
- Full conflict resolution for target-instance routing state

## Contract

### Export

- Detect source-instance top-level `bindings[]` entries from OpenClaw config when available.
- Filter entries to those whose `agentId` matches the exported source agent.
- Write the filtered entries to package metadata as binding hints.
- Binding hints are metadata only, not package payload required for import.

### Package format

- Remove `manifest.includes.bindings`.
- Remove `ReadPackageResult.bindings`.
- Do not write `config/bindings.json`.
- Add `meta/binding-hints.json` as an optional metadata file.
- Add a checksum entry for `meta/binding-hints.json` when present.

### Import and validate messaging

- Import does not write binding hints into target OpenClaw config.
- Human-readable output and next steps may mention that source routing bindings were detected and must be manually reapplied.
- Messaging must not claim that bindings are restored or packaged as real portable config.

## Data shape

Binding hints should preserve the source-backed OpenClaw fields as read:

- `type`
- `agentId`
- `comment`
- `match`
- `acp`

No extra inferred fields are required for this issue.

## Safety model

- Hints are read-only metadata.
- If OpenClaw config is missing, ambiguous, or has no matching bindings, export succeeds without hints.
- Import remains conservative and mutation-free for routing config.

## Files in scope

- `src/core/types.ts`
- `src/core/package-write.ts`
- `src/core/package-read.ts`
- export/inspect plumbing and docs
- tests covering manifest, package round-trip, and operator messaging

## Acceptance

- README and manifest no longer imply supported bindings migration.
- Package contents can optionally carry source-backed binding hints as metadata only.
- Manual re-apply language remains, but only in a way consistent with real OpenClaw top-level `bindings[]`.
