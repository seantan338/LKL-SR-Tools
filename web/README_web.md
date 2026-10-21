# 🌐 TALENT FLOW - Web Platform (Frontend)

本目录为 **TALENT FLOW (Omni Recruitment Management)** 的云原生 Web 前端应用，基于 **Next.js 16 (App Router)**、**React 19** 与 **Firebase** 构建。

> 📌 **项目完整说明、多端架构与全功能文档**，请参阅根目录的 [主项目 README](../README.md)。

---

## 🛠️ 技术栈构成

- **框架**：Next.js 16.3.5 (App Router)
- **UI 库**：React 19.2.8
- **云端服务**：Firebase 11.9.0 (Cloud Firestore 实时同步 + Firebase Authentication 身份鉴权)
- **看板交互**：`@hello-pangea/dnd` 拖拽 + `react-indiana-drag-scroll` 横向鼠标平移
- **数据可视化**：`Chart.js` 4.5.0
- **文档生成与导出**：`docx` 9.7.1 (Word 导出) + `html2pdf.js` (PDF 导出) + `pdfjs-dist` (PDF 解析)
- **端到端加密**：基于 Web Crypto API (AES-256-GCM + PBKDF2) 的零知识保密保险库

---

## ⚡ 本地开发运行

### 1. 安装依赖
```bash
npm install
```

### 2. 环境变量配置
在当前 `web` 目录下创建 `.env.local` 文件，配置如下参数：

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# 指向 Python AI 后端微服务 (本地开发通常为 http://localhost:8000)
PYTHON_API_URL=http://localhost:8000
```

### 3. 启动开发服务器
```bash
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 访问工作台。

---

## 🛡️ Firestore 安全规则部署

在 Firebase 控制台中，将 `firestore.rules` 文件的内容部署至 Firestore Database 的规则中，以启用多租户与基于角色的数据隔离（RBAC）。

---

## 🚀 生产构建

```bash
npm run build
npm start
```
详细部署说明请参考根目录的 [DEPLOYMENT.md](../DEPLOYMENT.md)。
