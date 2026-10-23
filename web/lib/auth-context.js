'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkedChildTeams, setLinkedChildTeams] = useState([]);
  const [activeViewTeamId, setActiveViewTeamId] = useState(null);

  useEffect(() => {
    const withTimeout = (promise, ms = 8000) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firestore 账户信息读取超时，请检查网络连接 / Firestore profile read timed out, please check network connection')), ms)
        ),
      ]);

    const checkIsAdminEmail = (email) => {
      const adminEmailStr = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase();
      const targetEmail = (email || '').trim().toLowerCase();
      if (!targetEmail) return false;
      const defaultAdmins = ['lokkalap123@gmail.com', 'sean@sunriserecruit.com'];
      if (!adminEmailStr) {
        return defaultAdmins.includes(targetEmail);
      }
      const adminEmails = adminEmailStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      return adminEmails.includes(targetEmail) || defaultAdmins.includes(targetEmail);
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          const isAdmin = checkIsAdminEmail(firebaseUser.email);
          // Fetch or create user profile in Firestore
          const profileRef = doc(db, 'users', firebaseUser.uid);
          const profileSnap = await withTimeout(getDoc(profileRef));

          if (profileSnap.exists()) {
            const data = profileSnap.data();
            // If the user is designated as admin via NEXT_PUBLIC_ADMIN_EMAIL / defaultAdmins, ensure owner role
            if (isAdmin && (data.role !== 'owner' || data.teamId !== 'default_team')) {
              const patchedData = { 
                ...data, 
                teamId: 'default_team', 
                role: 'owner' 
              };
              try {
                await withTimeout(setDoc(profileRef, patchedData, { merge: true }), 3000);
              } catch (writeErr) {
                console.warn('[auth] Could not persist owner role to Firestore (likely rules), applying in memory:', writeErr);
              }
              setUserProfile(patchedData);
            } else if (!data.teamId || !data.role) {
              const patchedData = { 
                ...data, 
                teamId: isAdmin ? 'default_team' : null, 
                role: isAdmin ? 'owner' : 'pending' 
              };
              try {
                await withTimeout(setDoc(profileRef, patchedData, { merge: true }), 3000);
              } catch (writeErr) {
                console.warn('[auth] Could not persist patch to Firestore:', writeErr);
              }
              setUserProfile(patchedData);
            } else {
              setUserProfile(data);
            }
          } else {
            // First-time login — create profile
            const newProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              teamId: isAdmin ? 'default_team' : null,
              role: isAdmin ? 'owner' : 'pending',
              createdAt: serverTimestamp(),
            };
            try {
              await withTimeout(setDoc(profileRef, newProfile), 3000);
            } catch (createErr) {
              console.warn('[auth] Direct create of profile blocked (likely firestore rules), attempting compliant fallback:', createErr);
              try {
                const compliantProfile = {
                  ...newProfile,
                  teamId: null,
                  role: 'pending'
                };
                await withTimeout(setDoc(profileRef, compliantProfile), 3000);
              } catch (fallbackErr) {
                console.error('[auth] Fallback profile creation also failed:', fallbackErr);
              }
            }
            setUserProfile(newProfile);
          }
        } else {
          setUser(null);
          setUserProfile(null);
          setLinkedChildTeams([]);
          setActiveViewTeamId(null);
          try {
            localStorage.removeItem('talent_flow_active_team');
          } catch (e) {}
        }
      } catch (error) {
        console.error('Error fetching user profile from Firestore:', error);
        if (firebaseUser) {
          setUser(firebaseUser);
          const isAdmin = checkIsAdminEmail(firebaseUser.email);
          setUserProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || '',
            photoURL: firebaseUser.photoURL || '',
            teamId: isAdmin ? 'default_team' : null,
            role: isAdmin ? 'owner' : 'pending',
            _firestoreFallback: true,
            _firestoreError: error?.message || String(error),
          });
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to team_links where current user's team is parentTeamId (e.g. HQ -> Partner)
  useEffect(() => {
    const myTeam = userProfile?.teamId;
    if (!myTeam || userProfile?.role === 'pending') {
      setLinkedChildTeams([]);
      setActiveViewTeamId(null);
      return;
    }

    const linksQuery = query(collection(db, 'team_links'), where('parentTeamId', '==', myTeam));
    const unsubscribe = onSnapshot(linksQuery, (snapshot) => {
      const links = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setLinkedChildTeams(links);

      // Verify active team cache: MUST be myTeam OR one of authorized links.childTeamId!
      try {
        const saved = localStorage.getItem('talent_flow_active_team');
        const isAuthorizedChild = links.some(l => l.childTeamId === saved);
        if (saved && (saved === myTeam || isAuthorizedChild)) {
          setActiveViewTeamId(saved);
        } else {
          setActiveViewTeamId(myTeam);
          localStorage.setItem('talent_flow_active_team', myTeam);
        }
      } catch (e) {
        setActiveViewTeamId(myTeam);
      }
    }, (error) => {
      console.warn('Error fetching linked child teams:', error);
      setLinkedChildTeams([]);
      setActiveViewTeamId(myTeam);
    });

    return () => unsubscribe();
  }, [userProfile?.teamId, userProfile?.role]);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (error) {
      console.error('Google sign-in failed:', error);
      throw error;
    }
  };

  const signInWithGoogleSheets = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      return { user: result.user, token };
    } catch (error) {
      console.error('Google Sheets sign-in failed:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      try {
        localStorage.removeItem('talent_flow_active_team');
      } catch (e) {}
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out failed:', error);
      throw error;
    }
  };

  const updateProfile = (data) => {
    setUserProfile(prev => ({ ...prev, ...data }));
  };

  const switchActiveTeam = (targetTeamId) => {
    const myTeam = userProfile?.teamId || 'default_team';
    const isAuthorizedChild = linkedChildTeams.some(l => l.childTeamId === targetTeamId);
    const nextId = (targetTeamId === myTeam || isAuthorizedChild) ? targetTeamId : myTeam;
    setActiveViewTeamId(nextId);
    try {
      localStorage.setItem('talent_flow_active_team', nextId);
    } catch (e) {}
  };

  const myTeamId = userProfile?.teamId || null;
  const effectiveTeamId = activeViewTeamId || myTeamId;
  const isReadOnlyView = Boolean(myTeamId && effectiveTeamId && effectiveTeamId !== myTeamId);

  let activeTeamName = '公司本部 (HQ)';
  if (effectiveTeamId === myTeamId) {
    activeTeamName = myTeamId === 'default_team' ? '公司本部 (HQ)' : (userProfile?.teamName || myTeamId || '我的团队');
  } else {
    const found = linkedChildTeams.find(l => l.childTeamId === effectiveTeamId);
    activeTeamName = found?.childTeamName || effectiveTeamId;
  }

  const value = {
    user,
    userProfile,
    loading,
    signInWithGoogle,
    signInWithGoogleSheets,
    signOut,
    updateProfile,
    isAuthenticated: !!user,
    teamId: effectiveTeamId,
    myTeamId,
    activeViewTeamId: effectiveTeamId,
    activeTeamName,
    isReadOnlyView,
    linkedChildTeams,
    switchActiveTeam,
    role: userProfile?.role || null,
    isOwner: userProfile?.role === 'owner',
    isManager: userProfile?.role === 'manager' || userProfile?.role === 'owner',
    isRecruiter: userProfile?.role === 'recruiter',
    // 考勤打卡仅适用于公司本部 (HQ)；分部 / 合作方团队无需打卡
    isHqTeam: effectiveTeamId === 'default_team',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
