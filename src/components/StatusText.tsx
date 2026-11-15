import { AlertTriangle, CheckCircle2, Clock, ShieldCheck, ShieldAlert } from 'lucide-react';

export function LivenessLabel({ status }: { status: string }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Live posting
      </span>
    );
  }
  if (status === 'expired' || status === 'unavailable') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {status === 'expired' ? 'Expired' : 'Unavailable'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Unverified link
    </span>
  );
}

export function AuthenticityLabel({ status }: { status: string }) {
  if (status === 'likely_official') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Official domain
      </span>
    );
  }
  if (status === 'suspicious') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Suspicious URL
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-500 whitespace-nowrap">
      Domain unverified
    </span>
  );
}

export function PipelineStatusLabel({ status }: { status: string }) {
  if (status === 'shortlisted') {
    return <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">Shortlisted</span>;
  }
  if (status === 'applied') {
    return <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">Applied</span>;
  }
  if (status === 'dismissed') {
    return <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Dismissed</span>;
  }
  return <span className="text-xs font-medium text-slate-600 whitespace-nowrap">New</span>;
}
