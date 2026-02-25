# Manual Operativo v3.0 Pro: PatrolHood

PatrolHood Pro es una plataforma distribuida de alta disponibilidad para la gestión de seguridad vecinal. Este manual detalla el funcionamiento interno bajo la arquitectura v3.0.

---

## 1. Arquitectura de Procesamiento Asíncrono

A diferencia de sistemas tradicionales, PatrolHood Pro separa la **Recepción** del **Procesamiento**.

### 1.1 La API (Recepción Rápida)
Cuando un usuario activa una alerta, la API Express responde en milisegundos. Su función es validación y encolado. Si la red externa (Telegram/Firebase) está lenta, el usuario no se queda esperando.

### 1.2 El Worker (Procesamiento Confiable)
Un proceso independiente (BullMQ) escucha la cola de Redis.
- **Reintentos**: Si Telegram falla, el Worker reintenta automáticamente con un backoff de 10 segundos, incrementando el tiempo en cada fallo.
- **Orden**: Garantiza que los mensajes se procesen en el orden de llegada por comunidad.

---

## 2. Inteligencia Anti-Spam (Deduplicación)

Para evitar que un error de usuario o una pulsación repetida sature a la comunidad, hemos implementado una **Capa de Deduplicación en Redis**:
- **Clave**: `dedupe:sos:{communityId}:{houseNumber}`.
- **Efecto**: Durante 120 segundos tras una alerta, cualquier intento de disparar un SOS desde la misma casa será detectado y bloqueado por la API antes de llegar a la base de datos o a los móviles de los vecinos.
- **Limpieza**: La clave se borra automáticamente cuando un administrador o el usuario cierran (STOP) la alerta.

---

## 3. Ciclo de Vida del SOS (Máquina de Estados)

Cada alerta transiciona por los siguientes estados:
1.  **`CREATED`**: Persistido en MongoDB y encolado en Redis.
2.  **`DISPATCHED`**: El Worker ha iniciado el envío de notificaciones.
3.  **`RESOLVED`**: La alerta ha sido finalizada. El bloqueo de deduplicación se libera.

---

## 4. Escalabilidad y Redundancia

### 4.1 Redis como Backbone
- **Socket.io Adapter**: Permite que si tienes 1000 usuarios en el Servidor A y 1000 en el Servidor B, todos reciban la alerta al mismo tiempo.
- **Persistencia de Colas**: Si el servidor se reinicia, los trabajos pendientes en BullMQ no se pierden; se retoman al arrancar.

### 4.2 Offline-First (Cliente)
El cliente (PWA) mantiene su propia cola en el bolsillo del usuario (**IndexedDB**). Si envías un SOS en un parking sin cobertura, la app lo guardará y lo "empujará" al servidor de forma transparente en cuanto detecte conexión.

---

## 5. Roles y Permisos Pro
- **Global Admin**: Acceso total multiplataforma.
- **Admin**: Gestión de su comunidad, configuración de bots de Telegram y auditoría.
- **Moderador**: Gestión de reportes y limpieza del foro.
- **Vecino**: Usuario final con capacidades SOS y comunicación.

---
*Manual de ingeniería para la versión 3.0 Pro.*
