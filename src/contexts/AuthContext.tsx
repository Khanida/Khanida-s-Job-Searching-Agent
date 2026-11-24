import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  auth,
  clearCachedGmailAccessToken,
  fetchUserWorkspaceFromCloud,
  getCachedGmailAccessToken,
  signInWithGooglePopup,
  signOutAccount,
  subscribeJuryDecisionsFromCloud,
  syncEmailPreferenceToCloud,
  syncJuryDecisionToCloud,
  syncProfileToCloud,
} from '../firebase.ts';
import type { JuryDecisionRecord } from '../firebase.ts';
import type { JuryDecisionSnapshot, UserEmailPreference } from '../types.ts';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  syncingCloud: boolean;
  cloudError: string | null;
  juryDecisions: JuryDecisionRecord[];
  gmailAccessToken: string | null;
  hasGmailPermission: boolean;
  signInWithGoogle: () => Promise<void>;
  connectGmail: () => Promise<string | null>;
  clearGmailToken: () => void;
  signOut: () => Promise<void>;
  recordJurySnapshot: (snapshot?: JuryDecisionSnapshot | null) => Promise<void>;
  syncEmailPref: (pref: UserEmailPreference) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authReady: false,
  syncingCloud: false,
  cloudError: null,
  juryDecisions: [],
  gmailAccessToken: null,
  hasGmailPermission: false,
  signInWithGoogle: async () => {},
  connectGmail: async () => null,
  clearGmailToken: () => {},
  signOut: async () => {},
  recordJurySnapshot: async () => {},
  syncEmailPref: async () => {},
});

export function AuthProvider({
  children,
  onWorkspaceHydrated,
}: {
  children: ReactNode;
  onWorkspaceHydrated: () => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [juryDecisions, setJuryDecisions] = useState<JuryDecisionRecord[]>([]);
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(() => getCachedGmailAccessToken());
  const prevUidRef = useRef<string | null>(null);

  const hydrateForUser = useCallback(
    async (signedUser: User) => {
      setSyncingCloud(true);
      setCloudError(null);
      try {
        const cloudData = await fetchUserWorkspaceFromCloud(signedUser.uid);
        let seedHistory: JuryDecisionSnapshot[] = [];

        if (cloudData.profile || cloudData.emailPreference) {
          const hydrateRes = await fetch('/api/workspace/hydrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cloudData),
          });
          if (hydrateRes.ok) {
            const payload = await hydrateRes.json();
            if (Array.isArray(payload.juryHistory)) {
              seedHistory = payload.juryHistory;
            } else if (payload.jurySnapshot) {
              seedHistory = [payload.jurySnapshot];
            }
          }
          onWorkspaceHydrated();
        } else {
          // First sign-in: seed Firestore from current profile & initial Jury deliberations
          const res = await fetch('/api/profile');
          if (res.ok) {
            const payload = await res.json();
            if (payload.profile) {
              await syncProfileToCloud(signedUser.uid, payload.profile);
            }
          }
          const dashRes = await fetch('/api/dashboard?limit=10');
          if (dashRes.ok) {
            const dashPayload = await dashRes.json();
            if (Array.isArray(dashPayload.juryHistory)) {
              seedHistory = dashPayload.juryHistory;
            } else if (dashPayload.jurySnapshot) {
              seedHistory = [dashPayload.jurySnapshot];
            }
          }
        }

        if (cloudData.juryDecisionsCount === 0 && seedHistory.length > 0) {
          for (const item of seedHistory.slice(-12)) {
            await syncJuryDecisionToCloud(signedUser.uid, item);
          }
        }
      } catch (err) {
        setCloudError(err instanceof Error ? err.message : 'Cloud sync unavailable');
      } finally {
        setSyncingCloud(false);
      }
    },
    [onWorkspaceHydrated]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        if (prevUidRef.current && prevUidRef.current !== nextUser.uid) {
          clearCachedGmailAccessToken();
        }
        prevUidRef.current = nextUser.uid;
        setGmailAccessToken(getCachedGmailAccessToken());
        void hydrateForUser(nextUser);
      } else {
        prevUidRef.current = null;
        clearCachedGmailAccessToken();
        setGmailAccessToken(null);
        setJuryDecisions([]);
      }
    });
    return () => unsub();
  }, [hydrateForUser]);

  // Real-time Firestore listener for Jury decisions, strictly gated on authReady && user
  useEffect(() => {
    if (!authReady || !user) {
      setJuryDecisions([]);
      return;
    }

    const unsubscribe = subscribeJuryDecisionsFromCloud(
      user.uid,
      (decisions) => {
        setJuryDecisions(decisions);
      },
      (err) => {
        setCloudError(err.message);
      }
    );

    return () => unsubscribe();
  }, [authReady, user]);

  const recordJurySnapshot = useCallback(
    async (snapshot?: JuryDecisionSnapshot | null) => {
      if (!authReady || !user || !snapshot) return;
      try {
        await syncJuryDecisionToCloud(user.uid, snapshot);
      } catch (err) {
        setCloudError(err instanceof Error ? err.message : 'Unable to sync jury decision checkpoint.');
      }
    },
    [authReady, user]
  );

  const syncEmailPref = useCallback(
    async (pref: UserEmailPreference) => {
      if (!authReady || !user) return;
      try {
        await syncEmailPreferenceToCloud(user.uid, pref);
      } catch (err) {
        setCloudError(err instanceof Error ? err.message : 'Unable to sync email preferences.');
      }
    },
    [authReady, user]
  );

  const signInWithGoogle = useCallback(async () => {
    setCloudError(null);
    const { accessToken } = await signInWithGooglePopup();
    setGmailAccessToken(accessToken || null);
  }, []);

  const connectGmail = useCallback(async (): Promise<string | null> => {
    setCloudError(null);
    const { accessToken } = await signInWithGooglePopup({
      loginHint: user?.email || null,
      forceConsent: true,
    });
    setGmailAccessToken(accessToken || null);
    return accessToken || null;
  }, [user?.email]);

  const clearGmailToken = useCallback(() => {
    clearCachedGmailAccessToken();
    setGmailAccessToken(null);
  }, []);

  const signOut = useCallback(async () => {
    clearCachedGmailAccessToken();
    setGmailAccessToken(null);
    await signOutAccount();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        syncingCloud,
        cloudError,
        juryDecisions,
        gmailAccessToken,
        hasGmailPermission: Boolean(gmailAccessToken),
        signInWithGoogle,
        connectGmail,
        clearGmailToken,
        signOut,
        recordJurySnapshot,
        syncEmailPref,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
