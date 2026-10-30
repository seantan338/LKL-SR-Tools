'use client';

import { useState, useEffect, useMemo } from 'react';
import { FirestoreStore } from '../lib/firestore-store';
import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';

export default function AttendanceLeaveModal({
  isOpen,
  onClose,
  targetDate,
  user,
  userProfile,
  teamId,
  hqMembers = [],
  isAdminMode = false,
  onSuccess
}) {
  const { t, lang } = useI18n();
  const isEn = lang === 'en';
  const auth = useAuth();

  const currentUser = user || auth?.user;
  const currentUserProfile = userProfile || auth?.userProfile;
  const currentTeamId = teamId || auth?.teamId || 'default_team';

  // State
  const [selectedUid, setSelectedUid] = useState('');
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [durationType, setDurationType] = useState('FULL_DAY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 初始化表单：仅在弹窗从关闭变为打开（isOpen 为 true）的一瞬间执行一次重置
  useEffect(() => {
    if (!isOpen) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const initialDate = targetDate || todayStr;
    setStartDate(initialDate);
    setEndDate(initialDate);
    setLeaveType('ANNUAL');
    setDurationType('FULL_DAY');
    setReason('');
    setErrorMsg('');

    if (isAdminMode && Array.isArray(hqMembers) && hqMembers.length > 0) {
      setSelectedUid(currentUser?.uid || hqMembers[0]?.uid || hqMembers[0]?.id || '');
    } else {
      setSelectedUid(currentUser?.uid || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 当切换为半天假时，自动锁定结束日期等于开始日期
  useEffect(() => {
    if (durationType === 'HALF_AM' || durationType === 'HALF_PM') {
      setEndDate(startDate);
    }
  }, [durationType, startDate]);

  // 计算预计折算天数
  const calculatedDays = useMemo(() => {
    if (durationType === 'HALF_AM' || durationType === 'HALF_PM') {
      return 0.5;
    }
    if (!startDate || !endDate) return 1;
    if (endDate < startDate) return 0;
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    if (!sy || !ey) return 1;
    const cur = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    let count = 0;
    while (cur <= end) {
      const d = cur.getDay();
      if (d !== 0 && d !== 6) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count > 0 ? count : 1;
  }, [startDate, endDate, durationType]);

  if (!isOpen) return null;

  const leaveTypeOptions = [
    { id: 'ANNUAL', label: t('attendanceLeave.typeAnnual', '年假 (Annual Leave - AL)') },
    { id: 'SICK', label: t('attendanceLeave.typeSick', '病假 (Medical Leave - MC)') },
    { id: 'EMERGENCY', label: t('attendanceLeave.typeEmergency', '紧急事假 (Emergency Leave - EL)') },
    { id: 'UNPAID', label: t('attendanceLeave.typeUnpaid', '无薪假 (Unpaid Leave - UL)') },
    { id: 'OTHER', label: t('attendanceLeave.typeOther', '其他调休 / 特殊假') }
  ];

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const targetUid = isAdminMode ? selectedUid : (currentUser?.uid || selectedUid);
    if (!targetUid) {
      setErrorMsg(t('attendanceLeave.errMemberRequired', '请选择目标员工'));
      return;
    }

    if (!startDate) {
      setErrorMsg(t('attendanceLeave.errStartDateRequired', '请选择请假开始日期'));
      return;
    }

    if (durationType === 'FULL_DAY' && (!endDate || endDate < startDate)) {
      setErrorMsg(t('attendanceLeave.errEndDateInvalid', '结束日期必须晚于或等于开始日期'));
      return;
    }

    if (!reason.trim()) {
      setErrorMsg(t('attendanceLeave.errReasonRequired', '请如实填写请假事由说明'));
      return;
    }

    try {
      setIsSubmitting(true);

      // 获取被请假人的信息
      let targetUserEmail = currentUser?.email || '';
      let targetPicName = currentUserProfile?.displayName || currentUser?.displayName || '员工';

      if (isAdminMode && hqMembers.length > 0) {
        const found = hqMembers.find(m => (m.uid || m.id) === targetUid);
        if (found) {
          targetUserEmail = found.email || '';
          targetPicName = found.displayName || found.name || targetUserEmail.split('@')[0] || '员工';
        }
      }

      const leaveData = {
        userId: targetUid,
        userEmail: targetUserEmail,
        picName: targetPicName,
        leaveType,
        durationType,
        startDate,
        endDate: (durationType === 'HALF_AM' || durationType === 'HALF_PM') ? startDate : endDate,
        reason: reason.trim(),
        isManualAdminEntry: Boolean(isAdminMode)
      };

      await FirestoreStore.submitAttendanceLeave(
        currentTeamId,
        leaveData,
        isAdminMode ? currentUser : null
      );

      if (onSuccess) {
        onSuccess(
          isAdminMode
            ? t('attendanceLeave.toastAdminSuccess', '休假记录已成功登记生效')
            : t('attendanceLeave.toastSubmitSuccess', '请假申请已提交，请等待主管审批')
        );
      }
      onClose();
    } catch (err) {
      console.error('Failed to submit leave:', err);
      setErrorMsg(err?.message || t('attendanceLeave.errSubmitFailed', '提交请假申请失败，请重试'));
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
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--accent-green, #10B981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px'
              }}>
                <i className="ph-bold ph-calendar-minus"></i>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {isAdminMode
                    ? t('attendanceLeave.titleAdmin', '登记/代录入员工休假')
                    : t('attendanceLeave.titleEmployee', '提交考勤请假申请')}
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  {isAdminMode
                    ? t('attendanceLeave.subtitleAdmin', '主管登记之休假直接批准生效，自动豁免班次打卡')
                    : t('attendanceLeave.subtitleEmployee', '获批后自动豁免阶梯班次打卡考核，保护考勤准点率')}
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

            {/* 管理员模式：选择员工 */}
            {isAdminMode && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('attendanceLeave.lblMember', '选择请假员工 (Staff Member)')} *
                </label>
                <select
                  className="select"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  value={selectedUid}
                  onChange={(e) => setSelectedUid(e.target.value)}
                  required
                >
                  {hqMembers.map(m => {
                    const id = m.uid || m.id;
                    const name = m.displayName || m.name || (m.email ? m.email.split('@')[0] : '员工');
                    return (
                      <option key={id} value={id}>
                        {name} ({m.email || 'No email'})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* 请假假别与粒度 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('attendanceLeave.lblLeaveType', '休假类别 (Leave Type)')} *
                </label>
                <select
                  className="select"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                >
                  {leaveTypeOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('attendanceLeave.lblDurationType', '请假时段 (Duration)')} *
                </label>
                <div style={{
                  display: 'flex',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.08))'
                }}>
                  {[
                    { id: 'FULL_DAY', label: t('attendanceLeave.fullDay', '全天') },
                    { id: 'HALF_AM', label: t('attendanceLeave.halfAm', '上午') },
                    { id: 'HALF_PM', label: t('attendanceLeave.halfPm', '下午') }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDurationType(tab.id)}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        fontSize: '12px',
                        fontWeight: durationType === tab.id ? '600' : '400',
                        color: durationType === tab.id ? '#ffffff' : 'var(--text-muted)',
                        background: durationType === tab.id ? 'var(--accent-blue, #2563EB)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 日期选择区 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('attendanceLeave.lblStartDate', '开始日期 (Start Date)')} *
                </label>
                <input
                  type="date"
                  className="input"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  {t('attendanceLeave.lblEndDate', '结束日期 (End Date)')} *
                </label>
                <input
                  type="date"
                  className="input"
                  style={{
                    width: '100%',
                    height: '36px',
                    fontSize: '13px',
                    opacity: (durationType === 'HALF_AM' || durationType === 'HALF_PM') ? 0.6 : 1,
                    cursor: (durationType === 'HALF_AM' || durationType === 'HALF_PM') ? 'not-allowed' : 'text'
                  }}
                  value={endDate}
                  disabled={durationType === 'HALF_AM' || durationType === 'HALF_PM'}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* 折算天数与豁免说明卡片 */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <i className="ph-bold ph-info" style={{ color: 'var(--accent-blue)', fontSize: '15px' }}></i>
                <span>
                  {durationType === 'HALF_AM' && t('attendanceLeave.hintHalfAm', '上午半天假：免上班打卡，13:30 前签到即可')}
                  {durationType === 'HALF_PM' && t('attendanceLeave.hintHalfPm', '下午半天假：上午正常签到，12:30 后签退免早退惩罚')}
                  {durationType === 'FULL_DAY' && t('attendanceLeave.hintFullDay', '全天假：当天免打卡，工作日自动折算')}
                </span>
              </div>
              <div style={{ fontWeight: '700', color: 'var(--accent-blue)', whiteSpace: 'nowrap', marginLeft: '10px' }}>
                {calculatedDays} {t('attendanceLeave.unitDays', '天 (Days)')}
              </div>
            </div>

            {/* 请假原因 */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                {t('attendanceLeave.lblReason', '请假具体事由说明 (Reason)')} *
              </label>
              <textarea
                className="textarea"
                rows={3}
                style={{ width: '100%', resize: 'vertical', fontSize: '13px', padding: '8px 10px' }}
                placeholder={t('attendanceLeave.placeholderReason', '请简明填写休假理由（如：个人年假出行 / 身体不适前往诊所就医）')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="ph-bold ph-warning-circle" style={{ fontSize: '15px' }}></i>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
                style={{ height: '36px', padding: '0 16px', fontSize: '13px' }}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{
                  height: '36px',
                  padding: '0 20px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isSubmitting ? (
                  <>
                    <i className="ph-bold ph-spinner" style={{ animation: 'spin 1s linear infinite' }}></i>
                    <span>{t('common.submitting', '提交中...')}</span>
                  </>
                ) : (
                  <>
                    <i className="ph-bold ph-check"></i>
                    <span>{isAdminMode ? t('attendanceLeave.btnAdminSubmit', '直接登记生效') : t('attendanceLeave.btnSubmit', '提交请假申请')}</span>
                  </>
                )}
              </button>
            </div>

          </form>

        </div>
      </div>
    </div>
  );
}
