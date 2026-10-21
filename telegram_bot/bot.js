/**
 * TALENT FLOW - Telegram Automated Workflow Bot (Standalone Node.js Microservice)
 * 
 * Functions:
 * 1. Listens for incoming documents (PDF, DOCX, DOC), photos, and text messages.
 * 2. Downloads files from Telegram servers.
 * 3. Sends files to ai_backend (FastAPI :8000/api/parse/file/cv) for high-fidelity extraction.
 * 4. Deduplicates and upserts candidate profiles into Cloud Firestore (teams/{teamId}/candidates).
 * 5. Instant feedback: replies to consultant with structured candidate cards and web dashboard links.
 */

const path = require('path');
const fs = require('fs');
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const FormData = require('form-data');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// Fallback: also load from ai_backend/.env if local .env has missing values
require('dotenv').config({ path: path.join(__dirname, '..', 'ai_backend', '.env') });

// --- Firebase Admin SDK Initialization ---
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.join(__dirname, '..', 'ai_backend', 'firebase-service-account.json');
let db = null;

if (fs.existsSync(serviceAccountPath)) {
    try {
        if (!getApps().length) {
            initializeApp({
                credential: cert(require(serviceAccountPath))
            });
        }
        const databaseId = (process.env.FIREBASE_DATABASE_ID || '(default)').trim();
        db = databaseId === '(default)' ? getFirestore() : getFirestore(databaseId);
        console.log(`[Firebase Admin] Firestore 已成功连接 ('${databaseId}')`);
    } catch (e) {
        console.error("[Firebase Admin] 初始化失败:", e);
    }
} else {
    console.warn(`[Firebase Admin] 未找到凭证文件: ${serviceAccountPath}，数据库直写将受限。`);
}

// --- Configuration ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || 'http://127.0.0.1:8000';
const DEFAULT_TEAM_ID = process.env.TELEGRAM_DEFAULT_TEAM || 'default_team';
const WEB_APP_BASE_URL = (process.env.WEB_APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SILENT_MODE = process.env.TELEGRAM_SILENT_MODE !== 'false';
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '')
    .split(',')
    .map(u => u.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);
const ALLOWED_CHATS = (process.env.TELEGRAM_ALLOWED_CHATS || '')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);

if (!BOT_TOKEN) {
    console.error("错误: 未设置 TELEGRAM_BOT_TOKEN！请在 .env 文件中配置机器人 Token。");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- Corporate Filename Hints Extractor ---
function extractFilenameHints(filename) {
    const clean = filename.replace(/\.[^/.]+$/, "");
    const parts = clean.replace(/ - /g, '-').replace(/ -/g, '-').replace(/- /g, '-').split('-').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
        return { company: parts[0], position: parts[1], name: parts[2] };
    } else if (parts.length === 2) {
        return { company: '', position: parts[0], name: parts[1] };
    }
    return {};
}

// --- Request Authorization Check ---
function isRequestAuthorized(ctx) {
    const chatType = ctx.chat.type;
    const chatId = String(ctx.chat.id).toLowerCase();
    const chatTitle = String(ctx.chat.title || '').toLowerCase();

    if (chatType === 'group' || chatType === 'supergroup') {
        if (ALLOWED_CHATS.length === 0) return true; // Default: trust groups where bot is added
        const cleanId = chatId.replace('-100', '').replace('-', '');
        return ALLOWED_CHATS.some(allowed => {
            const cleanAllowed = allowed.replace(/^@/, '').replace('-100', '').replace('-', '');
            return cleanAllowed === cleanId || cleanAllowed === chatId || cleanAllowed === chatTitle;
        });
    }

    if (ALLOWED_USERS.length === 0) return true;
    const userId = String(ctx.from.id).toLowerCase();
    const username = String(ctx.from.username || '').toLowerCase();
    return ALLOWED_USERS.includes(userId) || ALLOWED_USERS.includes(username);
}


// --- Helper: Clean Phone Number ---
function cleanPhoneNumber(raw) {
    if (!raw) return '';
    return String(raw).replace(/\D/g, '');
}

// --- Helper: Forward File to AI Backend ---
async function sendFileToAiBackend(fileBuffer, filename) {
    const form = new FormData();
    form.append('file', fileBuffer, { filename });

    const targetUrl = `${AI_BACKEND_URL}/api/parse/file/cv`;
    console.log(`[AI转发] 正在将文件 ${filename} (${fileBuffer.length} bytes) 发往 AI 微服务: ${targetUrl}`);

    const res = await fetch(targetUrl, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
        timeout: 90000 // 90 seconds timeout for large OCR/LLM
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI 微服务返回 HTTP ${res.status}: ${errorText}`);
    }

    const json = await res.json();
    if (json.status !== 'success' && !json.data) {
        throw new Error(json.message || 'AI 解析未返回有效数据');
    }

    return json.data;
}

// --- Helper: Upsert Candidate into Firestore ---
async function upsertCandidateToFirestore(parsedData, originalFilename, fromUser) {
    if (!db) {
        throw new Error("Firestore 数据库未初始化，无法持久化数据");
    }

    const cv = parsedData.parsed_cv || {};
    const personal = cv.personal_information || {};
    const edu = cv.education || [];
    const history = cv.professional_history || [];
    const missing = parsedData.missing_analysis || {};

    const hints = extractFilenameHints(originalFilename);
    const name = personal.name || hints.name || '未命名候选人';
    const rawPhone = personal.phone || '';
    const cleanPhone = cleanPhoneNumber(rawPhone);
    const email = personal.email || '';
    const location = personal.address || '';
    const salary = personal.expected_salary || personal.last_drawn_salary || '';
    const position = cv.position_applied || hints.position || (history[0] ? history[0].position : '') || '待定岗位';
    const company = hints.company || (history[0] ? history[0].company : '');
    const experience = cv.total_years_experience || '';
    const school = edu[0] ? edu[0].school : '';
    const degree = edu[0] ? (edu[0].degree || edu[0].qualification) : '';
    const major = edu[0] ? edu[0].major : '';

    const candidatesRef = db.collection('teams').document(DEFAULT_TEAM_ID).collection('candidates');

    // 查重：优先手机号，其次邮箱
    let existingDoc = null;
    if (cleanPhone && cleanPhone.length >= 7) {
        const snap = await candidatesRef.where('phone', '==', cleanPhone).limit(1).get();
        if (!snap.empty) existingDoc = snap.docs[0];
    }
    if (!existingDoc && email && email.includes('@')) {
        const snap = await candidatesRef.where('email', '==', email.toLowerCase()).limit(1).get();
        if (!snap.empty) existingDoc = snap.docs[0];
    }

    const nowIso = new Date().toISOString();
    const senderName = fromUser.username || fromUser.first_name || String(fromUser.id);

    if (existingDoc) {
        const cid = existingDoc.id;
        const oldData = existingDoc.data() || {};
        const updatePayload = {
            name: name !== '未命名候选人' ? name : oldData.name,
            phone: cleanPhone || oldData.phone,
            email: email || oldData.email,
            position: position || oldData.position,
            company: company || oldData.company,
            salary: salary || oldData.salary,
            offered: salary || oldData.offered,
            location: location || oldData.location,
            school: school || oldData.school,
            degree: degree || oldData.degree,
            major: major || oldData.major,
            experience: experience || oldData.experience,
            rawResumeFilename: originalFilename,
            parsedCvData: parsedData,
            missingFields: missing.missing_critical_fields || [],
            suggestedQuestions: missing.suggested_questions_for_hr || [],
            updatedAt: nowIso,
            lastSource: 'Telegram Node Bot Update'
        };

        const note = `[${nowIso.slice(0, 16)}] Telegram 顾问 @${senderName} 更新了简历 (${originalFilename})`;
        updatePayload.notes = oldData.notes ? `${oldData.notes}\n${note}` : note;

        await candidatesRef.doc(cid).set(updatePayload, { merge: true });
        console.log(`[Firestore] 已更新候选人: ${cid} (${name})`);

        return {
            isNew: false,
            id: cid,
            name,
            phone: cleanPhone || rawPhone,
            position,
            company,
            salary,
            school,
            degree,
            experience,
            missingFields: missing.missing_critical_fields || [],
            suggestedQuestions: missing.suggested_questions_for_hr || []
        };
    } else {
        const { v4: uuidv4 } = require('crypto').randomUUID ? { v4: require('crypto').randomUUID } : { v4: () => Math.random().toString(36).substring(2, 15) };
        const cid = uuidv4();

        const candidatePayload = {
            id: cid,
            name,
            phone: cleanPhone || rawPhone,
            email,
            school,
            major,
            degree,
            experience,
            location,
            salary,
            offered: salary,
            company,
            position,
            source: 'Telegram',
            stage: 'screening',
            stageHistory: [{ stage: 'screening', movedAt: nowIso }],
            status: 'active',
            interviewDate: null,
            interviewTime: null,
            rawResumeFilename: originalFilename,
            skills: cv.skills || [],
            parsedCvData: parsedData,
            missingFields: missing.missing_critical_fields || [],
            suggestedQuestions: missing.suggested_questions_for_hr || [],
            assignedTo: `tg_${senderName}`,
            notes: `[${nowIso.slice(0, 16)}] 由 Telegram 顾问 @${senderName} 接收建档`,
            createdAt: nowIso,
            updatedAt: nowIso
        };

        await candidatesRef.doc(cid).set(candidatePayload);
        console.log(`[Firestore] 已创建新候选人: ${cid} (${name})`);

        return {
            isNew: true,
            id: cid,
            name,
            phone: cleanPhone || rawPhone,
            position,
            company,
            salary,
            school,
            degree,
            experience,
            missingFields: missing.missing_critical_fields || [],
            suggestedQuestions: missing.suggested_questions_for_hr || []
        };
    }
}

// --- Helper: Format Telegram Reply (Clean, zero emoji) ---
function formatReplyHtml(result, isGroup = false) {
    const eduStr = result.degree ? `${result.school} (${result.degree})` : (result.school || '未填写');
    const webLink = `${WEB_APP_BASE_URL}/candidates?id=${result.id}`;

    if (isGroup) {
        const statusTag = result.isNew ? '<b>[简历已入库]</b>' : '<b>[档案已更新]</b>';
        return [
            `${statusTag} <b>${result.name}</b>`,
            `岗位: ${result.position}${result.company ? ` (${result.company})` : ''}`,
            `电话: ${result.phone || '未提供'} | 薪资: ${result.salary || '面议'}`,
            `学历: ${eduStr} | 经验: ${result.experience || '未提供'}`,
            `<a href="${webLink}">在 Talent Flow 查看档案</a>`
        ].join('\n');
    }

    const title = result.isNew ? '<b>[新简历录入成功]</b>' : '<b>[候选人档案已更新]</b>';

    let html = [
        title,
        '',
        `姓名: ${result.name}`,
        `电话: ${result.phone || '未提供'}`,
        `目标岗位: ${result.position}${result.company ? ` (${result.company})` : ''}`,
        `薪资期望: ${result.salary || '面议'}`,
        `教育背景: ${eduStr}`,
        `工作经验: ${result.experience || '未提供'}`,
    ];

    if (result.missingFields && result.missingFields.length > 0) {
        html.push('');
        html.push('待补关键信息:');
        result.missingFields.slice(0, 3).forEach(f => {
            const fieldName = f.split('.').pop();
            html.push(`  - ${fieldName}`);
        });
    }

    if (result.suggestedQuestions && result.suggestedQuestions.length > 0) {
        html.push('');
        html.push('建议追问话术:');
        result.suggestedQuestions.slice(0, 2).forEach(q => {
            html.push(`  * <i>${q}</i>`);
        });
    }

    html.push('');
    html.push(`<a href="${webLink}">点击进入 Talent Flow 看板查看详情</a>`);

    return html.join('\n');
}

// --- Telegraf Command & Event Handlers ---

bot.start(async (ctx) => {
    if (SILENT_MODE) return;
    return ctx.replyWithHTML(
        "<b>[Talent Flow 智能招聘机器人 (Node Hub)]</b>\n\n" +
        "向我发送：\n" +
        "- PDF / Word (.docx/.doc) 简历文件\n" +
        "- 纸质简历拍照 / 手机截图\n\n" +
        "系统将自动由 AI 提取结构化简历字段并写入 Talent Flow 人才库。"
    );
});

// 处理文档文件 (PDF / DOCX / DOC / TXT)
bot.on('document', async (ctx) => {
    if (!isRequestAuthorized(ctx)) return;

    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const doc = ctx.message.document;
    const filename = doc.file_name || 'resume.pdf';
    console.log(`[Telegram Bot] 监听到文件: ${filename} (来自: @${ctx.from.username || ctx.from.id}, 会话: ${ctx.chat.title || '私聊'})`);

    try {
        const fileLink = await ctx.telegram.getFileLink(doc.file_id);
        const resp = await fetch(fileLink.href);
        const buffer = await resp.buffer();

        // 发送给 AI 微服务
        const parsedData = await sendFileToAiBackend(buffer, filename);

        // 存入 Firestore
        const result = await upsertCandidateToFirestore(parsedData, filename, ctx.from);
        console.log(`[Telegram Bot] [静默建档完成] 候选人: ${result.name} | 岗位: ${result.position} | ID: ${result.id}`);

        // 仅在非静默模式下回复
        if (!SILENT_MODE) {
            const replyHtml = formatReplyHtml(result, isGroup);
            await ctx.replyWithHTML(replyHtml, {
                reply_to_message_id: ctx.message.message_id,
                disable_web_page_preview: true
            });
        }
    } catch (err) {
        console.error(`[Telegram Bot] 处理文档失败 (${filename}):`, err.message);
        if (!SILENT_MODE) {
            await ctx.replyWithHTML(`[处理失败] 无法解析 ${filename}: ${err.message}`, {
                reply_to_message_id: ctx.message.message_id
            });
        }
    }
});

// 处理图片 (手机拍照简历)
bot.on('photo', async (ctx) => {
    if (!isRequestAuthorized(ctx)) return;

    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const filename = `photo_${bestPhoto.file_id.slice(0, 8)}.jpg`;
    console.log(`[Telegram Bot] 监听到照片简历 (来自: @${ctx.from.username || ctx.from.id}, 会话: ${ctx.chat.title || '私聊'})`);

    try {
        const fileLink = await ctx.telegram.getFileLink(bestPhoto.file_id);
        const resp = await fetch(fileLink.href);
        const buffer = await resp.buffer();

        const parsedData = await sendFileToAiBackend(buffer, filename);
        const result = await upsertCandidateToFirestore(parsedData, filename, ctx.from);
        console.log(`[Telegram Bot] [静默建档完成] 候选人: ${result.name} | 岗位: ${result.position} | ID: ${result.id}`);

        if (!SILENT_MODE) {
            const replyHtml = formatReplyHtml(result, isGroup);
            await ctx.replyWithHTML(replyHtml, {
                reply_to_message_id: ctx.message.message_id,
                disable_web_page_preview: true
            });
        }
    } catch (err) {
        console.error(`[Telegram Bot] 处理图片失败:`, err.message);
        if (!SILENT_MODE) {
            await ctx.replyWithHTML(`[图片识别失败]: ${err.message}`, {
                reply_to_message_id: ctx.message.message_id
            });
        }
    }
});

// 优雅关停
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// 启动 Bot
bot.launch().then(() => {
    console.log(`\n[TELEGRAM BOT HUB] 机器人微服务已成功连接并启动监听 (静默模式: ${SILENT_MODE})！`);
    console.log(`当前运行环境: ${AI_BACKEND_URL}`);
    console.log(`授权白名单模式: ${ALLOWED_USERS.length > 0 ? ALLOWED_USERS.join(', ') : '公开模式 (无白名单限制)'}\n`);
}).catch(err => {
    console.error("Telegram 机器人启动失败:", err);
});

