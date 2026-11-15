export type CourtVoiceRole = 'scout' | 'proponent' | 'opponent' | 'examiner' | 'judge';

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];
let voiceListenerAttached = false;

function refreshVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    cachedVoices = window.speechSynthesis.getVoices();
    if (!voiceListenerAttached && typeof window.speechSynthesis.addEventListener === 'function') {
      voiceListenerAttached = true;
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        cachedVoices = window.speechSynthesis.getVoices();
      });
    }
  } catch {
    cachedVoices = [];
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctor();
    noiseBuffer = null;
  }
  return audioCtx;
}

export function unlockCourtAudio(): void {
  refreshVoices();
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function stopCourtSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore restricted speech contexts
  }
}

export function disposeCourtAudio(): void {
  stopCourtSpeech();
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
  }
  audioCtx = null;
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
 * triggered when all top 5 daily jobs finish Jury evaluation.
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

function pickVoiceForRole(voices: SpeechSynthesisVoice[], role: CourtVoiceRole): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = enVoices.length ? enVoices : voices;
  const byPattern = (re: RegExp) => pool.find((v) => re.test(v.name));

  if (role === 'judge') {
    return byPattern(/daniel|george|arthur|alex|guy|christopher|david|male/i) || pool[0];
  }
  if (role === 'opponent') {
    return (
      byPattern(/samantha|victoria|karen|aria|jenny|libby|serena|female/i) ||
      pool[pool.length > 1 ? 1 : 0]
    );
  }
  if (role === 'examiner') {
    return byPattern(/moira|fiona|tessa|sonia|emma|google uk/i) || pool[pool.length > 2 ? 2 : 0];
  }
  if (role === 'scout') {
    return byPattern(/google us|zira|sara|ava|allison/i) || pool[pool.length > 3 ? 3 : 0];
  }
  return byPattern(/ryan|thomas|oliver|matthew|mark|andrew/i) || pool[0];
}

const VOICE_TUNING: Record<CourtVoiceRole, { pitch: number; rate: number; volume: number }> = {
  scout: { pitch: 1.12, rate: 1.12, volume: 0.92 },
  proponent: { pitch: 0.96, rate: 1.08, volume: 0.96 },
  opponent: { pitch: 1.13, rate: 1.1, volume: 0.96 },
  examiner: { pitch: 1.03, rate: 1.1, volume: 0.92 },
  judge: { pitch: 0.8, rate: 0.98, volume: 1.0 },
};

/**
 * Speaks the character's courtroom line aloud with distinct voice profile & cadence.
 */
export function speakCourtLine(
  role: CourtVoiceRole,
  rawText: string,
  rateMultiplier = 1
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (!text) return;

  try {
    refreshVoices();
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const chosenVoice = pickVoiceForRole(cachedVoices, role);
    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    } else {
      utterance.lang = 'en-US';
    }

    const tune = VOICE_TUNING[role];
    utterance.pitch = tune.pitch;
    utterance.rate = Math.min(1.48, tune.rate * (rateMultiplier > 1 ? 1.18 : 1.0));
    utterance.volume = tune.volume;

    synth.speak(utterance);
  } catch {
    // Ignore restricted speech contexts
  }
}
