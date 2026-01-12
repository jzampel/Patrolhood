# 🌐 Acceso Remoto y PWA - PatrolHood

## ¿Qué es esto?

Esta guía te permite acceder a la aplicación desde cualquier lugar (no solo WiFi local) y hacer que sea **instalable en móviles** como una app nativa.

## 📱 Instalación PWA (Progressive Web App)

La aplicación ya está configurada como PWA. Cuando accedas desde un móvil:

### Android (Chrome/Edge)
1. Abre la app en el navegador
2. Verás un banner "Añadir a pantalla de inicio" o busca en el menú (⋮) → "Instalar aplicación"
3. ¡Listo! La app aparecerá como icono en tu pantalla

### iOS (Safari)
1. Abre la app en Safari
2. Toca el botón de compartir (□↑)
3. Selecciona "Añadir a pantalla de inicio"
4. ¡Listo!

## 🚀 Acceso Remoto (4G/5G)

### Opción 1: Uso Local (Solo WiFi)

```bash
# En la carpeta del proyecto
cd server
npm start

# En otra terminal
cd client
npm run dev
```

Accede desde tu móvil (en la misma WiFi): `http://192.168.1.151:5173`

### Opción 2: Acceso desde Cualquier Lugar

**Método Simple (Recomendado):**

1. **Ejecuta el script automático:**
   ```
   start_remote.bat
   ```

2. **Anota las URLs que aparecen:**
   - Backend Tunnel: `https://xxxxx.loca.lt` (ejemplo: `https://brave-cats-12345.loca.lt`)
   - Frontend Tunnel: `https://yyyyy.loca.lt`

3. **Configura el frontend para usar el backend remoto:**
   - Cierra la ventana "Frontend Server"
   - Abre una nueva terminal en la carpeta `client`
   - Ejecuta:
     ```bash
     set VITE_API_URL=https://xxxxx.loca.lt
     npm run dev
     ```
     (Reemplaza `xxxxx` con tu URL real del backend)

4. **Crea un nuevo túnel para el frontend:**
   ```bash
   npx -y localtunnel --port 5173
   ```

5. **Abre la URL del frontend en tu móvil** (la que te dio el último comando)

**Método Manual (Más control):**

```bash
# Terminal 1: Backend
cd server
npm start

# Terminal 2: Backend Tunnel
npx -y localtunnel --port 3001
# Anota la URL: https://xxxxx.loca.lt

# Terminal 3: Frontend con backend remoto
cd client
set VITE_API_URL=https://xxxxx.loca.lt
npm run dev

# Terminal 4: Frontend Tunnel
npx -y localtunnel --port 5173
# Anota la URL: https://yyyyy.loca.lt
```

## ⚠️ Notas Importantes

1. **Primer acceso al túnel:** Localtunnel puede mostrar una página de advertencia la primera vez. Haz clic en "Continue" para proceder.

2. **URLs temporales:** Las URLs de `loca.lt` cambian cada vez que reinicias el túnel. Son temporales y gratuitas.

3. **HTTPS requerido:** Para que la PWA funcione correctamente (especialmente las notificaciones push), necesitas HTTPS. Los túneles proporcionan esto automáticamente.

4. **Alternativas a Localtunnel:**
   - **Ngrok:** `npx -y ngrok http 5173` (requiere cuenta gratuita)
   - **Cloudflare Tunnel:** Más permanente pero requiere configuración

## 🔧 Solución de Problemas

**"La app no se conecta al servidor"**
- Verifica que `VITE_API_URL` esté configurado correctamente
- Asegúrate de que ambos túneles estén activos

**"No veo la opción de instalar"**
- Asegúrate de estar usando HTTPS (los túneles lo proporcionan)
- En iOS, solo Safari soporta PWA
- Recarga la página

**"El túnel se desconecta"**
- Los túneles gratuitos pueden tener límites de tiempo
- Simplemente reinicia el script `start_remote.bat`

## 📞 Soporte

Si tienes problemas, verifica:
1. ✅ Ambos servidores están corriendo (backend y frontend)
2. ✅ Los túneles están activos y muestran URLs
3. ✅ La variable `VITE_API_URL` apunta al backend correcto
4. ✅ Estás accediendo a la URL del frontend (no del backend)
