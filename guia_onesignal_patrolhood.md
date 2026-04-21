# Guía de Configuración OneSignal (Patrolhood)

Esta guía detalla los pasos y el código necesario para replicar el sistema de notificaciones push de RDR Clientes en el proyecto Patrolhood.

## 1. Configuración en el Panel de OneSignal
Para que funcione, primero debes crear un nuevo App en OneSignal:
- **Platform**: Web Push.
- **Configuración**: Web Push -> Custom Code / Site Setup.
- **Domain**: Añade el dominio de Patrolhood (ej: `patrolhood.com`).
- **Safari**: Activa el soporte para Safari para obtener el `safari_web_id`.

---

## 2. Archivos en la carpeta `web/` (Flutter)

### A. index.html
Añadir este bloque dentro del `<head>` (sustituyendo los IDs por los de Patrolhood):

```html
<!-- OneSignal SDK -->
<script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
<script>
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  
  window._oneSignalReady = new Promise(function(resolve) {
    OneSignalDeferred.push(async function(OneSignal) {
      await OneSignal.init({
        appId: "TU_NUEVO_APP_ID",
        safari_web_id: "TU_NUEVO_SAFARI_ID",
        serviceWorkerParam: { scope: "/" },
        serviceWorkerPath: "OneSignalSDKWorker.js",
        notifyButton: { enable: false },
      });
      resolve(OneSignal);
    });
  });

  window.loginToOneSignal = async function(userId) {
    const OS = await window._oneSignalReady;
    await OS.login(String(userId));
  };

  window.logoutFromOneSignal = async function() {
    const OS = await window._oneSignalReady;
    await OS.logout();
  };

  window.promptOneSignal = async function() {
    const OS = await window._oneSignalReady;
    if (OS.Notifications && OS.Notifications.requestPermission) {
      await OS.Notifications.requestPermission();
    }
  };

  window.isPushEnabled = async function() {
    const OS = await window._oneSignalReady;
    const permission = OS.Notifications ? OS.Notifications.permission : false;
    return permission === true || permission === "granted";
  };
</script>
```

### B. Service Worker
Crea un archivo llamado `web/OneSignalSDKWorker.js` con este contenido:
```javascript
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
```

---

## 3. Código Dart (Flutter Services)

Copia estos archivos a `lib/data/services/`:

**onesignal_helper.dart**:
```dart
export 'onesignal_stub.dart' if (dart.library.js_interop) 'onesignal_web.dart';
```

**onesignal_web.dart**:
```dart
import 'dart:js_interop';

@JS('loginToOneSignal') external void loginToOneSignalImpl(JSString userId);
@JS('logoutFromOneSignal') external void logoutFromOneSignalImpl();
@JS('promptOneSignal') external void promptOneSignalImpl();
@JS('isPushEnabled') external JSPromise isPushEnabledImpl();

void onesignalLogin(String userId) => loginToOneSignalImpl(userId.toJS);
void onesignalLogout() => logoutFromOneSignalImpl();
void onesignalPrompt() => promptOneSignalImpl();

Future<bool> isPushNotificationsEnabled() async {
  try {
    final result = await isPushEnabledImpl().toDart;
    return result != null && (result as JSBoolean).toDart;
  } catch (_) { return false; }
}
```

**onesignal_stub.dart**:
```dart
void onesignalLogin(String userId) {}
void onesignalLogout() {}
void onesignalPrompt() {}
Future<bool> isPushNotificationsEnabled() async => false;
```

---

## 4. Uso en la UI
Para vincular al usuario al hacer login:
```dart
onesignalLogin(usuarioId.toString());
```

Para mostrar el botón de activación (como hicimos en el Drawer):
```dart
if (!await isPushNotificationsEnabled()) {
  // Mostrar botón azul
}
```
