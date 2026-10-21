import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchingCandidate,
  identityKey,
  normalizeIcNo,
  picsEqual,
  matchPicToMemberUid,
} from './identity.mjs';

test('IC identity prefers digits-only 12-char key', () => {
  assert.equal(normalizeIcNo('950101-01-5555'), '950101015555');
  assert.equal(identityKey({ icNo: '950101-01-5555', name: 'Ali' }), 'ic:950101015555');
});

test('falls back to name+phone when IC missing', () => {
  assert.equal(
    identityKey({ name: 'Ali', phone: '019-848 8186' }),
    'np:ali::0198488186'
  );
});

test('findMatchingCandidate matches IC across hyphen formats', () => {
  const existing = [{ id: '1', name: 'Ali', icNo: '950101015555', phone: '111' }];
  const hit = findMatchingCandidate(existing, { name: 'Different', icNo: '950101-01-5555' });
  assert.equal(hit.id, '1');
});

test('picsEqual is exact, not substring', () => {
  assert.equal(picsEqual('Anis', 'anis'), true);
  assert.equal(picsEqual('Anis', 'Anisa'), false);
});

test('PIC maps to member only on exact name/email prefix', () => {
  const members = [
    { id: 'u1', displayName: 'Anis', email: 'anis@x.com' },
    { id: 'u2', displayName: 'Anisa', email: 'anisa@x.com' },
  ];
  assert.equal(matchPicToMemberUid('Anis', members, 'me'), 'u1');
  assert.equal(matchPicToMemberUid('Ani', members, 'me'), 'me');
});

test('resolveCanonicalPic unifies YeeYuan variants to Hok Yee Yuan', async () => {
  const { resolveCanonicalPic } = await import('./identity.mjs');
  const members = [
    { id: 'u_yee', displayName: 'Hok Yee Yuan', email: 'yeeyuan@company.com' },
    { id: 'u_kalap', displayName: 'Kalap Lok', email: 'kalap@company.com' },
  ];

  // All 5 variants from user screenshot
  const r1 = resolveCanonicalPic('YeeYuan', '', members);
  const r2 = resolveCanonicalPic('yeeyuan', '', members);
  const r3 = resolveCanonicalPic('Yeeyuan', '', members);
  const r4 = resolveCanonicalPic('Yee Yuan', '', members);
  const r5 = resolveCanonicalPic('hok yeeyuan', '', members);

  assert.equal(r1.displayName, 'Hok Yee Yuan');
  assert.equal(r1.uid, 'u_yee');
  assert.equal(r1.key, 'uid:u_yee');

  assert.equal(r2.key, r1.key);
  assert.equal(r3.key, r1.key);
  assert.equal(r4.key, r1.key);
  assert.equal(r5.key, r1.key);

  // Kalap variants
  const k1 = resolveCanonicalPic('Kalap', '', members);
  const k2 = resolveCanonicalPic('KaLap', '', members);
  const k3 = resolveCanonicalPic('kalap Lok', '', members);

  assert.equal(k1.displayName, 'Kalap Lok');
  assert.equal(k1.uid, 'u_kalap');
  assert.equal(k2.key, 'uid:u_kalap');
  assert.equal(k3.key, 'uid:u_kalap');
});

test('freelance / external PICs like MR KEE are NOT hijacked by assignedTo UID', async () => {
  const { resolveCanonicalPic } = await import('./identity.mjs');
  const members = [
    { id: 'u_kalap', displayName: 'Kalap Lok', email: 'kalap@company.com' },
    { id: 'u_wong', displayName: 'Wong Qi En', email: 'wong@company.com' },
  ];

  // Even when assignedTo is set to Kalap Lok (e.g. importer's account), MR KEE must stay Mr Kee!
  const res1 = resolveCanonicalPic('MR KEE', 'u_kalap', members);
  assert.equal(res1.displayName, 'Mr Kee');
  assert.equal(res1.key, 'norm:mrkee');
  assert.equal(res1.uid, '');
  assert.equal(res1.isExternal, true);

  const res2 = resolveCanonicalPic('mr kee', 'u_kalap', members);
  assert.equal(res2.key, res1.key);
  assert.equal(res2.displayName, 'Mr Kee');

  // If picName is empty/unassigned, assignedTo is respected
  const resEmpty = resolveCanonicalPic('', 'u_kalap', members);
  assert.equal(resEmpty.displayName, 'Kalap Lok');
  assert.equal(resEmpty.uid, 'u_kalap');
  assert.equal(resEmpty.isExternal, false);
});

