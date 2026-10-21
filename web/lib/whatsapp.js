/**
 * 将手机号标准化为 WhatsApp E.164 格式（无+号）
 * 支持马来西亚 (60) 和新加坡 (65) 双国码智能识别
 */
export function normalizeToWhatsApp(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 8) return null;
  
  // ── 已带国码的情况 ──
  // 马来西亚 60 + 9~10位本地号 = 11~12位总长
  if (digits.startsWith('60') && digits.length >= 11 && digits.length <= 12) return digits;
  // 新加坡 65 + 8位本地号 = 10位总长
  if (digits.startsWith('65') && digits.length === 10) return digits;
  
  // ── 本地格式（无国码）──
  // 马来西亚：以 0 开头 (如 019xxxxxxx)，去 0 补 60
  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) {
    return '60' + digits.slice(1);
  }
  // 新加坡：恰好 8 位，且以 8 或 9 开头（SG 手机号特征）
  if (digits.length === 8 && (digits.startsWith('8') || digits.startsWith('9'))) {
    return '65' + digits;
  }
  // 马来西亚裸号：9-10 位，不以 8/9 开头（排除掉 SG 误判）
  if (digits.length >= 9 && digits.length <= 10) {
    return '60' + digits;
  }
  
  return digits;
}

/**
 * 生成 WhatsApp 深链接 URL
 */
export function getWhatsAppUrl(phone, context = {}) {
  const normalized = normalizeToWhatsApp(phone);
  if (!normalized) return null;
  
  let url = `https://wa.me/${normalized}`;
  
  if (context.name && context.company) {
    const greeting = `Hi ${context.name}, this is from ${context.company}. `;
    url += `?text=${encodeURIComponent(greeting)}`;
  } else if (context.name) {
    const greeting = `Hi ${context.name}, `;
    url += `?text=${encodeURIComponent(greeting)}`;
  }
  
  return url;
}
