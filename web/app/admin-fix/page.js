'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth-context';
import { Utils } from '../../lib/utils';

export default function AdminFix() {
  const { user } = useAuth();
  const [status, setStatus] = useState('Idle');
  const [logs, setLogs] = useState([]);

  const log = (msg) => {
    console.log(msg);
    setLogs(prev => [...prev, msg]);
  };

  const runFix = async () => {
    if (!user) {
      log('User not authenticated. Please login first.');
      return;
    }
    
    setStatus('Running...');
    log('Starting reminder data fix...');
    
    try {
      // Find all teams the user has access to, or just default_team
      // For simplicity, we'll assume default_team or scan teams if possible.
      // Usually candidates are under teams/default_team/candidates
      const teamId = 'default_team';
      const candidatesRef = collection(db, 'teams', teamId, 'candidates');
      const snap = await getDocs(candidatesRef);
      
      let fixedCount = 0;
      let totalReminders = 0;

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        let needsUpdate = false;
        const reminders = data.reminders || [];
        
        const newReminders = reminders.map(r => {
          totalReminders++;
          log(`Checking reminder ${r.id}, creatorId: "${r.creatorId}"`);
          let updated = { ...r };
          let changed = false;
          
          if (!updated.id) {
            updated.id = Utils.generateId();
            changed = true;
            log(`Added missing id to a reminder in candidate ${docSnap.id}`);
          }
          
          if (!updated.creatorId || updated.creatorId === '') {
            updated.creatorId = 'SYSTEM_LEGACY';
            updated.creatorName = 'System Legacy';
            updated.creatorEmail = 'legacy@system.local';
            changed = true;
            log(`Added legacy creatorId to a reminder in candidate ${docSnap.id}`);
          }
          
          if (changed) needsUpdate = true;
          return updated;
        });

        if (needsUpdate) {
          await updateDoc(docSnap.ref, { reminders: newReminders });
          fixedCount++;
          log(`Updated candidate ${docSnap.id} with fixed reminders.`);
        }
      }

      log(`Fix complete! Scanned ${totalReminders} reminders.`);
      log(`Fixed reminders in ${fixedCount} candidates.`);
      setStatus('Completed');
    } catch (err) {
      log(`Error: ${err.message}`);
      setStatus('Error');
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', color: '#fff' }}>
      <h1>Admin Data Fixer</h1>
      <button 
        onClick={runFix}
        disabled={status === 'Running...'}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
      >
        Run Reminder Data Fix
      </button>
      <p>Status: {status}</p>
      <div style={{ marginTop: '20px', background: '#222', padding: '20px', borderRadius: '8px', maxHeight: '400px', overflowY: 'auto' }}>
        {logs.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
