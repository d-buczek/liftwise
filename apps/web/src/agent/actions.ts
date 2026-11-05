import { alertController, toastController } from '@ionic/vue';
import { reactive } from 'vue';
import { api, ApiError } from '../api/client';
import { i18n } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';
import { localTimestamp } from './chat';

// What the agent's cards do (§5.9.3, §5.9.4): undo a change group, confirm or reject a proposal.
// The server writes; a sync then brings the data and the card's new state.

// Groups undone from a card on this device. The server knows them (`undo_of`): undoing one again
// answers `already_undone`, which marks it here too.
export const undoneGroups = reactive(new Set<string>());

async function toast(message: string) {
  const created = await toastController.create({
    message,
    duration: 4000,
    position: 'bottom',
    positionAnchor: composer(),
  });
  await created.present();
}

// The message field of the shown page, so a toast doesn't cover it; pages Ionic keeps in the
// background are hidden. Earlier threads have none.
function composer(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('ion-footer.lw-composer')].find(
    (footer) => !footer.closest('.ion-page-hidden'),
  );
}

function errorText(error: unknown): string {
  const { t } = i18n.global;
  const code = error instanceof ApiError ? error.code : 'unknown';
  if (!(error instanceof ApiError)) console.error(error);
  return i18n.global.te(`errors.${code}`) ? t(`errors.${code}`) : t('errors.unknown');
}

// A record of the group changed after it (§5.9.4): undo only on confirmation.
async function confirmConflict(): Promise<boolean> {
  const { t } = i18n.global;
  const alert = await alertController.create({
    header: t('agent.undo.conflictTitle'),
    message: t('agent.undo.conflictMessage'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      { text: t('agent.undo.action'), role: 'confirm' },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  return role === 'confirm';
}

export async function undoChange(groupId: string): Promise<void> {
  const auth = useAuthStore();
  const { t } = i18n.global;
  if (!auth.token) return;
  const token = auth.token;
  const attempt = async (confirm: boolean): Promise<'done' | 'conflict' | 'failed'> => {
    try {
      await api.undo(token, groupId, confirm);
      return 'done';
    } catch (error) {
      if (error instanceof ApiError && error.code === 'already_undone') return 'done';
      if (error instanceof ApiError && error.code === 'conflict') return 'conflict';
      await toast(errorText(error));
      return 'failed';
    }
  };

  let result = await attempt(false);
  if (result === 'conflict') result = (await confirmConflict()) ? await attempt(true) : 'failed';
  if (result !== 'done') return;
  undoneGroups.add(groupId);
  void useSyncStore().sync();
  await toast(t('agent.undo.done'));
}

export async function resolveProposal(id: string, action: 'confirm' | 'reject'): Promise<void> {
  const auth = useAuthStore();
  const sync = useSyncStore();
  const { t } = i18n.global;
  if (!auth.token) return;
  try {
    await api.resolveProposal(auth.token, id, action, localTimestamp());
  } catch (error) {
    // Already resolved on another device: the sync shows how.
    if (error instanceof ApiError && error.code === 'not_pending') {
      void sync.sync();
      return;
    }
    await toast(
      error instanceof ApiError && error.code === 'stale'
        ? t('agent.proposal.stale')
        : errorText(error),
    );
    return;
  }
  void sync.sync();
}
