interface CuteRadarWidgetProps {
  isScanning?: boolean;
  picksCount?: number;
  onClick?: () => void;
}

export function CuteRadarWidget({
  isScanning = false,
  picksCount = 5,
  onClick,
}: CuteRadarWidgetProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={isScanning ? 'Jury radar scanning…' : `${picksCount} top picks on radar — click to refresh`}
      aria-label="Career radar animation — click to convene Jury"
      className="group relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-full bg-white border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      <svg
        viewBox="0 0 128 128"
        className="w-full h-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="radarGlassBg" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="65%" stopColor="#eff6ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.55" />
          </radialGradient>
          <linearGradient id="radarBeamSweep" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.34" />
            <stop offset="60%" stopColor="#60a5fa" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Frosted Radar Disc */}
        <circle cx="64" cy="64" r="56" fill="url(#radarGlassBg)" />

        {/* Expanding Sonar Ripples */}
        <circle
          cx="64"
          cy="64"
          r="26"
          fill="none"
          stroke="#60a5fa"
          strokeWidth="1.5"
          className="animate-sonar-ripple"
        />
        <circle
          cx="64"
          cy="64"
          r="26"
          fill="none"
          stroke="#93c5fd"
          strokeWidth="1.2"
          className="animate-sonar-ripple-delayed"
        />

        {/* Delicate Concentric Orbit Rings */}
        <circle
          cx="64"
          cy="64"
          r="52"
          fill="none"
          stroke="#bfdbfe"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <circle
          cx="64"
          cy="64"
          r="36"
          fill="none"
          stroke="#dbeafe"
          strokeWidth="1"
        />
        <circle
          cx="64"
          cy="64"
          r="20"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1"
        />

        {/* Subtle Axis Crosshair */}
        <line x1="12" y1="64" x2="116" y2="64" stroke="#e2e8f0" strokeWidth="0.9" strokeOpacity="0.8" />
        <line x1="64" y1="12" x2="64" y2="116" stroke="#e2e8f0" strokeWidth="0.9" strokeOpacity="0.8" />

        {/* Rotating Radar Sweep Wedge */}
        <g className="animate-radar-sweep">
          <path
            d="M 64 64 L 64 12 A 52 52 0 0 1 110 39 Z"
            fill="url(#radarBeamSweep)"
          />
          <line
            x1="64"
            y1="64"
            x2="64"
            y2="12"
            stroke="#2563eb"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.65"
          />
        </g>

        {/* Crisp Glowing Discovery Blips */}
        <g className="animate-radar-blip origin-[36px_42px]">
          <circle cx="36" cy="42" r="5.5" fill="#34d399" opacity="0.22" />
          <circle cx="36" cy="42" r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1.2" />
        </g>

        <g className="animate-radar-blip-delayed origin-[92px_45px]">
          <circle cx="92" cy="45" r="6" fill="#60a5fa" opacity="0.22" />
          <path
            d="M92 40 L93.3 43.7 L97 45 L93.3 46.3 L92 50 L90.7 46.3 L87 45 L90.7 43.7 Z"
            fill="#2563eb"
          />
        </g>

        <g className="animate-radar-blip origin-[84px_88px]">
          <circle cx="84" cy="88" r="5" fill="#f472b6" opacity="0.22" />
          <circle cx="84" cy="88" r="2.7" fill="#ec4899" stroke="#ffffff" strokeWidth="1.2" />
        </g>

        <g className="animate-radar-blip-delayed origin-[42px_84px]">
          <circle cx="42" cy="84" r="4.5" fill="#a78bfa" opacity="0.22" />
          <circle cx="42" cy="84" r="2.3" fill="#7c3aed" stroke="#ffffff" strokeWidth="1" />
        </g>

        {/* Sleek Sparkling Beacon Core (replaces cartoon face) */}
        <g className="animate-radar-bob">
          <circle cx="64" cy="64" r="11" fill="#ffffff" stroke="#dbeafe" strokeWidth="2" />
          <circle cx="64" cy="64" r="7.5" fill="#eff6ff" />
          <path
            d="M64 56.8 L65.9 62.1 L71.2 64 L65.9 65.9 L64 71.2 L62.1 65.9 L56.8 64 L62.1 62.1 Z"
            fill={isScanning ? '#2563eb' : '#3b82f6'}
          />
          <circle cx="64" cy="64" r="2" fill="#ffffff" />
        </g>
      </svg>
    </button>
  );
}
