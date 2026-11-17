import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { CandidateProfile, LearnedWeight } from './types.ts';

export interface JuryDecisionRecord {
  sessionId: string;
  sessionDate: string;
  label: string;
  reviewedCount: number;
  matchedCount: number;
  dailyPicksCount: number;
  shortlistedCount: number;
  dismissedCount: number;
  avgMatchScore: number;
  topMatchScore: number;
  createdAtMs?: number;
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function signInWithGooglePopup() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutAccount() {
  return signOut(auth);
}

function clampStr(val: string | null | undefined, max: number): string {
  return String(val || '').slice(0, max);
}

function safeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || 'default_id';
}

function normalizeExpLevel(level: string | undefined): 'entry-level' | 'mid-level' | 'all' {
  if (level === 'mid-level' || level === 'all') return level;
  return 'entry-level';
}

function normalizeTemplate(tpl: string | undefined): 'executive' | 'modern' | 'ats' {
  if (tpl === 'modern' || tpl === 'ats') return tpl;
  return 'executive';
}

export async function ensureUserRootDoc(uid: string, fallbackProfile?: Partial<CandidateProfile>): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        name: clampStr(fallbackProfile?.name || auth.currentUser?.displayName || 'Candidate', 120),
        citizenship: clampStr(fallbackProfile?.citizenship, 120),
        residence: clampStr(fallbackProfile?.residence, 120),
        degree: clampStr(fallbackProfile?.degree, 200),
        skills: clampStr(fallbackProfile?.skills, 3000),
        target_roles: clampStr(fallbackProfile?.target_roles, 1500),
        cv_text: clampStr(fallbackProfile?.cv_text, 120000),
        cv_filename: clampStr(fallbackProfile?.cv_filename, 260),
        experience_level: normalizeExpLevel(fallbackProfile?.experience_level),
        excluded_skills: clampStr(fallbackProfile?.excluded_skills, 600),
        excluded_job_terms: clampStr(fallbackProfile?.excluded_job_terms, 600),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncProfileToCloud(uid: string, profile: CandidateProfile): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const payload = {
    name: clampStr(profile.name, 120),
    citizenship: clampStr(profile.citizenship, 120),
    residence: clampStr(profile.residence, 120),
    degree: clampStr(profile.degree, 200),
    skills: clampStr(profile.skills, 3000),
    target_roles: clampStr(profile.target_roles, 1500),
    cv_text: clampStr(profile.cv_text, 120000),
    cv_filename: clampStr(profile.cv_filename, 260),
    experience_level: normalizeExpLevel(profile.experience_level),
    excluded_skills: clampStr(profile.excluded_skills, 600),
    excluded_job_terms: clampStr(profile.excluded_job_terms, 600),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncJobActionToCloud(
  uid: string,
  action: {
    jobId: string;
    status: 'new' | 'shortlisted' | 'applied' | 'dismissed';
    reason?: string;
    detail?: string;
    incrementClick?: boolean;
  }
): Promise<void> {
  await ensureUserRootDoc(uid);
  const jobId = safeFirestoreId(action.jobId);
  const path = `users/${uid}/jobActions/${jobId}`;
  const ref = doc(db, 'users', uid, 'jobActions', jobId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        jobId,
        status: action.status,
        reason: clampStr(action.reason, 80),
        detail: clampStr(action.detail, 500),
        clicks: action.incrementClick ? 1 : 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prevClicks = Number(snap.data()?.clicks || 0);
      await updateDoc(ref, {
        status: action.status,
        reason: clampStr(action.reason ?? snap.data()?.reason, 80),
        detail: clampStr(action.detail ?? snap.data()?.detail, 500),
        clicks: Math.min(10000, prevClicks + (action.incrementClick ? 1 : 0)),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncApplicationToCloud(
  uid: string,
  appDoc: {
    jobId: string;
    tailored_cv: string;
    cover_letter: string;
    template?: 'executive' | 'modern' | 'ats';
  }
): Promise<void> {
  await ensureUserRootDoc(uid);
  const jobId = safeFirestoreId(appDoc.jobId);
  const path = `users/${uid}/applications/${jobId}`;
  const ref = doc(db, 'users', uid, 'applications', jobId);
  const template = normalizeTemplate(appDoc.template);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        jobId,
        tailored_cv: clampStr(appDoc.tailored_cv, 120000),
        cover_letter: clampStr(appDoc.cover_letter, 40000),
        template,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        tailored_cv: clampStr(appDoc.tailored_cv, 120000),
        cover_letter: clampStr(appDoc.cover_letter, 40000),
        template,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncLearnedWeightsToCloud(
  uid: string,
  weights: LearnedWeight[]
): Promise<void> {
  if (!weights.length) return;
  await ensureUserRootDoc(uid);
  const topWeights = weights.slice(0, 35);

  for (const w of topWeights) {
    const weightId = safeFirestoreId(`${w.feature_type}__${w.feature_value}`);
    const path = `users/${uid}/learnedWeights/${weightId}`;
    const ref = doc(db, 'users', uid, 'learnedWeights', weightId);
    const delta = Math.max(-25, Math.min(25, Number(w.score_delta || 0)));
    const pos = Math.max(0, Math.min(100000, Number(w.positive_hits || 0)));
    const neg = Math.max(0, Math.min(100000, Number(w.negative_hits || 0)));

    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          ownerId: uid,
          feature_type: clampStr(w.feature_type, 64) || 'keyword',
          feature_value: clampStr(w.feature_value, 160) || 'general',
          score_delta: delta,
          positive_hits: pos,
          negative_hits: neg,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          feature_type: clampStr(w.feature_type, 64) || 'keyword',
          feature_value: clampStr(w.feature_value, 160) || 'general',
          score_delta: delta,
          positive_hits: pos,
          negative_hits: neg,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

export async function fetchUserWorkspaceFromCloud(uid: string): Promise<{
  profile: Partial<CandidateProfile> | null;
  jobActions: Array<{ jobId: string; status: string; reason: string; detail: string }>;
  applications: Array<{ jobId: string; tailored_cv: string; cover_letter: string; template: string }>;
  learnedWeights: Array<{
    feature_type: string;
    feature_value: string;
    score_delta: number;
    positive_hits: number;
    negative_hits: number;
  }>;
  juryDecisionsCount: number;
}> {
  const userPath = `users/${uid}`;
  let profile: Partial<CandidateProfile> | null = null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      profile = {
        name: String(d.name || ''),
        citizenship: String(d.citizenship || ''),
        residence: String(d.residence || ''),
        degree: String(d.degree || ''),
        skills: String(d.skills || ''),
        target_roles: String(d.target_roles || ''),
        cv_text: String(d.cv_text || ''),
        cv_filename: String(d.cv_filename || '') || null,
        experience_level: String(d.experience_level || 'entry-level'),
        excluded_skills: String(d.excluded_skills || ''),
        excluded_job_terms: String(d.excluded_job_terms || ''),
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const jobActions: Array<{ jobId: string; status: string; reason: string; detail: string }> = [];
  const actionsPath = `users/${uid}/jobActions`;
  try {
    const q = query(collection(db, 'users', uid, 'jobActions'), where('ownerId', '==', uid));
    const snaps = await getDocs(q);
    snaps.forEach((s) => {
      const d = s.data();
      jobActions.push({
        jobId: String(d.jobId || s.id),
        status: String(d.status || 'new'),
        reason: String(d.reason || ''),
        detail: String(d.detail || ''),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, actionsPath);
  }

  const applications: Array<{ jobId: string; tailored_cv: string; cover_letter: string; template: string }> = [];
  const appsPath = `users/${uid}/applications`;
  try {
    const q = query(collection(db, 'users', uid, 'applications'), where('ownerId', '==', uid));
    const snaps = await getDocs(q);
    snaps.forEach((s) => {
      const d = s.data();
      applications.push({
        jobId: String(d.jobId || s.id),
        tailored_cv: String(d.tailored_cv || ''),
        cover_letter: String(d.cover_letter || ''),
        template: String(d.template || 'executive'),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, appsPath);
  }

  const learnedWeights: Array<{
    feature_type: string;
    feature_value: string;
    score_delta: number;
    positive_hits: number;
    negative_hits: number;
  }> = [];
  const weightsPath = `users/${uid}/learnedWeights`;
  try {
    const q = query(collection(db, 'users', uid, 'learnedWeights'), where('ownerId', '==', uid));
    const snaps = await getDocs(q);
    snaps.forEach((s) => {
      const d = s.data();
      learnedWeights.push({
        feature_type: String(d.feature_type || ''),
        feature_value: String(d.feature_value || ''),
        score_delta: Number(d.score_delta || 0),
        positive_hits: Number(d.positive_hits || 0),
        negative_hits: Number(d.negative_hits || 0),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, weightsPath);
  }

  let juryDecisionsCount = 0;
  const decisionsPath = `users/${uid}/juryDecisions`;
  try {
    const q = query(collection(db, 'users', uid, 'juryDecisions'), where('ownerId', '==', uid));
    const snaps = await getDocs(q);
    juryDecisionsCount = snaps.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, decisionsPath);
  }

  return { profile, jobActions, applications, learnedWeights, juryDecisionsCount };
}

function clampNum(val: unknown, min: number, max: number): number {
  const n = Number(val);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function syncJuryDecisionToCloud(
  uid: string,
  decision: Omit<JuryDecisionRecord, 'createdAtMs'>
): Promise<void> {
  await ensureUserRootDoc(uid);
  const decisionId = safeFirestoreId(decision.sessionId);
  const path = `users/${uid}/juryDecisions/${decisionId}`;
  const ref = doc(db, 'users', uid, 'juryDecisions', decisionId);

  const mutableFields = {
    sessionDate: clampStr(decision.sessionDate, 32) || new Date().toISOString().slice(0, 10),
    label: clampStr(decision.label, 48) || 'Latest Session',
    reviewedCount: clampNum(decision.reviewedCount, 0, 100000),
    matchedCount: clampNum(decision.matchedCount, 0, 100000),
    dailyPicksCount: clampNum(decision.dailyPicksCount, 0, 100),
    shortlistedCount: clampNum(decision.shortlistedCount, 0, 100000),
    dismissedCount: clampNum(decision.dismissedCount, 0, 100000),
    avgMatchScore: clampNum(decision.avgMatchScore, 0, 100),
    topMatchScore: clampNum(decision.topMatchScore, 0, 100),
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        sessionId: decisionId,
        ...mutableFields,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, mutableFields);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeJuryDecisionsFromCloud(
  uid: string,
  onData: (decisions: JuryDecisionRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `users/${uid}/juryDecisions`;
  const q = query(collection(db, 'users', uid, 'juryDecisions'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: JuryDecisionRecord[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const createdTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Date.now();
        items.push({
          sessionId: String(d.sessionId || docSnap.id),
          sessionDate: String(d.sessionDate || ''),
          label: String(d.label || d.sessionDate || docSnap.id),
          reviewedCount: Number(d.reviewedCount || 0),
          matchedCount: Number(d.matchedCount || 0),
          dailyPicksCount: Number(d.dailyPicksCount || 0),
          shortlistedCount: Number(d.shortlistedCount || 0),
          dismissedCount: Number(d.dismissedCount || 0),
          avgMatchScore: Number(d.avgMatchScore || 0),
          topMatchScore: Number(d.topMatchScore || 0),
          createdAtMs: createdTs,
        });
      });

      items.sort((a, b) => {
        const diff = (a.createdAtMs || 0) - (b.createdAtMs || 0);
        if (diff !== 0) return diff;
        return a.sessionId.localeCompare(b.sessionId);
      });

      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}
