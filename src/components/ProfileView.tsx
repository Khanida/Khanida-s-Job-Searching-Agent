import { useEffect, useState } from 'react';
import { Cloud, Save, Upload } from 'lucide-react';
import type { CandidateProfile } from '../types.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { syncProfileToCloud } from '../firebase.ts';

interface ProfileViewProps {
  onNotify: (message: string) => void;
  onProfileSaved: () => void;
}

export function ProfileView({ onNotify, onProfileSaved }: ProfileViewProps) {
  const { user, signInWithGoogle, recordJurySnapshot } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  const [name, setName] = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [residence, setResidence] = useState('');
  const [degree, setDegree] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('entry-level');
  const [targetRoles, setTargetRoles] = useState('');
  const [skills, setSkills] = useState('');
  const [excludedSkills, setExcludedSkills] = useState('');
  const [excludedJobTerms, setExcludedJobTerms] = useState('');
  const [cvText, setCvText] = useState('');

  const hydrate = (p: CandidateProfile) => {
    setProfile(p);
    setName(p.name || '');
    setCitizenship(p.citizenship || '');
    setResidence(p.residence || '');
    setDegree(p.degree || '');
    setExperienceLevel(p.experience_level || 'entry-level');
    setTargetRoles(p.target_roles || '');
    setSkills(p.skills || '');
    setExcludedSkills(p.excluded_skills || '');
    setExcludedJobTerms(p.excluded_job_terms || '');
    setCvText(p.cv_text || '');
  };

  useEffect(() => {
    let active = true;
    fetch('/api/profile')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load candidate profile.');
        return res.json();
      })
      .then((data: { profile: CandidateProfile }) => {
        if (active) hydrate(data.profile);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Load error.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          citizenship,
          residence,
          degree,
          experience_level: experienceLevel,
          target_roles: targetRoles,
          skills,
          excluded_skills: excludedSkills,
          excluded_job_terms: excludedJobTerms,
          cv_text: cvText,
          preserveRoles: cvText.trim() === (profile?.cv_text || '').trim(),
          preserveSkills: cvText.trim() === (profile?.cv_text || '').trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to save profile.');
      hydrate(data.profile);
      if (user && data.profile) {
        void syncProfileToCloud(user.uid, data.profile);
      }
      if (data.jurySnapshot) {
        void recordJurySnapshot(data.jurySnapshot);
      }
      onNotify(
        user
          ? `${data.message || 'Profile saved and Jury updated.'} Synced to cloud account.`
          : data.message || 'Profile saved and Jury updated.'
      );
      onProfileSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save error.');
    } finally {
      setSaving(false);
    }
  };

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('cv_file', file);
      const res = await fetch('/api/profile/upload-cv', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      hydrate(data.profile);
      if (user && data.profile) {
        void syncProfileToCloud(user.uid, data.profile);
      }
      onNotify(data.message || 'CV uploaded and analyzed.');
      onProfileSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload error.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-white border border-slate-200 rounded-xl" />
        <div className="h-96 bg-white border border-slate-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="pb-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Candidate Criteria &amp; CV Matching</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Candidate Profile Matrix
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Configure target tracks, exclusions, and CV content. Saving re-convenes the Supreme Jury with your updated constraints.
          </p>
        </div>
        {!user ? (
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Sign in to persist CV permanently</span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg whitespace-nowrap self-start sm:self-auto">
            <Cloud className="w-3.5 h-3.5" />
            <span>Auto-saved to {user.email}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
          {error}
        </div>
      )}

      {/* CV Analysis Overview */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              CV Analysis &amp; Document Upload
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {profile?.cv_filename
                ? `Active file: ${profile.cv_filename}`
                : 'Upload a .txt, .md, .docx, or text-based .pdf resume to extract skills locally.'}
            </p>
          </div>

          <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors whitespace-nowrap self-start sm:self-auto">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Analyzing…' : 'Upload CV File'}</span>
            <input
              type="file"
              accept=".txt,.md,.docx,.pdf"
              onChange={handleCvUpload}
              disabled={uploading}
              className="sr-only"
            />
          </label>
        </div>

        {profile?.cv_analysis && (
          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-slate-500">Detected Skills</div>
              <p className="text-sm text-slate-800 mt-1">
                {profile.cv_analysis.skills.length
                  ? profile.cv_analysis.skills.join(' · ')
                  : 'No skills detected yet'}
              </p>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Recommended Tracks</div>
              <p className="text-sm text-slate-800 mt-1">
                {profile.cv_analysis.roles.length
                  ? profile.cv_analysis.roles.join(' · ')
                  : 'Add CV details below'}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Main Profile Form */}
      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Full Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="profile-citizenship" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Citizenship
            </label>
            <input
              id="profile-citizenship"
              type="text"
              value={citizenship}
              onChange={(e) => setCitizenship(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="profile-residence" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Preferred City / Residence
            </label>
            <input
              id="profile-residence"
              type="text"
              value={residence}
              onChange={(e) => setResidence(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="profile-degree" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Degree &amp; Institution
            </label>
            <input
              id="profile-degree"
              type="text"
              value={degree}
              onChange={(e) => setDegree(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="profile-level" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Seniority Filter
            </label>
            <select
              id="profile-level"
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="entry-level">Entry-level / Graduate only</option>
              <option value="mid-level">Include Mid-level roles</option>
              <option value="all">All seniority levels</option>
            </select>
          </div>

          <div>
            <label htmlFor="profile-excluded-skills" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Excluded Skills (comma-separated)
            </label>
            <input
              id="profile-excluded-skills"
              type="text"
              value={excludedSkills}
              onChange={(e) => setExcludedSkills(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div>
          <label htmlFor="profile-target-roles" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Target Roles (comma-separated)
          </label>
          <input
            id="profile-target-roles"
            type="text"
            value={targetRoles}
            onChange={(e) => setTargetRoles(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label htmlFor="profile-skills" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Core Skills (comma-separated)
          </label>
          <input
            id="profile-skills"
            type="text"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label htmlFor="profile-excluded-terms" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Excluded Job Title Terms (comma-separated)
          </label>
          <input
            id="profile-excluded-terms"
            type="text"
            value={excludedJobTerms}
            onChange={(e) => setExcludedJobTerms(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label htmlFor="profile-cv-text" className="block text-xs font-semibold text-slate-700 mb-1.5">
            CV Plain Text (used for local matching &amp; tailored application drafts)
          </label>
          <textarea
            id="profile-cv-text"
            rows={8}
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            placeholder="Paste your resume text or upload a CV file above..."
            className="w-full p-3.5 text-sm font-mono leading-relaxed bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving & Re-Debating…' : 'Save Profile & Re-Debate Jobs'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
