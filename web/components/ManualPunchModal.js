'use client';

import { useState, useEffect } from 'react';
import { FirestoreStore } from '../lib/firestore-store';
import { useI18n } from '../lib/i18n-context';

export default function ManualPunchModal({
  isOpen,
  onClose,
  teamId,
  adminUser,
  teamMembers = [],
  appealToReview = null,
  prefillTarget = null,
  onSuccess
}) {
  const { t, lang } = useI18n();
  const isEn = lang === 'en';

  // Mode: 'APPEAL_REVIEW' vs 'DIRECT_MANUAL'
  const isReviewMode = Boolean(appealToReview);

  // Form states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [punchType, setPunchType] = useState('CLOCK_OUT');
  const [timeStr, setTimeStr] = useState('18:00');
  const [reason, setReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (appealToReview) {
      setSelectedUserId(appealToReview.userId || '');
      setDateStr(appealToReview.date || '');
      setPunchType(appealToReview.requestedPunchType || 'CLOCK_OUT');
      setTimeStr(appealToReview.requestedTime || '18:00');
      setReason(appealToReview.reason ? `核准员工申诉: ${appealToReview.reason}` : '核准员工考勤申诉');
      setRejectNote('');
      setIsRejecting(false);
      setErrorMsg('');
    } else if (prefillTarget) {
      setSelectedUserId(prefillTarget.userId || '');
      setDateStr(prefillTarget.date || '');
      setPunchType(prefillTarget.defaultPunchType || 'CLOCK_OUT');
      setTimeStr(prefillTarget.defaultTime || '18:00');
      setReason(prefillTarget.defaultReason || '');
      setErrorMsg('');
    } else {
      const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      setDateStr(today);
      setPunchType('CLOCK_OUT');
      setTimeStr('18:00');
      setReason('');
      setErrorMsg('');
      if (teamMembers.length > 0 && !selectedUserId) {
        setSelectedUserId(teamMembers[0].id || teamMembers[0].uid || '');
      }
    }
  }, [appealToReview, prefillTarget, teamMembers]);

  if (!isOpen) return null;

  const currentMember = teamMembers.find(m => (m.id || m.uid) === selectedUserId) || null;
  const targetPicName = appealToReview?.picName || prefillTarget?.picName || currentMember?.displayName || currentMember?.name || currentMember?.email?.split('@')[0] || t('analytics.defaultPicName', '顾问');
  const targetEmail = appealToReview?.userEmail || prefillTarget?.userEmail || currentMember?.email || '';

  // Handle Approve Appeal & Manual Punch
  const handleApproveAppeal = async (e) => {
    e?.preventDefault();
    if (!timeStr) {
      setErrorMsg(t('manualPunch.errTimeRequired', '请设定核准的打卡时间 (HH:mm)'));
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      await FirestoreStore.reviewAttendanceAppeal(teamId, appealToReview.id, {
        status: 'APPROVED',
        reviewNote: reason.trim(),
        adminUser,
        approvedTimeStr: timeStr,
        approvedPunchType: punchType,
        originalAppeal: appealToReview
      });

      if (onSuccess) {
        onSuccess(t('manualPunch.toastApproveSuccess', '考勤申诉已核准，已成功生成【管理员补录】打卡记录！'));
      }
      onClose();
    } catch (err) {
      console.error('Failed to approve appeal:', err);
      setErrorMsg(err?.message || t('manualPunch.errApproveFailed', '核准失败，请重试'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reject Appeal
  const handleRejectAppeal = async () => {
    if (!rejectNote.trim()) {
      setErrorMsg(t('manualPunch.errRejectNoteRequired', '请填写驳回原因，以便通知申诉员工'));
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      await FirestoreStore.reviewAttendanceAppeal(teamId, appealToReview.id, {
        status: 'REJECTED',
        reviewNote: rejectNote.trim(),
        adminUser,
        originalAppeal: appealToReview
      });

      if (onSuccess) {
        onSuccess(t('manualPunch.toastRejectSuccess', '已驳回该考勤申诉'));
      }
      onClose();
    } catch (err) {
      console.error('Failed to reject appeal:', err);
      setErrorMsg(err?.message || t('manualPunch.errRejectFailed', '驳回失败，请重试'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Direct Admin Manual Punch
  const handleDirectManualPunch = async (e) => {
    e?.preventDefault();
    if (!selectedUserId) {
      setErrorMsg(t('manualPunch.errSelectMember', '请选择需要补录打卡的员工'));
      return;
    }
    if (!dateStr) {
      setErrorMsg(t('manualPunch.errDateRequired', '请指定打卡日期'));
      return;
    }
    if (!timeStr) {
      setErrorMsg(t('manualPunch.errTimeRequired', '请指定补录打卡时间 (HH:mm)'));
      return;
    }
    if (!reason.trim()) {
      setErrorMsg(t('manualPunch.errReasonRequired', '请填写补录事由（审计留痕必填）'));
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      await FirestoreStore.addManualAttendanceRecord(teamId, {
        userId: selectedUserId,
        userEmail: targetEmail,
        picName: targetPicName,
        type: punchType,
        dateStr,
        timeStr,
        reason: reason.trim(),
        adminUser
      });

      if (onSuccess) {
        onSuccess(t('manualPunch.toastDirectSuccess', { name: targetPicName, date: dateStr, time: timeStr }, '已成功为 {name} 补录 {date} {time} 的打卡记录！'));
      }
      onClose();
    } catch (err) {
      console.error('Failed to direct manual punch:', err);
      setErrorMsg(err?.message || t('manualPunch.errDirectFailed', '补录失败，请重试'));
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
      zIndex: 10060,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-4)'
    }}>
      <div className="bezel-shell" style={{ maxWidth: '540px', width: '100%', animation: 'scaleUp 0.2s ease-out' }}>
        <div className="bezel-core" style={{ padding: 'var(--space-6)' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.15)',
                color: 'var(--accent-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px'
              }}>
                <i className="ph-bold ph-wrench"></i>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {isReviewMode ? t('manualPunch.reviewTitle', '考勤申诉审核与补录') : t('manualPunch.directTitle', '管理员手动补录考勤')}
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  {isReviewMode ? t('manualPunch.reviewSub', '核实员工申报信息，核准生成带审计留痕的补录记录') : t('manualPunch.directSub', '为员工补录历史遗漏考勤，所有操作将终身不可篡改留痕')}
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

          {/* Appeal Context Info Card (If in review mode) */}
          {isReviewMode && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              marginBottom: 'var(--space-4)',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: '700', color: 'var(--accent-amber)' }}>
                  <i className="ph-bold ph-user" style={{ marginRight: '4px' }}></i>
                  {appealToReview.picName} ({appealToReview.userEmail})
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {appealToReview.date}
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.45', marginBottom: '6px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{t('manualPunch.lblClaim', '申报详情')}: </strong>
                {appealToReview.requestedPunchType === 'CLOCK_OUT' ? t('attendanceAppeal.typeClockOut', '下班签退') : t('attendanceAppeal.typeClockIn', '上班签到')} · {appealToReview.requestedTime}
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{t('manualPunch.lblReason', '申诉说明')}: </strong>
                {appealToReview.reason || t('common.none', '无')}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={isReviewMode ? handleApproveAppeal : handleDirectManualPunch} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            
            {/* Target Member (Only visible if not in review mode) */}
            {!isReviewMode && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('manualPunch.lblMember', '被补录员工 (Member)')} *
                </label>
                <select
                  className="select"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={Boolean(prefillTarget?.userId)}
                >
                  <option value="">{t('manualPunch.chooseMember', '请选择顾问成员...')}</option>
                  {teamMembers.map(m => {
                    const mId = m.id || m.uid;
                    const mName = m.displayName || m.name || (m.email ? m.email.split('@')[0] : mId);
                    return (
                      <option key={mId} value={mId}>{mName} ({m.email || '无邮箱'})</option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Target Date & Punch Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('manualPunch.lblDate', '考勤日期 (Date)')} *
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
                  {t('manualPunch.lblPunchType', '打卡类型 (Type)')} *
                </label>
                <select
                  className="select"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  value={punchType}
                  onChange={(e) => setPunchType(e.target.value)}
                >
                  <option value="CLOCK_OUT">{t('attendanceAppeal.typeClockOut', '下班签退 (CLOCK_OUT)')}</option>
                  <option value="CLOCK_IN">{t('attendanceAppeal.typeClockIn', '上班签到 (CLOCK_IN)')}</option>
                  <option value="LUNCH_OUT">{t('attendanceAppeal.typeLunchOut', '午休离开 (LUNCH_OUT)')}</option>
                  <option value="LUNCH_IN">{t('attendanceAppeal.typeLunchIn', '午休返回 (LUNCH_IN)')}</option>
                </select>
              </div>
            </div>

            {/* Punch Time */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                {t('manualPunch.lblPunchTime', '核定补录时间 (Effective Time)')} *
              </label>
              <input
                type="time"
                step="60"
                className="input"
                style={{ width: '100%', height: '36px', fontSize: '14px', fontFamily: 'monospace' }}
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                required
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {t('manualPunch.punchTimeHint', '系统将生成此精确时间戳的打卡记录并自动重算当日班次达标状态')}
              </div>
            </div>

            {/* Reason / Review Note */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                {isReviewMode ? t('manualPunch.lblReviewNote', '审批意见 / 核定理由') : t('manualPunch.lblDirectReason', '补录原因 / 特批说明')} *
              </label>
              <textarea
                className="input"
                style={{
                  width: '100%',
                  minHeight: '68px',
                  fontSize: '13px',
                  lineHeight: '1.45',
                  padding: '8px 12px',
                  resize: 'vertical'
                }}
                placeholder={isReviewMode ? t('manualPunch.reviewPlaceholder', '选填核准备注 (如: 已与客户经理核实)...') : t('manualPunch.directPlaceholder', '必填补录原因 (如: 10/29 因公外勤拜访客户，主管特批补录下班)...')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required={!isReviewMode}
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

            {/* Audit Trail Security Badge */}
            <div style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: '1.4'
            }}>
              <i className="ph-bold ph-shield-check" style={{ color: 'var(--accent-purple)', marginRight: '4px' }}></i>
              {t('manualPunch.auditNotice', { admin: adminUser?.displayName || adminUser?.name || adminUser?.email || '管理员' }, '安全留痕机制：补录记录将打上【管理员补录】标签，并永久留存管理员 ({admin}) 操作时间与事由。')}
            </div>

            {/* Reject Box in Review Mode */}
            {isReviewMode && isRejecting && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#f87171' }}>
                  {t('manualPunch.lblRejectReason', '驳回申诉原因 (必填)')}
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: '100%', height: '34px', fontSize: '12px', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                  placeholder={t('manualPunch.rejectPlaceholder', '填写驳回理由，如：出差无报备证明 / 考勤异常未提前请示...')}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '11px' }}
                    onClick={() => setIsRejecting(false)}
                  >
                    {t('common.cancel', '取消')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#ef4444', color: '#fff', fontSize: '11px', border: 'none' }}
                    onClick={handleRejectAppeal}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? t('manualPunch.processing', '正在驳回...') : t('manualPunch.btnConfirmReject', '确认驳回申诉')}
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
              <div>
                {isReviewMode && !isRejecting && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: '12px', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                    onClick={() => setIsRejecting(true)}
                    disabled={isSubmitting}
                  >
                    <i className="ph-bold ph-x-circle" style={{ marginRight: '4px' }}></i>
                    {t('manualPunch.btnReject', '驳回申诉')}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
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
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: '700',
                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.35)'
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <i className="ph-bold ph-spinner-gap ph-spin" style={{ marginRight: '6px' }}></i>
                      {t('manualPunch.saving', '正在保存...')}
                    </>
                  ) : (
                    <>
                      <i className="ph-bold ph-check-circle" style={{ marginRight: '6px' }}></i>
                      {isReviewMode ? t('manualPunch.btnApprove', '核准并执行补录') : t('manualPunch.btnConfirmManual', '确认执行补录')}
                    </>
                  )}
                </button>
              </div>
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
