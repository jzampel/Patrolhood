# Documentación Técnica Completa: Patrolhood v4.1 Pro+

Esta documentación detalla la arquitectura, tecnologías y diseño del sistema Patrolhood, proporcionando una visión integral para el equipo de desarrollo, mantenimiento y escalabilidad.

## 1. Arquitectura General y Topología
Patrolhood opera bajo una arquitectura **Cliente-Servidor robusta**, orientada a eventos en tiempo real y alta disponibilidad, con un enfoque implacable en la resiliencia y el aislamiento de datos.

- **Frontend (Cliente)**: Single Page Application (SPA) construida con React 18 y Vite, diseñada desde cero como **PWA (Progressive Web App)** para soporte de resiliencia offline.
- **Backend (Servidor)**: Aplicación Node.js bajo Express.js, diseñada con arquitectura orientada a microservicios a nivel lógico, gestionando endpoints de API RESTful y conexiones persistentes bidireccionales vía WebSocket.
- **Base de Datos**: MongoDB (NoSQL), actuando como almacén principal, ideal para datos geolocalizados de emergencia y esquemas dinámicos flexibles.
- **Integraciones Críticas Externas**: Acoplamiento estrecho con la API de Telegram mediante Telegraf para garantizar que las notificaciones externas sean ineludibles y no dependan enteramente de los servicios Push de Google o Apple.

## 2. Tecnologías Principales (Stack MERN+ Avanzado)

### Frontend
- **React 18**: Librería de UI para componentes reactivos que garantiza un renderizado veloz.
- **Vite**: Bundler de nueva generación y entorno de desarrollo de ultra-alta velocidad.
- **Socket.io-client**: Comunicación bidireccional de baja latencia con el servidor.
- **PWA / Service Workers**: Capacidades offline e instalación nativa en escritorio y móvil (Windows, Android, iOS).
- **Dexie.js (IndexedDB)**: Almacenamiento local persistente en el navegador cliente para crear un "buffer" o caché de alertas en caso de pérdida súbita de conexión.

### Backend
- **Node.js**: Entorno de ejecución de backend asíncrono y no bloqueante.
- **Express.js**: Framework robusto y minimalista para la construcción de la API.
- **Socket.io**: Motor de WebSockets para notificaciones (SOS, Foros, Sincronización de Mapas) con latencia sub-100ms.
- **Mongoose**: ORM/ODM estructurado para validación de datos e interacciones complejas con MongoDB.
- **Telegraf (Telegram Bot API)**: Framework para la integración y control de bots de Telegram en Node.js.

### Infraestructura / DevOps
- **Despliegue General**: Operación activa sobre Render (Platform-as-a-Service), garantizando alta disponibilidad.
- **Aislamiento Multi-tenant Total**: Utilización de `communityId` (UUID v4) implementado en todas las capas del sistema (middlewares, queries de base de datos) para garantizar que los datos (SOS, mensajes del foro, usuarios) estén estrictamente segregados y sellados por barrio o zona residencial.

## 3. Módulos Críticos del Sistema

### 3.1. Sistema Central de Emergencias (ActiveSOS)
Es el núcleo neurálgico de Patrolhood, encargado de manejar el ciclo de vida de una alerta y su inyección instantánea en el tejido vecinal.
- **Persistencia Obligatoria**: A diferencia de enviar alertas meramente volátiles en memoria, ActiveSOS inscribe cada alerta en MongoDB al milisegundo de su creación. 
- **Máquina de Estados**: Cada SOS actúa como un evento persistente con un ciclo de vida definido. Su estado 'Activo/Inactivo' solo puede ser modificado y resuelto por roles de usuario autorizados.
- **Dispatch Geolocalizado Rápido**: Tras insertarse en DB, la API emite el evento al "room" geográfico correcto de Socket.io y despacha notificaciones push/telegram simultáneamente. Si el servidor físico sufre un reinicio, al volver a arrancar escanea automáticamente la BB.DD para reflotar y reconectar todos los SOS que quedaron vigentes.

### 3.2. Sincronización en Tiempo Real (Socket.io)
Supera las limitaciones inherentes del protocolo HTTP (REST / long-polling) para necesidades de supervivencia y coordinación crítica.
- **Salas (Rooms) Compartimentadas**: Cada usuario, tras una validación exitosa del token, suscribe su socket exclusivamente a la sala (room) definida por su `communityId`.
- **Topometría en Vivo**: Las posiciones de los vecinos durante una alerta se transmiten de forma fluida a través de websockets, actualizando el mapa en las pantallas de todos los intervinientes sin sobrecarga de red.

### 3.3. Autenticación, Autorización y Seguridad
- **JSON Web Tokens (JWT)**: Cada sesión de la PWA es autenticada de manera *stateless* (sin estado en el servidor). El JWT criptográficamente firmado encapsula la identidad básica del usuario y su pertenencia comunitaria autorizada. El middleware de nivel superior `checkCommunity` bloquea de raíz cualquier intento de escalada de privilegios o interacciones cruzadas maliciosas entre distintos barrios.

### 3.4. Inteligencia de Foros y Moderación
Salas de comunicación persistentes y especializadas (SOS, Seguridad, General) que fomentan el debate y organización sin ruido ni desinformación.
- **Sincronicidad Pura**: La ingesta de nuevos mensajes en MongoDB gatilla inmediatamente payloads de Socket para que todos los teléfonos de esa comunidad reciban el mensaje sin refrescar la página.
- **Moderación en Vivo**: Herramientas administrativas que permiten la purga de mensajes inapropiados con sincronización push (eliminación remota) en tiempo real a las vistas de los clientes.

## 4. Estrategia de Resiliencia de Frontera (Offline-First)
En un contexto de incidentes críticos, emergencias, y posible inhibición de red, es imperativo que el sistema de socorro no colapse silenciosamente.
- **Cierre Gracioso (Graceful Degradation)**: Si un vecino activa compulsivamente un SOS en un garaje sin cobertura o en una red wifi caída, IndexedDB captura y almacena el estado en una cola local indesechable. El **Service Worker** asume el control e intenta despachar el SOS continuamente en segundo plano (Background Sync API) hasta que se restaure la conexión, momento en el cual el servidor recibe la trama de tiempo real.
- **Fallbacks Internos**: Capas de reintento para la conectividad de la base de datos y memoria residente para que la función principal de emitir el claxon de ayuda jamás sucumba por factores de latencia terciaria.

## 5. Escalabilidad y Futuro (Roadmap Arquitectónico)
- **Desacoplamiento Modular**: La estructura actual orientada en Express.js facilita que en futuras versiones el ruteo de notificaciones y procesamiento de geofencing sea extraído a microservicios independientes.
- **Escalado Horizontal Integrado**: La naturaleza mayoritariamente stateless de la capa HTTP permite la instanciación de múltiples contenedores de servidor detrás de un balanceador de carga; unificando el tráfico en tiempo real mediante *Redis Adapters* para soportar cientos de miles de conexiones simultáneas sin fricción.

---
_Documentación Técnica Consolidada y Expandida – PatrolHood Dev Team (2026)_
