# Informe Técnico: App PatrolHood (Neighbourhood Patrol)

## 1. Objetivo de la Aplicación
**PatrolHood** es una plataforma de seguridad comunitaria diseñada para la vigilancia colaborativa entre vecinos. Su propósito principal es permitir que una comunidad cerrada o vecindario pueda gestionar su propia seguridad mediante alertas en tiempo real, comunicación directa e integración con dispositivos de notificación (Telegram y Push Notifications).

---

## 2. Arquitectura del Sistema
La aplicación utiliza una arquitectura **MERN Stack** (MongoDB, Express, React, Node.js) con capas adicionales de mensajería y caché para alta disponibilidad.

### Capas Principales:
*   **Frontend**: Aplicación SPA (Single Page Application) moderna, ligera y optimizada para móviles.
*   **Backend**: API RESTful centralizada que gestiona la lógica de negocio, autenticación y comunicaciones.
*   **Base de Datos NoSQL**: Almacenamiento persistente de usuarios, inmuebles y logs de auditoría.
*   **Capa de Mensajería**: Sistema de colas y Pub/Sub para alertas críticas y sincronización en tiempo real.

---

## 3. Stack Tecnológico y Programas Usados

### Frontend (Cliente)
*   **Vite + React (19)**: Framework principal para una interfaz rápida y reactiva.
*   **Leaflet + React-Leaflet**: Motor de mapas interactivos para representar los inmuebles y alertas.
*   **Socket.io-Client**: Comunicación bidireccional en tiempo real para recibir alertas SOS al instante.
*   **Dexie.js**: Base de datos local (IndexedDB) para persistencia de datos en el navegador.
*   **Firebase SDK**: Integración con notificaciones push nativas.

### Backend (Servidor)
*   **Node.js + Express**: Servidor de aplicaciones.
*   **MongoDB + Mongoose**: Base de datos principal para perfiles de usuario y configuración.
*   **Redis + BullMQ**: Sistema de colas de alta prioridad para procesar alertas SOS y asegurar que ninguna se pierda.
*   **Socket.io Server**: Servidor de eventos en tiempo real.
*   **Telegram Bot API**: Integración con Telegram para notificaciones externas.
*   **Firebase Admin SDK**: Gestión de notificaciones push a dispositivos móviles.
*   **Sharp / Jimp**: Procesamiento de archivos multimedia y avatares.

### Infraestructura y Despliegue
*   **Render**: Plataforma de hosting para el servidor y el cliente.
*   **GitHub**: Almacenamiento y control de versiones del código.

---

## 4. Estructura del Proyecto
```text
/neighbourhood patrol
├── /client             # Aplicación Frontend (React)
│   ├── /src            # Código fuente (App.jsx, App.css)
│   ├── /public         # Activos estáticos
│   └── index.html      # Punto de entrada
├── /server             # Aplicación Backend (Node.js)
│   ├── /models         # Esquemas de datos (User, House, ActiveSOS)
│   ├── /shared         # Módulos compartidos (DB, Redis, Firebase)
│   └── index.js        # Punto de entrada del servidor
├── /tests              # Pruebas automatizadas del sistema
└── package.json        # Gestión de dependencias globales
```

---

## 5. Funcionamiento Clave

### A. Sistema SOS (Alta Prioridad)
Cuando un vecino pulsa el botón SOS:
1.  Se emite un evento vía **Socket.io** a todos los vecinos conectados en esa comunidad.
2.  Se añade una tarea a la cola de **BullMQ (Redis)** para asegurar la entrega.
3.  Se envían notificaciones masivas vía **Telegram** y **Firebase Push** a los dispositivos de los vecinos.
4.  Se registra en el mapa la ubicación exacta y el inmueble afectado.

### B. Gestión de Comunidad y Filtros
El sistema permite segmentar usuarios por roles (Admin, Moderador, Usuario). Los administradores tienen un panel dedicado para ver inmuebles, registrar vecinos y revisar el historial de alertas.

### C. Seguridad intrínseca
*   **JWT (JSON Web Tokens)**: Para sesiones seguras y duraderas.
*   **Rate Limiting**: Protección contra ataques de fuerza bruta en login y alertas.
*   **Eliminación 30 días**: Política automática de borrado de mensajes para protección de datos.

---

## 6. Conclusión
**PatrolHood** es una solución robusta y premium que combina la inmediatez de la web moderna con la fiabilidad de las herramientas de mensajería profesional. Está diseñada para ser escalable, segura y, sobre todo, fácil de usar en situaciones de emergencia.
