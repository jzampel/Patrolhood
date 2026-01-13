# 🔥 Firebase Setup Guide - PatrolHood

Sigue estos pasos para configurar Firebase Cloud Messaging.

## Paso 1: Crear Proyecto Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Haz clic en **"Agregar proyecto"** o **"Add project"**
3. Nombre del proyecto: `PatrolHood`
4. Acepta los términos
5. **Desactiva Google Analytics** (no lo necesitamos)
6. Haz clic en **"Crear proyecto"**

## Paso 2: Habilitar Cloud Messaging

1. En el menú lateral, ve a **"Compilación" → "Cloud Messaging"** (o **"Build" → "Cloud Messaging"**)
2. Si te pide habilitar la API, haz clic en **"Habilitar"**

## Paso 3: Configurar Web App

1. En la página principal, haz clic en el icono **"</>"** (Web)
2. Apodo de la app: `PatrolHood Web`
3. **NO** marques "Firebase Hosting"
4. Haz clic en **"Registrar app"**
5. **Copia el objeto `firebaseConfig`** que aparece:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "patrolhood-xxxxx.firebaseapp.com",
  projectId: "patrolhood-xxxxx",
  storageBucket: "patrolhood-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

**📋 GUARDA ESTO** - Lo necesitaremos para el código.

## Paso 4: Generar VAPID Key

1. En el menú lateral, ve a **"Configuración del proyecto"** (icono de engranaje ⚙️)
2. Ve a la pestaña **"Cloud Messaging"**
3. Busca la sección **"Web Push certificates"**
4. Haz clic en **"Generar par de claves"**
5. **Copia la clave pública** (empieza con `B...`)

**📋 GUARDA ESTO** - Es tu VAPID key.

## Paso 5: Crear Service Account (Credenciales del Servidor)

1. En **"Configuración del proyecto"** ⚙️
2. Ve a la pestaña **"Cuentas de servicio"** o **"Service accounts"**
3. Haz clic en **"Generar nueva clave privada"**
4. Selecciona formato **JSON**
5. Haz clic en **"Generar clave"**
6. Se descargará un archivo `.json`

**📋 GUARDA ESTE ARCHIVO** - Lo necesitaremos para Render.

---

## ✅ Checklist

Cuando hayas completado todo, deberías tener:

- [ ] ✅ Proyecto Firebase creado
- [ ] ✅ Cloud Messaging habilitado
- [ ] ✅ Objeto `firebaseConfig` copiado
- [ ] ✅ VAPID Key (clave pública) copiada
- [ ] ✅ Archivo JSON de Service Account descargado

---

## 🚀 Siguiente Paso

**Avísame cuando hayas completado estos pasos** y tengas los 3 elementos listos:
1. `firebaseConfig`
2. VAPID Key
3. Archivo JSON

Entonces actualizaré el código para usar Firebase.
