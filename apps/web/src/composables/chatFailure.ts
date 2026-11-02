import { useI18n } from 'vue-i18n';
import type { ChatFailure } from '../agent/chat';
import { useErrorMessage } from '../i18n';

// A failed agent turn (live or queued) as a message saying what to do.
export function useChatFailureText() {
  const i18n = useI18n();
  const errorMessage = useErrorMessage();
  return (failure: ChatFailure) => {
    if (failure.code === 'provider_unavailable') {
      const provider = failure.provider ? i18n.t(`models.providers.${failure.provider}`) : '';
      return i18n.t('agent.errors.provider_unavailable', { provider });
    }
    return i18n.te(`agent.errors.${failure.code}`)
      ? i18n.t(`agent.errors.${failure.code}`)
      : errorMessage(failure.code);
  };
}
