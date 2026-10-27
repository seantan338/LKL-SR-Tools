# TALENT FLOW - n8n 自动化简历建档工作流配置指南

本目录提供了用于导入本地或云端 n8n 的自动化工作流模版。

---

## 1. 架构定位与职责划分

采用“双轨解耦”架构，将可视化流程与底层复杂算法完美分离：

- **n8n（流程编排与可视化呈现）**：
  - 负责 Telegram 群组监听、消息流过滤；
  - 提供可视化的执行日志看板与状态监控；
  - 方便未来自由拖拽扩展（如同步写入 Google Sheets、发送飞书通知、邮件通知等）。
- **FastAPI / Talent Flow 后端（底层核心大脑）**：
  - 暴露标准接口：`POST /api/telegram/webhook?sync=true` 与 `POST /api/candidates/ingest-file`；
  - 负责沉重的技术实现：Word/PDF 文档拆解、手机拍摄简历 Vision OCR、公司模板线索提取 (`Company - Position - Name.docx`)、大模型结构化提取、电话/邮箱查重合流、Firestore 数据库事务落库。

---

## 2. 一键导入步骤 (30 秒完成)

1. 打开本地部署的 n8n 控制台（默认地址为 `http://localhost:5678`）；
2. 点击右上角菜单 **Workflows ➔ Import from File...**；
3. 选择本项目中的文件：`n8n/talentflow_telegram_workflow.json`；
4. 导入后即可在 n8n 画布上看到由 3 个核心节点构成的专业工作流。

---

## 3. 节点连接与凭据设置

### A. Telegram Trigger 节点
- **Credentials**：新建 `Telegram API` 凭据，粘贴来自 `@BotFather` 的 Bot Token；
- **Updates**：选择 `message`；
- **群隐私模式要求**：在 Telegram `@BotFather` 中发送 `/setprivacy` ➔ 选择当前 Bot ➔ 点击 **`Disable`**（关闭隐私模式后，Bot 才能监听群成员发送的简历附件）。

### B. HTTP Request 节点 (网络连通配置)
- **Method**：`POST`
- **URL**：
  - **如果 n8n 运行在 Docker 容器中**：填写 `http://host.docker.internal:8000/api/telegram/webhook?sync=true`
  - **如果 n8n 直接运行在 Windows 宿主机上**：填写 `http://localhost:8000/api/telegram/webhook?sync=true`
- **Body**：已预置为 `{{ JSON.stringify($json) }}`，直接透传 Telegram 消息体。

---

## 4. 双轨模式切换指南

| 场景 | 配置方法 | 运作机制 |
| :--- | :--- | :--- |
| **模式 1：使用 n8n 编排模式（推荐给老板演示/统一监控）** | 将 `ai_backend/.env` 中的 `TELEGRAM_BOT_TOKEN` 留空，并在 n8n 中点击 **Active (开启工作流)**。 | 由 n8n 负责监听 Telegram 并推送给后端处理，老板可在 n8n 界面实时查看绿色执行状态与每条候选人数据。 |
| **模式 2：系统原生极简长轮询模式（单机独立开发）** | 在 `ai_backend/.env` 填写 `TELEGRAM_BOT_TOKEN`，在 n8n 中关闭工作流。 | FastAPI 后端自启长轮询后台协程，无需启动 n8n，免内网穿透即可全自动建档。 |

---


---

## 5. 扩展能力接口 (通用文件建档 API)

如果未来老板希望在 n8n 中监听其他渠道（例如邮件附件、Google Drive、网盘文件），可直接调用通用建档接口：

- **接口地址**：`POST http://host.docker.internal:8000/api/candidates/ingest-file`
- **Content-Type**：`multipart/form-data`
- **参数说明**：
  - `file`: 二进制文件流（PDF / Word / 图片）
  - `teamId`: (可选) 团队 ID，默认为 `default_team`
  - `senderName`: (可选) 来源标识，如 `n8n_email_pipeline`
- **返回结果**：返回完整的标准化候选人 JSON 实体与系统 ID。

---

## 6. Google Sheets 实时同步转发工作流 (双流共用单个 ngrok 隧道)

当 ngrok 免费域名绑定在 n8n (`:5678`) 时，可使用此工作流无缝承接 Google 表格的实时推送：

1. **导入文件**：在 n8n 控制台导入 `n8n/talentflow_sheets_sync_workflow.json`；
2. **激活工作流**：在 n8n 中点击右上角开启 **Active**；
3. **Google Apps Script 配置**：
   将 Google 表格中的 `backendUrl` 指向 n8n Webhook：
   ```javascript
   var backendUrl = 'https://unsafe-islamist-idealist.ngrok-free.dev/webhook/sheets-sync';
   ```
4. **运作效果**：Google 表格编辑后，n8n 实时抓取并通过 `http://host.docker.internal:8000/api/sheets/webhook` 转发至 FastAPI，实现 Telegram 简历与 Google 表格同步无缝共存。
5. **Job Order 表格**：表头含 `Company Name` + `Job Title` 的表格（如 `Job Order 2026 > Database`）会被后端自动识别，只同步被编辑的那一行到 Job Orders（按「公司 + 职位 + 地点」匹配），不会被当成候选人解析。



---

## 7. Job Order 每日自动同步工作流 (Google Sheets → Firestore)

每天 08:00（Asia/Kuala_Lumpur）把 `Job Order 2026 > Database` 同步进系统，并把结果推送到 Telegram。

- **导入文件**：`n8n/talentflow_job_order_daily_sync_workflow.json`
- **流程**：`Daily 08:00` / `Run Now (Test)` → `Config` → `Sync Job Orders`（`POST /api/sheets/import-job-orders`）→ `Sync OK?` → Telegram 推送摘要或失败原因
- **同步规则**：按「公司 + 职位 + 地点」匹配；只新建新岗位、只更新内容有变化的岗位，不会重复；缺公司名或职位的行会跳过，并在推送消息里列出行号。
- **改名 / 删除的行**：表格里已找不到、但系统中仍在招聘的岗位会列在推送消息里，系统不会自动删除或关闭，由你确认处理。

### 设置步骤
1. **Config 节点**：填写 `apiBaseUrl`（后端地址，例如 Zeabur 的 `https://xxx.zeabur.app`；本地 Docker n8n 可用 `http://host.docker.internal:8000`）和 `telegramChatId`。`dryRun` 默认为 `true`（只报告不写入），试跑确认后改为 `false`。
2. **Sync Job Orders 节点** → Credential → 新建 **Header Auth**：Name = `X-API-Key`，Value = 后端环境变量 `INTERNAL_API_SECRET` 的值。
3. **Telegram Notify 节点** → 选择已有的 Telegram Bot 凭据。
4. 点 **Test workflow** 确认 Telegram 收到消息后，打开右上角 **Active**。

### 后端前提
| 环境变量 | 用途 |
| :--- | :--- |
| `INTERNAL_API_SECRET` | n8n 调用接口的密钥（与 Header Auth 的值一致） |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 写 Firestore；没有 `credentials.json` 时也用它读 Google Sheets |

表格需共享给该 service account 的 `client_email`（Viewer），且对应 GCP 项目需启用 **Google Sheets API**。

本地手动同步可直接运行 `ai_backend\sync_job_orders.ps1`（`-Apply` 写入）。
