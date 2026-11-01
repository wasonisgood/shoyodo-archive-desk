import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDoc, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'kosho-gura.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'kosho-gura',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'kosho-gura.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '407818398486',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
export let db: Firestore | null = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn('Firebase 初始化失敗（離線運作模式）:', e);
}

/**
 * 遠端驗證該 UID 是否仍然具有管理者權限
 * 邊界條件：若管理者已被解除名單，回傳 false
 */
export async function verifyRemoteAdminStatus(uid: string): Promise<boolean> {
  if (!db || !uid) return false;
  try {
    const adminRef = doc(db, 'admins', uid);
    const snap = await getDoc(adminRef);
    return snap.exists();
  } catch (e) {
    console.warn('驗證雲端管理者名單失敗（可能離線，保持既有許可）:', e);
    // 網路不可達時，不要隨意踢出管理員，保持許可
    return true;
  }
}
