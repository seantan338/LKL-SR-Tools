'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { CANDIDATE_GROUP_FIELDS, CANDIDATE_SORT_KEYS } from './candidate-view.mjs';

const STORAGE_KEY = 'talent_flow_candidates_view';

export const CANDIDATE_VIEW_MODES = ['table', 'grouped', 'compact'];

export const DEFAULT_CANDIDATES_VIEW_PREFS = {
  view: 'table',
  sortKey: 'updatedAt',
  sortDir: 'desc',
  groupBy: 'company'
};

let snapshot = null;
const listeners = new Set();

function sanitize(stored) {
  const prefs = { ...DEFAULT_CANDIDATES_VIEW_PREFS };
  if (!stored || typeof stored !== 'object') return prefs;
  if (CANDIDATE_VIEW_MODES.includes(stored.view)) prefs.view = stored.view;
  if (CANDIDATE_SORT_KEYS.includes(stored.sortKey)) prefs.sortKey = stored.sortKey;
  if (stored.sortDir === 'asc' || stored.sortDir === 'desc') prefs.sortDir = stored.sortDir;
  if (CANDIDATE_GROUP_FIELDS.includes(stored.groupBy)) prefs.groupBy = stored.groupBy;
  return prefs;
}

function readPrefs() {
  if (!snapshot) {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {}
    snapshot = sanitize(stored);
  }
  return snapshot;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getServerSnapshot = () => DEFAULT_CANDIDATES_VIEW_PREFS;

export function useCandidatesViewPrefs() {
  const prefs = useSyncExternalStore(subscribe, readPrefs, getServerSnapshot);
  const updatePrefs = useCallback((patch) => {
    snapshot = { ...readPrefs(), ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {}
    listeners.forEach(listener => listener());
  }, []);
  return [prefs, updatePrefs];
}
