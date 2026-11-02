import type { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  listen,
  SpeechFailure,
  speechNeedsNetwork,
  speechSupported,
  type SpeechHandlers,
} from './speech';

type Listener = (event: Record<string, unknown>) => void;
const listeners = new Map<string, Listener>();

const plugin = vi.hoisted(() => ({
  requestPermissions: vi.fn<typeof SpeechRecognition.requestPermissions>(async () => ({
    speechRecognition: 'granted',
  })),
  available: vi.fn<typeof SpeechRecognition.available>(async () => ({ available: true })),
  isOnDeviceRecognitionAvailable: vi.fn<typeof SpeechRecognition.isOnDeviceRecognitionAvailable>(
    async () => ({ available: true }),
  ),
  addListener: vi.fn<(name: string, listener: Listener) => Promise<PluginListenerHandle>>(
    async (name, listener) => {
      listeners.set(name, listener);
      return { remove: async () => void listeners.delete(name) };
    },
  ),
  start: vi.fn<typeof SpeechRecognition.start>(async () => ({ matches: [] })),
  stop: vi.fn<typeof SpeechRecognition.stop>(async () => undefined),
}));
vi.mock('@capgo/capacitor-speech-recognition', () => ({ SpeechRecognition: plugin }));

// The Web Speech API as Edge/Chrome have it.
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn<() => void>(() => (FakeRecognition.last = this));
  stop = vi.fn<() => void>(() => this.onend?.());
}

const handlers = () => ({
  onText: vi.fn<SpeechHandlers['onText']>(),
  onEnd: vi.fn<SpeechHandlers['onEnd']>(),
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  listeners.clear();
  FakeRecognition.last = null;
});

describe('speech in the browser', () => {
  beforeEach(() => vi.stubGlobal('webkitSpeechRecognition', FakeRecognition));

  it('is offered only where the Web Speech API exists, and needs the network', () => {
    expect(speechSupported()).toBe(true);
    expect(speechNeedsNetwork()).toBe(true);
    vi.unstubAllGlobals();
    expect(speechSupported()).toBe(false);
  });

  it('listens in Polish and passes the transcript so far', async () => {
    const on = handlers();
    const session = await listen(on);
    const recognition = FakeRecognition.last!;
    expect(recognition).toMatchObject({ lang: 'pl-PL', interimResults: true, continuous: false });

    recognition.onresult?.({ results: [[{ transcript: 'wyciskanie 24' }]] });
    recognition.onresult?.({
      results: [[{ transcript: 'wyciskanie 24 kg' }], [{ transcript: ' 4x10 ' }]],
    });
    expect(on.onText.mock.calls).toEqual([['wyciskanie 24'], ['wyciskanie 24 kg 4x10']]);

    session.stop();
    expect(on.onEnd).toHaveBeenCalledWith(null);
  });

  it('ends with an error code', async () => {
    const cases = [
      ['not-allowed', 'denied'],
      ['network', 'network'],
      ['no-speech', 'no_speech'],
      ['audio-capture', 'failed'],
      ['aborted', null],
    ] as const;
    for (const [error, code] of cases) {
      const on = handlers();
      await listen(on);
      FakeRecognition.last!.onerror?.({ error });
      FakeRecognition.last!.onend?.();
      expect(on.onEnd).toHaveBeenCalledWith(code);
    }
  });
});

describe('speech on Android', () => {
  beforeEach(() => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  });

  it('is offered without the network', () => {
    expect(speechSupported()).toBe(true);
    expect(speechNeedsNetwork()).toBe(false);
  });

  it('streams the transcript and ends when the recognizer stops', async () => {
    const on = handlers();
    const session = await listen(on);
    expect(plugin.start).toHaveBeenCalledWith({
      language: 'pl-PL',
      partialResults: true,
      popup: false,
      useOnDeviceRecognition: false,
    });

    listeners.get('partialResults')!({ matches: ['wyciskanie 24 kg 4x10 '] });
    expect(on.onText).toHaveBeenCalledWith('wyciskanie 24 kg 4x10');

    session.stop();
    expect(plugin.stop).toHaveBeenCalled();
    listeners.get('listeningState')!({ state: 'stopped', status: 'stopped' });
    listeners.get('listeningState')?.({ state: 'stopped' });
    expect(on.onEnd).toHaveBeenCalledTimes(1);
    expect(on.onEnd).toHaveBeenCalledWith(null);
  });

  it('uses the on-device recognizer offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await listen(handlers());
    expect(plugin.start).toHaveBeenCalledWith(
      expect.objectContaining({ useOnDeviceRecognition: true }),
    );
  });

  it('ends with the error the recognizer reported', async () => {
    const on = handlers();
    await listen(on);
    listeners.get('error')!({ code: 'NETWORK', message: 'Network error', sessionId: 1 });
    listeners.get('listeningState')!({ state: 'stopped' });
    expect(on.onEnd).toHaveBeenCalledWith('network');
  });

  it("doesn't start without the microphone permission or a Polish recognizer", async () => {
    plugin.requestPermissions.mockResolvedValueOnce({
      speechRecognition: 'denied',
    });
    await expect(listen(handlers())).rejects.toEqual(new SpeechFailure('denied'));

    plugin.start.mockRejectedValueOnce(new Error('LANGUAGE_ERROR'));
    const on = handlers();
    await expect(listen(on)).rejects.toEqual(new SpeechFailure('unavailable'));
    expect(on.onEnd).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
