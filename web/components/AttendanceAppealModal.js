'use client';

import { useState, useEffect } from 'react';
import { FirestoreStore } from '../lib/firestore-store';
import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';

export default function AttendanceAppealModal({
  isOpen,
  onClose,
  targetRecord,
  targetDate,
  defaultPunchType,
  user,
  userProfile,
  teamId,
  onSuccess
}) {
  const { t, lang } = useI18n();
  const isEn = lang === 'en';
  const auth = useAuth();

  const currentUser = user || auth?.user;
  const currentUserProfile = userProfile || auth?.userProfile;
  const currentTeamId = teamId || auth?.teamId || 'default_team';

  const [dateStr, setDateStr] = useState('');
  const [requestedPunchType, setRequestedPunchType] = useState('CLOCK_OUT');
  const [requestedTime, setRequestedTime] = useState('18:00');
  const [appealCategory, setAppealCategory] = useState('OFFSITE_WORK');
  const [reasonText, setReasonText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (targetDate) {
      setDateStr(targetDate);
    }
    if (defaultPunchType) {
      setRequestedPunchType(defaultPunchType);
      if (defaultPunchType === 'CLOCK_IN') {
        setRequestedTime('09:00');
      } else if (defaultPunchType === 'CLOCK_OUT') {
        setRequestedTime('18:00');
      } else if (defaultPunchType === 'LUNCH_OUT') {
        setRequestedTime('12:00');
      } else if (defaultPunchType === 'LUNCH_IN') {
        setRequestedTime('13:00');
      }
    }
    if (targetRecord) {
      setDateStr(targetRecord.date || '');
      // If user had clock-in but no clock-out, default to CLOCK_OUT; if no clock-in at all, CLOCK_IN
      if (!targetRecord.manualClockIn && !targetRecord.allClockIns?.length) {
        setRequestedPunchType('CLOCK_IN');
        setRequestedTime('09:00');
      } else {
        setRequestedPunchType('CLOCK_OUT');
        setRequestedTime('18:00');
      }
    }
    setAppealCategory('OFFSITE_WORK');
    setReasonText('');
    setErrorMsg('');
  }, [targetRecord, targetDate, defaultPunchType]);

  if (!isOpen) return null;

  const categories = [
    { id: 'OFFSITE_WORK', label: t('attendanceAppeal.catOffsite', '外勤出差 / 现场拜访客户或候选人') },
    { id: 'FORGOT_PUNCH', label: t('attendanceAppeal.catForgot', '在岗遗忘打卡 (有主管或同事证明)') },
    { id: 'NETWORK_GPS', label: t('attendanceAppeal.catNetwork', '网络故障 / GPS 定位漂移打卡未成') },
    { id: 'OVERTIME', label: t('attendanceAppeal.catOvertime', '临时外出公干加班，直接现场下班') },
    { id: 'OTHER', label: t('attendanceAppeal.catOther', '其他特殊情况说明') }
  ];

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!dateStr) {
      setErrorMsg(t('attendanceAppeal.errDateRequired', '请选择异常考勤日期'));
      return;
    }
    if (!requestedTime) {
      setErrorMsg(t('attendanceAppeal.errTimeRequired', '请填写期望补录的打卡时间 (HH:mm)'));
      return;
    }
    if (!reasonText.trim()) {
      setErrorMsg(t('attendanceAppeal.errReasonRequired', '请如实填写申诉原因及具体情况说明'));
      return;
    }

    const uid = currentUser?.uid;
    if (!uid) {
      setErrorMsg('未检测到有效登录用户，请重新登录后再试');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const picName = currentUserProfile?.displayName || currentUserProfile?.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || '员工';
      const categoryObj = categories.find(c => c.id === appealCategory);
      const combinedReason = `[${categoryObj?.label || appealCategory}] ${reasonText.trim()}`;

      await FirestoreStore.submitAttendanceAppeal(currentTeamId, {
        userId: uid,
        userEmail: currentUser?.email || '',
        picName,
        date: dateStr,
        appealType: requestedPunchType === 'CLOCK_OUT' ? 'MISSING_CLOCK_OUT' : 'MISSING_CLOCK_IN',
        requestedPunchType,
        requestedTime,
        reason: combinedReason
      });

      if (onSuccess) {
        onSuccess(t('attendanceAppeal.toastSuccess', '考勤申诉已成功提交，请等待管理员/经理审核'));
      }
      onClose();
    } catch (err) {
      console.error('Failed to submit appeal:', err);
      setErrorMsg(err?.message || t('attendanceAppeal.errSubmitFailed', '提交申诉失败，请检查网络重试'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10050,
      background: 'rgba(0, 0, 0, 0.72)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-4)'
    }}>
      <div className="bezel-shell" style={{ maxWidth: '520px', width: '100%', animation: 'scaleUp 0.2s ease-out' }}>
        <div className="bezel-core" style={{ padding: 'var(--space-6)' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(234, 179, 8, 0.15)',
                color: 'var(--accent-amber)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '17px'
              }}>
                <i className="ph-bold ph-shield-warning"></i>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {t('attendanceAppeal.title', '考勤异常申诉与补录申请')}
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  {t('attendanceAppeal.subtitle', '若因出差、外勤或系统故障导致打卡异常，可申请管理员核实补录')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                color: 'var(--text-secondary)',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <i className="ph-bold ph-x"></i>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            
            {/* Target Date & Punch Type Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('attendanceAppeal.lblDate', '异常日期 (Date)')} *
                </label>
                <input
                  type="date"
                  className="input"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('attendanceAppeal.lblPunchType', '补录卡别 (Type)')} *
                </label>
                <select
                  className="select"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  value={requestedPunchType}
                  onChange={(e) => setRequestedPunchType(e.target.value)}
                >
                  <option value="CLOCK_OUT">{t('attendanceAppeal.typeClockOut', '下班签退 (CLOCK_OUT)')}</option>
                  <option value="CLOCK_IN">{t('attendanceAppeal.typeClockIn', '上班签到 (CLOCK_IN)')}</option>
                  <option value="LUNCH_OUT">{t('attendanceAppeal.typeLunchOut', '午休离开 (LUNCH_OUT)')}</option>
                  <option value="LUNCH_IN">{t('attendanceAppeal.typeLunchIn', '午休返回 (LUNCH_IN)')}</option>
                </select>
              </div>
            </div>

            {/* Requested Time */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                {t('attendanceAppeal.lblRequestedTime', '实际离岗 / 到岗时间 (Actual Time)')} *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="time"
                  step="60"
                  className="input"
                  style={{ width: '100%', height: '36px', fontSize: '14px', fontFamily: 'monospace' }}
                  value={requestedTime}
                  onChange={(e) => setRequestedTime(e.target.value)}
                  required
                />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {t('attendanceAppeal.timeHint', '例如 10月29日因公外勤于 18:05 离岗，请如实申报 18:05')}
              </div>
            </div>

            {/* Appeal Category */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                {t('attendanceAppeal.lblCategory', '申诉类别 (Category)')} *
              </label>
              <select
                className="select"
                style={{ width: '100%', height: '36px', fontSize: '13px' }}
                value={appealCategory}
                onChange={(e) => setAppealCategory(e.target.value)}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Reason Textarea */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                {t('attendanceAppeal.lblReason', '申诉详细说明与佐证 (Reason & Proof)')} *
              </label>
              <textarea
                className="input"
                style={{
                  width: '100%',
                  minHeight: '84px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  padding: '8px 12px',
                  resize: 'vertical'
                }}
                placeholder={t('attendanceAppeal.reasonPlaceholder', '请详细说明实际出勤情况（如拜访哪家企业、经办哪些业务），供管理员核实...')}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                required
              />
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: '12px',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <i className="ph-bold ph-warning-circle"></i>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Notice */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: '1.4'
            }}>
              <i className="ph-bold ph-info" style={{ color: 'var(--accent-blue)', marginRight: '4px' }}></i>
              {t('attendanceAppeal.policyNotice', '提示：申诉一经管理员批准，系统将生成明确标记为【管理员补录】的历史打卡记录，并完整保留审批流水与操作人信息。')}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '13px', padding: '6px 16px' }}
                onClick={onClose}
                disabled={isSubmitting}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  fontSize: '13px',
                  padding: '6px 20px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '700',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)'
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <i className="ph-bold ph-spinner-gap ph-spin" style={{ marginRight: '6px' }}></i>
                    {t('attendanceAppeal.submitting', '正在提交...')}
                  </>
                ) : (
                  <>
                    <i className="ph-bold ph-paper-plane-tilt" style={{ marginRight: '6px' }}></i>
                    {t('attendanceAppeal.btnSubmit', '确认提交申诉')}
                  </>
                )}
              </button>
            </div>

          </form>

        </div>
      </div>

      <style jsx>{`
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
