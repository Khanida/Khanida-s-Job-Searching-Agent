import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  auth,
  fetchUserWorkspaceFromCloud,
  signInWithGooglePopup,
  signOutAccount,
  subscribeJuryDecisionsFromCloud,
  syncJuryDecisionToCloud,
  syncProfileToCloud,
} from '../firebase.ts';
import type { JuryDecisionRecord } from '../firebase.ts';
import type { JuryDecisionSnapshot } from '../types.ts';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  syncingCloud: boolean;
  cloudError: string | null;
  juryDecisions: JuryDecisionRecord[];
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  recordJurySnapshot: (snapshot?: JuryDecisionSnapshot | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authReady: false,
  syncingCloud: false,
  cloudError: null,
  juryDecisions: [],
  signInWithGoogle: async () => {},
  signOut: async () => {},
  recordJurySnapshot: async () => {},
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

  const hydrateForUser = useCallback(
    async (signedUser: User) => {
      setSyncingCloud(true);
      setCloudError(null);
      try {
        const cloudData = await fetchUserWorkspaceFromCloud(signedUser.uid);
        let seedHistory: JuryDecisionSnapshot[] = [];

        if (cloudData.profile) {
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
        void hydrateForUser(nextUser);
      } else {
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

  const signInWithGoogle = useCallback(async () => {
    setCloudError(null);
    await signInWithGooglePopup();
  }, []);

  const signOut = useCallback(async () => {
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
        signInWithGoogle,
        signOut,
        recordJurySnapshot,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
