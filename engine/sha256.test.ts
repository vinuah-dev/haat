import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { sha256Hex } from './sha256.ts';

const ref = (s: string) => createHash('sha256').update(s).digest('hex');

test('matches node:crypto on known and edge-length inputs', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (let n = 0; n < 200; n++) {
    const s = 'x'.repeat(n);
    assert.equal(sha256Hex(s), ref(s), `length ${n}`);
  }
  for (const s of ['d1-bread|buyer-3|4|9|a1b2c3', 'hindi नमस्ते ✓', 'd10-cloth|player|12|7|ffffffff00000000']) assert.equal(sha256Hex(s), ref(s));
});
