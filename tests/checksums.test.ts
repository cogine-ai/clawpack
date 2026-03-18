import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { checksumFile, checksumText } from '../src/core/checksums';

const fixtureFile = path.resolve('tests/fixtures/source-workspace/AGENTS.md');

test('checksumText produces deterministic output for same input', () => {
  const input = 'hello world';
  const a = checksumText(input);
  const b = checksumText(input);
  assert.equal(a, b);
});

test('checksumText produces different hashes for different inputs', () => {
  const a = checksumText('foo');
  const b = checksumText('bar');
  assert.notEqual(a, b);
});

test('checksumText output is 64-char hex string', () => {
  const hash = checksumText('test');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.length, 64);
});

test('checksumFile computes hash of a fixture file', async () => {
  const hash = await checksumFile(fixtureFile);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.length, 64);
});

test('checksumFile result matches checksumText of the same file content', async () => {
  const content = await readFile(fixtureFile, 'utf8');
  const fileHash = await checksumFile(fixtureFile);
  const textHash = checksumText(content);
  assert.equal(fileHash, textHash);
});
