// ============================================================
// NUZLOCKE OVERLAY — Log Receiver (Google Apps Script)
// ============================================================
//
// COMO INSTALAR:
// 1. Ve a https://script.google.com
// 2. Crea un proyecto nuevo
// 3. Pega este codigo completo
// 4. Cambia SHEET_ID por el ID de tu Google Sheet
// 5. Despliega como aplicacion web:
//    - Ejecuta como: Yo
//    - Acceso: Cualquier usuario
// 6. Copia la URL del despliegue y ponela en la app:
//    Configuracion > Diagnostico > URL de recepcion de logs
//
// ============================================================

// === CONFIGURACION ===
// Pon aqui el ID de tu Google Sheet (lo sacas de la URL)
// Ejemplo: https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
const SHEET_ID = 'TU_SHEET_ID_AQUI';

// === MAIN ===
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);

    // === Hoja: Events (cada evento de parseo) ===
    let eventsSheet = ss.getSheetByName('Events');
    if (!eventsSheet) {
      eventsSheet = ss.insertSheet('Events');
      eventsSheet.appendRow([
        'Timestamp', 'AppVersion', 'SessionID', 'OS', 'DotnetPath', 'Hostname',
        'Event', 'SavePath', 'SaveSize', 'GameVersion', 'Generation',
        'PKHeX_Game', 'PKHeX_PartyCount', 'PKHeX_PokemonCount', 'PKHeX_Error',
        'NativeTeamLength', 'NativeError',
        'Pokemon_Species', 'Pokemon_Nicknames', 'Pokemon_Levels', 'Pokemon_Shiny',
        'GeneralError'
      ]);
      eventsSheet.setFrozenRows(1);
      eventsSheet.getRange('1:1').setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    }

    const events = data.events || [];
    for (const ev of events) {
      const pokemon = ev.result?.pokemon || [];
      eventsSheet.appendRow([
        ev.timestamp || new Date().toISOString(),
        data.appVersion || '',
        data.sessionId || '',
        data.os || '',
        data.dotnetPath || '',
        data.hostname || '',
        ev.event || '',
        ev.savePath || '',
        ev.saveSize || '',
        ev.gameVersion || ev.gameInfo?.version || '',
        ev.gameGeneration || ev.gameInfo?.generation || ev.generation || '',
        ev.pkhexGame || ev.result?.game || '',
        ev.pkhexPartyCount || ev.result?.partyCount || '',
        ev.pkhexPokemonCount || ev.result?.pokemonCount || '',
        ev.pkhexError || '',
        ev.teamLength || '',
        ev.error || ev.nativeError || '',
        pokemon.map(p => p.species).join(', '),
        pokemon.map(p => p.nickname).join(', '),
        pokemon.map(p => p.level).join(', '),
        pokemon.map(p => p.shiny ? 'S' : '').join(', '),
        ev.error || '',
      ]);
    }

    // === Hoja: Sessions (resumen de cada sesion) ===
    let sessionsSheet = ss.getSheetByName('Sessions');
    if (!sessionsSheet) {
      sessionsSheet = ss.insertSheet('Sessions');
      sessionsSheet.appendRow([
        'Timestamp', 'SessionID', 'AppVersion', 'OS', 'DotnetPath',
        'Hostname', 'TotalRAM', 'FreeRAM', 'CPUs', 'Events'
      ]);
      sessionsSheet.setFrozenRows(1);
      sessionsSheet.getRange('1:1').setFontWeight('bold').setBackground('#34a853').setFontColor('#ffffff');
    }

    // Solo logear sesion en el primer evento de cada batch
    if (events.length > 0 && events[0].event === 'save_parse') {
      sessionsSheet.appendRow([
        new Date().toISOString(),
        data.sessionId || '',
        data.appVersion || '',
        data.os || '',
        data.dotnetPath || '',
        data.hostname || '',
        '',
        '',
        '',
        events.length,
      ]);
    }

    // === Hoja: Errors (solo errores) ===
    let errorsSheet = ss.getSheetByName('Errors');
    if (!errorsSheet) {
      errorsSheet = ss.insertSheet('Errors');
      errorsSheet.appendRow([
        'Timestamp', 'AppVersion', 'SessionID', 'OS', 'Event',
        'SavePath', 'SaveSize', 'GameVersion', 'Error'
      ]);
      errorsSheet.setFrozenRows(1);
      errorsSheet.getRange('1:1').setFontWeight('bold').setBackground('#ea4335').setFontColor('#ffffff');
    }

    for (const ev of events) {
      if (ev.error || ev.pkhexError || ev.nativeError) {
        errorsSheet.appendRow([
          ev.timestamp || new Date().toISOString(),
          data.appVersion || '',
          data.sessionId || '',
          data.os || '',
          ev.event || '',
          ev.savePath || '',
          ev.saveSize || '',
          ev.gameVersion || ev.gameInfo?.version || '',
          ev.error || ev.pkhexError || ev.nativeError || '',
        ]);
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, events: events.length })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'Nuzlocke Overlay Log Receiver', version: '1.0' })
  ).setMimeType(ContentService.MimeType.JSON);
}
