import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { API_URL } from './config';

export type AppUser = { id: string; role: 'Employee' | 'Staff' | 'Admin'; departmentId?: string };
type AuthIdentity = { uid: string; email: string | null; displayName?: string | null; getIdToken: () => Promise<string> };
type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAd2zzO7qI6D-Um8gA6aoYPHFVulFDP_0Q',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'internaloperationservice-f9727.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'internaloperationservice-f9727',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'internaloperationservice-f9727.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '395400276005',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:395400276005:web:94f776017f9b270d1577cc',
};

const isE2eMode = import.meta.env.DEV && import.meta.env.MODE === 'e2e';
const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
const AuthContext = createContext<AuthContextValue | null>(null);

function e2eIdentity(): AuthIdentity | null {
  if (!isE2eMode) return null;
  const value = localStorage.getItem('service-hub-e2e-user');
  if (!value) return null;
  const account = JSON.parse(value) as { uid: string; email: string; displayName?: string };
  return { ...account, getIdToken: async () => `e2e-token:${account.uid}` };
}

async function getAuthToken(): Promise<string> {
  if (isE2eMode) {
    const identity = e2eIdentity();
    if (!identity) throw new Error('Sign in to continue.');
    return identity.getIdToken();
  }
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error('Sign in to continue.');
  return current.getIdToken();
}

async function loadAppUser(identity: AuthIdentity): Promise<AppUser> {
  const token = await identity.getIdToken();
  const response = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : 'Unable to load your account.';
    throw new Error(message);
  }
  return body as AppUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let identityRevision = 0;
    const acceptIdentity = async (identity: AuthIdentity | null) => {
      const revision = ++identityRevision;
      const isCurrent = () => active && revision === identityRevision;
      if (!identity) {
        if (isCurrent()) {
          setUser(null);
          setError('');
          setLoading(false);
        }
        return;
      }
      if (isCurrent()) setLoading(true);
      try {
        const appUser = await loadAppUser(identity);
        if (isCurrent()) {
          setUser(appUser);
          setError('');
        }
      } catch (err) {
        if (isCurrent()) {
          setUser(null);
          setError(err instanceof Error ? err.message : 'Unable to verify your account with the service.');
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    };

    if (isE2eMode) {
      const update = () => void acceptIdentity(e2eIdentity());
      update();
      window.addEventListener('service-hub-auth-changed', update);
      return () => {
        active = false;
        window.removeEventListener('service-hub-auth-changed', update);
      };
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser: User | null) => {
      void acceptIdentity(firebaseUser);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    error,
    async signIn(email, password) {
      setError('');
      if (isE2eMode) {
        localStorage.setItem('service-hub-e2e-user', JSON.stringify({ uid: `e2e-${email.toLowerCase()}`, email }));
        window.dispatchEvent(new Event('service-hub-auth-changed'));
        return;
      }
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    },
    async signUp(name, email, password) {
      setError('');
      if (isE2eMode) {
        localStorage.setItem('service-hub-e2e-user', JSON.stringify({ uid: `e2e-${email.toLowerCase()}`, email, displayName: name }));
        window.dispatchEvent(new Event('service-hub-auth-changed'));
        return;
      }
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      await updateProfile(credential.user, { displayName: name });
    },
    async logout() {
      if (isE2eMode) {
        localStorage.removeItem('service-hub-e2e-user');
        window.dispatchEvent(new Event('service-hub-auth-changed'));
        return;
      }
      await signOut(firebaseAuth);
    },
  }), [user, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

export { getAuthToken };
