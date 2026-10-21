# 🤖 TALENT FLOW - Telegram 自动化工作流机器人 (Node.js 独立微服务)

本项目是与 `whatsapp_bot` 同构的 Node.js 独立机器人微服务，用于在 Telegram 中自动接收招聘顾问发送的简历（PDF、Word .docx、图片拍照），直接调用 `ai_backend` 微服务进行高保真解析并自动持久化录入 Cloud Firestore。

---

## ⚡ 核心能力
1. **自动文件嗅探**：支持 PDF、Word (.docx/.doc)、TXT 及手机拍照简历图片（自动触发 Vision OCR）。
2. **AI 高精度解析**：自动调用 FastAPI 服务的 `/api/parse/file/cv`，提取姓名、电话、学历、工作年限、职位与薪资期望。
3. **查重与安全建档**：基于手机号与邮箱自动查重，避免重复建档；若是老候选人，会自动增量更新并在档案时间轴追加备注。
4. **实时看板联动**：直接写入 Firestore `teams/{teamId}/candidates`，前端无需刷新，新候选人即刻呈现。
5. **即时卡片回执**：在 Telegram 中以富文本卡片格式回复顾问，附带缺失字段预警与 Web 页面直达链接。

---

## 🚀 启动指南

### 1. 安装依赖
```bash
cd telegram_bot
npm install
```

### 2. 配置环境变量
可以直接在当前目录创建 `.env` 文件（参考 `.env.example`）：
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
AI_BACKEND_URL=http://127.0.0.1:8000
TELEGRAM_DEFAULT_TEAM=default_team
TELEGRAM_ALLOWED_USERS=your_tg_username
WEB_APP_BASE_URL=http://localhost:3000
```
> *注：若当前目录未找到 `.env`，脚本会自动降级读取 `../ai_backend/.env`。*

### 3. 运行服务
```bash
# 生产启动
npm start

# 开发模式 (自动热重载)
npm run dev
```

---

## 🔄 双方案说明
- **方案 1（Python 原生内嵌）**：已直接集成在 `ai_backend/services/telegram_service.py` 中，只需在 `ai_backend/.env` 中填入 `TELEGRAM_BOT_TOKEN`，随 FastAPI 主服务一同自启或接收 Webhook。
- **方案 2（Node.js 独立微服务）**：即本目录代码，适合希望将 Telegram 机器人与主后端完全解耦、独立容器化或部署到独立服务器的场景。
