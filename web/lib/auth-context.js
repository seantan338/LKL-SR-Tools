'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
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

    // 初始管理员只由环境变量 NEXT_PUBLIC_ADMIN_EMAIL 指定（可用逗号分隔多个），不在代码里写死邮箱
    const checkIsAdminEmail = (email) => {
      const targetEmail = (email || '').trim().toLowerCase();
      if (!targetEmail) return false;
      const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '')
        .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      return adminEmails.includes(targetEmail);
    };

    let unsubProfile = null;

    // 安全兜底计时器：若在弱网、移动端 WebKit 或冷启动环境下 6 秒内未完成身份判定，
    // 强制解除全局加载阻塞，同时若已有登录态则补齐兜底 userProfile，彻底杜绝卡死在 "Verifying identity..." 或 "正在加载账户信息..."
    const safetyTimeout = setTimeout(() => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const isAdmin = checkIsAdminEmail(currentUser.email);
        setUser(currentUser);
        setUserProfile((prev) => prev || {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName || '',
          photoURL: currentUser.photoURL || '',
          teamId: isAdmin ? 'default_team' : null,
          role: isAdmin ? 'owner' : 'pending',
          _firestoreFallback: true,
        });
      }
      setLoading((currentLoading) => {
        if (currentLoading) {
          console.warn('[auth] Auth state detection safety timeout reached (6s), unlocking loading state.');
          return false;
        }
        return false;
      });
    }, 6000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          const isAdmin = checkIsAdminEmail(firebaseUser.email);
          // Fetch or create user profile in Firestore
          const profileRef = doc(db, 'users', firebaseUser.uid);
          const cleanEmail = (firebaseUser.email || '').trim().toLowerCase();
          const inviteRef = cleanEmail ? doc(db, 'invites', cleanEmail) : null;

          // 只把真正写入 Firestore 成功的身份放进界面：Firestore rules 不允许自己升为 owner，
          // 若写入失败仍在内存里当 owner，界面会出现管理功能、实际操作却全部被拒绝
          const persistProfile = async (profile, fallback) => {
            try {
              await withTimeout(setDoc(profileRef, profile, { merge: true }), 3000);
              return profile;
            } catch (writeErr) {
              console.warn('[auth] Could not persist profile to Firestore (likely rules), keeping stored role:', writeErr);
              return fallback;
            }
          };

          const [profileSnap, inviteSnap] = await Promise.all([
            withTimeout(getDoc(profileRef)),
            inviteRef ? withTimeout(getDoc(inviteRef)).catch(() => null) : Promise.resolve(null)
          ]);

          const inviteData = inviteSnap?.exists() ? inviteSnap.data() : null;
          let resolvedProfile = null;

          if (profileSnap.exists()) {
            const data = profileSnap.data();
            resolvedProfile = { ...data, uid: firebaseUser.uid };
            // If the user is designated as admin via NEXT_PUBLIC_ADMIN_EMAIL, try to ensure owner role
            if (isAdmin && (data.role !== 'owner' || data.teamId !== 'default_team')) {
              const saved = await persistProfile({ ...data, teamId: 'default_team', role: 'owner' }, data);
              resolvedProfile = { ...saved, uid: firebaseUser.uid };
            } else if (inviteData && (data.role === 'pending' || !data.teamId)) {
              // 管理员已提前在后台预设过该邮箱的入驻权限与团队，首次登录/刷新时自动激活直通
              const preApprovedData = {
                ...data,
                role: inviteData.role || 'recruiter',
                teamId: inviteData.teamId || 'default_team',
                displayName: data.displayName || inviteData.displayName || firebaseUser.displayName || '',
                allowWfhPunch: inviteData.allowWfhPunch !== undefined ? Boolean(inviteData.allowWfhPunch) : false,
                assignedPic: inviteData.assignedPic || inviteData.displayName || data.assignedPic || '',
              };
              const saved = await persistProfile(preApprovedData, data);
              resolvedProfile = { ...saved, uid: firebaseUser.uid };
              try { await deleteDoc(inviteRef); } catch (e) {}
            } else if (!data.teamId || !data.role) {
              const patchedData = {
                ...data,
                teamId: isAdmin ? 'default_team' : null,
                role: isAdmin ? 'owner' : 'pending'
              };
              const saved = await persistProfile(patchedData, { ...data, teamId: null, role: 'pending' });
              resolvedProfile = { ...saved, uid: firebaseUser.uid };
            }
          } else {
            // First-time login — create profile
            const targetRole = isAdmin ? 'owner' : (inviteData?.role || 'pending');
            const targetTeam = isAdmin ? 'default_team' : (inviteData?.teamId || null);

            const newProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: inviteData?.displayName || firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              teamId: targetTeam,
              role: targetRole,
              allowWfhPunch: inviteData?.allowWfhPunch !== undefined ? Boolean(inviteData.allowWfhPunch) : false,
              assignedPic: inviteData?.assignedPic || inviteData?.displayName || '',
              createdAt: serverTimestamp(),
            };
            try {
              await withTimeout(setDoc(profileRef, newProfile), 3000);
              resolvedProfile = { ...newProfile, uid: firebaseUser.uid };
              if (inviteData && inviteRef) {
                try { await deleteDoc(inviteRef); } catch (e) {}
              }
            } catch (createErr) {
              console.warn('[auth] Direct create of profile blocked (likely firestore rules), attempting compliant fallback:', createErr);
              const fallbackProfile = { ...newProfile, uid: firebaseUser.uid, teamId: null, role: 'pending' };
              resolvedProfile = fallbackProfile;
              try {
                await withTimeout(setDoc(profileRef, fallbackProfile), 3000);
              } catch (fallbackErr) {
                console.error('[auth] Fallback profile creation also failed:', fallbackErr);
              }
            }
          }

          // getDoc / setDoc 完成后立即同步写入 userProfile 并解除 loading，不等待 onSnapshot 首次回调才解锁界面
          if (resolvedProfile) {
            setUserProfile(resolvedProfile);
          }
          clearTimeout(safetyTimeout);
          setLoading(false);

          // 核心：对当前用户文档建立实时监听，任何权限撤销/剔除、WFH 权限开关、角色或团队变更全站零刷新即刻响应
          unsubProfile = onSnapshot(profileRef, (snap) => {
            clearTimeout(safetyTimeout);
            if (snap.exists()) {
              const snapData = snap.data();
              if (snapData.role === 'revoked') {
                setUserProfile({ ...snapData, uid: snap.id, role: 'revoked' });
              } else {
                setUserProfile({ ...snapData, uid: snap.id });
              }
            } else {
              // 用户文档已被管理员从团队剔除并物理删除，立即置为 revoked 阻断工作台并踢出
              setUserProfile({ uid: firebaseUser.uid, email: firebaseUser.email, role: 'revoked' });
            }
            setLoading(false);
          }, (err) => {
            clearTimeout(safetyTimeout);
            console.warn('[auth] Real-time profile listener error:', err);
            setLoading(false);
          });
        } else {
          clearTimeout(safetyTimeout);
          setUser(null);
          setUserProfile(null);
          setLinkedChildTeams([]);
          setActiveViewTeamId(null);
          try {
            localStorage.removeItem('talent_flow_active_team');
          } catch (e) {}
          setLoading(false);
        }
      } catch (error) {
        clearTimeout(safetyTimeout);
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
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      if (unsubProfile) unsubProfile();
      unsubscribeAuth();
    };
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
