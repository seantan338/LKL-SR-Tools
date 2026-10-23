import { db } from './firebase';
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch 
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
      if (!r || !r.officeLocations) return r;
      const healed = r.officeLocations.map(loc => {
        if (Math.abs((parseFloat(loc.latitude) || 0) - 3.139) < 0.001 && Math.abs((parseFloat(loc.longitude) || 0) - 101.6869) < 0.001) {
          return { ...loc, name: loc.name || '公司总部', latitude: 1.440472, longitude: 103.617917 };
        }
        return loc;
      });
      return { ...r, officeLocations: healed };
    };
    const defaultRules = {
      enabled: true,
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
  }
};


