// 面试自动提醒：根据面试日期 / 时间计算提醒，并替换候选人身上旧的自动提醒

export const INTERVIEW_REMINDER_SOURCE = 'interview_auto';
export const DEFAULT_INTERVIEW_REMINDER_LEAD = '60';
export const INTERVIEW_REMINDER_LEADS = ['15', '60', '180', '1440', 'none'];

const DEFAULT_INTERVIEW_TIME = '09:00';
const pad = (n) => String(n).padStart(2, '0');
const formatLocalDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatLocalTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function isHhMm(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

/**
 * 计算面试提醒；无法计算（日期无效、面试已过、选择不提醒）时返回 null
 * interviewDate: 'YYYY-MM-DD'；interviewTime: 'HH:mm'（可空，默认 09:00）
 * leadMinutes: 提前多少分钟提醒，'none' 表示不提醒
 */
export function buildInterviewReminder({ interviewDate, interviewTime, leadMinutes = DEFAULT_INTERVIEW_REMINDER_LEAD, content, now = new Date() }) {
  if (!isIsoDate(interviewDate) || leadMinutes === 'none') return null;
  const time = isHhMm(interviewTime) ? interviewTime : DEFAULT_INTERVIEW_TIME;

  // 不带时区的 "YYYY-MM-DDTHH:mm" 按本地时间解析
  const interviewAt = new Date(`${interviewDate}T${time}`);
  if (isNaN(interviewAt.getTime()) || interviewAt <= now) return null;

  const lead = Number(leadMinutes);
  let remindAt = new Date(interviewAt.getTime() - (Number.isFinite(lead) && lead > 0 ? lead : 0) * 60000);
  // 距离面试已不足提前量时，1 分钟后提醒，避免保存后立刻弹出
  const earliest = new Date(now.getTime() + 60000);
  if (remindAt < earliest) remindAt = earliest > interviewAt ? interviewAt : earliest;

  return {
    source: INTERVIEW_REMINDER_SOURCE,
    interviewAt: `${interviewDate}T${time}`,
    date: formatLocalDate(remindAt),
    time: formatLocalTime(remindAt),
    dateTime: `${formatLocalDate(remindAt)}T${formatLocalTime(remindAt)}`,
    content: content || '',
  };
}

/**
 * 用新的自动提醒替换候选人身上未触发的旧自动提醒；手动提醒和已触发的提醒保持不变
 * newReminder 为 null 时只移除旧的自动提醒
 * 返回 { reminders, changed }，内容相同则 changed = false（避免每次保存都重复写入）
 */
export function mergeInterviewReminder(reminders, newReminder) {
  const list = Array.isArray(reminders) ? reminders : [];
  const isPendingAuto = (r) => r && r.source === INTERVIEW_REMINDER_SOURCE && !r.fired;
  const pendingAuto = list.filter(isPendingAuto);

  if (newReminder && pendingAuto.length === 1
    && pendingAuto[0].dateTime === newReminder.dateTime
    && pendingAuto[0].interviewAt === newReminder.interviewAt
    && pendingAuto[0].content === newReminder.content) {
    return { reminders: list, changed: false };
  }
  if (!newReminder && pendingAuto.length === 0) {
    return { reminders: list, changed: false };
  }

  const kept = list.filter((r) => !isPendingAuto(r));
  return { reminders: newReminder ? [...kept, newReminder] : kept, changed: true };
}
