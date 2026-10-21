import { db, auth } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export class SystemLogger {
  /**
   * Write an audit log to Firestore (User actions tracking)
   * @param {string} teamId The ID of the team
   * @param {object} user The user object { uid, email, displayName }
   * @param {string} action The action taken (e.g. 'CREATE', 'UPDATE', 'DELETE', 'AI_PARSE')
   * @param {string} targetType The type of entity (e.g. 'CANDIDATE', 'JOB_ORDER', 'SYSTEM')
   * @param {string} targetName The name or identifier of the affected entity
   * @param {object} details Additional context
   */
  static async audit(teamId, user, action, targetType, targetName, details = null) {
    if (!teamId || !user) return;

    try {
      let safeDetails = '';
      if (typeof details === 'object' && details !== null) {
        if (details.actionDetail) {
          safeDetails = details.actionDetail;
        } else {
          try {
            safeDetails = JSON.stringify(details, null, 2);
          } catch (e) {
            safeDetails = String(details);
          }
        }
      } else if (details) {
        safeDetails = String(details);
      }

      const logPayload = {
        level: 'audit',
        action: action || 'UNKNOWN',
        targetType: targetType || 'SYSTEM',
        targetName: targetName || '',
        user: {
          uid: user?.uid || auth?.currentUser?.uid || 'anonymous',
          email: user?.email || auth?.currentUser?.email || '',
          displayName: user?.displayName || auth?.currentUser?.displayName || (user?.email ? user.email.split('@')[0] : '团队成员')
        },
        details: safeDetails,
        timestamp: serverTimestamp(),
        isDeleted: false
      };

      await addDoc(collection(db, 'teams', teamId, 'logs'), logPayload);
    } catch (err) {
      console.warn("[SystemLogger] Direct Firestore audit log write error:", err?.message || err);
      // Fallback: If direct write failed (e.g. offline/rules edge case), try backend API if available
      try {
        const apiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:8000' : '');
        if (apiUrl) {
          const currentUser = (user && typeof user.getIdToken === 'function') ? user : auth?.currentUser;
          if (currentUser && typeof currentUser.getIdToken === 'function') {
            const token = await currentUser.getIdToken();
            if (token) {
              await fetch(`${apiUrl}/api/audit-log`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ teamId, action, targetType, targetName, details })
              });
            }
          }
        }
      } catch (fallbackErr) {
        console.warn("[SystemLogger] Fallback to backend API also failed:", fallbackErr?.message || fallbackErr);
      }
    }
  }

  /**
   * Write an error log to Firestore
   * @param {string} teamId The ID of the team
   * @param {string} module Which part of the app threw the error (e.g., 'AI_PARSER', 'FIREBASE', 'RENDER')
   * @param {string} message Short description of the error
   * @param {Error|Object|string} details Detailed error object, response string, or stack trace
   */
  static async error(teamId, module, message, details = null) {
    if (!teamId) {
      console.error("[SystemLogger Failed] No teamId provided", { module, message, details });
      return;
    }

    try {
      // Serialize details safely
      let safeDetails = '';
      if (details instanceof Error) {
        safeDetails = details.stack || details.message;
      } else if (typeof details === 'object') {
        try {
          safeDetails = JSON.stringify(details, null, 2);
        } catch (e) {
          safeDetails = String(details);
        }
      } else {
        safeDetails = String(details);
      }

      await addDoc(collection(db, 'teams', teamId, 'logs'), {
        level: 'error',
        module,
        message,
        details: safeDetails,
        timestamp: serverTimestamp()
      });
      
      console.error(`[${module}] ${message}`, details);
    } catch (err) {
      console.error("Failed to write to SystemLogger", err);
    }
  }

  /**
   * Write an info log to Firestore
   */
  static async info(teamId, module, message, details = null) {
    if (!teamId) return;

    try {
      let safeDetails = '';
      if (typeof details === 'object') {
        try {
          safeDetails = JSON.stringify(details, null, 2);
        } catch (e) {
          safeDetails = String(details);
        }
      } else if (details) {
        safeDetails = String(details);
      }

      await addDoc(collection(db, 'teams', teamId, 'logs'), {
        level: 'info',
        module,
        message,
        details: safeDetails,
        timestamp: serverTimestamp()
      });
      
      console.log(`[${module}] ${message}`, details);
    } catch (err) {
      console.error("Failed to write to SystemLogger", err);
    }
  }
}
