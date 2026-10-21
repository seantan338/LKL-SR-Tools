import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInterviewReminder,
  mergeInterviewReminder,
  INTERVIEW_REMINDER_SOURCE,
} from './interview-reminder.mjs';

const now = new Date('2026-10-21T08:00');

test('reminder fires lead minutes before the interview (local time)', () => {
  const r = buildInterviewReminder({ interviewDate: '2026-10-22', interviewTime: '10:00', leadMinutes: '60', content: 'x', now });
  assert.equal(r.dateTime, '2026-10-22T09:00');
  assert.equal(r.date, '2026-10-22');
  assert.equal(r.time, '09:00');
  assert.equal(r.interviewAt, '2026-10-22T10:00');
  assert.equal(r.source, INTERVIEW_REMINDER_SOURCE);
});

test('one day lead crosses into the previous day', () => {
  const r = buildInterviewReminder({ interviewDate: '2026-11-01', interviewTime: '09:30', leadMinutes: '1440', now });
  assert.equal(r.dateTime, '2026-10-31T09:30');
});

test('missing time defaults to 09:00', () => {
  const r = buildInterviewReminder({ interviewDate: '2026-10-22', interviewTime: '', leadMinutes: '60', now });
  assert.equal(r.interviewAt, '2026-10-22T09:00');
  assert.equal(r.dateTime, '2026-10-22T08:00');
});

test('no reminder for past interviews, invalid dates or "none"', () => {
  assert.equal(buildInterviewReminder({ interviewDate: '2026-10-20', interviewTime: '10:00', now }), null);
  assert.equal(buildInterviewReminder({ interviewDate: '18/8/2026', interviewTime: '10:00', now }), null);
  assert.equal(buildInterviewReminder({ interviewDate: '2026-10-22', interviewTime: '10:00', leadMinutes: 'none', now }), null);
});

test('lead time already passed: remind 1 minute from now, never after the interview', () => {
  const soon = buildInterviewReminder({ interviewDate: '2026-10-21', interviewTime: '08:30', leadMinutes: '60', now });
  assert.equal(soon.dateTime, '2026-10-21T08:01');
  const verySoon = buildInterviewReminder({ interviewDate: '2026-10-21', interviewTime: '08:00', leadMinutes: '60', now: new Date('2026-10-21T07:59:30') });
  assert.equal(verySoon.dateTime, '2026-10-21T08:00');
});

test('merge replaces the pending auto reminder and keeps manual / fired ones', () => {
  const manual = { id: 'm1', content: 'call', dateTime: '2026-10-21T15:00' };
  const firedAuto = { id: 'a0', source: INTERVIEW_REMINDER_SOURCE, fired: true, dateTime: '2026-10-01T09:00' };
  const oldAuto = { id: 'a1', source: INTERVIEW_REMINDER_SOURCE, fired: false, dateTime: '2026-10-22T09:00', interviewAt: '2026-10-22T10:00', content: 'old' };
  const next = { id: 'a2', source: INTERVIEW_REMINDER_SOURCE, fired: false, dateTime: '2026-10-23T09:00', interviewAt: '2026-10-23T10:00', content: 'new' };

  const { reminders, changed } = mergeInterviewReminder([manual, firedAuto, oldAuto], next);
  assert.equal(changed, true);
  assert.deepEqual(reminders.map((r) => r.id), ['m1', 'a0', 'a2']);
});

test('merge is a no-op when the same auto reminder already exists', () => {
  const existing = { id: 'a1', source: INTERVIEW_REMINDER_SOURCE, fired: false, dateTime: '2026-10-22T09:00', interviewAt: '2026-10-22T10:00', content: 'c' };
  const same = { ...existing, id: 'new-id' };
  const { reminders, changed } = mergeInterviewReminder([existing], same);
  assert.equal(changed, false);
  assert.deepEqual(reminders, [existing]);
});

test('clearing the interview removes only the pending auto reminder', () => {
  const manual = { id: 'm1', content: 'call' };
  const oldAuto = { id: 'a1', source: INTERVIEW_REMINDER_SOURCE, fired: false };
  assert.deepEqual(mergeInterviewReminder([manual, oldAuto], null), { reminders: [manual], changed: true });
  assert.deepEqual(mergeInterviewReminder([manual], null), { reminders: [manual], changed: false });
});
