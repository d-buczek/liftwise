import { ref, type Ref } from 'vue';
import { listen, SpeechFailure, type SpeechError, type SpeechSession } from '../native/speech';

// Voice into the composer (§5.9.7): the transcript goes after what is already typed, live while
// speaking; the user reads it and sends it like typed text.
export function useVoiceInput(draft: Ref<string>) {
  const listening = ref(false);
  const error = ref<SpeechError | null>(null);
  let session: SpeechSession | null = null;

  async function start() {
    if (listening.value) return;
    error.value = null;
    listening.value = true;
    const typed = draft.value.trim();
    try {
      const started = await listen({
        onText: (text) => (draft.value = typed && text ? `${typed} ${text}` : text || typed),
        onEnd: (code) => {
          listening.value = false;
          session = null;
          error.value = code;
        },
      });
      if (listening.value) session = started;
    } catch (caught) {
      listening.value = false;
      error.value = caught instanceof SpeechFailure ? caught.code : 'failed';
      if (!(caught instanceof SpeechFailure)) console.error(caught);
    }
  }

  function stop() {
    session?.stop();
  }

  return {
    listening,
    error,
    toggle: () => (listening.value ? stop() : void start()),
    stop,
  };
}
