import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NONE,
  buildCandidateFilterOptions,
  groupCandidates,
  matchesCandidateFilter,
  sortCandidates
} from './candidate-view.mjs';

const sampleCandidates = [
  { id: '1', name: 'Zack', company: 'PSA', position: 'Driver', stage: 'interview', status: 'active', picName: 'Alice', location: 'JB', updatedAt: { seconds: 100 } },
  { id: '2', name: 'Aaron', company: 'IPE', position: 'Operator', stage: 'screening', status: 'active', picName: 'Bob', location: 'SG', updatedAt: { seconds: 300 } },
  { id: '3', name: 'Mike', company: '', position: 'Admin', stage: 'offer', status: 'rejected', picName: '', location: 'JB', updatedAt: { seconds: 200 } }
];

const ids = (list) => list.map(c => c.id);

test('sortCandidates sorts by updatedAt, name, stage and company with blanks last', () => {
  assert.deepEqual(ids(sortCandidates(sampleCandidates, 'updatedAt', 'desc')), ['2', '3', '1']);
  assert.deepEqual(ids(sortCandidates(sampleCandidates, 'name', 'asc')), ['2', '3', '1']);
  assert.deepEqual(ids(sortCandidates(sampleCandidates, 'company', 'asc')), ['2', '1', '3']);
  assert.deepEqual(ids(sortCandidates(sampleCandidates, 'stage', 'asc')), ['2', '1', '3']);
});

test('buildCandidateFilterOptions counts case-insensitively and puts NONE last', () => {
  const companies = buildCandidateFilterOptions(sampleCandidates, 'company');
  assert.deepEqual(companies.map(o => [o.value, o.count]), [['ipe', 1], ['psa', 1], [NONE, 1]]);
  assert.ok(matchesCandidateFilter(sampleCandidates[0], 'company', 'psa'));
  assert.ok(matchesCandidateFilter(sampleCandidates[2], 'company', NONE));
});

test('groupCandidates groups by company and stage properly', () => {
  const byStage = groupCandidates(sampleCandidates, 'stage');
  assert.deepEqual(byStage.map(g => g.key), ['screening', 'interview', 'rejected']);
  const byCompany = groupCandidates(sampleCandidates, 'company');
  assert.equal(byCompany[byCompany.length - 1].key, NONE);
});
