'use client';

import { useI18n } from '../../lib/i18n-context';

const metricLabelStyle = { color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '4px' };

const sectionBodyStyle = {
  background: 'rgba(255,255,255,0.02)',
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-sm)',
  lineHeight: '1.6',
  whiteSpace: 'pre-wrap'
};

function Section({ icon, color, title, children }) {
  return (
    <div>
      <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <i className={`ph-light ${icon}`} style={{ color }}></i> {title}
      </h4>
      <div style={sectionBodyStyle}>{children}</div>
    </div>
  );
}

/**
 * Job order details (metrics, work hours, requirements, benefits, notes).
 * Shared by the OrderDrawer and the Orders page preview pane; renders a fragment so the parent controls spacing.
 */
export default function OrderDetailContent({ order }) {
  const { t } = useI18n();

  return (
    <>
      {/* Quick Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 'var(--space-4)',
        background: 'var(--bg-card)',
        padding: 'var(--space-5)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div>
          <div style={metricLabelStyle}>{t('components.orderDrawer.salary')}</div>
          <div style={{ color: 'var(--accent-emerald)', fontWeight: '600' }}>{order.salary || t('components.orderDrawer.notSet')}</div>
        </div>
        <div>
          <div style={metricLabelStyle}>{t('components.orderDrawer.location')}</div>
          <div style={{ color: 'var(--text-primary)' }}>{order.location || t('components.orderDrawer.notSet')}</div>
        </div>
        <div>
          <div style={metricLabelStyle}>{t('components.orderDrawer.headcount')}</div>
          <div style={{ color: 'var(--accent-amber)' }}>{order.headcount || 1} {t('orders.pax')}</div>
        </div>
        {order.picName && (
          <div>
            <div style={metricLabelStyle}>{t('ordersView.pic')}</div>
            <div style={{ color: 'var(--text-primary)' }}>{order.picName}</div>
          </div>
        )}
        {order.commission && (
          <div>
            <div style={metricLabelStyle}>{t('ordersView.commission')}</div>
            <div style={{ color: 'var(--accent-blue)' }}>{order.commission}</div>
          </div>
        )}
      </div>

      <Section icon="ph-clock" color="var(--accent-amber)" title={t('components.orderDrawer.workHours')}>
        {order.workHours || t('components.orderDrawer.noWorkHours')}
      </Section>

      <Section icon="ph-list-checks" color="var(--accent-blue)" title={t('components.orderDrawer.reqs')}>
        {order.requirements || t('components.orderDrawer.noReqs')}
      </Section>

      {order.benefits && (
        <Section icon="ph-gift" color="var(--accent-rose)" title={t('components.orderDrawer.benefits')}>
          {order.benefits}
        </Section>
      )}

      {order.companyBackground && (
        <Section icon="ph-buildings" color="var(--text-muted)" title={t('ordersView.companyBackground')}>
          {order.companyBackground}
        </Section>
      )}

      {order.notes && (
        <div style={{
          borderTop: '1px dashed var(--border-subtle)',
          paddingTop: 'var(--space-5)',
          marginTop: 'var(--space-2)'
        }}>
          <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>{t('components.orderDrawer.teamNotes')}</h4>
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{order.notes}</div>
        </div>
      )}
    </>
  );
}
