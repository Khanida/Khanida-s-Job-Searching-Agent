export type CourtVoiceRole = 'scout' | 'proponent' | 'opponent' | 'examiner' | 'judge';

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let speechBusGain: GainNode | null = null;
let activeSpeechNodes: Array<{ stop?: () => void; disconnect: () => void }> = [];
let speechGenerationId = 0;
let autoUnlockAttached = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctor();
    noiseBuffer = null;
    speechBusGain = null;
  }
  return audioCtx;
}

function getSpeechBus(ctx: AudioContext): GainNode {
  if (!speechBusGain || speechBusGain.context !== ctx) {
    speechBusGain = ctx.createGain();
    speechBusGain.gain.setValueAtTime(1, ctx.currentTime);
    speechBusGain.connect(ctx.destination);
  }
  return speechBusGain;
}

function attachAutoUnlockListener(): void {
  if (typeof window === 'undefined' || autoUnlockAttached) return;
  autoUnlockAttached = true;
  const resumeIfNeeded = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('pointerdown', resumeIfNeeded, { passive: true });
  window.addEventListener('keydown', resumeIfNeeded, { passive: true });
}

export function unlockCourtAudio(): void {
  attachAutoUnlockListener();
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function stopCourtSpeech(): void {
  speechGenerationId += 1;

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore restricted speech contexts
    }
  }

  for (const node of activeSpeechNodes) {
    try {
      node.stop?.();
    } catch {
      // Node may already be stopped
    }
    try {
      node.disconnect();
    } catch {
      // Ignore disconnect issues
    }
  }
  activeSpeechNodes = [];

  if (audioCtx && speechBusGain && audioCtx.state === 'running') {
    const now = audioCtx.currentTime;
    speechBusGain.gain.cancelScheduledValues(now);
    speechBusGain.gain.setValueAtTime(1, now);
  }
}

export function disposeCourtAudio(): void {
  stopCourtSpeech();
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
  }
  audioCtx = null;
  speechBusGain = null;
  noiseBuffer = null;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.14);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.025));
  }
  noiseBuffer = buf;
  return buf;
}

/**
 * Crisp hardwood-on-sounding-block gavel strike synthesized with Web Audio API.
 */
export function playGavelStrike(volume = 0.56): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(195, now);
  osc.frequency.exponentialRampToValueAtTime(62, now + 0.09);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1250, now);
  filter.Q.setValueAtTime(2.6, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * 0.65, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
}

/**
 * Subtle discovery sonar ping when a department Scout finds a vacancy.
 */
export function playScoutPing(volume = 0.14): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(587.33, now);
  osc.frequency.setValueAtTime(783.99, now + 0.07);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

/**
 * Soft chamber cue tone when passing the floor between debating Counsel.
 */
export function playCounselCue(isObjection = false, volume = 0.12): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(isObjection ? 440 : 523.25, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

/**
 * Celebratory courtroom applause (staggered hand claps + warm fanfare chime)
 * triggered when all daily cases finish Jury evaluation.
 */
export function playCelebrationApplause(volume = 0.42): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const buf = getNoiseBuffer(ctx);

  // 1. Bright celebratory C-major fanfare chord arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const t0 = now + i * 0.095;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(volume * 0.28, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.65);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.68);
  });

  // 2. Crisp staggered applause claps across the courtroom (~2.8 seconds)
  const clapCount = 34;
  for (let i = 0; i < clapCount; i++) {
    const progress = i / clapCount;
    const envelope = Math.sin(progress * Math.PI);
    const jitter = ((Math.sin(i * 19.31) + 1) * 0.5) * 0.05;
    const t0 = now + 0.08 + i * 0.075 + jitter;

    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(950 + (i % 5) * 280, t0);
    bp.Q.setValueAtTime(1.4, t0);

    const g = ctx.createGain();
    const peak = Math.max(0.04, volume * (0.28 + 0.48 * envelope));
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.095);

    noise.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    noise.start(t0);
    noise.stop(t0 + 0.11);
  }
}

interface ArcadeVoiceProfile {
  waveform: OscillatorType;
  subWaveform: OscillatorType;
  baseHz: number;
  pitchSpan: number;
  formantLowHz: number;
  formantHighHz: number;
  filterType: BiquadFilterType;
  filterQ: number;
  blipMs: number;
  gapMs: number;
  volume: number;
  pitchSlide: number;
}

const ARCADE_VOICE_PROFILES: Record<CourtVoiceRole, ArcadeVoiceProfile> = {
  scout: {
    waveform: 'triangle',
    subWaveform: 'square',
    baseHz: 470,
    pitchSpan: 0.34,
    formantLowHz: 1100,
    formantHighHz: 2300,
    filterType: 'bandpass',
    filterQ: 2.0,
    blipMs: 44,
    gapMs: 18,
    volume: 0.16,
    pitchSlide: 1.12,
  },
  proponent: {
    waveform: 'sawtooth',
    subWaveform: 'triangle',
    baseHz: 235,
    pitchSpan: 0.24,
    formantLowHz: 680,
    formantHighHz: 1450,
    filterType: 'lowpass',
    filterQ: 3.2,
    blipMs: 58,
    gapMs: 22,
    volume: 0.18,
    pitchSlide: 1.05,
  },
  opponent: {
    waveform: 'square',
    subWaveform: 'sawtooth',
    baseHz: 340,
    pitchSpan: 0.32,
    formantLowHz: 950,
    formantHighHz: 2100,
    filterType: 'bandpass',
    filterQ: 2.8,
    blipMs: 52,
    gapMs: 20,
    volume: 0.15,
    pitchSlide: 0.88,
  },
  examiner: {
    waveform: 'triangle',
    subWaveform: 'sawtooth',
    baseHz: 300,
    pitchSpan: 0.26,
    formantLowHz: 850,
    formantHighHz: 1750,
    filterType: 'bandpass',
    filterQ: 2.4,
    blipMs: 50,
    gapMs: 18,
    volume: 0.17,
    pitchSlide: 1.08,
  },
  judge: {
    waveform: 'sawtooth',
    subWaveform: 'triangle',
    baseHz: 136,
    pitchSpan: 0.16,
    formantLowHz: 420,
    formantHighHz: 860,
    filterType: 'lowpass',
    filterQ: 2.8,
    blipMs: 74,
    gapMs: 28,
    volume: 0.22,
    pitchSlide: 0.94,
  },
};

interface GibberishSyllable {
  charCode: number;
  vowelBoost: number;
  pauseAfterMs: number;
}

/**
 * Converts readable dialogue into deterministic arcade gibberish syllable bursts
 * so characters "chatter" expressively without speaking literal words.
 */
function buildGibberishSyllables(text: string): GibberishSyllable[] {
  const words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const syllables: GibberishSyllable[] = [];
  const maxSyllables = 24;

  for (let wIdx = 0; wIdx < words.length && syllables.length < maxSyllables; wIdx++) {
    const word = words[wIdx];
    const clean = word.replace(/[^a-zA-Z0-9]/g, '');
    if (!clean) continue;

    // 1 to 2 arcade vocal blips per word depending on word length
    const chunks = clean.length >= 6 ? 2 : 1;
    for (let c = 0; c < chunks && syllables.length < maxSyllables; c++) {
      const ch = clean.charAt(c * 3) || clean.charAt(0);
      const code = ch.toLowerCase().charCodeAt(0);
      const hasBrightVowel = /[eiy]/i.test(clean);
      const hasOpenVowel = /[ao]/i.test(clean);
      const vowelBoost = hasBrightVowel ? 1.18 : hasOpenVowel ? 0.94 : 1.04;
      const endsWithComma = c === chunks - 1 && /[,;:\-]$/.test(word);
      const endsWithSentence = c === chunks - 1 && /[.!?]$/.test(word);

      syllables.push({
        charCode: code,
        vowelBoost,
        pauseAfterMs: endsWithSentence ? 68 : endsWithComma ? 44 : c === chunks - 1 ? 14 : 0,
      });
    }
  }

  return syllables;
}

function scheduleArcadeGibberish(
  ctx: AudioContext,
  role: CourtVoiceRole,
  rawText: string,
  rateMultiplier: number,
  generationId: number
): void {
  if (generationId !== speechGenerationId) return;

  const profile = ARCADE_VOICE_PROFILES[role];
  const bus = getSpeechBus(ctx);
  const syllables = buildGibberishSyllables(rawText);
  if (!syllables.length) return;

  const tempoScale = rateMultiplier > 1.3 ? 0.72 : rateMultiplier > 1.05 ? 0.85 : 1.0;
  const endsQuestion = rawText.trim().endsWith('?');
  const endsExclaim = rawText.trim().endsWith('!');

  let cursorSec = ctx.currentTime + 0.025;
  const maxTotalSec = 1.85 * tempoScale;
  const totalSyllables = syllables.length;

  for (let i = 0; i < totalSyllables; i++) {
    if (cursorSec - ctx.currentTime >= maxTotalSec) break;

    const s = syllables[i];
    const progress = totalSyllables > 1 ? i / (totalSyllables - 1) : 0;

    // Deterministic bouncy pseudo-random contour per character
    const hash = Math.abs(Math.sin((s.charCode + i * 7) * 12.9898));
    let contour = 1 + (hash - 0.5) * 2 * profile.pitchSpan;

    if (endsQuestion && progress > 0.72) {
      contour *= 1 + (progress - 0.72) * 0.95;
    } else if (endsExclaim && (progress < 0.2 || progress > 0.78)) {
      contour *= 1.16;
    } else if (progress > 0.84) {
      contour *= 0.9;
    }

    const startHz = Math.max(80, profile.baseHz * contour * s.vowelBoost);
    const endHz = Math.max(75, startHz * profile.pitchSlide);
    const durSec = Math.max(0.032, (profile.blipMs / 1000) * tempoScale * (0.86 + hash * 0.28));

    const osc = ctx.createOscillator();
    osc.type = profile.waveform;
    osc.frequency.setValueAtTime(startHz, cursorSec);
    osc.frequency.exponentialRampToValueAtTime(endHz, cursorSec + durSec);

    const subOsc = ctx.createOscillator();
    subOsc.type = profile.subWaveform;
    subOsc.frequency.setValueAtTime(startHz * (role === 'judge' ? 0.5 : 1.5), cursorSec);
    subOsc.frequency.exponentialRampToValueAtTime(
      endHz * (role === 'judge' ? 0.5 : 1.5),
      cursorSec + durSec
    );

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(role === 'judge' ? 0.45 : 0.24, cursorSec);

    const formantFilter = ctx.createBiquadFilter();
    formantFilter.type = profile.filterType;
    const fStart = profile.formantLowHz + (hash * (profile.formantHighHz - profile.formantLowHz));
    const fEnd = profile.formantHighHz - (hash * (profile.formantHighHz - profile.formantLowHz) * 0.45);
    formantFilter.frequency.setValueAtTime(fStart, cursorSec);
    formantFilter.frequency.linearRampToValueAtTime(fEnd, cursorSec + durSec);
    formantFilter.Q.setValueAtTime(profile.filterQ, cursorSec);

    const env = ctx.createGain();
    const peak = endsExclaim && progress > 0.75 ? profile.volume * 1.18 : profile.volume;
    env.gain.setValueAtTime(0.0001, cursorSec);
    env.gain.linearRampToValueAtTime(peak, cursorSec + 0.008);
    env.gain.setValueAtTime(peak * 0.85, cursorSec + durSec * 0.62);
    env.gain.exponentialRampToValueAtTime(0.0001, cursorSec + durSec);

    osc.connect(formantFilter);
    subOsc.connect(subGain);
    subGain.connect(formantFilter);
    formantFilter.connect(env);
    env.connect(bus);

    osc.start(cursorSec);
    subOsc.start(cursorSec);
    osc.stop(cursorSec + durSec + 0.01);
    subOsc.stop(cursorSec + durSec + 0.01);

    activeSpeechNodes.push(osc, subOsc, subGain, formantFilter, env);

    const gapSec = ((profile.gapMs + s.pauseAfterMs) / 1000) * tempoScale;
    cursorSec += durSec + gapSec;
  }
}

/**
 * Speaks the character's line using synthesized arcade-game gibberish syllables
 * ("blah-bluh-blip" vocal chatter) while keeping original text in speech bubbles.
 */
export function speakCourtLine(
  role: CourtVoiceRole,
  rawText: string,
  rateMultiplier = 1
): void {
  if (typeof window === 'undefined') return;
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (!text) return;

  stopCourtSpeech();
  const generationId = speechGenerationId;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running' && generationId === speechGenerationId) {
          scheduleArcadeGibberish(ctx, role, text, rateMultiplier, generationId);
        }
      })
      .catch(() => {});
    return;
  }

  if (ctx.state === 'running') {
    scheduleArcadeGibberish(ctx, role, text, rateMultiplier, generationId);
  }
}
