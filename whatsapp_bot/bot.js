const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

// --- Load Environment Variables ---
try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
    require('dotenv').config({ path: path.join(__dirname, '..', 'ai_backend', '.env') });
} catch (_) {}

// --- Firebase Scheduler & Admin SDK ---
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db = null;
try {
    let cred = null;
    let sourceDesc = null;

    // 1. Check raw JSON from env
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (rawJson && rawJson.trim()) {
        try {
            cred = cert(JSON.parse(rawJson.trim()));
            sourceDesc = 'FIREBASE_SERVICE_ACCOUNT_JSON 环境变量';
        } catch (je) {
            console.error('❌ [Firebase Admin] 解析 FIREBASE_SERVICE_ACCOUNT_JSON 失败:', je);
        }
    }

    // 2. Check candidate file paths
    if (!cred) {
        const candidatePaths = [
            process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
            '/etc/secrets/firebase-service-account.json',
            path.join(__dirname, 'firebase-service-account.json'),
            path.join(__dirname, '..', 'ai_backend', 'firebase-service-account.json'),
            path.join(process.cwd(), 'firebase-service-account.json'),
            path.join(process.cwd(), 'ai_backend', 'firebase-service-account.json')
        ].filter(Boolean);

        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                try {
                    cred = cert(require(path.resolve(p)));
                    sourceDesc = `凭据文件 '${p}'`;
                    break;
                } catch (pe) {
                    console.error(`❌ [Firebase Admin] 读取凭据文件 ${p} 失败:`, pe);
                }
            }
        }
    }

    if (cred) {
        if (!getApps().length) {
            initializeApp({ credential: cred });
        }
        db = getFirestore("default");
        console.log(`✅ [Firebase Admin] Firestore 初始化成功 (来源: ${sourceDesc})`);
    } else {
        console.warn('⚠️ [Firebase Admin] 未找到服务账号凭据 (已检查环境变量与本地文件路径)，白名单同步与到期自动提醒将受限。');
    }
} catch (e) {
    console.error('❌ [Firebase Admin] 初始化异常:', e);
}

// --- Whitelist & User Mapping Cache (Zero-Cost Verification) ---
const allowedUsersCache = new Map(); // phone -> { uid, name, email, teamId }

function normalizePhone(rawPhone) {
    if (!rawPhone) return [];
    const clean = String(rawPhone).replace(/\D/g, '');
    if (!clean) return [];
    
    const variants = new Set([clean]);
    // 马来西亚号码归一化兼容:
    // 01 开头 (如 01111223651) 补齐国际区号 601111223651
    if (clean.startsWith('01') && clean.length >= 10 && clean.length <= 11) {
        variants.add('60' + clean.slice(1));
    }
    // 601 开头 (如 601111223651) 兼容本地格式 01111223651
    if (clean.startsWith('601') && clean.length >= 11 && clean.length <= 12) {
        variants.add('0' + clean.slice(2));
    }
    return Array.from(variants);
}

if (db) {
    db.collection('users').onSnapshot(snapshot => {
        allowedUsersCache.clear();
        snapshot.docs.forEach(doc => {
            const d = doc.data();
            const userInfo = {
                uid: doc.id,
                name: d.displayName || d.name || '内部员工',
                email: d.email || '',
                teamId: d.teamId || 'default_team'
            };
            const phones = [d.whatsappNumber, d.whatsappPhone, d.phone];
            phones.forEach(p => {
                normalizePhone(p).forEach(num => {
                    allowedUsersCache.set(num, userInfo);
                });
            });
        });
        console.log(`🔒 [AI Agent] 白名单已同步，当前共授权 ${allowedUsersCache.size} 个有效号码映射`);
    });
}

// 防死循环与单用户频率防抖 (Anti-Loop & Rate Limit)
const userMessageTracker = new Map(); // phone -> { lastText, sameCount, lastTime }

// --- Multi-Session Manager ---
const PORT = parseInt(process.env.PORT || '8002', 10);
const HOST = process.env.HOST || '0.0.0.0';
const AI_BACKEND_URL = (process.env.AI_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const app = express();
app.use(cors());
app.use(express.json());

const sessions = new Map(); // botId -> { sock, status: 'connecting'|'qr'|'connected'|'disconnected', qr: string }
const AUTH_DIR = path.join(__dirname, '.wwebjs_auth');

if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR);
}

// Helper to remove directory recursively
function deleteFolderRecursive(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file, index) => {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}

async function initializeSession(botId) {
    console.log(`\n⏳ [${botId}] 正在启动无头轻量级 WhatsApp 连接...`);
    const sessionDir = path.join(AUTH_DIR, `session-${botId}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    // Default session state
    const sessionState = sessions.get(botId) || { status: 'connecting', qr: null, sock: null };
    sessions.set(botId, sessionState);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false, // 禁止拉取全量历史消息
        markOnlineOnConnect: false, // 禁止频繁自动标记上线
        generateHighQualityLinkPreview: false, // 节省内存
        logger: pino({ level: 'silent' }), // 彻底关闭底层狂暴日志，防止内存泄漏
        getMessage: async () => undefined // 不缓存接收到的消息上下文，纯发信模式
    });

    sessionState.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            sessionState.status = 'qr';
            sessionState.qr = qr;
            console.log(`📱 [${botId}] 请前往前端扫码，或扫描以下二维码:`);
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            sessionState.status = 'disconnected';
            sessionState.sock = null;
            
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || 500;
            const errorMsg = lastDisconnect?.error?.message || 'Unknown Error';
            
            let deepReason = '未知原因';
            let isFatalAuthError = false; // 决定是否要彻底清理凭证
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                deepReason = '凭证已过期或在手机端主动登出 (401)';
                isFatalAuthError = true;
            } else if (statusCode === 403) {
                deepReason = '账号可能被封禁或遭到限制 (403)';
                isFatalAuthError = true;
            } else if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
                deepReason = '连接被替换 (440)';
                isFatalAuthError = false;
            } else if (statusCode === DisconnectReason.connectionClosed || statusCode === 428) {
                deepReason = '网络连接被关闭/电脑休眠 (428)';
                isFatalAuthError = false;
            } else if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
                deepReason = '网络连接超时 (408)';
                isFatalAuthError = false;
            } else {
                deepReason = `其他连接异常 (状态码: ${statusCode}, ${errorMsg})`;
                isFatalAuthError = false;
            }

            console.log(`\n❌ [${botId}] 已断开连接.`);
            console.log(`🔍 [系统诊断] 深度原因: ${deepReason}`);
            
            if (isFatalAuthError) {
                console.log(`🚨 [${botId}] 凭证已明确失效，触发清理机制！`);
                console.log(`🗑️ [${botId}] 正在清理无效缓存文件夹...`);
                deleteFolderRecursive(sessionDir);
                sessions.delete(botId);
                
                console.log(`✨ [${botId}] 清理完成，系统将在 3 秒后生成全新的登录二维码...\n`);
                setTimeout(() => initializeSession(botId), 3000);
            } else {
                // 对于非致命错误（如网络波动、电脑休眠、500断流等），无限期耐心重试
                sessionState.retryCount = (sessionState.retryCount || 0) + 1;
                // 使用指数退避(Exponential Backoff)，最多等待 30 秒，防止频繁发送无用请求
                const waitTime = Math.min(5000 * sessionState.retryCount, 30000); 
                
                console.log(`🔄 [${botId}] 判定为网络或休眠波动，绝不删除凭证。`);
                console.log(`⏳ [${botId}] 准备在 ${waitTime/1000} 秒后尝试第 ${sessionState.retryCount} 次重连...\n`);
                setTimeout(() => initializeSession(botId), waitTime);
            }
        } else if (connection === 'open') {
            sessionState.status = 'connected';
            sessionState.qr = null;
            sessionState.retryCount = 0; // 成功连上，清空失败计数
            console.log(`✅ [${botId}] 已成功启动并连接！`);
        }
    });

    // 监听收到的新消息
    sock.ev.on('messages.upsert', async (m) => {
        try {
            // 只拦截精确命名为 company 的账号，防止私人号和公司号互相 AI 对话产生死循环！
            if (botId !== 'company') return;

            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            // 仅处理个人 1对1 消息，物理拒绝群聊 (@g.us) 和状态广播 (@broadcast)
            if (!msg.key.remoteJid || !msg.key.remoteJid.endsWith('@s.whatsapp.net')) return;

            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            if (!text) return;

            // 🔐 白名单校验：仅允许团队内部人员 (系统录入的手机号) 触发 AI
            const senderPhone = msg.key.remoteJid.split('@')[0];
            const senderInfo = allowedUsersCache.get(senderPhone);
            if (!senderInfo) {
                // 拦截非内部人员，保持彻底静默，仅在后端打印日志方便排查
                console.log(`🔒 [AI Agent] 拦截未授权访客: ${senderPhone}`);
                return;
            }

            // 🛑 防死循环与自动回复屏蔽 (收到相同消息达到 6 次自动静默丢弃)
            const now = Date.now();
            const tracker = userMessageTracker.get(senderPhone) || { lastText: '', sameCount: 0, lastTime: 0 };
            
            // 冷却检查：同一号码 1.5 秒内极速重发直接忽略防抖
            if (now - tracker.lastTime < 1500) {
                console.warn(`⏳ [AI Agent] 号码 ${senderPhone} 发信过频 (<1.5s)，防抖拦截`);
                return;
            }

            if (tracker.lastText === text) {
                tracker.sameCount += 1;
                if (tracker.sameCount >= 6) {
                    console.warn(`🛑 [AI Agent] 号码 ${senderPhone} 连续发送相同内容已达 ${tracker.sameCount} 次，自动静默屏蔽，防止死循环`);
                    userMessageTracker.set(senderPhone, { ...tracker, lastTime: now });
                    return;
                }
            } else {
                tracker.lastText = text;
                tracker.sameCount = 1;
            }
            tracker.lastTime = now;
            userMessageTracker.set(senderPhone, tracker);

            console.log(`🤖 [AI Agent] 收到来自 ${senderInfo.name} (${senderPhone}) 的消息: ${text}`);

            // 模拟人类输入中 (Composing) - 防风控
            try {
                await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
            } catch (_) {}

            // 转发给 AI 后端，传递真实用户身份
            const response = await fetch(`${AI_BACKEND_URL}/api/agent/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer talent-flow-internal-ai-agent-secret-2026'
                },
                body: JSON.stringify({
                    text: text,
                    teamId: senderInfo.teamId || 'default_team',
                    senderUid: senderInfo.uid,
                    senderName: senderInfo.name,
                    senderEmail: senderInfo.email
                })
            });

            if (response.ok) {
                const data = await response.json();
                const aiReply = data.message;
                
                // 将 AI 回复发回给 WhatsApp 用户
                if (aiReply) {
                    // 拟人化间隔 1.2 秒
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    await sock.sendMessage(msg.key.remoteJid, { text: aiReply });
                    console.log(`🤖 [AI Agent] 已回复 ${senderInfo.name}: ${aiReply}`);
                }
            } else {
                console.error(`🤖 [AI Agent] 后端请求失败: ${response.status}`);
            }
        } catch (error) {
            console.error('🤖 [AI Agent] 转发消息失败:', error);
        }
    });
}

// 自动加载曾经连接过的所有 Session
function autoLoadSessions() {
    console.log("🔍 正在扫描历史 WhatsApp 账号...");
    const folders = fs.readdirSync(AUTH_DIR);
    folders.forEach(folder => {
        if (folder.startsWith('session-')) {
            const botId = folder.replace('session-', '');
            initializeSession(botId);
        }
    });
}
autoLoadSessions();

// --- HTTP API ---

app.post('/api/bot/create', (req, res) => {
    const { botId } = req.body;
    if (!botId) return res.status(400).json({ error: "Missing botId" });
    
    if (!sessions.has(botId)) {
        initializeSession(botId);
    }
    res.json({ success: true, message: "Bot session initialized" });
});

app.get('/api/bot/status/:botId', (req, res) => {
    const botId = req.params.botId;
    const session = sessions.get(botId);
    if (!session) return res.json({ status: 'not_found' });
    res.json({ status: session.status, qr: session.qr });
});

app.get('/api/bot/list', (req, res) => {
    const list = Array.from(sessions.keys()).map(botId => ({
        botId,
        status: sessions.get(botId).status
    }));
    res.json({ success: true, bots: list });
});

app.post('/api/bot/logout', (req, res) => {
    const { botId } = req.body;
    if (!botId) return res.status(400).json({ error: "Missing botId" });
    const sessionDir = path.join(AUTH_DIR, `session-${botId}`);
    
    const session = sessions.get(botId);
    if (session && session.sock) {
        session.sock.logout();
    } else {
        deleteFolderRecursive(sessionDir);
        sessions.delete(botId);
    }
    res.json({ success: true });
});

// Immediate Send API (used by frontend "Send Now")
app.post('/api/send-whatsapp', async (req, res) => {
    try {
        const { botId, phone, message } = req.body;
        if (!phone || !message) return res.status(400).json({ error: '缺少手机号或消息内容' });
        
        const targetBotId = botId || 'personal'; // default for backward compat
        const session = sessions.get(targetBotId);
        
        if (!session || session.status !== 'connected' || !session.sock) {
            return res.status(503).json({ error: `指定机器人 ${targetBotId} 未连接或不存在` });
        }
        
        const cleanPhone = phone.replace(/\D/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;

        const [result] = await session.sock.onWhatsApp(jid);
        if (result && result.exists) {
            await session.sock.sendMessage(result.jid, { text: message });
            console.log(`📩 [API发送] 成功发送给: ${phone} (Via: ${targetBotId})`);
            res.json({ success: true, message: 'Message sent' });
        } else {
            console.error(`❌ [API发送] 号码未注册WhatsApp: ${phone}`);
            res.status(404).json({ error: '号码未注册WhatsApp' });
        }
    } catch (err) {
        console.error('发送失败:', err);
        res.status(500).json({ error: err.toString() });
    }
});

// --- Scheduled Tasks (Zero-Read Cost Architecture) ---
const scheduledMessages = new Map(); // docId -> { ref, data }

// 实时监听新增或修改的定时任务，只消耗推送时的读取额度
db.collectionGroup('candidates').where('whatsappStatus', '==', 'scheduled').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
            scheduledMessages.set(change.doc.id, {
                ref: change.doc.ref,
                data: change.doc.data()
            });
        }
        if (change.type === 'removed') {
            scheduledMessages.delete(change.doc.id);
        }
    });
});

// 每秒扫描一次内存中的任务池 (零成本)
setInterval(async () => {
    try {
        const now = Date.now();
        for (const [docId, task] of scheduledMessages.entries()) {
            const data = task.data;
            if (data.whatsappSendAt && data.whatsappSendAt <= now) {
                // 立即从内存池移除，防止重复发送
                scheduledMessages.delete(docId);
                
                const phone = data.phone;
                const message = data.whatsappMessage;
                const botRole = data.whatsappBotRole || 'personal';
                
                const session = sessions.get(botRole);

                if (!session || session.status !== 'connected' || !session.sock) {
                    // 如果机器人没连上，放回内存池等待下次扫描
                    scheduledMessages.set(docId, task);
                    continue;
                }

                if (!phone || !message) {
                    await task.ref.update({ whatsappStatus: 'failed', whatsappError: '缺失手机号或消息内容' });
                    continue;
                }

                const cleanPhone = phone.replace(/\D/g, '');
                const jid = `${cleanPhone}@s.whatsapp.net`;
                
                try {
                    const [result] = await session.sock.onWhatsApp(jid);
                    if (result && result.exists) {
                        await session.sock.sendMessage(result.jid, { text: message });
                        console.log(`📩 [定时调度] 成功发送至: ${phone} (Via: ${botRole})`);
                        await task.ref.update({ whatsappStatus: 'sent', whatsappSentAt: now });
                    } else {
                        console.error(`❌ [定时调度] 号码未注册: ${phone}`);
                        await task.ref.update({ whatsappStatus: 'failed', whatsappError: '未注册WhatsApp' });
                    }
                } catch (err) {
                    console.error(`❌ [定时调度] 异常 (${phone}):`, err);
                    await task.ref.update({ whatsappStatus: 'failed', whatsappError: err.toString() });
                }
            }
        }
    } catch (err) {
        console.error('调度引擎内存扫描错误:', err);
    }
}, 1000); // 1秒一次，极其精准，且不消耗任何 Firestore 读取

// ═══════════════════════════════════════════════════════════════════
// 🔔 提醒 → WhatsApp 通知桥 (Reminder-to-WhatsApp Bridge)
// ═══════════════════════════════════════════════════════════════════
// 当候选人的「跟进提醒」到期触发时，自动通过 company 机器人
// 向提醒创建者的私人 WhatsApp 号码发送通知消息。
// ═══════════════════════════════════════════════════════════════════

const pendingReminders = new Map(); // docId -> { ref, data }
const firedReminderIds = new Set(); // 防止同一条提醒重复发送
const userPhoneCache = new Map();   // uid -> phone (内存缓存，减少 Firestore 读取)

// 1. 实时监听所有候选人文档，将含有提醒的文档加载到内存
if (db) {
    db.collectionGroup('candidates').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            const reminders = data.reminders || [];
            // 只缓存含有未触发提醒的候选人
            const hasUnfired = reminders.some(r => !r.fired);
            if ((change.type === 'added' || change.type === 'modified') && hasUnfired) {
                pendingReminders.set(change.doc.id, {
                    ref: change.doc.ref,
                    data: data
                });
            }
            if (change.type === 'removed' || !hasUnfired) {
                pendingReminders.delete(change.doc.id);
            }
        });
    }, err => {
        console.error('🔔 [提醒桥] Firestore 监听出错:', err);
    });
}

// 2. 辅助：查找用户的 WhatsApp 号码 (带缓存)
async function getUserWhatsAppPhone(uid) {
    if (!uid || uid === 'system_bot' || !db) return null;
    if (userPhoneCache.has(uid)) return userPhoneCache.get(uid);
    
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) return null;
        const userData = userDoc.data();
        // 支持多种字段名
        const phone = userData.whatsappNumber || userData.whatsappPhone || userData.phone || null;
        if (phone) userPhoneCache.set(uid, phone);
        return phone;
    } catch (err) {
        console.error(`🔔 [提醒桥] 查找用户 ${uid} 手机号失败:`, err);
        return null;
    }
}

// 3. 每 15 秒扫描一次内存中的提醒，检测到期则发送 WhatsApp
setInterval(async () => {
    try {
        const now = Date.now();
        const companySession = sessions.get('company');
        
        // 如果 company 机器人没连上，直接跳过
        if (!companySession || companySession.status !== 'connected' || !companySession.sock) return;
        
        for (const [docId, entry] of pendingReminders.entries()) {
            const candidateData = entry.data;
            const reminders = candidateData.reminders || [];
            let hasChanges = false;

            for (const r of reminders) {
                if (r.fired) continue;
                // 防重：如果这条提醒已经被我们处理过了
                const remKey = `${docId}_${r.id}`;
                if (firedReminderIds.has(remKey)) continue;

                // 判断是否到期
                let isDue = false;
                if (r.dateTime) {
                    const remTime = new Date(String(r.dateTime).trim().replace(' ', 'T'));
                    isDue = !isNaN(remTime.getTime()) && remTime.getTime() <= now;
                } else if (r.date) {
                    const remTime = new Date(`${String(r.date).trim()}T${r.time ? String(r.time).trim() : '09:00'}`);
                    isDue = !isNaN(remTime.getTime()) && remTime.getTime() <= now;
                }

                if (!isDue) continue;

                // 到期了！发送 WhatsApp 通知
                firedReminderIds.add(remKey);

                const creatorId = r.creatorId;
                const phone = await getUserWhatsAppPhone(creatorId);

                if (phone) {
                    const cleanPhone = phone.replace(/\D/g, '');
                    const jid = `${cleanPhone}@s.whatsapp.net`;
                    const message = [
                        `🔔 *跟进提醒*`,
                        ``,
                        `📋 候选人: *${candidateData.name || '未知'}*`,
                        `📝 事由: ${r.content || '请跟进'}`,
                        `⏰ 时间: ${r.date || ''} ${r.time || ''}`,
                        ``,
                        `请及时处理！`
                    ].join('\n');

                    try {
                        const [result] = await companySession.sock.onWhatsApp(jid);
                        if (result && result.exists) {
                            await companySession.sock.sendMessage(result.jid, { text: message });
                            console.log(`🔔 [提醒桥] 已通知 ${creatorId}: ${candidateData.name} - ${r.content}`);
                        } else {
                            console.warn(`🔔 [提醒桥] 号码 ${phone} 未注册 WhatsApp，跳过通知`);
                        }
                    } catch (sendErr) {
                        console.error(`🔔 [提醒桥] WhatsApp 发送失败:`, sendErr);
                    }
                } else {
                    console.warn(`🔔 [提醒桥] 用户 ${creatorId} 未设置 WhatsApp 号码，跳过通知`);
                }

                // 标记为已触发 (无论 WhatsApp 是否发送成功)
                r.fired = true;
                hasChanges = true;
            }

            // 批量写回 Firestore
            if (hasChanges) {
                try {
                    await entry.ref.update({ reminders: reminders });
                    console.log(`🔔 [提醒桥] 已更新 ${candidateData.name} 的提醒状态`);
                } catch (updateErr) {
                    console.error(`🔔 [提醒桥] Firestore 更新失败:`, updateErr);
                }
            }
        }
    } catch (err) {
        console.error('🔔 [提醒桥] 扫描引擎错误:', err);
    }
}, 15000); // 每 15 秒扫描一次

app.listen(PORT, HOST, () => {
    console.log(`\n🚀 [MULTI-TENANT HUB] WhatsApp 机器人微服务运行在: http://${HOST}:${PORT}`);
    console.log(`🔔 [提醒桥] 提醒到期自动 WhatsApp 通知功能已激活`);
    console.log(`✨ 支持在网页端动态绑定无限个 WhatsApp 账号！\n`);
});
