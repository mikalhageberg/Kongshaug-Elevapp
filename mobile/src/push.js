import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';

// Vis varsler også når appen er åpen (forgrunn), med lyd og banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Be om tillatelse, hent Expo push-token, og registrer det hos serveren.
// Kalles rett etter innlogging (og ved app-oppstart hvis allerede innlogget).
export async function registerForPushNotifications() {
  if (!Device.isDevice) return; // simulator/emulator har ingen push-token
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api('/api/push/register', { method: 'POST', body: { token, platform: Platform.OS } })
    .catch(() => { /* stille feil: ikke kritisk for at appen skal fungere */ });
}

// Avregistrer denne enhetens token ved utlogging.
export async function unregisterPushToken() {
  if (!Device.isDevice) return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/api/push/register', { method: 'DELETE', body: { token } }).catch(() => {});
  } catch { /* ingen token å fjerne */ }
}
