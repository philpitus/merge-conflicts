import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * Speech to text with the browser's Web Speech API (Chrome, Edge and Safari; not Firefox).
 * Chrome sends the audio to Google's speech service; Safari recognises on the device.
 */

type Alternative = { transcript: string };
type Result = { isFinal: boolean; 0: Alternative; length: number };
type ResultEvent = { resultIndex: number; results: { length: number; [i: number]: Result } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: ResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const noop = () => () => {};
const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

/** Always English, whatever language the browser or system is set to. */
const LANG = "en-US";

export type DictationError = "not-allowed" | "other" | null;

type Session = {
  rec: Recognition | null;
  /** Words from earlier recognisers in this session (the browser ends one after a stretch of silence) */
  prior: string;
  current: string;
  onText: (heard: string) => void;
  onEnd: (error: DictationError) => void;
  failures: number;
};

/** Starts a recogniser for the session; when the browser ends it after a silence, starts the next. */
function listen(session: { current: Session | null }, setListening: (on: boolean) => void, setError: (e: DictationError) => void) {
  const s = session.current;
  const Ctor = ctor();
  if (!s || !Ctor) return;
  const rec = new Ctor();
  rec.lang = LANG;
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let heard = "";
    for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
    s.current = heard.replace(/\s+/g, " ").trim();
    s.failures = 0;
    s.onText(join(s.prior, s.current));
  };
  rec.onerror = (e) => {
    if (e.error === "aborted" || e.error === "no-speech") return;
    const err: DictationError = e.error === "not-allowed" || e.error === "service-not-allowed" ? "not-allowed" : "other";
    s.failures++;
    // refused, or failing over and over: end the session instead of restarting it
    if (err === "not-allowed" || s.failures > 2) {
      setError(err);
      session.current = null;
      s.onEnd(err);
    }
  };
  rec.onend = () => {
    if (session.current !== s) {
      // This session is over. It ended itself (refused, failing) only if no other has started since:
      // a recogniser stopped by end() reports its end late, often after the next session has begun.
      if (!session.current) setListening(false);
      return;
    }
    // the browser stopped after a silence: that pause ends a sentence; keep what was heard and listen again
    s.prior = join(s.prior, s.current && !/[.?!,]$/.test(s.current) ? `${s.current}.` : s.current);
    s.current = "";
    listen(session, setListening, setError);
  };
  s.rec = rec;
  try {
    rec.start();
  } catch {
    session.current = null;
    setListening(false);
    s.onEnd("other");
  }
}

/**
 * `start(onText, onEnd)` listens until `end()`, calling `onText` with everything
 * heard so far: settled words plus the guess at the words still being spoken. When the browser's
 * recogniser stops after a silence, a new one picks up, so the session runs until you end it.
 * `onEnd` fires if the session ends on its own, such as when microphone access is refused.
 */
export function useDictation() {
  // Known only in the browser; render as unsupported on the server, then correct it.
  const supported = useSyncExternalStore(noop, () => !!ctor(), () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<DictationError>(null);
  const session = useRef<Session | null>(null);

  const start = useCallback(
    (onText: (heard: string) => void, onEnd: (error: DictationError) => void) => {
      if (!ctor() || session.current) return;
      session.current = { rec: null, prior: "", current: "", onText, onEnd, failures: 0 };
      setError(null);
      setListening(true);
      listen(session, setListening, setError);
    },
    [],
  );

  /** End the session and drop whatever is still on its way: the text on screen is what's kept. */
  const end = useCallback(() => {
    const s = session.current;
    session.current = null;
    if (s?.rec) {
      s.rec.onresult = null;
      s.rec.abort();
    }
    setListening(false);
  }, []);

  // Never leave the microphone on after the component goes away.
  useEffect(() => () => session.current?.rec?.abort(), []);

  return { supported, listening, error, start, end };
}

/**
 * While `on`, opens the microphone a second time just to measure loudness, and hands the level
 * (0–1, smoothed) to `onLevel` every frame. Recognition doesn't expose the audio itself.
 */
export function useMicLevel(on: boolean, onLevel: (level: number) => void) {
  const cb = useRef(onLevel);
  useEffect(() => {
    cb.current = onLevel;
  });

  useEffect(() => {
    if (!on || !navigator.mediaDevices?.getUserMedia) return;
    let raf = 0;
    let stopped = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let level = 0;
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          const rms = Math.sqrt(sum / buf.length);
          // speech sits around 0.02–0.2 rms; map it onto 0–1, rising fast and falling slower
          const target = Math.min(1, Math.max(0, (Math.log10(rms + 1e-4) + 2.6) / 1.9));
          level += (target - level) * (target > level ? 0.45 : 0.12);
          cb.current(level);
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {});
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [on]);
}
