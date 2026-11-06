import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth, 
  indexedDBLocalPersistence, 
  browserLocalPersistence, 
  browserSessionPersistence,
  inMemoryPersistence, 
  browserPopupRedirectResolver,
  GoogleAuthProvider 
} from 'firebase/auth';
import { 
  getFirestore, 
  enableMultiTabIndexedDbPersistence 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'build-placeholder-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'localhost',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:000000000000:web:000000000000',
};

// Initialize Firebase (prevent duplicate initialization in dev with HMR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const isIOS = typeof window !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) || 
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

// 客户端安全初始化 Auth：
// 1. 必须显式传入 popupRedirectResolver: browserPopupRedirectResolver，否则 signInWithPopup 会抛 auth/argument-error
// 2. iOS WebKit 的 IndexedDB 在多标签下存在底层死锁缺陷，且 PersistenceUserManager.create 会对数组内所有项并发执行 Promise.all(_isAvailable)，
//    因此在 iOS 下彻底物理剔除 indexedDBLocalPersistence，纯走同步级 LocalStorage/SessionStorage，1ms 完成初始化
let authInstance;
if (typeof window !== 'undefined') {
  try {
    authInstance = initializeAuth(app, {
      popupRedirectResolver: browserPopupRedirectResolver,
      persistence: isIOS
        ? [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]
        : [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]
    });
  } catch (e) {
    // 已经初始化过 (如 HMR 重载) 则安全获取已有实例
    authInstance = getAuth(app);
  }
} else {
  authInstance = getAuth(app);
}

export const auth = authInstance;

// 兼容自定义数据库名 "default"（原项目 omnirecruitmanagement）与 Firebase 标准默认数据库 "(default)"
const defaultDbId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === 'omnirecruitmanagement') ? 'default' : '(default)';
const databaseId = (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || defaultDbId).trim();
export const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);

// 仅在非 iOS 桌面/安卓环境开启多标签 IndexedDB 持久化；iOS 环境直接使用默认内存缓存，彻底斩断 WebKit IndexedDB 死锁源
if (typeof window !== 'undefined' && !isIOS) {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
      console.warn('Persistence not supported in this browser');
    }
  });
}
export const googleProvider = new GoogleAuthProvider();

export default app;
