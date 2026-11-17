export type JobStatus = 'new' | 'shortlisted' | 'applied' | 'dismissed';
export type LivenessStatus = 'live' | 'expired' | 'unavailable' | 'unverified';
export type AuthenticityStatus = 'likely_official' | 'suspicious' | 'unverified';

export interface CandidateProfile {
  id: number;
  name: string;
  citizenship: string;
  residence: string;
  degree: string;
  skills: string;
  target_roles: string;
  cv_text: string;
  cv_filename: string | null;
  cv_uploaded_at: string | null;
  cv_analysis: CvAnalysis | null;
  experience_level: string;
  excluded_skills: string;
  excluded_job_terms: string;
  updated_at: string;
}

export interface CvAnalysis {
  skills: string[];
  roles: string[];
  summary: string;
}

export interface JobItem {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description: string;
  visa_evidence: string;
  housing_evidence: string;
  score: number;
  jury_score: number;
  is_daily_pick: number;
  advocate_agent: string;
  jury_verdict: string;
  liveness_status: LivenessStatus | string;
  liveness_checked_at: string | null;
  authenticity_status: AuthenticityStatus | string;
  authenticity_evidence: string | null;
  posted_date: string;
  status: JobStatus;
  created_at: string;
  learned_boost?: number;
  learned_reasons?: string[];
  has_application?: boolean;
}

export interface AgentArgument {
  id: number;
  deliberation_id: string;
  job_id: string;
  agent_name: string;
  agent_role: string;
  argument_type: string;
  statement: string;
  score: number;
  created_at: string;
}

export interface JuryVerdict {
  id: number;
  deliberation_id: string;
  job_id: string;
  verdict: string;
  consensus_score: number;
  strengths: string | null;
  risks: string | null;
  recommendation: string;
  is_selected: number;
  created_at: string;
}

export interface DeliberationSession {
  id: string;
  session_date: string;
  summary: string;
  top_picks_count: number;
  created_at: string;
}

export interface ApplicationDraft {
  id: number;
  job_id: string;
  status: string;
  tailored_cv: string;
  cover_letter: string;
  notes: string | null;
  created_at: string;
}

export interface DashboardStats {
  totalRaw: number;
  activeCount: number;
  dailyPicksCount: number;
  shortlistedCount: number;
  appliedCount: number;
  newCount: number;
  expiredCount: number;
  dismissedCount: number;
  liveCount: number;
  sources: Array<{ source: string; count: number }>;
}

export interface JuryDecisionSnapshot {
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
}

export interface DashboardResponse {
  stats: DashboardStats;
  dailyPicks: JobItem[];
  jobs: JobItem[];
  pagination: {
    page: number;
    limit: number;
    totalMatching: number;
    totalPages: number;
  };
  profile: CandidateProfile;
  latestDeliberation: DeliberationSession | null;
  jurySnapshot?: JuryDecisionSnapshot;
  juryHistory?: JuryDecisionSnapshot[];
  googleSearchUrl: string;
}

export interface JobDetailResponse {
  job: JobItem;
  arguments: AgentArgument[];
  verdict: JuryVerdict | null;
  application: ApplicationDraft | null;
}

export interface JuryRoomItem {
  job: JobItem;
  arguments: AgentArgument[];
  verdict: JuryVerdict | null;
}

export interface JuryRoomResponse {
  deliberation: DeliberationSession | null;
  items: JuryRoomItem[];
}

export interface LearnedWeight {
  feature_type: string;
  feature_value: string;
  score_delta: number;
  positive_hits: number;
  negative_hits: number;
  updated_at: string;
}

export interface SettingsResponse {
  training: {
    stage: string;
    total_events: number;
    clicks: number;
    shortlists: number;
    applies: number;
    dismisses: number;
    weights: LearnedWeight[];
  };
  totalJobs: number;
  liveCount: number;
  sources: Array<{ source: string; count: number }>;
  latestDeliberation: DeliberationSession | null;
}

export const REJECTION_REASONS: Record<string, string> = {
  seniority: 'Too senior / too much experience required',
  skills: 'Skills or experience are not a good match',
  location: 'Location or relocation does not work for me',
  authorization: 'Work authorization or visa is unsuitable',
  compensation: 'Salary or benefits are not suitable',
  role_type: 'The role type is not what I want',
  company: 'I do not want to work for this company',
  other: 'Other reason',
};
