#!/usr/bin/env node
/*
 * Rinnova il token di Instagram (dura 60 giorni; si può rinnovare dopo 24 ore).
 *
 *   node agente/token.js
 *
 * Non stampa mai il token. Aggiorna solo la data di scadenza in agente/stato.json.
 * Nota: se il rinnovo dovesse restituire un token DIVERSO, il nuovo va salvato a mano
 * (vedi docs/06-autopilota.md). Al primo utilizzo controlliamo come si comporta.
 */
const lib = require('./lib');
const { instagram } = require('./ig');

async function main() {
  const stato = lib.leggiStato();
  const giorni = await instagram(stato).rinnovaToken();
  if (!giorni) throw new Error('Rinnovo non riuscito: risposta senza durata.');
  const scadenza = new Date(Date.now() + giorni * 86400000).toISOString().slice(0, 10);
  stato.token_scadenza = scadenza;
  lib.scriviStato(stato);
  console.log(`✓ Token rinnovato: valido ${giorni} giorni (fino al ${scadenza}).`);
}

main().catch(lib.esci);
