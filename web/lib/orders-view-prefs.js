'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { GROUP_FIELDS, SORT_KEYS } from './order-view.mjs';

/**
 * Orders page view preferences (view mode, sort, grouping, hidden table columns), remembered in localStorage.
 * useSyncExternalStore renders the defaults during SSR / hydration and the stored values right after.
 */
const STORAGE_KEY = 'talent_flow_orders_view';

export const ORDER_VIEW_MODES = ['cards', 'table', 'grouped', 'split'];

export const DEFAULT_ORDERS_VIEW_PREFS = {
  view: 'cards',
  sortKey: 'updated',
  sortDir: 'desc',
  groupBy: 'company',
  hiddenColumns: []
};

let snapshot = null;
const listeners = new Set();

function sanitize(stored) {
  const prefs = { ...DEFAULT_ORDERS_VIEW_PREFS };
  if (!stored || typeof stored !== 'object') return prefs;
  if (ORDER_VIEW_MODES.includes(stored.view)) prefs.view = stored.view;
  if (SORT_KEYS.includes(stored.sortKey)) prefs.sortKey = stored.sortKey;
  if (stored.sortDir === 'asc' || stored.sortDir === 'desc') prefs.sortDir = stored.sortDir;
  if (GROUP_FIELDS.includes(stored.groupBy)) prefs.groupBy = stored.groupBy;
  if (Array.isArray(stored.hiddenColumns)) prefs.hiddenColumns = stored.hiddenColumns.filter(c => typeof c === 'string');
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

const getServerSnapshot = () => DEFAULT_ORDERS_VIEW_PREFS;

export function useOrdersViewPrefs() {
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
