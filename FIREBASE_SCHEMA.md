# 🔥 TALENT FLOW - Firebase Database Schema

> **Notice for Developers & AI Agents**: This document outlines the exact JSON schemas and Firestore paths used in the TALENT FLOW project. When reading, writing, or migrating data, strictly adhere to these interfaces.

## 📂 Firestore Collection Structure (RBAC)

The database uses a multi-tenant hierarchy based on `teamId`:

```text
/teams/{teamId}
  ├── /candidates/{candidateId}   // Candidate tracking records
  ├── /job_orders/{orderId}       // Job/recruitment orders
  ├── /feedback/{feedbackId}      // System feedback/suggestions
  ├── /ad_versions/{versionId}    // AI generated JD histories
  └── /tags/metadata              // Aggregated tag dictionaries
```

---

## 📄 JSON Schemas (TypeScript Interfaces)

### 1. Team Member (`/teams/{teamId}/members/{uid}`)
```typescript
interface TeamMember {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'manager' | 'recruiter';
  whatsappNumber?: string;         // (New) Standardized E.164 format e.g. "60123456789" for internal notifications
  createdAt: any;
}
```

### 2. Candidate (`/teams/{teamId}/candidates/{candidateId}`)
```typescript
interface Candidate {
  id: string;                      // Unique UUID/nanoid
  name: string;                    
  phone: string;                   // Only digits allowed ideally
  email: string;                   
  school: string;                  
  major: string;                   
  degree?: string;                 // (e.g. SPM, Diploma, Degree)
  experience?: string;             // (e.g. "2 years CNC operator")
  location?: string;               // Residential area (e.g. Skudai)
  icNo?: string;                   // Identity Card Number
  age?: string;                    // Numeric age string
  offered?: string;                // Offered salary (e.g. RM1900)
  salary?: string;                 // Expected salary
  department?: string;             
  company: string;                 // Target company / Current company
  position: string;                // Target position
  source: string;                  // Source of candidate
  stage: 'screening' | 'phone' | 'interview' | 'offer' | 'pre_onboarding' | 'onboarding' | 'post_onboarding';
  stageHistory: Array<{            
    stage: string;
    movedAt: string;               // ISO Timestamp
  }>;
  interviewDate: string | null;    // Format: YYYY-MM-DD
  interviewTime: string | null;    // Format: HH:mm
  normalizedStatus?: 'attended' | 'no_show' | 'unable_to_attend' | 'pending';
  rawStatus?: string;              // Original status text from sheets
  interviewNotes: string;          
  intentionNotes: string;          
  reminders: Array<{               
    id: string;
    date: string;                  // YYYY-MM-DD
    time: string;                  // HH:mm
    dateTime: string;              // YYYY-MM-DDTHH:mm
    content: string;               
    fired: boolean;                
    createdAt: string;             // ISO Timestamp
    creatorId: string;             // UID of creator (private visibility)
    creatorName: string;           
  }>;
  resumeUrl: string;               
  tags: string[];                  
  status: 'active' | 'rejected';   
  rejectedAt: string | null;       // ISO Timestamp if rejected
  rejectReason?: string;           // Taxonomy Drop Reason
  rejectNote?: string;             
  assignedTo?: string;             // Owner UID for row-level security
  picName?: string;                // Recruiter string name
  companySource?: 'manual' | 'row_explicit' | 'tab_inferred'; 
  createdAt: any;                  // Firestore serverTimestamp()
  updatedAt: any;                  // Firestore serverTimestamp()
}
```

### 2. Job Order (`/teams/{teamId}/job_orders/{orderId}`)
```typescript
interface JobOrder {
  id: string;
  company: string;
  position: string;
  salary: string;
  benefits: string;
  requirements: string;
  workHours: string;
  location: string;
  status: 'open' | 'urgent' | 'filled' | 'paused';
  notes: string;                   // E2EE compatible private notes
  picName?: string;                
  assignedTo?: string;             // Owner UID
  createdAt: any;                  // Firestore serverTimestamp()
  updatedAt: any;                  // Firestore serverTimestamp()
}
```

### 3. Feedback (`/teams/{teamId}/feedback/{feedbackId}`)
```typescript
interface FeedbackItem {
  id: string;
  category: 'feature' | 'bug' | 'ux' | 'other';
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_review' | 'resolved' | 'closed';
  adminNote?: string;
  createdBy: string;
  creatorName: string;
  creatorEmail: string;
  createdAt: any;
  updatedAt: any;
}
```

### 4. Internal Notification Queue (`/teams/{teamId}/notifications/{notificationId}`)
```typescript
interface InternalNotification {
  id: string;
  recipientUid: string;            // Target team member
  targetPhone: string;             // WhatsApp Number of recipient
  message: string;                 // The message content
  status: 'pending' | 'sent' | 'failed';
  triggerAt: string | any;         // ISO timestamp or Firestore Timestamp for when to send
  createdAt: any;
  updatedAt: any;
}
```

## 🚨 Critical AI Interaction Rules
1. **No Undefined Values**: Firestore crashes if you pass `undefined`. Always strip `undefined` fields or fallback to `null`/empty strings before calling `setDoc`/`updateDoc`.
2. **Timestamps**: `createdAt` and `updatedAt` should use `serverTimestamp()` from Firebase SDK during writes. Read operations will return a Timestamp object `{ seconds, nanoseconds }` which needs to be converted via `.toDate()`.
3. **Immutability**: Once an audit log or history array is written, prefer append-only operations. Do not overwrite historical arrays maliciously.
