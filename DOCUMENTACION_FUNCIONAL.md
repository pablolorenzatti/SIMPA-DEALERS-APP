# Documentación Funcional SIMPA Connect (Vista Administrador)

Este documento describe el funcionamiento técnico y lógico de la integración **SIMPA Connect**, diseñado para servir como base para la capacitación de administradores y usuarios de los concesionarios (Dealers).

## 1. Visión General
**SIMPA Connect** es un middleware de integración que conecta el CRM central de **Grupo SIMPA** con los múltiples portales de HubSpot de sus concesionarios (Dealers). Su función principal es **distribuir leads automáticamente** desde la casa matriz hacia el concesionario correcto y **recibir retroalimentación** sobre el estado de ventas.

---

## 2. Estructura de Conexión (Razones Sociales y Concesionarios)

La integración no conecta "Dealers" individualmente, sino **Razones Sociales** (Entidades Legales). Esto es crucial porque una misma Razón Social puede administrar múltiples concesionarios de diferentes marcas.

### ¿Cómo se configuran las conexiones?
El sistema utiliza un archivo de configuración maestro (`razones-sociales.json`) que define:
*   **Nombre de la Razón Social:** El identificador principal (ej: `SPORTADVENTURE`).
*   **Portal ID de HubSpot:** El ID único de la cuenta de HubSpot del Dealer.
*   **Token de Acceso:** La "llave" para entrar a ese portal (definida como variable de entorno segura, ej: `SPORTADVENTURE_TOKEN`).
*   **Marcas Habilitadas:** Qué marcas comercializa este grupo (ej: KTM, Royal Enfield).
*   **Concesionarios (Dealers):** La lista de nombres comerciales ("Fantasía") asociados a esta razón social (ej: `KTM ROSARIO`, `ROYAL ENFIELD ROSARIO`).

### Lógica de Inferencia
Cuando llega un lead, el sistema no siempre sabe a qué Razón Social pertenece. Utiliza una **lógica de inferencia**:
1.  Mira el campo `dealer_name` del lead (ej: "KTM ROSARIO").
2.  Busca ese nombre en la lista de todos los Dealers configurados.
3.  Si lo encuentra, identifica la **Razón Social** asociada (`SPORTADVENTURE`).
4.  Usa el **Token** de esa Razón Social para enviar los datos.

---

## 3. Envío de Leads (SIMPA -> Dealer)

Este es el proceso "Forward Lead" (Reenvío). Ocurre cuando un lead ingresa a SIMPA y cumple los criterios para ser derivado.

### Flujo de Datos
1.  **Disparador:** Un Workflow en HubSpot SIMPA envía los datos del lead a la API de SIMPA Connect.
2.  **Validación:** Se verifica el `dealer_name` y la `marca`.
3.  **Destino:** Se selecciona el Portal de HubSpot destino usando la lógica de inferencia mencionada arriba.
4.  **Creación/Actualización:**
    *   **Contacto:** Se busca el contacto por email en el portal del Dealer. Si existe, se actualiza; si no, se crea.
    *   **Negocio (Deal):** Se crea un nuevo negocio asociado al contacto.

### ¿Qué información se envía?

**Datos del Contacto:**
*   Nombre y Apellido
*   Email
*   Teléfono
*   Ciudad
*   Preferencia de contacto (`como_queres_ser_contactado_`)
*   **ID Referencia:** `id_contacto_simpa` (ID original en SIMPA para trazar el vínculo).

**Datos del Negocio (Deal):**
*   **Nombre del Negocio (`dealname`):** Formato estandarizado:
    `SIMPA - {Nombre Apellido} - {Concesionario} - {Modelo}`
*   **Pipeline y Etapa:** Se asigna dinámicamente según la marca y configuración del Dealer (ej: Pipeline de Ventas Motos > Etapa "Lead Nuevo").
*   **Propiedades Específicas:**
    *   `marca_simpa`: La marca de interés (ej: KTM).
    *   `modelo_simpa`: El modelo específico (generado dinámicamente si no existe).
    *   `concesionarios_simpa`: El nombre del dealer asignado.
    *   `id_negocio_simpa`: **CRÍTICO**. Es el ID del negocio original en SIMPA. Permite que el Dealer "responda" actualizaciones.
    *   Información adicional: `financing_option`, `inquiry_reason`, `message` (comentarios).

---

## 4. Retorno de Información (Dealer -> SIMPA)

Este es el proceso de "Feedback Loop". Permite a SIMPA saber qué pasó con el lead sin preguntarle manualmente al Dealer.

### Mecanismo: Webhooks
Cada portal de Dealer tiene configurada una automatización (Workflow) que dice: *"Si el negocio cambia de etapa (Deal Stage), avisar a SIMPA Connect"*.

### Flujo de Lectura
1.  **Evento:** El vendedor en el Dealer mueve el negocio de "Lead Nuevo" a "Cierre Ganado".
2.  **Webhook:** HubSpot del Dealer envía una señal a SIMPA Connect con:
    *   Portal ID del Dealer.
    *   ID del Negocio en el Dealer.
3.  **Autenticación Inversa:** SIMPA Connect recibe la señal, lee el `Portal ID` y busca en su configuración qué token usar para leer los detalles.
4.  **Lectura de Detalles:** El sistema lee el negocio en el portal del Dealer y busca la propiedad clave: `id_negocio_simpa`.
5.  **Sincronización:**
    *   Usa el `id_negocio_simpa` para encontrar el negocio original en la cuenta central de SIMPA.
    *   Actualiza el estado en SIMPA para reflejar (ej: Si ganó en Dealer, marca como Ganado en SIMPA).
    *   Actualiza monto, fecha de cierre y etapa equivalente.

---

## 5. Herramientas de Administración

El Panel de Administrador (`/api/admin`) permite gestionar todo esto sin código:
*   **Dashboard:** Ver métricas de leads procesados y tasa de éxito.
*   **Razones Sociales:** Ver la configuración de conexiones (quién es quién).
*   **Simulador:** Probar manualmente el envío de un lead para verificar si la lógica de inferencia y los campos personalizados funcionan correctamente antes de habilitarlo en vivo.
*   **Logs:** Ver errores de transmisión en tiempo real.
