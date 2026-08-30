# Guia: Sistema de Logs Remotos

## Como funciona

1. Cada vez que un usuario parsea un save, la app envia un POST al endpoint
2. Google Apps Script recibe el POST y guarda en 3 hojas de Google Sheet:
   - **Events** — Cada evento de parseo (save, juego, resultado PKHeX, errores)
   - **Sessions** — Resumen de cada sesion (OS, version, dotnet)
   - **Errors** — Solo errores (para rapido diagnosticar)

## Instalacion (5 minutos)

### Paso 1: Crear el Google Sheet

1. Ve a https://sheets.google.com
2. Crea una hoja nueva, nombrala **"Nuzlocke Logs"**
3. Copia el ID de la URL:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_ID_ESLO_QUE_NECESTITAS/edit
                                       ^^^^^^^^^^^^^^^^^^^
   ```

### Paso 2: Crear el Google Apps Script

1. Ve a https://script.google.com
2. Crea un proyecto nuevo
3. Borra todo el codigo que haya
4. Pega el contenido de `scripts/log-receiver.gs`
5. Cambia `TU_SHEET_ID_AQUI` por el ID que copiaste en Paso 1
6. Guarda (Ctrl+S)

### Paso 3: Desplegar como API

1. Haz clic en **"Desplegar"** > **"Desplegar nueva implementacion"**
2. Tipo: **Aplicacion web**
3. Ejecuta como: **Yo** (tu cuenta)
4. Acceso: **Cualquier usuario**
5. Haz clic en **"Desplegar"**
6. **Copia la URL** que te da (algo como `https://script.google.com/macros/s/AKfyc.../exec`)

### Paso 4: Configurar en la app

1. Abre Nuzlocke Overlay
2. Ve a **Configuracion** > **Diagnostico**
3. Pega la URL en **"URL de recepcion de logs"**
4. Listo! Los logs se envian automaticamente

## Ver los logs

Abre tu Google Sheet "Nuzlocke Logs". Tendras 3 hojas:

### Hoja Events
| Columna | Que muestra |
|---------|-------------|
| Timestamp | Cuando se parseo |
| AppVersion | Version de la app del usuario |
| OS | Sistema operativo |
| Event | `save_parse`, `pkhex_result`, `native_parser_result` |
| SavePath | Ruta del save del usuario |
| SaveSize | Tamano del archivo |
| GameVersion | Juego detectado |
| PKHeX_Game | Que detecto PKHeX |
| PKHeX_PartyCount | Cuantos Pokemon en equipo |
| PKHeX_Error | Error de PKHeX si fallo |
| Pokemon_Species | IDs de los Pokemon |
| Pokemon_Nicknames | Nicknames |
| GeneralError | Error general |

### Hoja Errors
Solo errores. Rapido para ver que esta fallando.

### Hoja Sessions
Una fila por sesion. Para ver cuantos usuarios activos hay.

## Ejemplo de uso

1. Un usuario reporta "no detecta mi equipo"
2. Abres el Sheet > hoja Errors > buscas su sessionID
3. Ves el error: `PKHeX not found` o `Native parser returned 0 Pokemon`
4. Ves su OS, version, tamano del save
5. Arreglas el bug
6. Siguiente push

## Coste

**Gratis.** Google Apps Script y Google Sheets son gratuitos para uso normal.
No necesitas servidor ni hosting.
