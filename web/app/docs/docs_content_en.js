import React from 'react';

export const sectionsEn = [
  {
    id: 'overview',
    title: '1. Quick Start & Dashboard (Overview)',
    badge: 'Fundamentals',
    icon: 'ph-compass',
    tag: 'Core',
    summary: 'Master system architecture, login authorization, KPI metric cards, and global navigation layout.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-info"></i> Decoupled Enterprise Architecture:</strong>
          <span>TALENT FLOW 2.0 adopts a modern decoupled architecture: Next.js 14 responsive frontend, Google Firebase Auth + Firestore real-time cloud database, Python FastAPI AI microservice (:8000), and n8n visual automation engine (:5678).</span>
        </div>

        <h4>1. Authentication & Team Sandboxing Protocol</h4>
        <p>
          To protect enterprise recruitment assets (client registries, base salary margins, candidate contact information), newly registered accounts undergo strict security gating:
        </p>
        <ul className="doc-feature-list">
          <li><strong>Google SSO or Corporate Email Sign-In</strong>: Use your corporate Google Workspace email or email/password credentials to log in.</li>
          <li><strong>Pending Approval Sandbox (<code>role: 'pending'</code>)</strong>: New accounts are placed in an isolated holding sandbox with zero read access to production client or candidate records.</li>
          <li><strong>Administrator Approval Flow</strong>: Team <code>Owner</code> or <code>Manager</code> administrators access <strong>Team Collaboration (<code>/team</code>)</strong>, locate the applicant under "Pending Approvals", select their destination team (Headquarters or Partner Branch), and click <strong>Approve</strong> while assigning their role (such as <code>Recruiter</code>).</li>
          <li><strong>Instant Activation</strong>: Once approved, the member refreshes their browser to immediately unlock live recruitment delivery boards.</li>
        </ul>

        <h4>2. Workspace Dashboard Metrics (KPIs)</h4>
        <p>
          The workspace overview (<code>/overview</code>) serves as the consultant's daily command cockpit:
        </p>
        <div style={{ overflowX: 'auto', margin: '14px 0 20px 0' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>KPI Metric Card</th>
                <th>Underlying Calculation</th>
                <th>Strategic Delivery Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Total Talent Pool</strong></td>
                <td>Count of all non-deleted candidate records</td>
                <td>Reflects overall talent asset accumulation across all team members</td>
              </tr>
              <tr>
                <td><strong>Candidates in Pipeline</strong></td>
                <td>Active candidates in Screening, Interview, or Offer</td>
                <td>Measures active delivery pipeline velocity and immediate consultant workload</td>
              </tr>
              <tr>
                <td><strong>Upcoming Interviews</strong></td>
                <td>Scheduled interviews for today and next 7 days</td>
                <td>Prioritizes near-term interview attendance and client follow-up calls</td>
              </tr>
              <tr>
                <td><strong>Placement Success Rate</strong></td>
                <td>Total Onboarded / Total Candidates Completed</td>
                <td>Measures end-to-end recruitment conversion efficiency and quality of hire</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4>3. Stage Distribution & Priority Alerts</h4>
        <p>
          The dashboard visualizes candidate distribution across all 7 pipeline stages, highlighting upcoming interviews with direct navigation to the calendar.
        </p>

        <h4>4. Multilingual & Theme Personalization</h4>
        <p>
          Click the Sun/Moon icon in the upper-right corner of the top navbar to toggle between Midnight Obsidian Dark Mode and Crisp Light Mode. Click the <code>EN</code> / <code>中</code> button to switch between English and Simplified Chinese across the entire system.
        </p>
      </div>
    )
  },
  {
    id: 'orders',
    title: '2. Enterprise Job Orders (Job Orders)',
    badge: 'Demand Mgmt',
    icon: 'ph-briefcase',
    tag: 'Requisitions',
    summary: 'Manage client hiring specifications, multi-token smart search, candidate pitch scripts, and E2EE confidential notes.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-shield-check"></i> Enterprise Requisition Console:</strong>
          <span>Manage client job descriptions, fee structures, warranty terms, and candidate matching status in a unified repository.</span>
        </div>

        <h4>1. Five Standard Requisition Statuses</h4>
        <div style={{ overflowX: 'auto', margin: '14px 0 20px 0' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Status Name</th>
                <th>Code</th>
                <th>Operational Meaning</th>
                <th>Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>Open (进行中)</strong></td><td><code>open</code></td><td>Active delivery</td><td>Standard open requisition undergoing sourcing</td></tr>
              <tr><td><strong>Urgent (急聘)</strong></td><td><code>urgent</code></td><td>High priority</td><td>Client facing acute shortage; prioritizes candidate matching</td></tr>
              <tr><td><strong>Paused (暂停)</strong></td><td><code>paused</code></td><td>Temporarily frozen</td><td>Client freezing headcount or restructuring budgets</td></tr>
              <tr><td><strong>Filled (满额)</strong></td><td><code>filled</code></td><td>Quota achieved</td><td>Candidates successfully onboarded; quota satisfied</td></tr>
              <tr><td><strong>Closed (已关闭)</strong></td><td><code>closed</code></td><td>Terminated</td><td>Contract completed, cancelled, or expired</td></tr>
            </tbody>
          </table>
        </div>

        <h4>2. Space-Separated Multi-Token Smart Search</h4>
        <p>
          The search bar implements real-time space-separated multi-token search. For example, typing <code>Semiconductor Senior Penang</code> splits each keyword and matches across company name, job title, location, specifications, and decrypted secret notes. <strong>Only requisitions matching all tokens simultaneously are displayed</strong>.
        </p>

        <h4>3. One-Click Candidate Pitch Generation</h4>
        <p>
          Inside any requisition detail drawer, click <strong>Generate Candidate Pitch</strong> to produce an enticing, structured job pitch highlighting key selling points and compensation structure, ready to copy into WhatsApp or email outreach.
        </p>

        <h4>4. End-to-End Encrypted (E2EE) Confidential Notes</h4>
        <p>
          Record sensitive client markups, fee percentages, payment cycles, and client hiring quirks strictly in <strong>Secret Notes (私密笔记)</strong>:
        </p>
        <ul className="doc-feature-list">
          <li><strong>Client-Side Encryption</strong>: Notes are encrypted directly in the browser using Web Crypto API (<code>PBKDF2-SHA-256</code> with 100,000 iterations + <code>AES-GCM-256</code>).</li>
          <li><strong>Ciphertext Signature</strong>: Cloud Firestore stores only ciphertext beginning with the standard signature <code>TLFL_E2EE_V1:</code>.</li>
          <li><strong>Zero-Knowledge Vault</strong>: Neither the database operator nor system developers possess your master key. Unlocking requires entering your team vault master password in <strong>Settings</strong>.</li>
        </ul>

        <h4>5. AI Semantic Matching & Vector Embeddings</h4>
        <p>
          Open an order's drawer and click <strong>AI Smart Match</strong>. The system calculates semantic vector similarity between job specifications and all candidate CVs in the database, ranking profiles with percentage fit and AI rationale. Click <strong>Sync Embedding</strong> at the top of the page to refresh the vector index with newly imported resumes.
        </p>
      </div>
    )
  },
  {
    id: 'candidates',
    title: '3. Candidate Panoramic Profiles & Talent Pool',
    badge: 'Talent Asset',
    icon: 'ph-users',
    tag: 'Candidates',
    summary: 'Candidate master database, 360° profile drawer, multi-channel ingestion, WhatsApp direct outreach, and talent pool reactivation.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-user-circle"></i> Tri-Module Candidate Positioning:</strong>
          <span>Understand the distinct responsibilities across Candidate Records, Agile Kanban, and the Talent Pool.</span>
        </div>

        <h4>1. Tri-Module Responsibility Matrix</h4>
        <div style={{ overflowX: 'auto', margin: '14px 0 20px 0' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Module Page</th>
                <th>Core Responsibility</th>
                <th>Scope of Data</th>
                <th>Typical Operations</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Candidate Records (<code>/candidates</code>)</strong></td>
                <td>Master archive, bulk operations, search hub</td>
                <td>All candidates (Active + Eliminated)</td>
                <td>Full search, bulk company assignment, AI batch ingest, 360° drawer maintenance</td>
              </tr>
              <tr>
                <td><strong>Agile Kanban (<code>/pipeline</code>)</strong></td>
                <td>Daily delivery velocity, visual swimlanes</td>
                <td>Active candidates in pipeline only</td>
                <td>Drag-and-drop advancement, bottleneck monitoring</td>
              </tr>
              <tr>
                <td><strong>Talent Pool (<code>/talent-pool</code>)</strong></td>
                <td>Asset preservation, talent reactivation</td>
                <td>Eliminated / dropped candidates only</td>
                <td>Filter by elimination reasons, one-click reactivation into pipeline</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4>2. Multi-Channel Ingestion Workflows</h4>
        <ul className="doc-feature-list">
          <li><strong>AI Batch Resume Ingestion (Recommended)</strong>: Drag multiple Word (<code>.docx</code>), PDF, TXT, or image resumes into the modal. If named by convention (<code>Company - Job - Candidate.docx</code>), company and job titles are reverse-engineered automatically. Review cards side-by-side, then click "Save All to Talent Pool".</li>
          <li><strong>Manual Entry with Order Linkage</strong>: Click Add Candidate (or the bottom-right blue <code>+</code> Global FAB); typing company or position keywords prompts active order suggestions.</li>
          <li><strong>External Automations (Telegram & Google Sheets)</strong>: Forward resumes to the Telegram bot or edit connected Google Sheets rows to sync candidate details in real time.</li>
        </ul>

        <h4>3. 360° Panoramic Profile Drawer</h4>
        <p>
          Clicking any candidate opens the side drawer without leaving the current view:
        </p>
        <ul className="doc-feature-list">
          <li><strong>Profile & History</strong>: Core demographics, target order linkage, embedded AI extraction, interview card with Google Calendar sync, and Sunrise standard work history with amber "Reason for Leaving" badges.</li>
          <li><strong>Dossier & Remarks</strong>: Deep consultant notes (salary floor, personality, interview feedback) and resume vault for downloading original files.</li>
          <li><strong>Lifecycle Timeline</strong>: Chronological log of creation, stage advancements, elimination notes, and reactivation timestamps.</li>
          <li><strong>Follow-Up Reminders</strong>: Schedule future follow-ups with Google Calendar sync and automated WhatsApp notifications.</li>
        </ul>

        <h4>4. Bulk Assignment & WhatsApp Direct Outreach</h4>
        <p>
          Select multiple candidates via checkboxes to reveal the glassmorphic floating action bar for bulk company reassignment. Click the green WhatsApp icon next to any phone number to launch WhatsApp Web/Desktop directly with auto-normalized country codes (e.g., <code>+60</code>), eliminating the need to save contacts.
        </p>
      </div>
    )
  },
  {
    id: 'pipeline',
    title: '4. Recruitment Pipeline & Agile Kanban',
    badge: 'Delivery Hub',
    icon: 'ph-kanban',
    tag: 'Pipeline',
    summary: '5 active agile swimlanes, drag-and-drop flow, consultant filtering, and immutable stage transition audit logs.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-cards"></i> Agile Visual Delivery:</strong>
          <span>Manage recruitment delivery velocity across clear operational stages with real-time cloud synchronization.</span>
        </div>

        <h4>1. Five Active Pipeline Swimlanes</h4>
        <div style={{ overflowX: 'auto', margin: '14px 0 20px 0' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Swimlane Name</th>
                <th>Operational Definition</th>
                <th>Accent Color</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1</td><td><strong>Resume Screening (Screening)</strong></td><td>Newly ingested profiles awaiting initial review</td><td>Indigo (<code>#6366f1</code>)</td></tr>
              <tr><td>2</td><td><strong>Phone Screen (Phone)</strong></td><td>CV passed; compensation and availability aligned</td><td>Blue (<code>#3b82f6</code>)</td></tr>
              <tr><td>3</td><td><strong>Client Interview (Interview)</strong></td><td>Candidate attending 1st/2nd/Final round interviews</td><td>Orange (<code>#f59e0b</code>)</td></tr>
              <tr><td>4</td><td><strong>Offer Extended (Offer)</strong></td><td>Client offer extended; compensation negotiation</td><td>Purple (<code>#8b5cf6</code>)</td></tr>
              <tr><td>5</td><td><strong>Successfully Placed (Onboarding)</strong></td><td>Candidate onboarded; warranty period commenced</td><td>Green (<code>#10b981</code>)</td></tr>
            </tbody>
          </table>
        </div>

        <h4>2. Drag-and-Drop & Audit Logging</h4>
        <p>
          Dragging a card between columns updates Firestore in real-time, appends a timestamped stage transition to <code>stageHistory</code>, and logs an immutable audit entry in <code>/logs</code> detailing operator, candidate name, and old/new stages.
        </p>

        <h4>3. Horizontal Canvas Panning</h4>
        <p>
          When the screen cannot display all swimlanes simultaneously, simply click and hold the left mouse button on any blank canvas area (between swimlanes) and drag horizontally to smoothly pan the board.
        </p>

        <h4>4. Consultant Filter & One-Way Read-Only Protection</h4>
        <p>
          Use the Recruiter filter in the header to view personal candidates or total team workload. When viewing a partner team's board, the board enters One-Way Read-Only mode to prevent accidental mutations.
        </p>
      </div>
    )
  },
  {
    id: 'ai-parser',
    title: '5. AI Job Specification & Anti-Poaching JD Generator',
    badge: 'AI Engine',
    icon: 'ph-sparkle',
    tag: 'AI Tools',
    summary: 'Transform raw employer notes into 4 standardized JD versions with automated anti-poaching de-identification.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-shield-check"></i> Commercial Anti-Poaching Protection:</strong>
          <span>The AI automatically masks client company names and exact street addresses into generic industry descriptions on public versions to prevent direct candidate circumvention.</span>
        </div>

        <h4>1. Four Targeted Commercial Versions</h4>
        <div style={{ overflowX: 'auto', margin: '14px 0 20px 0' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Version Name</th>
                <th>Target Audience</th>
                <th>Core Characteristics</th>
                <th>Usage Warning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Internal Approval (Internal Detailed)</strong></td>
                <td>Team Leads, Account Managers, Agency Owners</td>
                <td>Full English; details business drivers, OKR alignment, hiring budget, and unmasked salary baseline</td>
                <td>Strictly internal! Contains real company name and true salary floor; never publish externally!</td>
              </tr>
              <tr>
                <td><strong>Public Chinese (Facebook Job Groups & Social Media)</strong></td>
                <td>Candidates, Facebook recruitment groups (Johor, KL, SG), RED Note, WhatsApp/Telegram</td>
                <td>7 core modules; company name masked (e.g., <code>[Leading Global Manufacturing MNC]</code>); structured for high-engagement Facebook posting</td>
                <td>Standard public release; general street address to industrial zone level</td>
              </tr>
              <tr>
                <td><strong>Public English (English Job Boards)</strong></td>
                <td>Multinational clients, high-level English candidates, LinkedIn</td>
                <td>1:1 strict mirror of Chinese modules in standardized corporate English format</td>
                <td>Standard public release for English job boards and LinkedIn</td>
              </tr>
              <tr>
                <td><strong>Public Bahasa Melayu (Local Job Portals)</strong></td>
                <td>Malaysian local candidates, job fairs, community boards</td>
                <td>Standard Bahasa Melayu adhering to Employment Act 1955 standards</td>
                <td>Standard public release for local job seekers</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4>2. Four Post-Generation Verification Checklists</h4>
        <ul className="doc-feature-list">
          <li><strong>Check 1: Anti-Poaching Masking</strong>: Confirm company name is masked. Generalize street addresses (e.g., "Jalan Senai 2") to industrial zone level ("Senai Industrial Estate, Johor").</li>
          <li><strong>Check 2: Legal Compliance</strong>: Verify absence of discriminatory clauses (race, religion, gender, age, marital or pregnancy restrictions).</li>
          <li><strong>Check 3: Numerical Accuracy</strong>: Verify basic salary, OT multipliers, gross monthly estimates, and consultant WhatsApp contacts.</li>
          <li><strong>Check 4: Multi-Language Alignment</strong>: Verify benefits terms (Basic Salary, OT, Hostel, Asrama, Pengangkutan transport) align across English and Malay.</li>
        </ul>

        <h4>3. Version History & In-Place Editing</h4>
        <p>
          Edit text directly inside any of the 4 version tabs. Click <strong>Save Current Version</strong> to update existing records, or click <strong>Save as New Version</strong> to create alternative promotional angles.
        </p>
      </div>
    )
  },
  {
    id: 'cv-autofill',
    title: '6. CV Smart Parsing & Builder (CV Builder)',
    badge: 'Intelligent CV',
    icon: 'ph-file-text',
    tag: 'AI Tools',
    summary: 'Extract 20+ candidate profile fields from PDF/DOCX resumes, perform side-by-side verification, and export standardized Word CVs.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-cpu"></i> Full-Dimension Profile Extraction:</strong>
          <span>Supports PDF, DOCX, DOC, TXT, and scanned image resumes. Extracts nationality, current/expected salary, notice period, language skills, and work history with departure reasons.</span>
        </div>

        <h4>1. Anti-Hallucination & Diagnostic Assistant</h4>
        <p>
          In <code>/cv-autofill</code>, drag and drop resumes or paste raw text. The AI extracts structured fields into the Sunrise agency template schema:
        </p>
        <ul className="doc-feature-list">
          <li><strong>Anti-Hallucination Tagging</strong>: Unmentioned fields are flagged with <code>[Not Specified]</code> in amber borders and warning badges.</li>
          <li><strong>Diagnostic Screening Assistant</strong>: The yellow diagnostic card lists missing critical fields and provides English outreach questions to ask candidates during phone screening (e.g., <em>"Could you please share your expected monthly salary?"</em>).</li>
        </ul>

        <h4>2. Five Structured Verification Modules</h4>
        <ul className="doc-feature-list">
          <li><strong>Personal Information</strong>: Name, phone, email, address, expected/last drawn salary, availability, nationality, race, gender, marital status.</li>
          <li><strong>Professional History</strong>: Reverse chronological order; company, position, period, salary, responsibilities, and highlighted amber "Reason for Leaving" badge.</li>
          <li><strong>Education</strong>: Degree, major, institution, graduation year.</li>
          <li><strong>Skills & Languages</strong>: Normalized into search tags.</li>
          <li><strong>ATS Settings</strong>: Total years of experience, initial pipeline stage, and PIC Recruiter assignment.</li>
        </ul>

        <h4>3. Dual Delivery Actions</h4>
        <div style={{ overflowX: 'auto', margin: '14px 0 20px 0' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Delivery Action</th>
                <th>Underlying System Behavior</th>
                <th>Business Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Export Sunrise CV (.docx)</strong></td>
                <td>Renders client-ready Word document; empty sections automatically stripped; named <code>Sunrise CV - [Job] - [Name].docx</code></td>
                <td>Client submission weapon. Beautiful typography ready to email to client HRBPs with zero manual formatting.</td>
              </tr>
              <tr>
                <td><strong>Confirm & Ingest into Pipeline</strong></td>
                <td>Commits full profile, history, and education into Firestore; enters <code>/candidates</code> and Screening swimlane</td>
                <td>System delivery intake. Resets form upon success for rapid continuous processing of incoming resumes.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  },
  {
    id: 'calendar',
    title: '7. Interview Scheduling & Calendar Management',
    badge: 'Scheduling',
    icon: 'ph-calendar-check',
    tag: 'Interviews',
    summary: '42-grid monthly calendar, attendance status tracking, Global vs Personal views, Auto-Jump, and Google Calendar sync.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-calendar-plus"></i> Unified Interview Calendar:</strong>
          <span>Synchronizes candidate interview dates, recruiter assignments, attendance tracking, and Google Calendar reminders.</span>
        </div>

        <h4>1. 42-Grid Anti-Jitter Monthly Calendar</h4>
        <p>
          The calendar displays a fixed 6-row, 7-column grid (42 cells) preventing layout jumps across months. Today's date features a luminous ring, count badges, and up to 3 colored interview tags with a "+N more" expander.
        </p>

        <h4>2. Four Attendance Status Colors</h4>
        <div style={{ overflowX: 'auto', margin: '14px 0 20px 0' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Indicator</th>
                <th>Status Name</th>
                <th>Operational Meaning</th>
                <th>Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>🟢</td><td><strong>Present (已到场)</strong></td><td>Candidate attended interview</td><td>Open drawer, log interview feedback, advance to Offer or mark Eliminated</td></tr>
              <tr><td>🔵</td><td><strong>Pending (待出席)</strong></td><td>Scheduled interview awaiting fulfillment</td><td>Send WhatsApp reminder 1 day prior; confirm transport</td></tr>
              <tr><td>🟡</td><td><strong>Rescheduled (改期请假)</strong></td><td>Candidate requested postponement</td><td>Coordinate new date with client and update calendar schedule</td></tr>
              <tr><td>🔴</td><td><strong>No Show (爽约未到)</strong></td><td>Candidate failed to attend without notice</td><td>Mark eliminated with "No Show" tag; risk warning noted on profile</td></tr>
            </tbody>
          </table>
        </div>

        <h4>3. Global vs Personal View & Auto-Jump</h4>
        <p>
          Toggle between Global (team-wide interview volume) and Personal (filtered to logged-in consultant) views. If the current month has no interviews, the calendar automatically navigates (Auto-Jump) to the earliest month containing active schedules.
        </p>

        <h4>4. One-Click Google Calendar Integration</h4>
        <p>
          Click "Add to Google Calendar" in any interview schedule card to launch a pre-populated 60-minute Google Calendar event with candidate name, target position, and interview details.
        </p>
      </div>
    )
  },
  {
    id: 'n8n',
    title: '8. n8n Automation & Multi-Channel Ingestion',
    badge: 'Automation',
    icon: 'ph-arrows-split',
    tag: 'Integrations',
    summary: 'Automate candidate intake via Telegram bot forwarding and real-time bidirectional Google Sheets synchronization.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-lightning"></i> Multi-Channel Automation:</strong>
          <span>Connects Telegram business groups, Google Sheets, and binary files into an automated candidate ingestion pipeline.</span>
        </div>

        <h4>1. Dual-Engine Decoupled Architecture</h4>
        <p>
          The automation infrastructure decouples the <strong>Python FastAPI Microservice (:8000)</strong> (responsible for LLM extraction and embeddings) from the <strong>n8n Visual Automation Engine (:5678)</strong> (handling Telegram and Google Sheets triggers), routed through an ngrok static reverse proxy.
        </p>

        <h4>2. Telegram Bot Rapid Ingestion</h4>
        <p>
          Consultants forward resumes (PDF/DOCX) or paste candidate text directly into the designated Telegram group:
        </p>
        <ul className="doc-feature-list">
          <li><strong>Noise Filter</strong>: Messages under 80 characters are discarded to ignore casual chatter.</li>
          <li><strong>Bot Privacy Setting</strong>: Ensure bot privacy mode is set to <code>/setprivacy -&gt; Disable</code> in <code>@BotFather</code> so the bot can inspect group attachments.</li>
          <li><strong>Group Whitelist</strong>: Verify group Chat ID is registered in <code>TELEGRAM_ALLOWED_CHATS</code>.</li>
        </ul>

        <h4>3. Google Sheets Real-Time Bidirectional Synchronization</h4>
        <p>
          Connect team Google Sheets using an Apps Script <code>onEdit</code> trigger posting to n8n Webhook:
        </p>
        <ul className="doc-feature-list">
          <li><strong>Non-Destructive Ingestion (<code>merge=True</code>)</strong>: Incoming sheet columns update candidate contact details without overwriting recruiter notes, interview schedules, or advanced pipeline stages.</li>
          <li><strong>High Responsiveness</strong>: Webhooks return HTTP 200 within 200ms to guarantee zero spreadsheet lag.</li>
        </ul>

        <h4>4. Binary Ingestion API</h4>
        <p>
          External tools can submit files directly to <code>POST /api/candidates/ingest-file</code> (multipart/form-data) with fields <code>file</code>, <code>source</code>, and <code>recruiter_id</code>.
        </p>
      </div>
    )
  },
  {
    id: 'team',
    title: '10. Team Collaboration & RBAC Permissions',
    badge: 'Security RBAC',
    icon: 'ph-users-three',
    tag: 'Management',
    summary: 'Three-tier RBAC permission matrix, new member approval flow, and HQ partner one-way read-only penetration.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-shield-check"></i> Enterprise Access Control:</strong>
          <span>Role-Based Access Control (RBAC) ensures data isolation between headquarters and partner branch teams with zero leakage.</span>
        </div>

        <h4>1. Three-Tier Role Permissions Matrix</h4>
        <div style={{ overflowX: 'auto', margin: '14px 0 20px 0' }}>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Capability / Action</th>
                <th>Owner (所有者)</th>
                <th>Manager (主管)</th>
                <th>Recruiter (顾问)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Approve / Reject Pending Members</td><td>Yes</td><td>Yes</td><td>No</td></tr>
              <tr><td>Edit Member Roles & Transfer Teams</td><td>Yes</td><td>No</td><td>No</td></tr>
              <tr><td>Create / Unlink Partner Teams</td><td>Yes</td><td>No</td><td>No</td></tr>
              <tr><td>View Headquarters Data</td><td>Full</td><td>Full</td><td>Assigned Only</td></tr>
              <tr><td>One-Way Partner Inspection</td><td>Yes (Read-Only)</td><td>Yes (Read-Only)</td><td>No</td></tr>
              <tr><td>Create / Edit Candidates & Orders</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Drag-and-Drop Pipeline Stages</td><td>Yes</td><td>Yes</td><td>Yes</td></tr>
              <tr><td>Archive / Soft-Delete Audit Logs</td><td>Yes</td><td>No</td><td>No</td></tr>
            </tbody>
          </table>
        </div>

        <h4>2. New Member Approval Workflow</h4>
        <p>
          New registrations enter a <code>pending</code> holding state. In <code>/team</code>, Owners or Managers locate the amber <strong>Pending Approvals</strong> card, select the destination team assignment (Headquarters or Partner Branch) from the dropdown, and click <strong>Approve</strong> to immediately activate the user as a Recruiter.
        </p>

        <h4>3. HQ Partner One-Way Read-Only Penetration</h4>
        <p>
          Headquarters leaders can switch into partner teams via the top navbar team selector:
        </p>
        <ul className="doc-feature-list">
          <li><strong>Gold Badge Indicator</strong>: The top bar highlights a prominent gold <code>[One-Way Read-Only]</code> badge.</li>
          <li><strong>Mutation Freezing</strong>: "Add Candidate", "Post Order", and the floating Quick FAB are completely hidden.</li>
          <li><strong>Firestore Rules Security</strong>: Write requests into partner collections are strictly rejected at the database level.</li>
          <li><strong>Zero Reverse Visibility</strong>: Partner teams have zero visibility into headquarters data or sibling partner teams.</li>
        </ul>
      </div>
    )
  },
  {
    id: 'settings',
    title: '11. System Settings & Data Security',
    badge: 'Console',
    icon: 'ph-gear-six',
    tag: 'Settings',
    summary: 'Disaster recovery JSON migration, Google Sheets 15-column import & AI cleaning, E2EE vault, and WhatsApp alerts.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-lock-key"></i> Security & Integration Console:</strong>
          <span>Manage data migration, batch spreadsheet imports, Zero-Knowledge encryption vaults, and personal notification preferences.</span>
        </div>

        <h4>1. Local JSON Migration (Disaster Recovery Only)</h4>
        <p>
          Restricted strictly to the Owner role. The migration channel assigns fresh UUIDs to all imported records. <em>Important: Do not import the same JSON backup repeatedly, as this will duplicate records.</em> Use Google Sheets or AI Parsing for daily incremental additions.
        </p>

        <h4>2. Google Sheets Import & AI Smart Cleaning Pipeline</h4>
        <p>
          Available to all team members (Owner, Manager, Recruiter):
        </p>
        <ul className="doc-feature-list">
          <li><strong>14 Auto-Inferred + 15 Selectable Mappings</strong>: Supports public CSV and private Google OAuth channels, automatically mapping names, phones, emails, schools, and companies.</li>
          <li><strong>AI Smart Cleaning Pipeline</strong>: Pre-deduplicates against Firestore cloud records (saving API tokens), batches rows concurrently, matches recruiter names fuzzily, and displays an editable Diff Review table before committing.</li>
        </ul>

        <h4>3. Confidential Data Vault (Zero-Knowledge E2EE)</h4>
        <p>
          Client commission rates and confidential order notes are encrypted using browser-native Web Crypto API (PBKDF2-SHA-256 with 100,000 iterations + AES-GCM-256). All encrypted records bear the signature <code>TLFL_E2EE_V1:</code>. Because encryption is symmetric, all team members accessing confidential notes must share the same vault password. Passwords are never uploaded to the server and cannot be recovered if lost!
        </p>

        <h4>4. WhatsApp Notification Binding & Template Customization</h4>
        <p>
          Consultants bind their personal WhatsApp phone number and customize 3 dynamic notification template slots with placeholders <code>{'{name}'}</code>, <code>{'{job}'}</code>, and <code>{'{date}'}</code>.
        </p>

        <h4>5. Recommended Onboarding Configuration Sequence</h4>
        <p>
          Step 1: Initialize Vault Master Password in Settings ➔ Step 2: Bind personal WhatsApp phone number ➔ Step 3: Perform initial Google Sheets or JSON migration ➔ Step 4: Approve incoming team members in Team Collaboration.
        </p>
      </div>
    )
  },
  {
    id: 'faq',
    title: '12. Troubleshooting & FAQ Guide',
    badge: 'Knowledge Base',
    icon: 'ph-question',
    tag: 'Guide',
    summary: 'Comprehensive solutions for account approvals, Kanban snapbacks, talent reactivation, AI timeouts, and E2EE vaults.',
    content: (
      <div className="doc-section-body">
        <div className="doc-callout doc-callout-info">
          <strong><i className="ph-bold ph-lightbulb-filament"></i> Quick Troubleshooting Tip:</strong>
          <span>This chapter compiles the 13 most common operational questions and solutions across all system modules. If you encounter any unexpected behavior, please refer to this guide first.</span>
        </div>

        <h4>I. Accounts, Login & Team Permissions</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 24px 0' }}>
          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q1: A new member sees "Pending Approval (pending)" after login and cannot see any data?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: This is the system's commercial data protection barrier. New accounts are unprivileged by default. Please contact a team <code>Owner</code> or <code>Manager</code> to log in, navigate to "Team Collaboration", locate the applicant under "Pending Approvals", select their team, and click "Approve" to activate their Recruiter access immediately.
            </div>
          </div>

          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q2: When switching to a Partner Team, why are "Add Candidate" and "Post Order" buttons hidden?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: HQ partner inspection operates under One-Way Read-Only Protection (indicated by the gold <code>[One-Way Read-Only]</code> badge). To protect partner data, all mutation buttons and the bottom-right floating FAB are automatically hidden, and the database rejects write requests. Switch back to "Headquarters (Own Data)" in the top bar to create records.
            </div>
          </div>

          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q3: When a consultant resigns or transfers branches, how should their account and candidates be handled?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: An Owner can click Edit on the member card in "Team Collaboration" to transfer them to another branch team, or click the trash icon to remove them. When removed, all candidates and orders previously created by the consultant remain intact in the shared team repository, and the manager can bulk-reassign them to other recruiters.
            </div>
          </div>
        </div>

        <h4>II. Candidate Progression, Kanban & Talent Pool</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 24px 0' }}>
          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q4: When dragging a candidate card on the Kanban board, why does it immediately snap back?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: Check two factors: 1) Verify whether the top bar is in partner "One-Way Read-Only" mode (drag-and-drop is locked in read-only mode); 2) Check your network connectivity. Stage transitions write to Firestore and create immutable audit logs; network failures will trigger an error toast and revert the card.
            </div>
          </div>

          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q5: A candidate was eliminated and disappeared from the main list. How can they be reactivated?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: The system archives eliminated candidates rather than deleting them. Navigate to "Talent Pool (<code>/talent-pool</code>)" in the left menu, search by keyword or filter by elimination reason, click the candidate card to open their 360° profile drawer, and click the emerald "Reactivate into Pipeline" button in the top banner. The candidate is immediately restored to the Screening stage.
            </div>
          </div>

          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q6: What is the permanent blue "+" floating button (Global Quick FAB) in the bottom-right corner?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: This is the persistent quick-creation button. Regardless of scroll depth, click the FAB to instantly open the "Add Candidate" drawer or "Post Job Order" modal without scrolling back to the top. In read-only partner mode, this button is automatically destroyed.
            </div>
          </div>
        </div>

        <h4>III. AI Intelligence Suite & CV Parsing</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 24px 0' }}>
          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q7: AI Job Description generation or CV parsing reports "Connection Timeout" or "Parsing Failed"?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: Check sequentially: 1) Ensure the Python AI microservice (port 8000) is running (verify via <code>http://localhost:8000/docs</code>); 2) Check that <code>OPENROUTER_API_KEY</code> in <code>ai_backend/.env</code> has sufficient balance; 3) LLM services experience occasional network jitter. The system has built-in retry and timeout fallbacks; re-click after 3–5 seconds.
            </div>
          </div>

          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q8: Why does the AI JD generator automatically replace the client company name with a generic title?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: This is the core anti-poaching de-identification mechanism. The three public versions (Facebook Job Groups / Social Media, RED Note, English Job Board) automatically mask client company names into generic descriptions (e.g., <code>[Leading Global Manufacturing MNC]</code>) and suggest generalizing street addresses to industrial zone level to prevent candidates from bypassing consultants. Only the full English Internal Approval version retains the real company name and unmasked salary baseline.
            </div>
          </div>
        </div>

        <h4>IV. Scheduling & Ecosystem Automation</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 24px 0' }}>
          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q9: Why does a scheduled candidate not appear on the monthly Interview Calendar?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: Check three items: 1) Verify whether an explicit interview date is filled in the candidate drawer (candidates without dates reside in the pending list rather than calendar cells); 2) Check if the top view is in "Personal Mode" and filtered to a different consultant; 3) Check whether the current month has active interviews (the calendar automatically jumps to the earliest month with active schedules).
            </div>
          </div>

          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q10: Resumes were sent in the Telegram group, but they never appeared in the Talent Pool?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: Check sequentially: 1) If sending raw text, ensure the message exceeds 80 characters (anti-chatter filter); 2) Verify the bot's privacy mode is disabled (<code>/setprivacy -&gt; Disable</code> via <code>@BotFather</code>); 3) Confirm the group Chat ID is included in <code>TELEGRAM_ALLOWED_CHATS</code>; 4) Confirm both n8n (:5678) and the AI backend (:8000) are running and the workflow is Active.
            </div>
          </div>
        </div>

        <h4>V. Trade Secrets & Data Security</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 10px 0' }}>
          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q11: After logging in from a new laptop, why do confidential notes appear encrypted and locked?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: This is standard End-to-End Encryption (E2EE) behavior. The vault password is only cached in local browser memory and never uploaded to Firestore. After switching devices or clearing browser cache, simply navigate to "System Settings", re-enter your Vault Master Password, and save to unlock all notes immediately.
            </div>
          </div>

          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q12: What if I forget the Confidential Data Vault master password?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: High-strength Zero-Knowledge encryption (PBKDF2 + AES-GCM-256) is mathematically irreversible; neither servers nor developers can retrieve your password! Emergency Recovery: Contact a colleague (such as the Owner) who still has an unlocked session on their computer, copy and backup the plaintext notes from their screen, and then reset a new master password for the team.
            </div>
          </div>

          <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
              Q13: Why does re-importing the same JSON backup file duplicate candidate counts?
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              Answer: The JSON migration pipeline is designed for disaster recovery and assigns a fresh UUID to every record to prevent overwriting active histories. Do not re-import the same JSON backup. For incremental additions, use Google Sheets Import or AI CV Parsing, which include pre-deduplication checks.
            </div>
          </div>
        </div>
      </div>
    )
  }
];
