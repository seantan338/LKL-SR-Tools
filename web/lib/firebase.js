import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

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

export const auth = getAuth(app);

// 默认使用 Firebase 标准数据库 "(default)"；如需命名数据库，设置 NEXT_PUBLIC_FIREBASE_DATABASE_ID
const databaseId = (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || '(default)').trim();
export const db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);

// 开启多标签页离线持久化 (极致降低读取成本)
if (typeof window !== 'undefined') {
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
