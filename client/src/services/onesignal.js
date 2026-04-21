import { Capacitor } from '@capacitor/core';

/**
 * OneSignal Hybrid Service (Web + Native)
 */

export const initOneSignalNative = async (appId) => {
  if (Capacitor.isNativePlatform()) {
    const OneSignal = window.plugins?.OneSignal;
    if (OneSignal) {
      // Standard OneSignal mobile initialization
      OneSignal.setAppId(appId);
      OneSignal.setNotificationOpenedHandler((openedEvent) => {
        console.log('Notification opened:', openedEvent);
      });
      // In mobile, we might want to prompt immediately or wait
    }
  }
};

export const onesignalLogin = (userId) => {
  if (Capacitor.isNativePlatform()) {
    window.plugins?.OneSignal?.setExternalUserId(String(userId));
  } else if (window.loginToOneSignal) {
    window.loginToOneSignal(userId);
  }
};

export const onesignalLogout = () => {
  if (Capacitor.isNativePlatform()) {
    window.plugins?.OneSignal?.removeExternalUserId();
  } else if (window.logoutFromOneSignal) {
    window.logoutFromOneSignal();
  }
};

export const onesignalPrompt = () => {
  if (Capacitor.isNativePlatform()) {
    window.plugins?.OneSignal?.promptForPushNotificationsWithUserResponse((accepted) => {
      console.log("User accepted notifications: ", accepted);
    });
  } else if (window.promptOneSignal) {
    window.promptOneSignal();
  }
};

export const checkPushPermission = async () => {
  if (Capacitor.isNativePlatform()) {
    return new Promise((resolve) => {
      window.plugins?.OneSignal?.getDeviceState((state) => {
        resolve(state.hasNotificationPermission);
      });
    });
  } else if (window.isPushEnabled) {
    const permission = await window.isPushEnabled();
    return permission === true || permission === 'granted';
  }
  return false;
};
