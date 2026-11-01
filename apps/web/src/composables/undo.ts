import { toastController } from '@ionic/vue';
import { i18n } from '../i18n';

// A manual delete or copy is immediate; the toast offers "Cofnij" for a few seconds (§5.2).
export async function showUndo(message: string, undo: () => Promise<unknown>) {
  const toast = await toastController.create({
    message,
    duration: 6000,
    position: 'bottom',
    buttons: [{ text: i18n.global.t('day.undo'), handler: () => void undo() }],
  });
  await toast.present();
}
