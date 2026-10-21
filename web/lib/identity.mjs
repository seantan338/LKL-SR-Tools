export function normalizeIcNo(ic) {
  return String(ic || '').replace(/\D/g, '');
}

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function picsEqual(a, b) {
  return String(a || '').toLowerCase().trim() === String(b || '').toLowerCase().trim();
}

export function identityKey(item) {
  const ic = normalizeIcNo(item?.icNo);
  if (ic.length >= 12) return `ic:${ic}`;
  const name = String(item?.name || item?.candidateName || '').trim().toLowerCase();
  const phone = normalizePhone(item?.phone);
  if (name && phone) return `np:${name}::${phone}`;
  if (name) {
    return `n:${name}::${String(item?.position || item?.currentPosition || '').trim().toLowerCase()}`;
  }
  return null;
}

export function findMatchingCandidate(existingList, item) {
  const list = Array.isArray(existingList) ? existingList : [];
  const ic = normalizeIcNo(item?.icNo);
  if (ic.length >= 12) {
    const byIc = list.find((c) => normalizeIcNo(c.icNo) === ic);
    if (byIc) return byIc;
  }
  const name = String(item?.name || item?.candidateName || '').trim().toLowerCase();
  const phone = normalizePhone(item?.phone);
  if (name && phone) {
    return list.find((c) =>
      String(c.name || '').trim().toLowerCase() === name &&
      normalizePhone(c.phone) === phone
    ) || null;
  }
  return null;
}

export function matchPicToMemberUid(picName, teamMembers, fallbackUid) {
  const picStr = String(picName || '').toLowerCase().trim();
  if (!picStr || !Array.isArray(teamMembers)) return fallbackUid;
  const member = teamMembers.find((m) => {
    const names = [m.name, m.displayName, (m.email || '').split('@')[0]].filter(Boolean);
    return names.some((n) => n.toLowerCase().trim() === picStr);
  });
  return member?.id || fallbackUid;
}

/**
 * 智能解析并归一化经办顾问 (PIC) 主数据
 * 解决 "YeeYuan", "yeeyuan", "Yee Yuan", "hok yeeyuan" 分散拆行的问题
 * 1. 显式 PIC 姓名优先原则：如果填写了 PIC 姓名（如 "MR KEE" 或 "YeeYuan"），以此为准
 *    - 若匹配在册团队成员（别名/拼音/姓氏），绑定官方姓名与成员 UID
 *    - 若不匹配在册团队成员，视为外部/Freelance 顾问，严禁被操作员/导入者的 assignedTo UID 劫持
 * 2. 仅当显式 PIC 为空/未分配时，才回退使用 assignedTo 成员档案
 * 3. 兜底字符级紧凑键 (norm:mrkee)，确保同名不同大小写/空格合并为同一人
 */
export function resolveCanonicalPic(rawName, assignedTo, teamMembers = []) {
  const members = Array.isArray(teamMembers) ? teamMembers : [];
  const raw = String(rawName || '').trim();
  const isRawEmptyOrUnassigned =
    !raw ||
    raw === '未分配' ||
    raw === '未分配顾问' ||
    ['unassigned', 'none', 'null', 'n/a', 'undefined'].includes(raw.toLowerCase());

  // 1. 如果没有填写显式 PIC 姓名，才使用 assignedTo 成员 UID 作为备选归属
  if (isRawEmptyOrUnassigned) {
    if (assignedTo) {
      const member = members.find((m) => m.id === assignedTo || m.uid === assignedTo);
      if (member) {
        const officialName = member.displayName || member.name || (member.email ? member.email.split('@')[0] : '顾问');
        return {
          key: `uid:${member.id || member.uid}`,
          displayName: officialName,
          uid: member.id || member.uid,
          photoURL: member.photoURL || null,
          isExternal: false
        };
      }
    }
    return {
      key: 'unassigned',
      displayName: '未分配顾问',
      uid: '',
      photoURL: null,
      isExternal: false
    };
  }

  const normPic = raw.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  if (!normPic) {
    return {
      key: 'unassigned',
      displayName: '未分配顾问',
      uid: '',
      photoURL: null,
      isExternal: false
    };
  }

  // 2. 优先匹配在册团队成员（支持 UID、别名、去空格全拼、名与姓切分）
  for (const m of members) {
    const memberId = m.id || m.uid;
    const dispName = String(m.displayName || m.name || '').trim();
    const emailPrefix = String(m.email || '').split('@')[0].trim();
    const aliases = Array.isArray(m.aliases) ? m.aliases : [];
    const candidatesToMatch = [dispName, emailPrefix, ...aliases].filter(Boolean);

    // 直接 UID 匹配
    if (memberId && (raw === memberId || normPic === memberId.toLowerCase())) {
      return {
        key: `uid:${memberId}`,
        displayName: dispName || emailPrefix || '顾问',
        uid: memberId,
        photoURL: m.photoURL || null,
        isExternal: false
      };
    }

    // 完全归一化匹配 (例如 "yeeyuan" === "yeeyuan")
    const hasExactMatch = candidatesToMatch.some((cand) => {
      const normCand = cand.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
      return normCand && normCand === normPic;
    });

    if (hasExactMatch) {
      return {
        key: `uid:${memberId}`,
        displayName: dispName || emailPrefix,
        uid: memberId,
        photoURL: m.photoURL || null,
        isExternal: false
      };
    }

    // 名字成分匹配：例如成员名为 "Hok Yee Yuan"
    const dispTokens = dispName.toLowerCase().split(/\s+/).filter(Boolean);
    if (dispTokens.length >= 2) {
      const givenNameNorm = dispTokens.slice(1).join(''); // "yeeyuan"
      const fullNameNorm = dispTokens.join('');          // "hokyeeyuan"
      const firstNameNorm = dispTokens[0];               // "hok" 或 "kalap"
      const lastNameNorm = dispTokens[dispTokens.length - 1]; // "lok"

      if (normPic === givenNameNorm || normPic === fullNameNorm) {
        return {
          key: `uid:${memberId}`,
          displayName: dispName || emailPrefix,
          uid: memberId,
          photoURL: m.photoURL || null,
          isExternal: false
        };
      }

      // 如果 rawPic 长度 >= 4 且直接命中名或姓 (如 "kalap" 命中 "Kalap Lok")
      if (normPic.length >= 4 && (normPic === firstNameNorm || normPic === lastNameNorm)) {
        return {
          key: `uid:${memberId}`,
          displayName: dispName || emailPrefix,
          uid: memberId,
          photoURL: m.photoURL || null,
          isExternal: false
        };
      }
    }
  }

  // 3. 兜底无在册成员命中：明确判定为【外部/Freelance顾问】（例如 "MR KEE"）
  // 严禁被操作员/导入者的 assignedTo UID 劫持！生成规范展示名与唯一 norm 键
  const formattedWords = raw
    .split(/\s+/)
    .map((w) => {
      const clean = w.replace(/[^a-zA-Z0-9\u4e00-\u9fa5.]/g, '');
      if (!clean) return '';
      const upper = clean.toUpperCase();
      if (['MR', 'MS', 'MRS', 'DR', 'MDM'].includes(upper.replace('.', ''))) {
        return upper.charAt(0) + upper.slice(1).toLowerCase().replace('.', '') + (upper.includes('.') ? '.' : '');
      }
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    })
    .filter(Boolean);
  const formattedName = formattedWords.length > 0 ? formattedWords.join(' ') : raw;

  return {
    key: `norm:${normPic}`,
    displayName: formattedName,
    uid: '',
    photoURL: null,
    isExternal: true
  };
}
