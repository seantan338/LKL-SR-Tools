'use client';

import { useI18n } from '../../lib/i18n-context';
import { NONE, defaultSortDir } from '../../lib/order-view.mjs';
import { OrdersColumnChooser } from './OrdersTableView';

const VIEW_OPTIONS = [
  { key: 'cards', icon: 'ph-squares-four', labelKey: 'ordersView.viewCards' },
  { key: 'table', icon: 'ph-table', labelKey: 'ordersView.viewTable' },
  { key: 'grouped', icon: 'ph-stack', labelKey: 'ordersView.viewGrouped' },
  { key: 'split', icon: 'ph-columns', labelKey: 'ordersView.viewSplit' },
  { key: 'kanban', icon: 'ph-kanban', labelKey: 'ordersView.viewKanban' },
  { key: 'compact', icon: 'ph-list-dashes', labelKey: 'ordersView.viewCompact' }
];

const SORT_LABEL_KEYS = {
  updated: 'ordersView.sortUpdated',
  company: 'ordersView.colCompany',
  position: 'ordersView.colPosition',
  salary: 'ordersView.colSalary',
  status: 'ordersView.colStatus',
  location: 'ordersView.colLocation',
  pic: 'ordersView.colPic',
  commission: 'ordersView.colCommission'
};

const GROUP_LABEL_KEYS = {
  company: 'ordersView.groupCompany',
  pic: 'ordersView.groupPic',
  status: 'ordersView.groupStatus',
  location: 'ordersView.groupLocation'
};

/** View switcher + sort / group-by / column controls. `prefs` comes from useOrdersViewPrefs. */
export default function OrdersViewToolbar({ prefs, onChange, summary }) {
  const { t } = useI18n();
  const { view, sortKey, sortDir, groupBy, hiddenColumns } = prefs;

  return (
    <div className="orders-view-bar">
      <div className="orders-view-toggle" role="tablist" aria-label={t('ordersView.viewLabel')}>
        {VIEW_OPTIONS.map(option => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={view === option.key}
            className={view === option.key ? 'active' : ''}
            onClick={() => onChange({ view: option.key })}
            title={t(option.labelKey)}
          >
            <i className={`ph-light ${option.icon}`}></i>
            <span className="orders-view-label">{t(option.labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="orders-view-controls">
        <select
          className="form-select btn-sm orders-compact-select"
          value={sortKey}
          onChange={(e) => onChange({ sortKey: e.target.value, sortDir: defaultSortDir(e.target.value) })}
          aria-label={t('ordersView.sortBy')}
        >
          {Object.keys(SORT_LABEL_KEYS).map(key => (
            <option key={key} value={key}>{`${t('ordersView.sortBy')}: ${t(SORT_LABEL_KEYS[key])}`}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onChange({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })}
          title={t(sortDir === 'asc' ? 'ordersView.sortAsc' : 'ordersView.sortDesc')}
          aria-label={t(sortDir === 'asc' ? 'ordersView.sortAsc' : 'ordersView.sortDesc')}
        >
          <i className={`ph-light ${sortDir === 'asc' ? 'ph-sort-ascending' : 'ph-sort-descending'}`}></i>
        </button>

        {view === 'grouped' && (
          <select
            className="form-select btn-sm orders-compact-select"
            value={groupBy}
            onChange={(e) => onChange({ groupBy: e.target.value })}
            aria-label={t('ordersView.groupBy')}
          >
            {Object.keys(GROUP_LABEL_KEYS).map(key => (
              <option key={key} value={key}>{t(GROUP_LABEL_KEYS[key])}</option>
            ))}
          </select>
        )}

        {view === 'table' && (
          <OrdersColumnChooser hiddenColumns={hiddenColumns} onChange={(columns) => onChange({ hiddenColumns: columns })} />
        )}
      </div>

      <div className="orders-view-summary">{summary}</div>
    </div>
  );
}

/** PIC / location / company dropdown; `options` comes from buildFilterOptions. */
export function OrdersFilterSelect({ value, onChange, options, allLabel, noneLabel }) {
  return (
    <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={allLabel}>
      <option value="">{allLabel}</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {`${option.value === NONE ? noneLabel : option.label} (${option.count})`}
        </option>
      ))}
    </select>
  );
}

export function OrdersPagination({ page, pageCount, onChange }) {
  const { t } = useI18n();
  if (pageCount <= 1) return null;
  return (
    <div className="orders-pagination">
      <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <i className="ph-light ph-caret-left"></i> {t('ordersView.prevPage')}
      </button>
      <span>{t('ordersView.pageOf', { page, total: pageCount })}</span>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        {t('ordersView.nextPage')} <i className="ph-light ph-caret-right"></i>
      </button>
    </div>
  );
}
