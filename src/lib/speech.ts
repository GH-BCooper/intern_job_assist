/**
 * Voice in and voice out for Scout, on browser-native APIs only.
 *
 * `SpeechRecognition` (Chrome/Edge) dictates a message; `speechSynthesis`
 * (everywhere) reads a reply aloud. Both are free, keyless, and degrade to
 * "unsupported" rather than erroring where they are missing.
 */

type RecognitionResultHandler = (transcript: string, isFinal: boolean) => void;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function dictationSupported(): boolean {
  return !!ctor();
}

export type Dictation = { stop: () => void };

/**
 * Starts dictation, streaming interim text so the input updates as you speak.
 * Returns null when the API is missing.
 */
export function startDictation(
  onResult: RecognitionResultHandler,
  opts: { lang?: string; onError?: (message: string) => void; onEnd?: () => void } = {},
): Dictation | null {
  const Ctor = ctor();
  if (!Ctor) return null;

  let recognition: SpeechRecognitionLike;
  try {
    recognition = new Ctor();
  } catch {
    return null;
  }

  recognition.lang = opts.lang || navigator.language || 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = event => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript || '';
      if (result.isFinal) final += text;
      else interim += text;
    }
    if (final) onResult(final.trim(), true);
    else if (interim) onResult(interim.trim(), false);
  };

  recognition.onerror = event => {
    const message =
      event.error === 'not-allowed'
        ? 'Microphone access was blocked.'
        : event.error === 'no-speech'
          ? 'I did not hear anything.'
          : `Dictation failed (${event.error}).`;
    opts.onError?.(message);
  };

  recognition.onend = () => opts.onEnd?.();

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

/* ------------------------------- speaking ------------------------------- */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Strips the markdown Scout writes so it isn't read out as punctuation. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string, opts: { lang?: string; rate?: number; onEnd?: () => void } = {}): boolean {
  if (!speechSupported()) return false;
  const clean = plainText(text).slice(0, 4000);
  if (!clean) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = opts.lang || navigator.language || 'en-US';
    utterance.rate = opts.rate ?? 1.02;
    // Tell the caller when it stops, whether it finished, was cancelled or failed —
    // without this the UI can only guess and stays on "Stop" for good.
    utterance.onend = () => opts.onEnd?.();
    utterance.onerror = () => opts.onEnd?.();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  if (speechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

export function isSpeaking(): boolean {
  return speechSupported() && window.speechSynthesis.speaking;
}
