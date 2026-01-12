# 🌐 Acceso Remoto - Guía Rápida

## ¿Qué necesitas?

Para acceder a la app desde **fuera de casa** (4G/5G), necesitas crear "túneles" que expongan tu servidor local a internet.

## Pasos Simples

### 1️⃣ Ejecuta el script automático

Haz doble clic en:
```
start_remote_simple.bat
```

### 2️⃣ Copia la URL del Backend

Se abrirá una ventana llamada **"Backend Tunnel"**. Verás algo como:

```
your url is: https://brave-cats-12345.loca.lt
```

**Copia esa URL completa** y pégala cuando el script te lo pida.

### 3️⃣ Obtén la URL del Frontend

Se abrirá otra ventana llamada **"Frontend Tunnel"**. Verás:

```
your url is: https://funny-dogs-67890.loca.lt
```

**Esa es la URL que abres en tu móvil.**

### 4️⃣ Abre en tu móvil

1. Desactiva el WiFi (usa 4G/5G)
2. Abre la URL del Frontend en tu navegador
3. La primera vez verás una página de advertencia de Localtunnel
4. Haz clic en **"Continue"** o **"Click to Continue"**
5. ¡Ya puedes usar la app!

## 📱 Instalar como App

Una vez que la página cargue:

**Android (Chrome):**
- Menú (⋮) → "Instalar aplicación" o "Añadir a pantalla de inicio"

**iOS (Safari):**
- Botón compartir (□↑) → "Añadir a pantalla de inicio"

## ⚠️ Notas Importantes

- **Las URLs cambian cada vez**: Cada vez que ejecutes el script, obtendrás URLs diferentes
- **Temporales**: Las URLs son gratuitas pero temporales
- **Mantén el PC encendido**: Tu ordenador debe estar encendido y ejecutando los servidores
- **Página de advertencia**: Es normal, solo haz clic en "Continue"

## 🔧 Si algo falla

**"No se conecta al servidor"**
- Asegúrate de haber copiado bien la URL del backend
- Verifica que todas las ventanas estén abiertas

**"Error al crear el túnel"**
- Cierra todas las ventanas y vuelve a ejecutar el script

**"La app no carga"**
- Espera unos segundos más
- Recarga la página
- Verifica que hayas hecho clic en "Continue" en la página de advertencia

## 🎯 Resumen Visual

```
Tu PC (en casa)
    ↓
Backend Tunnel → https://xxxxx.loca.lt (servidor)
    ↓
Frontend Tunnel → https://yyyyy.loca.lt (app)
    ↓
Tu Móvil (4G/5G) → Abre https://yyyyy.loca.lt
```

---

**¿Prefieres acceso permanente?**

Si necesitas una URL que no cambie, considera usar:
- **Ngrok** (requiere cuenta gratuita)
- **Cloudflare Tunnel** (más complejo pero permanente)
