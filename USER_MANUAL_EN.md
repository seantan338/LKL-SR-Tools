# 📘 TALENT FLOW 2.0 User Operations & Recruitment Delivery Manual (User Manual)

Welcome to **TALENT FLOW (Omni Recruitment Management)**, the enterprise-grade intelligent applicant tracking and candidate full-lifecycle delivery platform. This manual is designed for **Recruitment Consultants, HRBPs, Recruitment Team Leads, Account Managers, and System Administrators**, providing a comprehensive, step-by-step guide from job order intake, candidate profiling, agile pipeline advancement, AI-assisted candidate matching, to multi-channel automated ingestion.

---

## 📑 Table of Contents

1. [Quick Start & Onboarding](#1-quick-start--onboarding)
   - [1.1 System Architecture & Authentication](#11-system-architecture--authentication)
   - [1.2 Team Approval Mechanism (Pending State Explained)](#12-team-approval-mechanism-pending-state-explained)
   - [1.3 Multilingual & Dark/Light Theme Switching](#13-multilingual--darklight-theme-switching)
2. [Workspace Dashboard (Overview)](#2-workspace-dashboard-overview)
3. [Enterprise Job Orders Database (Job Orders)](#3-enterprise-job-orders-database-job-orders)
   - [3.1 Purpose & Strategic Value](#31-purpose--strategic-value)
   - [3.2 Interface Layout & Four Key Zones](#32-interface-layout--four-key-zones)
   - [3.3 Five Standard Requisition Statuses](#33-five-standard-requisition-statuses)
   - [3.4 Core Operations & Multi-Token Smart Search](#34-core-operations--multi-token-smart-search)
   - [3.5 Daily Operational Workflow](#35-daily-operational-workflow)
   - [3.6 Candidate Management Integration](#36-candidate-management-integration)
   - [3.7 Permissions & One-Way Read-Only Protection](#37-permissions--one-way-read-only-protection)
   - [3.8 Frequently Asked Questions (FAQ)](#38-frequently-asked-questions-faq)
4. [Candidate Lifecycle Management & Agile Kanban (Pipeline & Candidates)](#4-candidate-lifecycle-management--agile-kanban-pipeline--candidates)
   - [4.1 Candidate Management Console (Candidate Records & Ingestion)](#41-candidate-management-console)
   - [4.2 Agile Kanban Board Operations (Pipeline Swimlanes)](#42-agile-kanban-board-operations)
   - [4.3 360° Panoramic Candidate Profile Drawer](#43-360-panoramic-candidate-profile-drawer)
   - [4.4 Talent Pool & One-Click Reactivation](#44-talent-pool--one-click-reactivation)
5. [AI Intelligence Suite (AI Parser & CV Builder)](#5-ai-intelligence-suite)
   - [5.1 AI Job Description Generation & Anti-Poaching De-identification](#51-ai-job-description-generation--anti-poaching-de-identification)
   - [5.2 CV Parsing, Structured Verification & DOCX Export (CV Builder)](#52-cv-parsing-structured-verification--docx-export-cv-builder)
6. [Interview Scheduling & Calendar Management (Calendar)](#6-interview-scheduling--calendar-management-calendar)
   - [6.1 Module Positioning & Quad-Ecosystem Integration](#61-module-positioning--quad-ecosystem-integration)
   - [6.2 Overall Page Layout & Dual-Panel Synergy](#62-overall-page-layout--dual-panel-synergy)
   - [6.3 Month Grid, Badges & Attendance Status Matrix](#63-month-grid-badges--attendance-status-matrix)
   - [6.4 Right Agenda Panel (Selected Day vs All Scheduled)](#64-right-agenda-panel-selected-day-vs-all-scheduled)
   - [6.5 Global vs Personal View Modes with Auto-Match](#65-global-vs-personal-view-modes-with-auto-match)
   - [6.6 Ingestion Channels & Date/Time Tolerances](#66-ingestion-channels--datetime-tolerances)
   - [6.7 Empty Month Auto-Jump Navigation](#67-empty-month-auto-jump-navigation)
   - [6.8 One-Click Google Calendar Synchronization](#68-one-click-google-calendar-synchronization)
   - [6.9 Dashboard & Global Notification Center Synergy](#69-dashboard--global-notification-center-synergy)
   - [6.10 Recommended Daily Best Practices & Calendar FAQ](#610-recommended-daily-best-practices--calendar-faq)
7. [n8n Automation & Ecosystem Integration](#7-n8n-automation--ecosystem-integration)
   - [7.1 Module Positioning & Strategic Value](#71-module-positioning--strategic-value)
   - [7.2 Dual-Engine Decoupled Architecture](#72-dual-engine-decoupled-architecture)
   - [7.3 Workflow 1: Telegram Bot Rapid Ingestion](#73-workflow-1-telegram-bot-rapid-ingestion)
   - [7.4 Workflow 2: Google Sheets Real-Time Sync](#74-workflow-2-google-sheets-real-time-sync)
   - [7.5 Binary File Ingestion API](#75-binary-file-ingestion-api)
   - [7.6 Environment Variables Reference](#76-environment-variables-reference)
   - [7.7 Post-Deployment Verification Checklist](#77-post-deployment-verification-checklist)
   - [7.8 Production Security & Stability Guidelines](#78-production-security--stability-guidelines)
   - [7.9 Automation Troubleshooting FAQ](#79-automation-troubleshooting-faq)
8. [Team Collaboration & Partner Penetration (Team & RBAC)](#8-team-collaboration--partner-penetration-team--rbac)
   - [8.1 Module Architecture & Authority Hierarchy](#81-module-architecture--authority-hierarchy)
   - [8.2 Three-Tier RBAC Permission Matrix](#82-three-tier-rbac-permission-matrix)
   - [8.3 New Member Onboarding Approval Flow](#83-new-member-onboarding-approval-flow)
   - [8.4 Existing Member Management & Cross-Team Transfer](#84-existing-member-management--cross-team-transfer)
   - [8.5 HQ Partner One-Way Penetration Mechanism](#85-hq-partner-one-way-penetration-mechanism)
   - [8.6 Troubleshooting & FAQ](#86-troubleshooting--faq)
9. [System Settings & Data Security (Settings)](#9-system-settings--data-security-settings)
   - [9.1 Strategic Value & Module Purpose](#91-strategic-value--module-purpose)
   - [9.2 Local JSON Migration (Disaster Recovery Cloud Ingestion)](#92-local-json-migration-disaster-recovery-cloud-ingestion)
   - [9.3 Google Sheets Import & AI Data Cleaning Pipeline](#93-google-sheets-import--ai-data-cleaning-pipeline)
   - [9.4 Confidential Data Vault (Zero-Knowledge E2EE)](#94-confidential-data-vault-zero-knowledge-e2ee)
   - [9.5 WhatsApp Personal Notification & Dynamic Templates](#95-whatsapp-personal-notification--dynamic-templates)
   - [9.6 Recommended Setup Sequence for New Teams](#96-recommended-setup-sequence-for-new-teams)
   - [9.7 Settings Troubleshooting FAQ](#97-settings-troubleshooting-faq)
10. [Frequently Asked Questions & Troubleshooting (FAQ)](#10-frequently-asked-questions--troubleshooting-faq)
    - [10.1 Accounts, Login & Team Permissions](#101-accounts-login--team-permissions)
    - [10.2 Candidate Progression, Kanban & Talent Pool](#102-candidate-progression-kanban--talent-pool)
    - [10.3 AI Suite & CV Parsing](#103-ai-suite--cv-parsing)
    - [10.4 Scheduling & Ecosystem Automation](#104-scheduling--ecosystem-automation)
    - [10.5 Trade Secrets & Data Security](#105-trade-secrets--data-security)

---

## 1. Quick Start & Onboarding

### 1.1 System Architecture & Authentication
TALENT FLOW 2.0 adopts a modern, decoupled enterprise architecture available in two deployment modes:
* **Cloud-Native Web Collaboration Platform (Primary)**: Accessible instantly via standard web browsers. Supports multi-user team collaboration, real-time cloud data synchronization, and end-to-end multi-tenant isolation.
* **Electron Desktop Standalone Mode**: Tailored for zero-network environments or extreme confidentiality requirements, utilizing encrypted local storage.

#### Authentication Methods
Access the system login page via any modern Chromium browser (Chrome, Edge, Brave):
1. **Google Single Sign-On (SSO)**: Recommended for corporate Google Workspace accounts, completing authentication in seconds.
2. **Corporate Email + Password Sign-In / Registration**: Enter your registered corporate email and password, then click "Sign In" or "Register".

---

### 1.2 Team Approval Mechanism (Pending State Explained)
To protect confidential enterprise recruitment assets (client registries, base salaries, candidate contact numbers), the system implements **strict corporate team approval gating**:
1. **Initial Registration**: Upon registering with a new email or Google account, the user is placed into a sandboxed `Pending (pending)` state by default.
2. **Holding Notification Screen**: The user sees an amber alert screen: *"Your account is awaiting approval from your team administrator"*. Production client and candidate data remain strictly hidden.
3. **Administrator Approval Workflow**: Team administrators with `Owner` or `Manager` privileges navigate to **Team Collaboration (`/team`)**, view the "Pending Approvals" card, select the destination team (Headquarters or Partner Branch), and click **Approve** while assigning their role (such as `Recruiter`).
4. **Instant Unlocking**: Once approved, the new member refreshes their browser and immediately gains full access to team candidates, orders, and boards.

---

### 1.3 Multilingual & Dark/Light Theme Switching
Located in the upper-right corner of the top navbar:
* **Language Toggle (🌐 `中 / EN`)**: Click to toggle seamlessly between English and Simplified Chinese across the entire application interface.
* **Theme Switching (☀️ / 🌙)**: Click to switch between Midnight Obsidian Dark Mode and Crisp Light Mode. Preferences are saved automatically to browser local storage.

---

## 2. Workspace Dashboard (Overview)

The **Workspace Dashboard (`/overview`)** serves as the consultant's command center:

* **Core KPI Metric Cards**:
  - **Total Talent Pool**: Total active candidates stored in the cloud repository.
  - **Candidates in Pipeline**: Number of candidates actively progressing through screening, interviews, or offer negotiations.
  - **Upcoming Interviews**: Total scheduled interview sessions for today and the next 7 days.
  - **Placement Success Rate**: Overall conversion percentage of candidates reaching final onboarding.
* **Agile Stage Distribution Bar**: Visual breakdown of candidate volumes across all 7 recruitment pipeline stages.
* **Today's Priority To-Do & Interview Alerts**: Highlights upcoming interview candidates and urgent follow-up calls requiring action.
* **Quick Action Grid**: One-click shortcuts to Add Candidate, Post Job Order, Launch AI Parser, and Open Interview Calendar.

---

## 3. Enterprise Job Orders Database (Job Orders)

Navigate to **Job Orders (`/orders`)** in the left sidebar to manage client hiring quotas, fee agreements, and delivery specs.

> 🎯 **Target Audience**: Recruitment Consultants, Team Leads, Account Managers, Agency Owners

### 3.1 Purpose & Strategic Value
A Job Order represents a client hiring requisition. It is the genesis and target of all recruitment delivery:
* **Centralized Specifications**: Eliminates scattered WeChat/WhatsApp notes and emails into structured records;
* **Delivery Velocity Tracking**: Instantly reveals which positions are urgent, on hold, or filled;
* **Trade Secret Protection**: Client markups, commission splits, and hiring manager quirks are stored under cryptographic encryption;
* **AI-Assisted Candidate Matching**: Automatically evaluates talent pool profiles against job requirements using semantic vector comparison.

### 3.2 Interface Layout & Four Key Zones
1. **Top Control Bar**: Search box, status dropdown filter, "Sync Embedding" button, and "Post Job Order" button.
2. **Order Cards Grid**: Displays job title, company name, salary range, location, quota, and current status.
3. **Quick Status Dropdown**: Located at the foot of each card to update requisition status without opening the edit modal.
4. **Order Detail Drawer**: Slides out from the right upon clicking "View Details", containing specifications, confidential notes, and AI matching.

### 3.3 Five Standard Requisition Statuses

| Status | Code | Operational Meaning | Recommended Usage |
| :--- | :--- | :--- | :--- |
| **Open (进行中)** | `open` | Active delivery | Standard open requisitions undergoing sourcing |
| **Urgent (急聘)** | `urgent` | High priority | Client is suffering severe talent shortage; prioritizes candidate matching |
| **Paused (暂停)** | `paused` | Temporarily frozen | Client is restructuring, freezing headcounts, or reviewing budgets |
| **Filled (满额)** | `filled` | Quota achieved | Candidates successfully onboarded; requisition closed |
| **Closed (已关闭)** | `closed` | Requisition terminated | Contract ended, client cancelled, or job expired |

*Note: Every status adjustment creates an immutable audit log entry in the system.*

### 3.4 Core Operations & Multi-Token Smart Search
1. **Posting a Requisition (Recommended: AI Extraction)**:
   - Click **Post Job Order** in the upper right.
   - Click **AI Smart Extraction** at the top of the form.
   - Paste the raw text received from client WeChat/WhatsApp messages or emails, then click **Extract**.
   - The AI automatically extracts Company Name, Position Title, Salary Range, Location, Working Hours, Requirements, and Benefits.
   - Review and adjust fields, append Secret Notes, and click Save.
2. **Space-Separated Multi-Keyword Search**:
   Enter multiple keywords separated by spaces, such as `Frontend Remote 25k` or `Penang Operator Urgent`. The engine splits each token and matches across company, position, salary, location, job specs, and decrypted secret notes. **Only orders matching all tokens simultaneously are displayed**.
3. **Quick Status Modification**:
   Select a new status from the dropdown menu at the bottom of the card for instant cloud updates.
4. **End-to-End Encrypted (E2EE) Secret Notes**:
   Record confidential client markups, fee percentages, payment cycles, and client hiring quirks strictly in **Secret Notes (私密笔记)**.
   - Notes are encrypted directly inside your browser before transmission using Web Crypto API (`PBKDF2-SHA-256` with 100,000 iterations + `AES-GCM-256`);
   - Cloud Firestore stores only the ciphertext starting with `TLFL_E2EE_V1:`;
   - Only team members possessing the vault master password can decrypt and read the notes.
5. **AI Semantic Matching**:
   Open an order's detail drawer and click **AI Smart Match**. Adjust matching weights (Skills, Experience, Salary, Location) to evaluate the entire candidate database against the position requirements. High-scoring candidates are listed with percentage fit and AI rationale.
6. **Sync Embedding**:
   When new resumes are imported in bulk, click **Sync Embedding** at the top of the orders page to refresh the semantic vector database.

### 3.5 Daily Operational Workflow
1. **Intake & Profiling**: Paste client requirements into the AI extractor, review specs, add confidential commission notes, and publish;
2. **AI Sourcing**: Open the drawer, click AI Smart Match, review top-matched candidates, and reach out;
3. **Pipeline Delivery**: Advance candidates across Screening, Interview, Offer, and Hired stages;
4. **Archival**: Upon reaching quota, switch the card status to "Filled".

### 3.6 Candidate Management Integration
* **Auto-Association**: When creating a candidate in `/candidates`, typing company or job keywords prompts an autocomplete list of active orders (`open` or `urgent`), ensuring standardized naming conventions.
* **Unassigned Audit**: Candidates displaying "Unspecified Company" can be filtered out for bulk assignment.

### 3.7 Permissions & One-Way Read-Only Protection
When viewing a partner team's data from Headquarters, the Orders page enters **One-Way Read-Only Mode**: a prominent gold badge `[One-Way Read-Only · Partner Data]` appears, and New, Edit, and Delete buttons are automatically hidden.

### 3.8 Frequently Asked Questions (FAQ)
* **Q: Why is AI Smart Matching returning empty or outdated candidates?**  
  *A: Click "Sync Embedding" at the top of the page to refresh the vector index with recent resumes.*
* **Q: Secret Notes displays "Encrypted content, enter vault password"?**  
  *A: The vault is locked in local browser memory. Enter your team vault master password to unlock.*
* **Q: Will modifying an order's salary range alter already linked candidates?**  
  *A: No. Historical candidate records remain unchanged. Future AI matches and suggestions will reflect the updated criteria.*

---

## 4. Candidate Lifecycle Management & Agile Kanban (Pipeline & Candidates)

### 4.1 Candidate Management Console

**Target Audience**: Recruitment Consultants, Team Leads, Account Managers, Agency Owners

#### Core Responsibilities & Tri-Module Distinction

| Module Page | Primary Responsibility | Data Scope | Typical Operations |
| :--- | :--- | :--- | :--- |
| **Candidate Records (`/candidates`)** | Central talent archive, bulk workflows, asset search | All candidates (Active + Eliminated) | Search, bulk client assignment, AI batch ingest, 360° drawer maintenance |
| **Agile Kanban (`/pipeline`)** | Daily delivery velocity, visual stage swimlanes | Active candidates in pipeline only | Drag-and-drop advancement, bottleneck monitoring |
| **Talent Pool (`/talent-pool`)** | Asset preservation, dormant candidate reactivation | Eliminated / dropped candidates only | Filter by elimination reasons, one-click reactivation into pipeline |

#### Interface Layout & Four Key Zones
1. **Header Zone**: Displays title, language toggle, theme switcher, notifications, and team selector.
2. **Search & Filter Toolbar**: Multi-keyword search box matching across 10+ fields, target company filter (with `⚠️ Unassigned Company` audit option), and stage filter.
3. **Action Bar**: AI Batch Resume Import button, Add Candidate button.
4. **Card-Grid Table & Global Floating FAB**: Displays candidate rows; the blue circular `+` button in the bottom right allows instant candidate creation from any scroll position.

#### Candidate Table Columns

| Column | Content & Details |
| :--- | :--- |
| **Checkbox** | Select candidates for bulk actions; header checkbox allows select/deselect all. |
| **Basic Information** | Gradient avatar, bold full name, phone number (with green WhatsApp direct-chat icon), education/school/location pills. |
| **Target Company / Job** | Blue highlighted client name (e.g., PSA, Santak), job title and department; flags "Unassigned Company" if unlinked. |
| **Current Stage** | Stage badge: Phone Screen (Blue), Interview (Orange), Offer (Purple), Onboarded (Green). Shows red "Eliminated · Reason" if dropped. |
| **Updated Time** | Formatted date or relative time ("Just now", "3 days ago"). |
| **Row Actions** | Red trash icon (delete with audit log) and arrow icon (open 360° drawer). |

#### Multi-Channel Ingestion Workflows
* **Workflow 1: AI Batch Resume Import (Recommended)**: Drag multiple Word (`.docx`/`.doc`), PDF, TXT, or scanned image resumes into the modal (up to 20MB per file). If named according to convention (e.g., `Client - Job - Candidate.docx`), the AI reverse-engineers company and position names with 100% precision. Review parsed cards side-by-side, then click "Save All to Talent Pool".
* **Workflow 2: Manual Entry with Order Association**: Click Add Candidate, type company or job keywords to select from active requisitions, fill basic details, and save.
* **Workflow 3: External Automation (Telegram & Google Sheets)**: Forward resumes to the team Telegram bot for instant background parsing, or edit connected Google Sheets rows to sync candidate details bi-directionally.

#### Bulk Client Assignment
Select candidates via checkboxes; a glassmorphic floating capsule appears at the bottom. Click **Batch Set Target Company**, type or select a client name, and confirm. All records update immediately with audit logging.

#### WhatsApp Direct Outreach
Click the green WhatsApp icon next to any phone number. The system normalizes phone numbers (adding country codes like `+60`) and opens WhatsApp Web/Desktop directly without saving contacts.

---

### 4.2 Agile Kanban Board Operations

**Target Audience**: Recruitment Consultants, Team Leads, Agency Owners

#### Five Active Swimlanes

| Order | Swimlane Name | Operational Definition | Accent Color |
| :---: | :--- | :--- | :---: |
| 1 | **Resume Screening (Screening)** | Newly ingested profiles awaiting initial review | Indigo (`#6366f1`) |
| 2 | **Phone Screen (Phone)** | CV passed; compensation and availability aligned | Blue (`#3b82f6`) |
| 3 | **Client Interview (Interview)** | Candidate attending 1st/2nd/Final round interviews | Orange (`#f59e0b`) |
| 4 | **Offer Extended (Offer)** | Client offer extended; compensation negotiation in progress | Purple (`#8b5cf6`) |
| 5 | **Successfully Placed (Onboarding)** | Candidate signed offer and onboarded; warranty period started | Green (`#10b981`) |

*Candidates marked as Eliminated do not occupy space on the Kanban board; they are archived into the Talent Pool.*

#### Drag-and-Drop Operations
1. Click and hold any card; the card floats with dynamic elevation shadow;
2. Drag to the target swimlane and release;
3. The system appends a timestamped stage transition to `stageHistory` and records an audit log (e.g., *"Kanban Drag: Phone Screen -> Client Interview"*);
4. To reverse an accidental drag, simply drag the card back; both transitions are preserved with audit timestamps.

---

### 4.3 360° Panoramic Candidate Profile Drawer
Clicking any candidate opens the comprehensive side drawer across 4 dedicated tabs:

1. **Profile & History (Profile)**:
   - **Embedded AI Auto-Fill**: Upload a new resume to re-extract and update fields on the fly;
   - **Core Demographics**: Full Name, WhatsApp, IC/Passport, Age, University, Major, Location, Nationality, Race, Gender, Marital Status, Availability, Languages;
   - **Target Requisition**: Client company, position title, expected salary, last drawn salary, PIC Recruiter, and current stage;
   - **Interview Schedule Card**: Populates interview date/time, attendance status (Present, No-Show, Rescheduled), location, and includes a **"📅 Sync to Google Calendar"** button;
   - **Sunrise Standard Work Experience**: Cards detailing company, position, salary, dates, responsibilities, and highlighted amber **"Reason for Leaving"** badges.
2. **Dossier & Remarks (Dossier)**:
   - **Deep Consultant Remarks**: Structured notes recording salary floor, interview feedback, and personality assessments;
   - **Resume Vault**: Upload, preview, and download original candidate CV files (Word/PDF).
3. **Lifecycle Timeline (Timeline)**:
   - Chronological log of creation date, stage movements, elimination notes, and reactivation timestamps.
4. **Follow-Up Reminders (Reminders)**:
   - Schedule future follow-up dates and times with Google Calendar sync and automated WhatsApp notifications.

---

### 4.4 Talent Pool & One-Click Reactivation

**Target Audience**: Recruitment Consultants, Team Leads, Account Managers, Agency Owners

#### Purpose & Value
Candidates are often eliminated not due to competence, but timing (salary mismatch with client budget, hiring quota filled, or candidate accepted another offer). The **Talent Pool (`/talent-pool`)** preserves these high-value assets for future requisitions.

#### 10 Standard Elimination Reasons & Recruiter Strategy

| Dimension | Standard Elimination Reason | Recruiter Strategy & Reactivation Timing |
| :--- | :--- | :--- |
| **Candidate** | **Accepted Another Offer** | Highly competitive profile. Re-contact after **3–6 months** during probation review to check satisfaction. |
| **Candidate** | **Salary Mismatch** | High-value professional. Priority reactivation when high-budget or urgent positions open. |
| **Candidate** | **Location Too Far** | Reactivate when requisitions open in nearby industrial parks or with company transport. |
| **Candidate** | **Working Hours Unacceptable** | Reactivate when regular 5-day office-hour positions become available. |
| **Candidate** | **Personal / Family Reasons** | Temporary pause. Re-contact after **3–6 months** with friendly check-in. |
| **Client** | **Quota Filled / Hiring Paused** | Prime ready-to-place talent. Immediately push when similar roles open with competitors! |
| **Client** | **Skill / Qualification Gap** | Retain for junior or alternative technical roles. |
| **Client** | **Interview Failed** | Review specific weaknesses in dossier notes; match with clients with different cultural preferences. |
| **Process** | **No Show / Unreachable** | Risk warning on commitment and reliability. Evaluate carefully before re-engagement. |
| **Other** | **Other Reasons (Custom)** | Non-standard situations; details recorded in text remarks for full-text search. |

#### One-Click Reactivation
1. In the Talent Pool, click the candidate row to open their 360° drawer;
2. In the pink banner at the top, click the emerald **Reactivate into Pipeline** button;
3. Status reverts to `active`, stage resets to `screening`, elimination tags are cleared, and the candidate reappears in the first Kanban swimlane with all historical notes and attachments intact.

---

## 5. AI Intelligence Suite

### 5.1 AI Job Description Generation & Anti-Poaching De-identification

**Target Audience**: Recruitment Consultants, Account Managers, Team Leads, Agency Owners

#### Purpose & Anti-Poaching Mechanism
Client requirements sent over WhatsApp or email often contain raw company names or street addresses. Direct sharing risks client circumvention. The **AI Job Parser (`/ai-parser`)** generates 4 standardized commercial formats in parallel with automatic brand de-identification.

#### Four Standard Versions

1. 🏢 **Internal Approval Version (Full English · Internal Approval)**:
   - Audience: Team Leads, Account Managers, Executive Management, Client HRBPs;
   - Content: Professional business management English detailing business drivers, OKR alignment, hiring budget, and unmasked salary baselines;
   - Warning: Contains real company name and true salary floor. Strictly for internal use!
2. 📢 **Public Release - Chinese (Facebook Job Groups & Social Media)**:
   - Audience: Candidates, Facebook recruitment groups (e.g., Johor Bahru, KL, Singapore job groups), RED Note (Xiaohongshu), WhatsApp/Telegram broadcasting channels;
   - Content: 7 core modules with company name masked (e.g., `[Leading Global Manufacturing MNC]`), standardized benefits, and high-engagement social copy with consultant WhatsApp direct link.
3. 🌐 **Public Release - English (English Job Boards & LinkedIn)**:
   - Audience: Multinational client managers, high-level English-speaking candidates, LinkedIn;
   - Content: 1:1 strict mirror of the 7 Chinese modules in standardized corporate English.
4. 🌏 **Public Release - Bahasa Melayu (Local Job Portals & Community Boards)**:
   - Audience: Malaysian local candidates, local hiring fairs, community boards;
   - Content: Standard Bahasa Melayu adhering to Malaysian Employment Act 1955 standards.

#### Post-Generation Verification Checklist
* **Check 1: Anti-Poaching Masking**: Confirm client name is masked. Generalize specific street addresses (e.g., "Jalan Senai 2") to industrial zone level ("Senai Industrial Estate, Johor") to prevent bypass;
* **Check 2: Legal Compliance**: Verify absence of discriminatory clauses (race, religion, gender, age, marital/pregnancy restrictions);
* **Check 3: Numerical Accuracy**: Check basic salary, OT multipliers, gross monthly estimates, and consultant WhatsApp contacts.

---

### 5.2 CV Parsing, Structured Verification & DOCX Export (CV Builder)

**Target Audience**: Recruitment Consultants, Delivery Specialists, Team Leads, Agency Owners

#### Key Capabilities
* **Full-Profile Extraction**: Ingests PDF, DOCX, DOC, TXT, and scanned image resumes. Extracts 20+ fields matching the Sunrise recruitment agency template schema within 5–10 seconds.
* **Anti-Hallucination Tagging**: Unspecified fields are tagged `[Not Specified]` with amber borders and warning badges;
* **Interactive Diagnostic Assistant**: Identifies missing critical fields and provides English outreach questions to ask candidates during phone screening;
* **Dual Deliverables**:
  - **Export Standardized Word CV (`.docx`)**: Generates formatted, client-ready presentation resumes with empty tables automatically stripped.
  - **Commit to Talent Database**: Ingests the profile directly into `/candidates` and the Kanban Screening swimlane.

---

## 6. Interview Scheduling & Calendar Management (Calendar)

> **Target Audience**: Recruitment Consultants (Recruiter), Team Leads (Manager), Agency Owners (Owner)  
> **Location**: Left Navigation ➔ **Interview Calendar (`/calendar`)**

### 6.1 Module Positioning & Quad-Ecosystem Integration
The **Interview Calendar** centralizes all scheduled candidate interviews across the team and individual consultants. It enables consultants and managers to assess interview density, track candidate attendance, and directly launch profile drawers to log interview evaluations.

* **Candidate Profile Drawer**: Setting interview dates in the drawer updates the calendar in real-time;
* **Workspace Dashboard (Overview)**: The home overview widget features upcoming interviews for immediate visibility;
* **Global Notification Center**: Pushes automated high-priority alerts for today's and tomorrow's scheduled sessions;
* **Google Calendar Ecosystem**: One-click event creation for mobile calendar alerts and calendar invites.

### 6.2 Overall Page Layout & Dual-Panel Synergy
The page employs a dual-panel split layout:
* **Left Panel: Month Grid**: 42-cell visual calendar displaying interview density and attendance status color tags;
* **Right Panel: Agenda List**: Detailed cards detailing candidate, company, position, venue, PIC recruiter, and action buttons;
* **Top Control Bar**: Month navigator, "Today" button, Global vs Personal perspective toggle, and PIC consultant dropdown filter.

### 6.3 Month Grid, Badges & Attendance Status Matrix
The monthly grid follows the standard Monday-to-Sunday format with 6 fixed rows (42 cells):
* **Today Highlight**: Luminous blue ring;
* **Selected Date**: Highlighted blue border and tinted background;
* **Count Badge**: Number in upper right showing total scheduled interviews on that date;
* **Mini Pill Tags**: Displays up to 3 interviews per cell (`[Time] [Candidate Name]`) with a `+N more` expander for busy days.

#### Attendance Status Color Semantics

| Indicator | Status Name | Operational Meaning | Recommended Action |
| :---: | :--- | :--- | :--- |
| 🟢 | **Present (已到场)** | Candidate arrived and completed interview | Open drawer, record interview feedback, advance to Offer or mark Eliminated |
| 🔵 | **Pending Attendance (待出席)** | Scheduled interview awaiting fulfillment | Send WhatsApp interview reminder 1 day prior; confirm transportation |
| 🟡 | **Rescheduled / Excused (改期请假)** | Candidate requested postponement with notice | Coordinate new date with client and update calendar schedule |
| 🔴 | **No Show / Unreachable (面试爽约/失联)** | Candidate failed to attend without notice | Mark eliminated with "No Show" tag; risk warning noted on profile |

### 6.4 Right Agenda Panel (Selected Day vs All Scheduled)
* **"Selected Day" Tab**: Displays interviews for the date clicked on the grid, sorted chronologically from morning to evening;
* **"All Scheduled" Tab**: Chronological master agenda of all upcoming and past interviews;
* **Card Actions**: Click the card body to jump to the date and open the candidate's 360° drawer; click "Add to Google Calendar" to launch an external calendar event.

### 6.5 Global vs Personal View Modes with Auto-Match

| Perspective Mode | Target Audience | Core Value & Logic |
| :--- | :--- | :--- |
| **👑 Global Mode** | Team Managers, Agency Owners | Displays all interviews across all consultants for managerial capacity planning |
| **💼 Personal Mode** | Frontline Recruiters | Filters strictly to candidates where PIC equals the current logged-in user |

* **Automatic PIC Matching**: Switching to Personal Mode automatically matches the consultant's Google account name or corporate email prefix against candidate PIC records;
* **Browser Persistence**: Your perspective mode and consultant selection are preserved in browser `localStorage`.

### 6.6 Ingestion Channels & Date/Time Tolerances
Interviews are ingested via 3 primary channels:
1. **Candidate Profile Drawer**: Fill date, time, location, and attendance status in the "Interview Schedule" section;
2. **Google Sheets / Excel Import**: Populate the "Interview Date" column during spreadsheet import;
3. **AI Parsing**: Paste client interview emails or chat notes to automatically extract interview timestamps.

#### Tolerant Regex Parsing Engine
* **Dates**: `2026-08-18`, `2026/08/18`, `18/8/2026`, `18-08-2026`, `18.8.2026`; dates without years (`18/8`) default to the current calendar year;
* **Times**: `10am`, `2:30pm`, `at 3:00pm`, and 24-hour formats (`14:30`, `09:00`);
* **Noise Filter**: Extraneous day-of-week strings (`Mon`, `Friday`, `周五`) are cleaned automatically.

### 6.7 Empty Month Auto-Jump Navigation
If the current calendar month contains zero interviews, the calendar automatically navigates (**Auto-Jump**) to the earliest month containing scheduled interviews, displaying a blue notification banner with cross-month shortcuts.

### 6.8 One-Click Google Calendar Synchronization
Clicking **Add to Google Calendar** launches a pre-filled 60-minute Google Calendar event:
* **Title**: `Interview: [Candidate Name] - [Job Title] ([Client Company])`;
* **Duration**: 60 minutes default;
* **Location**: Pre-filled with physical interview venue, factory address, or virtual meeting link;
* **Description**: Includes candidate phone, email, current salary, expected salary, PIC consultant, and interview notes.

> ⚠️ **Privacy Notice**: Check and sanitize candidate personal details if sharing or inviting external non-cleared parties to the calendar event.

### 6.9 Dashboard & Global Notification Center Synergy
* **Workspace Dashboard**: Home overview card displays upcoming interviews for today and tomorrow;
* **Notification Bell**:
  - 🔴 **Urgent (Today)**: Pushes high-priority red alert: *"Interview for [Candidate] is scheduled today at HH:mm."*
  - 🟡 **Warning (Tomorrow)**: Pushes yellow warning notification to prepare candidate interview reminders.

### 6.10 Recommended Daily Best Practices & Calendar FAQ
1. **Morning Routine**: Check the notification bell and dashboard upcoming interviews; open the calendar's "Selected Day" tab;
2. **Instant Sync**: When booking an interview, click "Add to Google Calendar" and notify the candidate via WhatsApp;
3. **Feedback Loop**: Within 30 minutes of interview completion, open the drawer, update attendance status, and log remarks;
4. **Weekly Review**: Managers switch to Global Mode during Monday meetings to assess weekly pipeline throughput.

---

## 7. n8n Automation & Ecosystem Integration

> **Target Audience**: System Administrators, DevOps Engineers, Frontline Recruiters  
> **Core Paths**: `n8n/`, `ai_backend/services/telegram_service.py`, `ai_backend/main.py`

### 7.1 Module Positioning & Strategic Value
Traditional candidate profiling requires manual resume uploads. **n8n Automation & Ecosystem Integration** provides a 24/7 automated ingestion hub:
* **Telegram Rapid Ingestion**: Forward resume files, photos, or raw text directly in Telegram; AI parses profiles into the database within seconds;
* **Google Sheets Real-Time Sync**: External partners updating Google Sheets trigger real-time non-destructive cloud synchronization;
* **Extensible Ecosystem**: Standard file ingestion API connects Gmail attachments, Google Drive, and workplace bots.

### 7.2 Dual-Engine Decoupled Architecture

| Layer | Port | Primary Responsibility |
| :--- | :---: | :--- |
| **n8n Visual Orchestration Engine** | `:5678` | Listens to external webhooks, filters chatter, triggers retries, visual execution logs |
| **FastAPI AI Microservice** | `:8000` | Heavy algorithm core: document parsing, OCR, LLM extraction, phone deduplication, Firestore writes |

External triggers (Telegram message or Sheets edit) ➔ n8n filter & relay ➔ AI microservice parsing ➔ Live in TALENT FLOW web app.

### 7.3 Workflow 1: Telegram Bot Rapid Ingestion
1. **Admin Setup**: Create bot with `@BotFather` (`TELEGRAM_BOT_TOKEN`), disable privacy mode via `/setprivacy -> Disable`, add bot to recruitment Telegram groups, configure `TELEGRAM_ALLOWED_CHATS` in `ai_backend/.env`, and import `n8n/talentflow_telegram_workflow.json`;
2. **Consultant Operation**: Forward PDF/DOCX resumes, send photos of printed CVs/name cards, or paste raw text (minimum 80 characters to bypass casual chatter filter);
3. **Automated Processing**: Profiles are extracted into the Sunrise schema, deduplicated by phone/email, and committed to Firestore in the Screening stage with `source: 'Telegram'`;
4. **Silent Mode**: `TELEGRAM_SILENT_MODE=true` ensures the bot listens silently without posting intrusive confirmation messages in busy chat groups.

### 7.4 Workflow 2: Google Sheets Real-Time Sync
Because free ngrok tunnels offer 1 public domain (assigned to n8n `:5678`), the system leverages n8n as a webhook relay:
1. **Apps Script Webhook**: Configure `backendUrl = 'https://[your-ngrok-domain]/webhook/sheets-sync'` in the sheet's Apps Script;
2. **Instant Receipt**: n8n responds with HTTP 200 within 200ms to eliminate spreadsheet UI lag;
3. **Non-Destructive Ingestion (`merge=True`)**: Updates candidate contact details without overwriting recruiter notes, interview schedules, or advanced pipeline stages.

### 7.5 Binary File Ingestion API
The FastAPI microservice exposes a standardized binary intake endpoint:
* **Endpoint**: `POST http://host.docker.internal:8000/api/candidates/ingest-file`
* **Content-Type**: `multipart/form-data`
* **Parameters**: `file` (Binary), `teamId` (String, optional), `senderName` (String, optional).

### 7.6 Environment Variables Reference (`ai_backend/.env`)
* `TELEGRAM_BOT_TOKEN`: API key generated by `@BotFather`;
* `TELEGRAM_ENABLE_POLLING`: `false` (n8n manages webhooks);
* `TELEGRAM_SILENT_MODE`: `true` (silent background ingestion);
* `TELEGRAM_ALLOWED_CHATS`: Whitelisted group chat IDs.

### 7.7 Post-Deployment Verification Checklist
1. Verify n8n (`:5678`) and AI backend (`:8000`) are active and ngrok tunnel is healthy;
2. Confirm both workflows in n8n are set to **Active**;
3. Send a test resume PDF in Telegram; verify execution success in n8n Executions log;
4. Confirm candidate appears in `/candidates` with source tagged `Telegram`;
5. Edit a salary figure in Google Sheets; confirm Firestore profile updates without stage reset.

### 7.8 Production Security & Stability Guidelines
* **Public Tunnel Persistence**: In local dev with ngrok, re-linking is required if ngrok restarts. For 24/7 production, deploy to cloud servers with static domains;
* **Group ID Whitelisting**: Strictly populate `TELEGRAM_ALLOWED_CHATS` to prevent random group files from polluting the database;
* **Privacy Compliance**: Restrict recruitment groups to authorized consultants.

### 7.9 Automation Troubleshooting FAQ
* **Q: Resumes sent to Telegram group do not appear in the database?**  
  *A: Check that text exceeds 80 characters, bot privacy mode is disabled via `/setprivacy -> Disable`, group ID is whitelisted, and n8n workflow is Active.*
* **Q: What happens if the same candidate is submitted multiple times?**  
  *A: Deduplication matches phone/email and merges data, appending timeline notes without duplicating records.*
* **Q: Why does the bot remain silent after receiving a resume?**  
  *A: Silent mode is active by default to prevent group noise. Refresh the web app to view the new profile.*

---

## 8. Team Collaboration & Partner Penetration (Team & RBAC)

> **Target Audience**: Agency Owners (Owner), Team Leads (Manager), Recruitment Consultants (Recruiter)  
> **Location**: Left Navigation ➔ **Team Collaboration (`/team`)**

### 8.1 Module Architecture & Authority Hierarchy
In executive recruitment and workforce agencies, candidate resumes, compensation notes, and fee agreements constitute core commercial secrets. TALENT FLOW establishes a multi-tenant isolation and authority matrix:
* **Strict Sandboxing Barrier**: New registrations cannot view data until approved by an administrator;
* **Three-Tier Role Hierarchy**: Clear separation of duties across Owner, Manager, and Recruiter;
* **HQ Partner One-Way Penetration**: Headquarters can inspect partner branch delivery without exposing HQ records to partners.

### 8.2 Three-Tier RBAC Permission Matrix

| Capability / Action | Owner (所有者) | Manager (主管) | Recruiter (顾问) |
| :--- | :---: | :---: | :---: |
| Approve / Reject Pending Users | Yes | Yes | No |
| Change Member Roles & Transfer Teams | Yes | No | No |
| Remove Members from Team | Yes | No | No |
| Create / Unlink Partner Teams | Yes | No | No |
| View All Headquarters Orders & Candidates | Yes | Yes | Assigned Only |
| One-Way Partner Penetration Inspection | Yes (Read-Only) | Yes (Read-Only) | No |
| Create / Edit Candidates & Orders | Yes | Yes | Yes |
| Delete / Soft-Archive Audit Logs | Yes | No | No |

*Note: Audit logs are protected by immutable security rules; physical deletion is prohibited for all roles including Owner.*

### 8.3 New Member Onboarding Approval Flow
1. **Pending Alert**: New registrations enter `pending` state; Owners/Managers see an amber **Pending Approvals** card;
2. **Team Allocation**: Select whether to assign the member to "Headquarters (Default)" or a specific "Partner Team";
3. **Approve / Reject**: Clicking Approve activates the user as a `Recruiter`; clicking Reject removes the request.

### 8.4 Existing Member Management & Cross-Team Transfer
Owners can click Edit on any member card in `/team`:
* **Display Name**: Update consultant name or internal alias;
* **Team Branch**: Reassign members between Headquarters and Partner teams (redirecting real-time Firestore security scopes);
* **Role Privileges**: Adjust between Owner, Manager, and Recruiter.

### 8.5 HQ Partner One-Way Penetration Mechanism
To oversee branch offices, franchises, and regional partners:
1. **Create Partner Link (Owner Only)**: Click "Create & Link Partner Team", name the partner (e.g., `Sunrise Group (Johor)`), and confirm;
2. **HQ One-Way Inspection**: Headquarters users click the top-right team switcher to view partner candidates and orders;
3. **Gold Badge & Mutation Freezing**: A prominent gold `[One-Way Read-Only]` badge appears; Add, Upload, and Quick FAB buttons are destroyed; Firestore rules reject write requests;
4. **Partner Blind Spot**: Partner members have no team switcher and cannot see Headquarters data.

### 8.6 Troubleshooting & FAQ
* **Q: Why does a new colleague see "Awaiting Administrator Approval"?**  
  *A: Standard security barrier. Have an Owner/Manager approve them under "Pending Approvals" in `/team`.*
* **Q: Why are "Add Candidate" buttons missing when viewing a partner team?**  
  *A: One-Way Read-Only protection. Switch back to "Headquarters" in the top bar to create records.*
* **Q: Can consultants be transferred between Headquarters and Partners?**  
  *A: Yes. An Owner can edit the member's profile and switch their assigned team dropdown.*
* **Q: Will unlinking a partner team delete their candidates?**  
  *A: No. Unlinking only dissolves the one-way inspection channel; partner data remains completely intact.*

---

## 9. System Settings & Data Security (Settings)

> **Target Audience**: Agency Owners (Owner), Team Leads (Manager), Recruitment Consultants (Recruiter)  
> **Location**: Left Navigation ➔ **System Settings (`/settings`)**

### 9.1 Strategic Value & Module Purpose
The Settings module governs historical data migration, external spreadsheet imports, cryptographic vaults, and personal notification preferences.

### 9.2 Local JSON Migration (Disaster Recovery Cloud Ingestion)
Designed for teams migrating from the Electron desktop standalone version or restoring offline disaster backups:
1. **Owner Authority**: Restricted strictly to Owner roles with prototype pollution cleansing (`Object.create(null)`);
2. **UUID Re-Generation**: Because `FirestoreStore.addCandidate` generates a fresh UUID for every record, importing the same JSON backup repeatedly will duplicate records;
3. **Usage Policy**: Use JSON migration solely for initial onboarding or catastrophic disaster recovery. Use Google Sheets or AI Parsing for daily incremental additions.

### 9.3 Google Sheets Import & AI Data Cleaning Pipeline
Available to all team members (Owner, Manager, Recruiter):
* **Dual Ingestion Modes**: Public CSV URL or Private Google OAuth;
* **14 Auto-Inferred + 15 Selectable Mappings**: Automatically aligns standard columns including name, phone, email, university, company, and salary;
* **AI Smart Cleaning Pipeline**: Pre-deduplicates against Firestore cloud records (saving API tokens), batches rows concurrently, matches recruiter names fuzzily, and presents an interactive Diff Review table before committing.

### 9.4 Confidential Data Vault (Zero-Knowledge E2EE)
Protects client commission rates, gross margins, and sensitive billing notes:
* **Mathematical Zero-Knowledge**: PBKDF2-SHA-256 (100,000 iterations) + AES-GCM-256;
* **Ciphertext Signature**: Standardized system prefix `TLFL_E2EE_V1:`;
* **Team Shared Passphrase**: Because symmetric encryption is employed, all team members accessing confidential notes must share the same vault password;
* **Non-Recoverable**: The server never stores your password. If lost, encrypted notes cannot be decrypted by developers.

### 9.5 WhatsApp Personal Notification & Dynamic Templates
* **Personal Phone Binding**: Consultants bind their personal WhatsApp mobile number;
* **Dynamic 3-Slot Templates**: Customize follow-up reminders with placeholders `{name}`, `{job}`, and `{date}`.

### 9.6 Recommended Setup Sequence for New Teams
1. Step 1: Initialize Vault Master Password in **Settings**;
2. Step 2: Bind personal WhatsApp phone number;
3. Step 3: Perform initial Google Sheets or historical JSON migration;
4. Step 4: Approve incoming team members in **Team Collaboration**.

### 9.7 Settings Troubleshooting FAQ
* **Q: Why do confidential notes show locked after logging in from a new laptop?**  
  *A: The vault key is held strictly in local browser memory. Simply re-enter your vault password in Settings.*
* **Q: What if I forget the vault password?**  
  *A: Have a colleague with an unlocked session export/backup the plaintext notes, then establish a new vault password.*

---

## 10. Frequently Asked Questions & Troubleshooting (FAQ)

### 10.1 Accounts, Login & Team Permissions

* **Q1: A new member logged in and sees "Pending Approval (pending)" with no data access. What should we do?**  
  * **Root Cause**: This is the system's commercial security barrier. New accounts are unprivileged by default.
  * **Solution**: Have a team `Owner` or `Manager` log in, navigate to **Team Collaboration (`/team`)**, locate the user under **Pending Approvals**, assign their team, and click **Approve** to activate them as a `Recruiter`.

* **Q2: When switching into a Partner Team, why are "Add Candidate" and "Post Order" buttons hidden?**  
  * **Root Cause**: HQ partner inspection is governed by One-Way Read-Only Protection (indicated by the gold `[One-Way Read-Only]` badge). To safeguard partner data and prevent accidental mutations, all write actions and the bottom-right floating FAB are automatically destroyed.
  * **Solution**: To create records for your own organization, switch back to **Headquarters (Own Data)** in the top bar.

* **Q3: When a consultant resigns or transfers branches, how should their account and candidates be handled?**  
  * **Solution**: An Owner can click Edit on the member card in `/team` to reassign them to another branch, or click the trash icon to remove them from the team.
  * **Asset Protection**: When removed, all candidates and orders previously created by the consultant remain intact within the shared team repository. The manager can bulk-reassign them to another active recruiter.

---

### 10.2 Candidate Progression, Kanban & Talent Pool

* **Q4: When dragging a candidate card on the Kanban board, why does it immediately snap back?**  
  * **Diagnostics**:
    1. **Check Read-Only Mode**: Ensure you are not viewing a partner team in read-only mode, where drag-and-drop is locked;
    2. **Check Network Connectivity**: Kanban moves write directly to Firestore and record immutable audit logs. Network disconnects will trigger an error toast and revert the card.

* **Q5: A candidate was eliminated and disappeared from the main list and Kanban. How can they be reactivated?**  
  * **Mechanism**: Elimination archives the record rather than deleting it.
  * **Reactivation Steps**:
    1. Click the left menu and open **Talent Pool (`/talent-pool`)**;
    2. Search by keyword or filter by elimination reason (e.g., "Salary Mismatch", "Accepted Other Offer");
    3. Click the candidate card to open their 360° Profile Drawer;
    4. In the pink elimination banner at the top, click the emerald **Reactivate into Pipeline** button;
    5. The candidate is immediately restored to active status in the *Screening* stage.

* **Q6: What is the permanent blue "+" floating button (Global Quick FAB) in the bottom-right corner?**  
  * **Feature**: A persistent shortcut to quickly create candidates or post job orders from any screen, regardless of scroll depth. In read-only partner mode, this button is automatically destroyed.

---

### 10.3 AI Suite & CV Parsing

* **Q7: AI Job Description generation or CV parsing reports "Connection Timeout" or "Parsing Failed"?**  
  * **Diagnostics**:
    1. Verify the Python AI microservice (port `8000`) is running. Test `http://localhost:8000/docs` in your browser;
    2. Check that `OPENROUTER_API_KEY` in `ai_backend/.env` is valid and has sufficient credit;
    3. LLM providers experience occasional network jitter. The system has built-in retry and timeout fallbacks; re-click after 3–5 seconds.

* **Q8: Why does the AI JD generator automatically replace the client company name with a generic industry title?**  
  * **Mechanism**: This is the core anti-poaching mechanism. The 3 public versions (Facebook Job Groups / Social Media, RED Note, English Job Board) mask client brands into generic descriptions (e.g., `[Leading Global Semiconductor MNC]`) to prevent candidates from bypassing consultants. Only the full English Internal Approval version retains the real company name and unmasked salary baseline.

---

### 10.4 Scheduling & Ecosystem Automation

* **Q9: Why does a scheduled candidate not appear on the monthly Interview Calendar?**  
  * **Diagnostics**:
    1. Verify an explicit `interviewDate` is populated in the candidate drawer (candidates without scheduled dates reside in the pending list rather than calendar cells);
    2. Check the consultant filter in the top bar to ensure you are not filtered to a different recruiter;
    3. Check the calendar month. If the current month has no interviews, the calendar automatically jumps to the earliest month with scheduled sessions.

* **Q10: Resumes were sent in the Telegram group, but they never appeared in the Talent Pool?**  
  * **Diagnostics**:
    1. For text resumes, ensure the message exceeds 80 characters (anti-chatter filter);
    2. Verify the bot's privacy mode is disabled (`/setprivacy -> Disable` in `@BotFather`);
    3. Verify the Telegram group chat ID is included in `TELEGRAM_ALLOWED_CHATS`;
    4. Confirm both the n8n instance (`:5678`) and AI microservice (`:8000`) are active.

---

### 10.5 Trade Secrets & Data Security

* **Q11: After logging in from a new laptop, why do confidential notes appear encrypted and locked?**  
  * **Mechanism**: Standard Zero-Knowledge E2EE behavior. The vault password is only cached in local browser memory and never uploaded to Firestore.
  * **Solution**: Simply navigate to **Settings**, re-enter your Vault Master Password, and save to unlock all notes instantly.

* **Q12: What if I forget the Confidential Vault master password?**  
  * **Security Principle**: High-strength encryption (PBKDF2 + AES-GCM-256) is mathematically irreversible.
  * **Emergency Recovery**: Contact a colleague or Owner who still has an unlocked session, copy/backup the plaintext notes from their screen, and then reset a new master password for the team.

* **Q13: Why does re-importing the same JSON backup file duplicate candidate counts?**  
  * **Mechanism**: The JSON migration pipeline is designed for disaster recovery and assigns a fresh UUID to every record to prevent overwriting active histories.
  * **Best Practice**: Never re-import the same JSON backup. For incremental additions, use Google Sheets Import or AI CV Parsing which include pre-deduplication checks.

---

🎉 **Wishing you and your team peak recruitment productivity with TALENT FLOW!**  
For technical support or feature requests, please reach out to your system administrator or technical support team.
