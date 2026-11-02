import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

// Speech to text for the agent (§5.9.7, D10): the system SpeechRecognizer on Android (works
// offline with the on-device recognizer and the Polish language pack), the Web Speech API in
// Edge/Chrome on the PC (needs the network). Elsewhere (Firefox) there is no voice input.

const LANGUAGE = 'pl-PL';

// Why listening ended without a transcript.
export type SpeechError = 'denied' | 'unavailable' | 'network' | 'no_speech' | 'failed';

export type SpeechHandlers = {
  // The whole transcript of this session so far: partial while speaking, then final.
  onText: (text: string) => void;
  // Once, when listening ends: `null` after a transcript or a stop.
  onEnd: (error: SpeechError | null) => void;
};

export type SpeechSession = { stop: () => void };

// Listening couldn't start: `listen` rejects with it and `onEnd` is never called.
export class SpeechFailure extends Error {
  constructor(readonly code: SpeechError) {
    super(code);
    this.name = 'SpeechFailure';
  }
}

// The Web Speech API, which the DOM types don't describe.
type WebRecognitionResult = { readonly length: number; [index: number]: { transcript: string } };
type WebRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<WebRecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type WebRecognitionClass = new () => WebRecognition;

function webRecognition(): WebRecognitionClass | undefined {
  const scope = window as unknown as {
    SpeechRecognition?: WebRecognitionClass;
    webkitSpeechRecognition?: WebRecognitionClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

const native = () => Capacitor.isNativePlatform();

// Whether the mic button is shown at all.
export function speechSupported(): boolean {
  return native() || webRecognition() !== undefined;
}

// The browser recognizer sends audio to a server; Android can recognize on the device.
export function speechNeedsNetwork(): boolean {
  return !native();
}

export function listen(handlers: SpeechHandlers): Promise<SpeechSession> {
  return native() ? listenNative(handlers) : listenWeb(handlers);
}

const WEB_ERRORS: Record<string, SpeechError | null> = {
  'not-allowed': 'denied',
  'service-not-allowed': 'denied',
  network: 'network',
  'no-speech': 'no_speech',
  'language-not-supported': 'unavailable',
  // Stopped on purpose.
  aborted: null,
};

async function listenWeb({ onText, onEnd }: SpeechHandlers): Promise<SpeechSession> {
  const Recognition = webRecognition();
  if (!Recognition) throw new SpeechFailure('unavailable');
  const recognition = new Recognition();
  recognition.lang = LANGUAGE;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  let error: SpeechError | null = null;
  recognition.onresult = ({ results }) =>
    onText(
      Array.from(results, (result) => result[0]?.transcript ?? '')
        .join('')
        .trim(),
    );
  recognition.onerror = (event) => {
    const mapped = WEB_ERRORS[event.error];
    error = mapped === undefined ? 'failed' : mapped;
  };
  recognition.onend = () => onEnd(error);
  try {
    recognition.start();
  } catch {
    throw new SpeechFailure('failed');
  }
  return { stop: () => recognition.stop() };
}

const NATIVE_ERRORS: Record<string, SpeechError> = {
  INSUFFICIENT_PERMISSIONS: 'denied',
  NETWORK: 'network',
  NETWORK_TIMEOUT: 'network',
  SERVER: 'network',
  SERVER_DISCONNECTED: 'network',
  NO_MATCH: 'no_speech',
  SPEECH_TIMEOUT: 'no_speech',
};

async function listenNative({ onText, onEnd }: SpeechHandlers): Promise<SpeechSession> {
  const permission = await SpeechRecognition.requestPermissions();
  if (permission.speechRecognition !== 'granted') throw new SpeechFailure('denied');
  if (!(await SpeechRecognition.available()).available) throw new SpeechFailure('unavailable');
  // Online, the system recognizer (the most accurate, no language pack needed); offline only the
  // on-device one can work.
  const onDevice =
    !navigator.onLine &&
    (await SpeechRecognition.isOnDeviceRecognitionAvailable({ language: LANGUAGE })).available;

  let error: SpeechError | null = null;
  let ended = false;
  const handles: PluginListenerHandle[] = [];
  const end = () => {
    if (ended) return;
    ended = true;
    for (const handle of handles) void handle.remove();
    onEnd(error);
  };
  handles.push(
    await SpeechRecognition.addListener('partialResults', (event) => {
      const text = event.accumulatedText ?? event.matches?.[0];
      if (text) onText(text.trim());
    }),
    await SpeechRecognition.addListener('error', (event) => {
      error = NATIVE_ERRORS[event.code] ?? 'failed';
    }),
    await SpeechRecognition.addListener('listeningState', (event) => {
      if (event.state === 'stopped' || event.status === 'stopped') end();
    }),
  );
  try {
    await SpeechRecognition.start({
      language: LANGUAGE,
      partialResults: true,
      popup: false,
      useOnDeviceRecognition: onDevice,
    });
  } catch {
    // No recognizer for Polish (on the device, without the language pack).
    ended = true;
    for (const handle of handles) void handle.remove();
    throw new SpeechFailure('unavailable');
  }
  return { stop: () => void SpeechRecognition.stop().catch(() => end()) };
}
