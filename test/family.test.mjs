import assert from 'node:assert/strict';
import { test } from 'node:test';
import { familyKeys, newFamilyCode, parseFamilyCode, seal, unseal } from '../src/family.mjs';

test('a family code retyped loosely still opens the same family', () => {
  const code = newFamilyCode();
  const retyped = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l');
  assert.deepEqual(familyKeys(retyped), familyKeys(code));
  assert.throws(() => parseFamilyCode('MYPC-1234'), /does not look right/);
});

test('only the same family can open a message, and a changed message is refused', () => {
  const ours = familyKeys(newFamilyCode()).key;
  const theirs = familyKeys(newFamilyCode()).key;
  const frame = seal(ours, { t: 'call', tool: 'run_command', args: { command: 'hostname' } });

  assert.deepEqual(unseal(ours, frame), { t: 'call', tool: 'run_command', args: { command: 'hostname' } });
  assert.equal(unseal(theirs, frame), null);
  const tampered = Buffer.from(frame);
  tampered[tampered.length - 1] ^= 1;
  assert.equal(unseal(ours, tampered), null);
});
