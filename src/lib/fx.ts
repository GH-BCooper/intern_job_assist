/**
 * Celebration and sound, both hand-rolled to keep the zero-new-dependency streak.
 *
 * Confetti is a canvas the module owns and removes when the burst ends; sounds
 * are Web Audio oscillators, so there are no audio files to host. Both respect
 * `prefers-reduced-motion` and the user's sound preference.
 */

import { read } from './store';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ------------------------------- confetti ------------------------------- */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
};

const COLORS = ['#FB923C', '#FF7E7E', '#FFB245', '#34D399', '#38BDF8', '#A78BFA'];

let running = false;

/** A short, physical burst from the bottom centre. Silently no-ops when reduced motion is on. */
export function confetti(opts: { count?: number; duration?: number } = {}) {
  if (typeof document === 'undefined' || prefersReducedMotion() || running) return;
  const count = opts.count ?? 90;
  const duration = opts.duration ?? 2400;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:200';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const particles: Particle[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const speed = 9 + Math.random() * 9;
    return {
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h + 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  running = true;
  const started = performance.now();

  const frame = (t: number) => {
    const elapsed = t - started;
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.vy += 0.28; // gravity
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    if (elapsed < duration) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
      running = false;
    }
  };

  requestAnimationFrame(frame);
}

/* -------------------------------- sound -------------------------------- */

let audioCtx: AudioContext | null = null;

function ctxOrNull(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

type Tone = { freq: number; at: number; duration: number; gain?: number; type?: OscillatorType };

function playTones(tones: Tone[]) {
  const ctx = ctxOrNull();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  tones.forEach(tone => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type || 'sine';
    osc.frequency.value = tone.freq;
    const peak = tone.gain ?? 0.07;
    gain.gain.setValueAtTime(0.0001, t0 + tone.at);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + tone.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + tone.at);
    osc.stop(t0 + tone.at + tone.duration + 0.02);
  });
}

export type SoundName = 'pop' | 'chime' | 'click' | 'error';

const SOUNDS: Record<SoundName, Tone[]> = {
  click: [{ freq: 660, at: 0, duration: 0.05, gain: 0.04, type: 'triangle' }],
  pop: [
    { freq: 520, at: 0, duration: 0.08, type: 'triangle' },
    { freq: 780, at: 0.05, duration: 0.1, type: 'sine' },
  ],
  chime: [
    { freq: 523.25, at: 0, duration: 0.28 },
    { freq: 659.25, at: 0.1, duration: 0.3 },
    { freq: 783.99, at: 0.2, duration: 0.42 },
    { freq: 1046.5, at: 0.3, duration: 0.5, gain: 0.05 },
  ],
  error: [
    { freq: 300, at: 0, duration: 0.12, type: 'sawtooth', gain: 0.045 },
    { freq: 210, at: 0.1, duration: 0.18, type: 'sawtooth', gain: 0.045 },
  ],
};

/** Plays a UI sound if the user opted in. Never throws. */
export function play(name: SoundName) {
  try {
    if (!read().preferences.sounds) return;
    playTones(SOUNDS[name]);
  } catch {
    /* audio is decoration — never let it break a flow */
  }
}

/** Preview a sound regardless of the preference, for the Settings toggle. */
export function previewSound(name: SoundName) {
  try {
    playTones(SOUNDS[name]);
  } catch {
    /* ignore */
  }
}

/** The full Offer celebration: confetti plus the rising chime. */
export function celebrate() {
  confetti();
  play('chime');
}
