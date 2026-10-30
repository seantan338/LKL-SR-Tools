import { db } from './firebase';
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, increment, Timestamp 
} from 'firebase/firestore';
import { Utils } from './utils';
import { mergeInterviewReminder } from './interview-reminder.mjs';

/**
 * Firestore Data Layer for TALENT FLOW
 * Replaces the old localStorage/Electron IPC store.
 */

function sanitizeFirestoreData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const res = {};
  for (const [key, val] of Object.entries(obj)) {
    // Defense against prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    if (val !== undefined) {
      if (
        val && 
        typeof val === 'object' && 
        !Array.isArray(val) && 
        !(val instanceof Date) && 
        typeof val.toMillis !== 'function' &&
        typeof val._methodName !== 'string'
      ) {
        res[key] = sanitizeFirestoreData(val);
      } else {
        res[key] = val;
      }
    }
  }
  return res;
}

const _candidatesCache = new Map(); // teamId -> Array<Candidate>

export const FirestoreStore = {
  // --- Candidates ---

  subscribeToCandidates(teamId, userRole, userId, callback) {
    if (!teamId) return () => {};
    
    let q;
    const candidatesRef = collection(db, 'teams', teamId, 'candidates');
    
    // Team pool is shared: every approved member can see all candidates (mutual follow-up).
    q = query(candidatesRef, orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const seen = new Set();
      const candidates = [];
      for (const doc of snapshot.docs) {
        const item = { ...doc.data(), id: doc.id };
        if (!seen.has(item.id)) {
          seen.add(item.id);
          candidates.push(item);
        }
      }
      // Sort on client using unified millisecond timestamp to bridge legacy ISO string vs Firestore Timestamp split
      candidates.sort((a, b) => Utils.getCandidateTimestamp(b) - Utils.getCandidateTimestamp(a));
      _candidatesCache.set(teamId, candidates);
      callback(candidates);
    }, (error) => {
      console.error("Error fetching candidates:", error);
      callback([]);
    });
  },

  async getCandidate(teamId, candidateId) {
    if (!candidateId) return null;
    const safeTeamId = teamId || 'default_team';
    const docRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id };
  },

  async addCandidate(teamId, userId, data) {
    const candidateId = Utils.generateId();
    const safeTeamId = teamId || 'default_team';
    const docRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    
    const now = new Date().toISOString();
    const phoneNormalized = Utils.normalizePhoneCore(data.phone);
    const candidate = sanitizeFirestoreData({
      ...data,
      id: candidateId,
      phoneNormalized: phoneNormalized || '',
      notes: Utils.normalizeCandidateNotes(data.notes),
      assignedTo: data.assignedTo || userId || 'system',
      stage: data.stage || 'screening',
      stageHistory: [{ stage: data.stage || 'screening', movedAt: now }],
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(docRef, candidate);
    // Keep in-memory cache immediately consistent for rapid batch imports
    const cached = _candidatesCache.get(safeTeamId);
    if (Array.isArray(cached)) {
      _candidatesCache.set(safeTeamId, [{ ...candidate, createdAt: now, updatedAt: now }, ...cached]);
    }
    return candidate;
  },

  async findCandidateByPhone(teamId, phone) {
    if (!phone) return null;
    const safeTeamId = teamId || 'default_team';
    const cleanTarget = String(phone).replace(/\D/g, '');
    if (!cleanTarget || cleanTarget.length < 7) return null;
    const normTarget = Utils.normalizePhoneCore(cleanTarget);

    // 1. O(1) zero-read in-memory lookup from active team subscription cache (covers 100% of legacy phone formats)
    const cachedList = _candidatesCache.get(safeTeamId);
    if (Array.isArray(cachedList) && cachedList.length > 0) {
      for (const item of cachedList) {
        if (!item?.phone) continue;
        const cleanExisting = String(item.phone).replace(/\D/g, '');
        if (!cleanExisting) continue;
        if (cleanExisting === cleanTarget) return item;
        const normExisting = item.phoneNormalized || Utils.normalizePhoneCore(cleanExisting);
        if (normTarget && normExisting === normTarget && normTarget.length >= 7) {
          return item;
        }
      }
      return null;
    }

    const candidatesRef = collection(db, 'teams', safeTeamId, 'candidates');

    // 2. Indexed lookup by phoneNormalized or common phone variants when memory cache is cold
    try {
      if (normTarget && normTarget.length >= 7) {
        const normQ = query(candidatesRef, where('phoneNormalized', '==', normTarget));
        const normSnap = await getDocs(normQ);
        if (!normSnap.empty) {
          const first = normSnap.docs[0];
          return { ...first.data(), id: first.id };
        }
      }
      const variants = Utils.getPhoneVariants(phone);
      if (variants.length > 0) {
        const varQ = query(candidatesRef, where('phone', 'in', variants));
        const varSnap = await getDocs(varQ);
        if (!varSnap.empty) {
          const first = varSnap.docs[0];
          return { ...first.data(), id: first.id };
        }
      }
    } catch (e) {
      console.warn("findCandidateByPhone indexed query error:", e);
    }
    return null;
  },

  /**
   * 按电话号码查重并智能合并或新增候选人 (对齐 UAT CV-16)
   * 若电话重复：合并更新最新画像字段，保留原阶段(stage)、原负责人(assignedTo)，并在 notes 中追加重新投递审计记录
   */
  async upsertCandidate(teamId, userId, data, rawFilename = '') {
    const safeTeamId = teamId || 'default_team';
    const phone = data.phone?.trim();

    let existingCandidate = null;
    if (phone) {
      existingCandidate = await this.findCandidateByPhone(safeTeamId, phone);
    }

    const now = new Date();
    const nowStr = now.toISOString().slice(0, 16).replace('T', ' '); // "2026-10-12 11:00"

    if (existingCandidate) {
      const candidateId = existingCandidate.id;
      const fileLabel = rawFilename || data.rawResumeFilename || '最新简历';
      const reapplyNote = `[${nowStr}] 重新投递/更新了简历 (${fileLabel})`;

      const existingNotes = Utils.normalizeCandidateNotes(existingCandidate.notes);
      const incomingNotes = Utils.normalizeCandidateNotes(data.notes);
      const baseNotes = existingNotes || incomingNotes;
      const mergedNotes = baseNotes 
        ? `${baseNotes}\n${reapplyNote}` 
        : reapplyNote;

      // 合并更新字段：保留原阶段、原状态、原创建时间与负责人
      const updatePayload = {
        ...data,
        id: candidateId,
        phoneNormalized: Utils.normalizePhoneCore(data.phone || existingCandidate.phone) || '',
        // 保留原阶段与流转历史
        stage: existingCandidate.stage || data.stage || 'screening',
        stageHistory: existingCandidate.stageHistory || [{ stage: existingCandidate.stage || 'screening', movedAt: now.toISOString() }],
        status: existingCandidate.status || 'active',
        assignedTo: existingCandidate.assignedTo || userId || 'system',
        createdAt: existingCandidate.createdAt || serverTimestamp(),
        notes: mergedNotes,
        reappliedAt: now.toISOString(),
      };

      await this.updateCandidate(safeTeamId, candidateId, updatePayload);
      return { ...updatePayload, isMerged: true, existingId: candidateId };
    } else {
      const newDoc = await this.addCandidate(safeTeamId, userId, data);
      return { ...newDoc, isMerged: false };
    }
  },

  async updateCandidate(teamId, candidateId, updateData) {
    const safeTeamId = teamId || 'default_team';
    const docRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    const payload = { ...updateData };
    if (payload.phone !== undefined) {
      payload.phoneNormalized = Utils.normalizePhoneCore(payload.phone) || '';
    }
    if (payload.notes !== undefined) {
      payload.notes = Utils.normalizeCandidateNotes(payload.notes);
    }
    const cleaned = sanitizeFirestoreData(payload);
    await updateDoc(docRef, {
      ...cleaned,
      updatedAt: serverTimestamp()
    });
    const cached = _candidatesCache.get(safeTeamId);
    if (Array.isArray(cached)) {
      _candidatesCache.set(
        safeTeamId,
        cached.map(c => (c.id === candidateId ? { ...c, ...cleaned } : c))
      );
    }
  },

  async deleteCandidate(teamId, candidateId) {
    const safeTeamId = teamId || 'default_team';
    const docRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    await deleteDoc(docRef);
  },

  /**
   * 手动批量合并多份候选人档案 (原子批量提交)
   * 更新主档案，并安全删除被吸收的副档案
   */
  async mergeCandidates(teamId, userId, masterId, secondaryIds, mergedData) {
    const safeTeamId = teamId || 'default_team';
    const batch = writeBatch(db);

    // 1. 更新主档案
    const masterRef = doc(db, 'teams', safeTeamId, 'candidates', masterId);
    const cleaned = sanitizeFirestoreData({
      ...mergedData,
      id: masterId,
      updatedAt: serverTimestamp()
    });
    batch.update(masterRef, cleaned);

    // 2. 批量删除被吸收的副档案
    for (const secId of secondaryIds) {
      if (secId && secId !== masterId) {
        const secRef = doc(db, 'teams', safeTeamId, 'candidates', secId);
        batch.delete(secRef);
      }
    }

    await batch.commit();
    return { masterId, mergedCount: secondaryIds.length + 1 };
  },

  async addStageRemark(teamId, candidateId, remarkData) {
    const safeTeamId = teamId || 'default_team';
    const candidateRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    const snap = await getDoc(candidateRef);
    if (!snap.exists()) return null;

    const candidate = snap.data();
    const stageRemarks = candidate.stageRemarks || [];
    
    stageRemarks.push(sanitizeFirestoreData(remarkData));
    await updateDoc(candidateRef, { stageRemarks, updatedAt: serverTimestamp() });
    return remarkData;
  },

  // --- Reminders ---

  async addReminder(teamId, candidateId, reminderData) {
    const safeTeamId = teamId || 'default_team';
    const candidateRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    const snap = await getDoc(candidateRef);
    if (!snap.exists()) return null;

    const candidate = snap.data();
    const reminders = candidate.reminders || [];
    
    const newReminder = {
      id: Utils.generateId(),
      ...sanitizeFirestoreData(reminderData),
      fired: false,
      createdAt: new Date().toISOString()
    };

    reminders.push(newReminder);
    await updateDoc(candidateRef, { reminders, updatedAt: serverTimestamp() });
    return newReminder;
  },

  /**
   * 设定 / 替换候选人的面试自动提醒（reminderData 为 null 时移除未触发的自动提醒）
   * 返回 { changed, reminder }
   */
  async setInterviewReminder(teamId, candidateId, reminderData) {
    const safeTeamId = teamId || 'default_team';
    const candidateRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    const snap = await getDoc(candidateRef);
    if (!snap.exists()) return { changed: false, reminder: null };

    const newReminder = reminderData ? {
      id: Utils.generateId(),
      ...sanitizeFirestoreData(reminderData),
      fired: false,
      createdAt: new Date().toISOString()
    } : null;

    const { reminders, changed } = mergeInterviewReminder(snap.data().reminders, newReminder);
    if (changed) {
      await updateDoc(candidateRef, { reminders, updatedAt: serverTimestamp() });
    }
    return { changed, reminder: changed ? newReminder : null };
  },

  async markReminderFired(teamId, candidateId, reminderId) {
    const safeTeamId = teamId || 'default_team';
    const candidateRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    const snap = await getDoc(candidateRef);
    if (!snap.exists()) return;

    const candidate = snap.data();
    const reminders = (candidate.reminders || []).map(r => 
      r.id === reminderId ? { ...r, fired: true } : r
    );
    
    await updateDoc(candidateRef, { reminders, updatedAt: serverTimestamp() });
  },

  async deleteReminder(teamId, candidateId, reminderId) {
    const safeTeamId = teamId || 'default_team';
    const candidateRef = doc(db, 'teams', safeTeamId, 'candidates', candidateId);
    const snap = await getDoc(candidateRef);
    if (!snap.exists()) return;

    const candidate = snap.data();
    const reminders = (candidate.reminders || []).filter(r => r.id !== reminderId);
    await updateDoc(candidateRef, { reminders, updatedAt: serverTimestamp() });
  },

  // --- Job Orders ---

  subscribeToJobOrders(teamId, userRole, userId, callback) {
    if (!teamId) return () => {};
    
    const ordersRef = collection(db, 'teams', teamId, 'job_orders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const seen = new Set();
      const orders = [];
      for (const doc of snapshot.docs) {
        const item = { ...doc.data(), id: doc.id };
        if (!seen.has(item.id)) {
          seen.add(item.id);
          orders.push(item);
        }
      }
      callback(orders);
    }, (error) => {
      console.warn("subscribeToJobOrders with orderBy failed, falling back to unordered query:", error);
      const fallbackQuery = query(ordersRef);
      onSnapshot(fallbackQuery, (snapshot) => {
        const seen = new Set();
        const orders = [];
        for (const doc of snapshot.docs) {
          const item = { ...doc.data(), id: doc.id };
          if (!seen.has(item.id)) {
            seen.add(item.id);
            orders.push(item);
          }
        }
        callback(orders);
      });
    });
  },

  async addJobOrder(teamId, userId, data) {
    const orderId = Utils.generateId();
    const safeTeamId = teamId || 'default_team';
    const docRef = doc(db, 'teams', safeTeamId, 'job_orders', orderId);
    
    const order = sanitizeFirestoreData({
      ...data,
      id: orderId,
      assignedTo: userId || 'system',
      status: data.status || 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(docRef, order);
    return order;
  },

  async updateJobOrder(teamId, orderId, updateData) {
    const safeTeamId = teamId || 'default_team';
    const docRef = doc(db, 'teams', safeTeamId, 'job_orders', orderId);
    const cleaned = sanitizeFirestoreData(updateData);
    await updateDoc(docRef, {
      ...cleaned,
      updatedAt: serverTimestamp()
    });
  },

  async deleteJobOrder(teamId, orderId) {
    const safeTeamId = teamId || 'default_team';
    const docRef = doc(db, 'teams', safeTeamId, 'job_orders', orderId);
    await deleteDoc(docRef);
  },

  // --- Tags ---

  subscribeToTags(teamId, callback) {
    if (!teamId) return () => {};
    
    const tagsRef = doc(db, 'teams', teamId, 'tags', 'metadata');
    return onSnapshot(tagsRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      } else {
        callback({ companies: {}, positions: {}, sources: {}, customTags: {} });
      }
    });
  },

  // --- Ad Versions (AI Parser History) ---

  subscribeToAdVersions(teamId, callback) {
    if (!teamId) return () => {};
    
    const versionsRef = collection(db, 'teams', teamId, 'ad_versions');
    const q = query(versionsRef, orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const versions = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      callback(versions);
    });
  },

  async addAdVersion(teamId, userId, data) {
    const versionId = Utils.generateId();
    const docRef = doc(db, 'teams', teamId, 'ad_versions', versionId);
    
    const version = {
      ...data,
      id: versionId,
      authorId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, version);
    return version;
  },

  async updateAdVersion(teamId, versionId, updateData) {
    const docRef = doc(db, 'teams', teamId, 'ad_versions', versionId);
    await updateDoc(docRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
  },

  async deleteAdVersion(teamId, versionId) {
    const docRef = doc(db, 'teams', teamId, 'ad_versions', versionId);
    await deleteDoc(docRef);
  },

  // --- Feedback & Suggestions ---

  subscribeToFeedback(teamId, callback) {
    if (!teamId) return () => {};
    const feedbackRef = collection(db, 'teams', teamId, 'feedback');
    const q = query(feedbackRef, orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      callback(items);
    });
  },

  async addFeedback(teamId, user, feedbackData) {
    const feedbackId = Utils.generateId();
    const docRef = doc(db, 'teams', teamId, 'feedback', feedbackId);

    const newFeedback = {
      id: feedbackId,
      category: feedbackData.category || 'feature',
      title: feedbackData.title || '',
      content: feedbackData.content || '',
      priority: feedbackData.priority || 'medium',
      status: 'pending', // pending, in_review, resolved, closed
      adminNote: '',
      createdBy: user?.uid || 'anonymous',
      creatorName: user?.displayName || user?.email || '团队成员',
      creatorEmail: user?.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, newFeedback);
    return newFeedback;
  },

  async updateFeedbackStatus(teamId, feedbackId, status, adminNote = '') {
    const docRef = doc(db, 'teams', teamId, 'feedback', feedbackId);
    const updatePayload = {
      status,
      updatedAt: serverTimestamp()
    };
    if (adminNote !== undefined) {
      updatePayload.adminNote = adminNote;
    }
    await updateDoc(docRef, updatePayload);
  },

  async deleteFeedback(teamId, feedbackId) {
    const docRef = doc(db, 'teams', teamId, 'feedback', feedbackId);
    await deleteDoc(docRef);
  },

  // --- Attendance Rules & Records ---

  subscribeToAttendanceRules(teamId, callback) {
    if (!teamId) return () => {};
    const healRules = (r) => {
      if (!r) return r;
      const res = { ...r, shiftOverrides: r.shiftOverrides || {} };
      if (!res.officeLocations) return res;
      const healed = res.officeLocations.map(loc => {
        if (Math.abs((parseFloat(loc.latitude) || 0) - 3.139) < 0.001 && Math.abs((parseFloat(loc.longitude) || 0) - 101.6869) < 0.001) {
          return { ...loc, name: loc.name || '公司总部', latitude: 1.440472, longitude: 103.617917 };
        }
        return loc;
      });
      return { ...res, officeLocations: healed };
    };
    const defaultRules = {
      enabled: true,
      allowWfh: true,
      enableLunchPunch: false,
      maxDistanceMeters: 100,
      maxDriftCompensation: 40,
      officeLocations: [
        { name: '公司总部', latitude: 1.440472, longitude: 103.617917, radiusMeters: 100 }
      ],
      officeWifi: { allowedIps: [], ddnsDomain: '' }
    };

    let localRules = null;
    try {
      const saved = localStorage.getItem(`omni_attendance_rules_${teamId}`);
      if (saved) localRules = JSON.parse(saved);
    } catch (e) {}

    // First attempt to subscribe to dedicated attendance_rules collection
    const docRef = doc(db, 'teams', teamId, 'attendance_rules', 'current');
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback(healRules({ ...defaultRules, ...snap.data() }));
      } else {
        callback(healRules(localRules || defaultRules));
      }
    }, (err) => {
      // If permission-denied (rules pending deployment), try reading team doc's attendanceRules
      console.warn("Notice: Subscribing to attendance_rules collection fallback to team document / local:", err?.message || err);
      getDoc(doc(db, 'teams', teamId)).then((teamSnap) => {
        if (teamSnap.exists() && teamSnap.data()?.attendanceRules) {
          callback(healRules({ ...defaultRules, ...teamSnap.data().attendanceRules }));
        } else {
        callback(healRules(localRules || defaultRules));
        }
      }).catch(() => {
        callback(healRules(localRules || defaultRules));
      });
    });

    return unsub;
  },

  async saveAttendanceRules(teamId, rulesData) {
    if (!teamId) return;
    const payload = sanitizeFirestoreData({
      ...rulesData,
      updatedAt: serverTimestamp()
    });

    // 1. Persist to localStorage for zero-latency local fallback
    try {
      localStorage.setItem(`omni_attendance_rules_${teamId}`, JSON.stringify(rulesData));
    } catch (e) {}

    // 2. Persist to team document (allowed by existing rules for owner/manager)
    try {
      await updateDoc(doc(db, 'teams', teamId), {
        attendanceRules: payload
      });
    } catch (teamDocErr) {
      console.warn("Could not write attendanceRules to team document:", teamDocErr?.message || teamDocErr);
    }

    // 3. Attempt to write to dedicated attendance_rules collection (if deployed)
    try {
      const docRef = doc(db, 'teams', teamId, 'attendance_rules', 'current');
      await setDoc(docRef, payload, { merge: true });
    } catch (rulesColErr) {
      console.warn("Could not write to attendance_rules subcollection (pending rule deployment):", rulesColErr?.message || rulesColErr);
    }

    return payload;
  },

  async saveShiftOverride(teamId, overrideKey, overrideData) {
    if (!teamId || !overrideKey) return;
    let currentRules = {};
    try {
      const saved = localStorage.getItem(`omni_attendance_rules_${teamId}`);
      if (saved) currentRules = JSON.parse(saved);
    } catch (e) {}

    const overrides = { ...(currentRules.shiftOverrides || {}) };
    if (overrideData === null) {
      delete overrides[overrideKey];
    } else {
      overrides[overrideKey] = {
        ...overrideData,
        updatedAt: new Date().toISOString()
      };
    }

    const updatedRules = {
      ...currentRules,
      shiftOverrides: overrides
    };

    return await this.saveAttendanceRules(teamId, updatedRules);
  },

  async addAttendanceRecord(teamId, recordData) {
    if (!teamId) return;
    const recordId = Utils.generateId();
    const payload = sanitizeFirestoreData({
      ...recordData,
      id: recordId,
      timestamp: serverTimestamp()
    });

    // 1. Primary write to `teams/{teamId}/logs`
    // (teams/{teamId}/logs is guaranteed permitted for all approved team members by existing Firestore rules)
    try {
      await addDoc(collection(db, 'teams', teamId, 'logs'), {
        level: 'audit',
        action: recordData.type || 'CLOCK_IN',
        targetType: 'ATTENDANCE',
        targetName: recordData.picName || recordData.userEmail || '员工打卡',
        user: {
          uid: recordData.userId || '',
          email: recordData.userEmail || '',
          displayName: recordData.picName || (recordData.userEmail ? recordData.userEmail.split('@')[0] : '团队成员')
        },
        userId: recordData.userId || '',
        userEmail: recordData.userEmail || '',
        type: recordData.type || 'CLOCK_IN',
        verifyMethod: recordData.verifyMethod || '',
        verifySnapshot: recordData.verifySnapshot || null,
        details: recordData.note || `${recordData.picName || '员工'} 完成${recordData.type === 'CLOCK_OUT' ? '下班签退' : '上班打卡'}`,
        timestamp: serverTimestamp(),
        isDeleted: false
      });
    } catch (logErr) {
      console.warn("Failed to write attendance punch to logs collection:", logErr?.message || logErr);
    }

    // 2. Dual-write to dedicated `teams/{teamId}/attendance` collection (if cloud rules deployed)
    try {
      const docRef = doc(db, 'teams', teamId, 'attendance', recordId);
      await setDoc(docRef, payload);
    } catch (attErr) {
      console.warn("Direct attendance collection write failed (pending cloud firestore rules deployment):", attErr?.message || attErr);
    }

    return payload;
  },

  /**
   * 管理员手动补录打卡时间 (明确留痕 ADMIN_MANUAL 凭证，记录操作人、服务器时间与原因)
   */
  async addManualAttendanceRecord(teamId, {
    userId,
    userEmail,
    picName,
    type = 'CLOCK_OUT',
    dateStr,
    timeStr,
    reason = '',
    appealId = null,
    adminUser = null
  }) {
    if (!teamId || !userId || !dateStr || !timeStr) {
      throw new Error('参数不完整：缺少 teamId, userId, dateStr 或 timeStr');
    }

    // 严谨换算本地时间戳 (针对 YYYY-MM-DD 与 HH:mm / HH:mm:ss)
    const dateParts = dateStr.split('-').map(Number);
    const timeParts = timeStr.split(':').map(Number);
    const year = dateParts[0];
    const month = dateParts[1] - 1;
    const day = dateParts[2];
    const hour = timeParts[0] || 0;
    const minute = timeParts[1] || 0;
    const second = timeParts[2] || 0;

    const targetDate = new Date(year, month, day, hour, minute, second);
    if (isNaN(targetDate.getTime())) {
      throw new Error(`无效的日期或时间格式: ${dateStr} ${timeStr}`);
    }

    const recordId = Utils.generateId();
    const adminName = adminUser?.displayName || adminUser?.name || adminUser?.email?.split('@')[0] || '管理员';
    const adminEmail = adminUser?.email || '';
    const adminUid = adminUser?.uid || '';

    const payload = sanitizeFirestoreData({
      id: recordId,
      teamId,
      userId,
      userEmail: userEmail || '',
      picName: picName || '',
      type: type || 'CLOCK_OUT',
      verifyMethod: 'ADMIN_MANUAL',
      isManualEntry: true,
      manualEntry: {
        addedByUid: adminUid,
        addedByName: adminName,
        addedByEmail: adminEmail,
        addedAt: new Date().toISOString(),
        appealId: appealId || null,
        reason: reason || '',
        targetDate: dateStr,
        targetTime: timeStr
      },
      verifySnapshot: {
        method: 'ADMIN_MANUAL',
        methodName: '管理员手动补录',
        adminName,
        adminEmail,
        adminUid,
        appealId: appealId || null,
        reason: reason || '',
        targetDate: dateStr,
        targetTime: timeStr,
        timestamp: new Date().toISOString()
      },
      note: `[管理员补录] ${type === 'CLOCK_OUT' ? '下班签退' : type === 'CLOCK_IN' ? '上班签到' : type} (${dateStr} ${timeStr}) - ${reason || '主管核准补录'}`,
      timestamp: Timestamp.fromDate(targetDate),
      createdAt: serverTimestamp(),
      isDeleted: false
    });

    // 1. 写入专属 attendance 集合
    const docRef = doc(db, 'teams', teamId, 'attendance', recordId);
    await setDoc(docRef, payload);

    // 2. 写入不可篡改审计日志 (targetType: ATTENDANCE_ADJUSTMENT，防止普通考勤监听器重复统计)
    try {
      await addDoc(collection(db, 'teams', teamId, 'logs'), {
        level: 'audit',
        action: 'MANUAL_PUNCH_RECORDED',
        targetType: 'ATTENDANCE_ADJUSTMENT',
        targetName: `${picName || userEmail} 考勤补录`,
        user: {
          uid: adminUid,
          email: adminEmail,
          displayName: adminName
        },
        targetUser: {
          uid: userId,
          email: userEmail,
          name: picName
        },
        details: `管理员 ${adminName} 为员工 ${picName} 补录 ${dateStr} ${timeStr} [${type === 'CLOCK_OUT' ? '下班签退' : '上班签到'}]，原因: ${reason || '无'}${appealId ? ` (申诉单 #${appealId})` : ''}`,
        appealId: appealId || null,
        recordId,
        timestamp: serverTimestamp(),
        isDeleted: false
      });
    } catch (logErr) {
      console.warn('Logging manual punch notice:', logErr?.message || logErr);
    }

    return payload;
  },

  /**
   * 员工提交考勤异常申诉
   */
  async submitAttendanceAppeal(teamId, appealData) {
    if (!teamId || !appealData?.userId || !appealData?.date) {
      throw new Error('参数不完整：缺少 teamId, userId 或 date');
    }

    // 格式防御校验
    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_REGEX.test(appealData.date)) {
      throw new Error('无效的考勤日期格式，必须为 YYYY-MM-DD');
    }

    const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
    const requestedTime = appealData.requestedTime || (appealData.requestedPunchType === 'CLOCK_IN' ? '09:00' : '18:00');
    if (!TIME_REGEX.test(requestedTime)) {
      throw new Error('无效的主张打卡时间，必须为 HH:mm 格式');
    }

    const targetPunchType = appealData.requestedPunchType || 'CLOCK_OUT';

    // 幂等性防抖与防重复提交：检查同用户在同一日期同一打卡类型是否已有 PENDING 申诉
    try {
      const q = query(
        collection(db, 'teams', teamId, 'attendance_appeals'),
        where('userId', '==', appealData.userId),
        where('date', '==', appealData.date),
        where('status', '==', 'PENDING')
      );
      const snap = await getDocs(q);
      const duplicate = snap.docs.find(d => {
        const item = d.data();
        return (item.requestedPunchType || item.punchType || 'CLOCK_OUT') === targetPunchType;
      });
      if (duplicate) {
        throw new Error('该打卡时段已存在正在审核中的申诉单，请勿重复提交');
      }
    } catch (checkErr) {
      if (checkErr.message?.includes('该打卡时段已存在')) {
        throw checkErr;
      }
      console.warn('Idempotency check query fallback notice:', checkErr?.message || checkErr);
    }

    const appealId = Utils.generateId();
    const payload = sanitizeFirestoreData({
      id: appealId,
      teamId,
      userId: appealData.userId,
      userEmail: appealData.userEmail || '',
      picName: appealData.picName || '',
      date: appealData.date, // 'YYYY-MM-DD'
      appealType: appealData.appealType || 'MISSING_CLOCK_OUT',
      requestedPunchType: appealData.requestedPunchType || 'CLOCK_OUT',
      requestedTime: appealData.requestedTime || '18:00',
      reason: appealData.reason || '',
      status: 'PENDING', // 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      reviewedBy: null,
      reviewedByUid: null,
      reviewedAt: null,
      reviewNote: null,
      resultRecordId: null
    });

    const docRef = doc(db, 'teams', teamId, 'attendance_appeals', appealId);
    await setDoc(docRef, payload);

    try {
      await addDoc(collection(db, 'teams', teamId, 'logs'), {
        level: 'info',
        action: 'APPEAL_SUBMITTED',
        targetType: 'ATTENDANCE_APPEAL',
        targetName: `考勤异常申诉 (${appealData.picName || appealData.userEmail})`,
        user: {
          uid: appealData.userId,
          email: appealData.userEmail,
          displayName: appealData.picName
        },
        details: `提交了 ${appealData.date} 的考勤申诉 [申请补录 ${appealData.requestedPunchType === 'CLOCK_OUT' ? '下班' : '上班'} ${appealData.requestedTime}]，原因: ${appealData.reason}`,
        timestamp: serverTimestamp(),
        isDeleted: false
      });
    } catch (e) {
      console.warn('Logging appeal submit notice:', e);
    }

    return { ...payload, id: appealId };
  },

  /**
   * 订阅团队考勤异常申诉列表 (支持普通员工按 filterUserId 进行本人数据隔离订阅)
   */
  subscribeToAttendanceAppeals(teamId, callback, filterUserId = null) {
    if (!teamId) return () => {};
    let unsub = () => {};
    try {
      const colRef = collection(db, 'teams', teamId, 'attendance_appeals');
      const q = filterUserId
        ? query(colRef, where('userId', '==', filterUserId), orderBy('createdAt', 'desc'))
        : query(colRef, orderBy('createdAt', 'desc'));

      unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        callback(list);
      }, (err) => {
        console.warn('Attendance appeals subscription fallback (without index):', err?.message || err);
        const fallbackQ = filterUserId
          ? query(colRef, where('userId', '==', filterUserId))
          : colRef;

        const fallbackUnsub = onSnapshot(fallbackQ, (snap) => {
          const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
          list.sort((a, b) => {
            const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
            const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
            return tB - tA;
          });
          callback(list);
        });
        unsub = fallbackUnsub;
      });
    } catch (e) {
      console.warn('Error in subscribeToAttendanceAppeals:', e);
    }
    return () => unsub();
  },

  /**
   * 管理员审批考勤申诉 (APPROVED / REJECTED)
   */
  async reviewAttendanceAppeal(teamId, appealId, {
    status,
    reviewNote = '',
    adminUser = null,
    approvedTimeStr = '',
    approvedPunchType = '',
    originalAppeal
  }) {
    if (!teamId || !appealId) throw new Error('Missing teamId or appealId');
    const adminName = adminUser?.displayName || adminUser?.name || adminUser?.email?.split('@')[0] || '管理员';
    const adminUid = adminUser?.uid || '';
    const docRef = doc(db, 'teams', teamId, 'attendance_appeals', appealId);

    let resultRecordId = null;

    if (status === 'APPROVED' && originalAppeal) {
      // 审批通过：自动生成具有 ADMIN_MANUAL 标记的正式补录卡
      const targetTime = approvedTimeStr || originalAppeal.requestedTime || '18:00';
      const punchType = approvedPunchType || originalAppeal.requestedPunchType || 'CLOCK_OUT';

      const punchRecord = await this.addManualAttendanceRecord(teamId, {
        userId: originalAppeal.userId,
        userEmail: originalAppeal.userEmail,
        picName: originalAppeal.picName,
        type: punchType,
        dateStr: originalAppeal.date,
        timeStr: targetTime,
        reason: `[申诉核准] ${reviewNote ? reviewNote + ' - ' : ''}员工申诉理由: ${originalAppeal.reason || '无'}`,
        appealId: appealId,
        adminUser
      });
      resultRecordId = punchRecord?.id || null;
    }

    const updatePayload = {
      status, // 'APPROVED' | 'REJECTED'
      reviewedBy: adminName,
      reviewedByUid: adminUid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      reviewNote: reviewNote || '',
      resultRecordId: resultRecordId || null
    };

    await updateDoc(docRef, updatePayload);

    try {
      await addDoc(collection(db, 'teams', teamId, 'logs'), {
        level: 'audit',
        action: status === 'APPROVED' ? 'APPEAL_APPROVED' : 'APPEAL_REJECTED',
        targetType: 'ATTENDANCE_APPEAL',
        targetName: `考勤申诉审批 (${originalAppeal?.picName || originalAppeal?.userEmail || appealId})`,
        user: {
          uid: adminUid,
          email: adminUser?.email || '',
          displayName: adminName
        },
        details: `管理员 ${adminName} ${status === 'APPROVED' ? '批准' : '驳回'} 了员工 ${originalAppeal?.picName || '员工'} ${originalAppeal?.date || ''} 的考勤申诉。批注: ${reviewNote || '无'}${resultRecordId ? ` (已生成补录卡 #${resultRecordId})` : ''}`,
        timestamp: serverTimestamp(),
        isDeleted: false
      });
    } catch (e) {
      console.warn('Logging appeal review notice:', e);
    }

    return { id: appealId, ...updatePayload };
  },

  /**
   * 员工在待审核状态下自行撤回申诉
   */
  async cancelAttendanceAppeal(teamId, appealId, userId) {
    if (!teamId || !appealId) throw new Error('Missing teamId or appealId');
    const docRef = doc(db, 'teams', teamId, 'attendance_appeals', appealId);
    await deleteDoc(docRef);
  },

  // --- Google Sheets Long-term Webhook Sync Config ---
  subscribeToSheetSyncConfig(teamId, callback) {
    if (!teamId) return () => {};
    const defaultLocal = () => {
      try {
        const saved = localStorage.getItem(`omni_sheet_sync_${teamId}`);
        return saved ? JSON.parse(saved) : null;
      } catch (_) {
        return null;
      }
    };

    const docRef = doc(db, 'teams', teamId, 'integrations', 'google_sheets');
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data());
      } else {
        callback(defaultLocal());
      }
    }, () => {
      callback(defaultLocal());
    });
    return unsub;
  },

  async saveSheetSyncConfig(teamId, config) {
    if (!teamId) return;
    const payload = sanitizeFirestoreData({
      ...config,
      updatedAt: serverTimestamp()
    });

    try {
      localStorage.setItem(`omni_sheet_sync_${teamId}`, JSON.stringify(config));
    } catch (_) {}

    try {
      const docRef = doc(db, 'teams', teamId, 'integrations', 'google_sheets');
      await setDoc(docRef, payload, { merge: true });
    } catch (err) {
      console.warn("Could not save sheet sync config to Firestore integrations subcollection:", err?.message || err);
    }

    try {
      await updateDoc(doc(db, 'teams', teamId), {
        googleSheetSync: payload
      });
    } catch (_) {}

    return payload;
  },

  // --- Announcements ---

  subscribeToAnnouncements(teamId, callback) {
    const announcementsRef = collection(db, 'announcements');
    const q = query(announcementsRef, orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const list = [];
      const now = new Date().toISOString();
      for (const d of snapshot.docs) {
        const item = { ...d.data(), id: d.id };
        if (item.isDeleted) continue;
        
        // 租户过滤：'ALL' 全局可见，或者与当前用户 teamId 相同
        if (item.teamId && item.teamId !== 'ALL' && teamId && item.teamId !== teamId) {
          continue;
        }

        // 检查是否过期，若过期则置顶失效
        if (item.expiresAt && item.expiresAt < now) {
          item.isPinned = false;
        }

        list.push(item);
      }
      callback(list);
    }, (err) => {
      console.warn("subscribeToAnnouncements error:", err);
      callback([]);
    });
  },

  subscribeToMyAnnouncementReads(userId, callback) {
    if (!userId) {
      callback({});
      return () => {};
    }
    const readsRef = collection(db, 'announcement_reads');
    const q = query(readsRef, where('userId', '==', userId));

    return onSnapshot(q, (snapshot) => {
      const readMap = {};
      for (const d of snapshot.docs) {
        const item = d.data();
        readMap[item.announcementId] = item;
      }
      callback(readMap);
    }, (err) => {
      console.warn("subscribeToMyAnnouncementReads error:", err);
      callback({});
    });
  },

  async createAnnouncement(data) {
    const id = data.id || `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload = sanitizeFirestoreData({
      id,
      title: data.title || '',
      content: data.content || '',
      titleEn: data.titleEn || null,
      contentEn: data.contentEn || null,
      titleZh: data.titleZh || null,
      contentZh: data.contentZh || null,
      category: data.category || 'SUPERVISOR',
      priority: data.priority || 'P2_NORMAL',
      author: {
        id: data.author?.id || '',
        name: data.author?.name || '管理员',
        avatarUrl: data.author?.avatarUrl || ''
      },
      versionTag: data.versionTag || null,
      changeTypes: data.changeTypes || [],
      targetScope: data.targetScope || 'ALL',
      teamId: data.teamId || 'ALL',
      requireAck: Boolean(data.requireAck),
      isPinned: Boolean(data.isPinned),
      readCount: 0,
      ackCount: 0,
      createdAt: data.createdAt || new Date().toISOString(),
      expiresAt: data.expiresAt || null,
      isDeleted: false
    });

    await setDoc(doc(db, 'announcements', id), payload);
    return payload;
  },

  async updateAnnouncement(id, updates) {
    if (!id) return;
    const payload = sanitizeFirestoreData({
      ...updates,
      updatedAt: new Date().toISOString()
    });
    await updateDoc(doc(db, 'announcements', id), payload);
    return payload;
  },

  async deleteAnnouncement(id, user) {
    if (!id) return;
    await updateDoc(doc(db, 'announcements', id), {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: user?.uid || '',
      deletedByName: user?.displayName || user?.email || ''
    });
  },

  async markAnnouncementRead(announcementId, user, autoAcknowledge = false) {
    if (!announcementId || !user?.uid) return;
    const readDocId = `${announcementId}_${user.uid}`;
    const docRef = doc(db, 'announcement_reads', readDocId);

    const snap = await getDoc(docRef);
    const now = new Date().toISOString();

    if (!snap.exists()) {
      await setDoc(docRef, sanitizeFirestoreData({
        id: readDocId,
        announcementId,
        userId: user.uid,
        userName: user.displayName || user.email || '团队成员',
        userAvatar: user.photoURL || '',
        teamId: user.teamId || '',
        readAt: now,
        ackAt: autoAcknowledge ? now : null
      }));

      try {
        const updateObj = { readCount: increment(1) };
        if (autoAcknowledge) updateObj.ackCount = increment(1);
        await updateDoc(doc(db, 'announcements', announcementId), updateObj);
      } catch (err) {
        console.warn("Could not increment readCount:", err);
      }
    } else if (autoAcknowledge && !snap.data().ackAt) {
      await updateDoc(docRef, { ackAt: now });
      try {
        await updateDoc(doc(db, 'announcements', announcementId), { ackCount: increment(1) });
      } catch (err) {
        console.warn("Could not increment ackCount:", err);
      }
    }
  },

  async acknowledgeAnnouncement(announcementId, user) {
    if (!announcementId || !user?.uid) return;
    const readDocId = `${announcementId}_${user.uid}`;
    const docRef = doc(db, 'announcement_reads', readDocId);
    const now = new Date().toISOString();

    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, sanitizeFirestoreData({
        id: readDocId,
        announcementId,
        userId: user.uid,
        userName: user.displayName || user.email || '团队成员',
        userAvatar: user.photoURL || '',
        teamId: user.teamId || '',
        readAt: now,
        ackAt: now
      }));
      try {
        await updateDoc(doc(db, 'announcements', announcementId), {
          readCount: increment(1),
          ackCount: increment(1)
        });
      } catch (err) {
        console.warn("Could not increment ack/read count:", err);
      }
    } else {
      if (!snap.data().ackAt) {
        await updateDoc(docRef, { ackAt: now });
        try {
          await updateDoc(doc(db, 'announcements', announcementId), {
            ackCount: increment(1)
          });
        } catch (err) {
          console.warn("Could not increment ackCount:", err);
        }
      }
    }
  },

  async getAnnouncementReaders(announcementId) {
    if (!announcementId) return [];
    const readsRef = collection(db, 'announcement_reads');
    const q = query(readsRef, where('announcementId', '==', announcementId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id }));
  },

  // --- Commission Engine & Deal Ledger (Phase 6) ---

  subscribeToCommissionConfig(teamId, callback) {
    if (!teamId) return () => {};
    let localConfig = null;
    try {
      const saved = localStorage.getItem(`talent_flow_commission_cfg_${teamId}`);
      if (saved) localConfig = JSON.parse(saved);
    } catch (e) {}

    // Primary: listen to tags/commission_config (guaranteed permitted in existing cloud rules)
    const configDocRef = doc(db, 'teams', teamId, 'tags', 'commission_config');
    const unsubTags = onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const cfg = snap.data();
        try {
          localStorage.setItem(`talent_flow_commission_cfg_${teamId}`, JSON.stringify(cfg));
        } catch (e) {}
        callback(cfg);
      } else {
        // Fallback: check root team document
        getDoc(doc(db, 'teams', teamId)).then(teamSnap => {
          if (teamSnap.exists() && teamSnap.data()?.commissionConfig) {
            callback(teamSnap.data().commissionConfig);
          } else {
            callback(localConfig || null);
          }
        }).catch(() => {
          callback(localConfig || null);
        });
      }
    }, (err) => {
      console.warn("Notice: Subscribing to tags/commission_config fallback to team doc / local:", err?.message || err);
      getDoc(doc(db, 'teams', teamId)).then(teamSnap => {
        if (teamSnap.exists() && teamSnap.data()?.commissionConfig) {
          callback(teamSnap.data().commissionConfig);
        } else {
          callback(localConfig || null);
        }
      }).catch(() => {
        callback(localConfig || null);
      });
    });

    return unsubTags;
  },

  async saveCommissionConfig(teamId, userId, configData) {
    if (!teamId) return;
    const nowIso = new Date().toISOString();
    const payload = sanitizeFirestoreData({
      ...configData,
      updatedAt: nowIso,
      updatedBy: userId || 'system'
    });

    // 1. Local storage zero-latency persistence
    try {
      localStorage.setItem(`talent_flow_commission_cfg_${teamId}`, JSON.stringify(payload));
    } catch (e) {}

    // 2. Primary cloud write: write to dedicated tags/commission_config document
    // (teams/{teamId}/tags/{tagDoc} is already 100% permitted in cloud firestore.rules since project inception)
    try {
      const configDocRef = doc(db, 'teams', teamId, 'tags', 'commission_config');
      await setDoc(configDocRef, payload, { merge: true });
    } catch (tagDocErr) {
      console.warn("Could not write commissionConfig to tags subcollection:", tagDocErr?.message || tagDocErr);
    }

    // 3. Fallback/Dual write: attempt to write to team root document if permitted
    try {
      const teamDocRef = doc(db, 'teams', teamId);
      await setDoc(teamDocRef, { commissionConfig: payload }, { merge: true });
    } catch (teamDocErr) {
      console.warn("Notice: Root team document update bypassed (phantom doc or rules restricted):", teamDocErr?.message || teamDocErr);
    }

    return payload;
  },

  subscribeToCommissionRecords(teamId, callback) {
    if (!teamId) return () => {};

    // Primary: listen to tags/commission_ledger (guaranteed permitted in existing cloud rules)
    const ledgerRef = doc(db, 'teams', teamId, 'tags', 'commission_ledger');
    const unsubLedger = onSnapshot(ledgerRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() || {};
        const records = Object.values(data).filter(r => r && typeof r === 'object' && r.id);
        records.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        callback(records);
      } else {
        // Fallback: try querying dedicated commission_records collection
        const commRef = collection(db, 'teams', teamId, 'commission_records');
        const q = query(commRef, orderBy('createdAt', 'desc'));
        getDocs(q).then(snapshot => {
          const records = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
          callback(records);
        }).catch(() => {
          callback([]);
        });
      }
    }, (error) => {
      console.warn("Notice: Subscribing to tags/commission_ledger fallback to commission_records collection:", error?.message || error);
      const commRef = collection(db, 'teams', teamId, 'commission_records');
      const q = query(commRef, orderBy('createdAt', 'desc'));
      getDocs(q).then(snapshot => {
        const records = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        callback(records);
      }).catch(() => {
        callback([]);
      });
    });

    return unsubLedger;
  },

  async upsertCommissionRecord(teamId, userId, recordData) {
    if (!teamId) throw new Error("Missing teamId");
    const recordId = recordData.id || `comm_${Date.now()}_${Utils.generateId().slice(0, 6)}`;
    const nowIso = new Date().toISOString();
    const isNew = !recordData.id;
    const payload = sanitizeFirestoreData({
      ...recordData,
      id: recordId,
      teamId,
      updatedAt: nowIso,
      ...(isNew ? { createdAt: nowIso, createdBy: userId || 'system' } : {})
    });

    // 1. Primary cloud write: write to tags/commission_ledger (guaranteed 100% permitted by existing cloud rules)
    try {
      const ledgerRef = doc(db, 'teams', teamId, 'tags', 'commission_ledger');
      await setDoc(ledgerRef, {
        [recordId]: payload
      }, { merge: true });
    } catch (ledgerErr) {
      console.warn("Could not write to tags/commission_ledger:", ledgerErr);
    }

    // 2. Dual write to dedicated collection (if rules deployed)
    try {
      const docRef = doc(db, 'teams', teamId, 'commission_records', recordId);
      await setDoc(docRef, payload, { merge: true });
    } catch (commColErr) {
      console.warn("Notice: commission_records subcollection write bypassed (pending cloud rule deployment):", commColErr?.message || commColErr);
    }

    // 3. Write immutable audit log
    try {
      await addDoc(collection(db, 'teams', teamId, 'logs'), {
        level: 'audit',
        action: recordData.isOverridden ? 'COMMISSION_OVERRIDE' : 'COMMISSION_DEAL_RECORDED',
        targetType: 'COMMISSION',
        targetName: recordData.candidateName || recordId,
        details: recordData.isOverridden
          ? `主管特批改派佣金: ${recordData.overrideReason || '未填原因'} (总佣金池: RM ${recordData.billingSnapshot?.totalCommissionPool || recordData.totalCommissionPool || 0})`
          : `成单登记: 候选人 ${recordData.candidateName || ''} 入职 ${recordData.companyName || ''} (总佣金池: RM ${recordData.billingSnapshot?.totalCommissionPool || recordData.totalCommissionPool || 0})`,
        user: {
          uid: userId || '',
          displayName: recordData.overrideBy || (userId ? `User ${userId.slice(0, 6)}` : '系统')
        },
        timestamp: serverTimestamp(),
        isDeleted: false
      });
    } catch (logErr) {
      console.warn("Audit log write failed for commission record:", logErr);
    }

    return { ...payload, id: recordId };
  },

  async updateCommissionStatus(teamId, userId, recordId, status, extraData = {}) {
    if (!teamId || !recordId) return;
    const nowIso = new Date().toISOString();
    const updatePayload = sanitizeFirestoreData({
      status,
      updatedAt: nowIso,
      ...extraData
    });

    // 1. Primary write to tags/commission_ledger
    try {
      const ledgerRef = doc(db, 'teams', teamId, 'tags', 'commission_ledger');
      await setDoc(ledgerRef, {
        [recordId]: updatePayload
      }, { merge: true });
    } catch (err) {
      console.warn("Could not update tags/commission_ledger:", err);
    }

    // 2. Dual write to commission_records
    try {
      const docRef = doc(db, 'teams', teamId, 'commission_records', recordId);
      await updateDoc(docRef, updatePayload);
    } catch (_) {}

    // 3. Audit log
    try {
      await addDoc(collection(db, 'teams', teamId, 'logs'), {
        level: 'audit',
        action: `COMMISSION_${status}`,
        targetType: 'COMMISSION',
        targetName: extraData.candidateName || recordId,
        details: `佣金状态变更为 ${status}。说明: ${extraData.cancellation?.reason || extraData.note || '状态流转更新'}`,
        user: {
          uid: userId || '',
          displayName: userId || '主管'
        },
        timestamp: serverTimestamp(),
        isDeleted: false
      });
    } catch (logErr) {
      console.warn("Audit log write failed:", logErr);
    }
  },

  async cancelPendingCommissionForCandidate(teamId, userId, candidateId, reason) {
    if (!teamId || !candidateId) return 0;
    let count = 0;
    try {
      // 1. Check tags/commission_ledger first
      const ledgerRef = doc(db, 'teams', teamId, 'tags', 'commission_ledger');
      const snap = await getDoc(ledgerRef);
      if (snap.exists()) {
        const data = snap.data() || {};
        for (const [recId, rec] of Object.entries(data)) {
          if (rec?.candidateId === candidateId && rec?.status === 'PENDING') {
            await this.updateCommissionStatus(teamId, userId, recId, 'CANCELLED', {
              candidateName: rec.candidateName || '',
              cancellation: {
                cancelledAt: new Date().toISOString(),
                cancelledBy: userId || 'supervisor',
                reason: reason || '候选人离职/退工冲销'
              }
            });
            count++;
          }
        }
      }
    } catch (e) {
      console.warn("Could not check tags/commission_ledger for cancellation:", e);
    }

    // 2. Also check commission_records collection if deployed
    try {
      const commRef = collection(db, 'teams', teamId, 'commission_records');
      const q = query(commRef, where('candidateId', '==', candidateId), where('status', '==', 'PENDING'));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await this.updateCommissionStatus(teamId, userId, d.id, 'CANCELLED', {
          candidateName: d.data()?.candidateName || '',
          cancellation: {
            cancelledAt: new Date().toISOString(),
            cancelledBy: userId || 'supervisor',
            reason: reason || '候选人离职/退工冲销'
          }
        });
        count++;
      }
    } catch (_) {}

    return count;
  }

};
