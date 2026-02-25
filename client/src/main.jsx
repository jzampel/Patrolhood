import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// GLOBAL ERROR REPORTER: Catch and show errors even if React fails to render
const reportError = (msg, extra = '') => {
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `
      <div style="background: #7f1d1d; color: white; padding: 20px; font-family: monospace; height: 100vh; overflow-y: auto;">
        <h1 style="color: #f87171;">🚨 ERROR DE EJECUCIÓN</h1>
        <p>La aplicación se ha detenido por un error inesperado.</p>
        <hr style="border-color: rgba(255,255,255,0.2)"/>
        <pre style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; white-space: pre-wrap;">${msg}\n\n${extra}</pre>
        <button onclick="localStorage.clear(); window.location.reload();" style="background: white; color: black; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">
          ♻️ Resetear App (Borrar datos)
        </button>
      </div>
    `
  }
}

window.onerror = (msg, url, line, col, error) => {
  reportError(`${msg}`, `URL: ${url}\nLínea: ${line}, Col: ${col}\nStack: ${error?.stack || 'No stack'}`)
}

window.onunhandledrejection = (event) => {
  reportError(`Promesa rechazada no capturada`, `Razón: ${event.reason}\nStack: ${event.reason?.stack || 'No stack'}`)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
