import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// The end of a rest on Android (§5.3): a scheduled notification on a high-importance channel, so
// it vibrates with the screen locked. The app is sideloaded, so USE_EXACT_ALARM (in the manifest)
// grants exact alarms; `allowWhileIdle` lets them fire in Doze. On the PC this does nothing.
const ID = 1;
const CHANNEL = 'rest';
const MAX_IMPORTANCE = 5;

let channel: Promise<void> | undefined;
// Whether the notification may alert; until then the app vibrates itself.
let granted = false;
// Calls run in order, so a quick skip can't be overtaken by a slower schedule.
let queue = Promise.resolve();

function enqueue(task: () => Promise<void>) {
  queue = queue.then(task).catch((error: unknown) => console.error('rest alarm', error));
}

// A rest kept over a restart of the app ends with the notification scheduled before it.
if (Capacitor.isNativePlatform())
  enqueue(async () => {
    granted = (await LocalNotifications.checkPermissions()).display === 'granted';
  });

async function clear() {
  await LocalNotifications.cancel({ notifications: [{ id: ID }] });
  await LocalNotifications.removeDeliveredNotificationsById({ ids: [ID] });
}

export function restAlarmNotifies(): boolean {
  return granted;
}

// Replaces the pending or shown notification; `channelName` is shown in the system settings.
export function scheduleRestAlarm(endsAt: number, title: string, channelName: string) {
  if (!Capacitor.isNativePlatform()) return;
  enqueue(async () => {
    channel ??= LocalNotifications.createChannel({
      id: CHANNEL,
      name: channelName,
      importance: MAX_IMPORTANCE,
      vibration: true,
    });
    await channel;
    // Asks only the first time (Android 13+ POST_NOTIFICATIONS).
    granted = (await LocalNotifications.requestPermissions()).display === 'granted';
    await clear();
    if (!granted) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID,
          title,
          body: '',
          channelId: CHANNEL,
          foreground: true,
          autoCancel: true,
          schedule: { at: new Date(endsAt), allowWhileIdle: true },
        },
      ],
    });
  });
}

// Skipped or dismissed rest, or the next set: no pending and no shown notification.
export function cancelRestAlarm() {
  if (!Capacitor.isNativePlatform()) return;
  enqueue(clear);
}
