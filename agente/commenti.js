#!/usr/bin/env node
/*
 * Gestione dei commenti.
 *
 *   node agente/commenti.js leggi                  commenti a cui non abbiamo ancora risposto (JSON)
 *   node agente/commenti.js rispondi <id> "testo"  risponde a un commento
 *   node agente/commenti.js nascondi <id>          nasconde un commento (non lo cancella)
 *   node agente/commenti.js ignora <id> [motivo]   nessuna risposta: non lo ripropone più
 *   node agente/commenti.js commenta <media> "testo"  commento nostro sotto un post (es. rettifica)
 *
 * "Già gestito" si capisce direttamente da Instagram (c'è una nostra risposta o il
 * commento è nascosto). Solo i commenti lasciati senza risposta per scelta
 * finiscono in agente/ignorati.json.
 * Le decisioni su COSA rispondere sono in agente/regole-community.md.
 */
const fs = require('fs');
const path = require('path');
const lib = require('./lib');
const { instagram } = require('./ig');

const MAX_CARATTERI = 400;
const IGNORATI = path.join(lib.ROOT, 'agente', 'ignorati.json');

const leggiIgnorati = () => (fs.existsSync(IGNORATI) ? JSON.parse(fs.readFileSync(IGNORATI, 'utf8')) : {});

async function leggi(ig, stato) {
  const profilo = await ig.profilo();
  const igId = profilo.user_id || profilo.id;
  const giorni = stato.giorni_commenti || 14;
  const limiteData = Date.now() - giorni * 86400000;
  const media = (await ig.mediaRecenti(igId, 25)).filter((m) => new Date(m.timestamp).getTime() >= limiteData);

  const ignorati = leggiIgnorati();
  const daGestire = [];
  let nostreUltime24h = 0;
  for (const m of media) {
    for (const c of await ig.commenti(m.id)) {
      const risposte = (c.replies && c.replies.data) || [];
      nostreUltime24h += risposte.filter((r) => r.username === profilo.username && Date.now() - new Date(r.timestamp) < 86400000).length;
      if (c.username === profilo.username || c.hidden || ignorati[c.id]) continue;
      if (risposte.some((r) => r.username === profilo.username)) continue;
      daGestire.push({
        id: c.id,
        utente: c.username,
        testo: c.text,
        quando: c.timestamp,
        post: { id: m.id, inizio: (m.caption || '').split('\n')[0].slice(0, 100), link: m.permalink },
      });
    }
  }
  daGestire.sort((a, b) => a.quando.localeCompare(b.quando));

  const limite = stato.limite_risposte_giorno || 40;
  console.log(JSON.stringify({
    account: profilo.username,
    post_controllati: media.length,
    risposte_ultime_24h: nostreUltime24h,
    risposte_ancora_disponibili_oggi: Math.max(0, limite - nostreUltime24h),
    da_gestire: daGestire,
  }, null, 2));
}

async function main() {
  const [azione, id, ...resto] = process.argv.slice(2);
  const stato = lib.leggiStato();
  if (!stato.attivo) {
    console.log('Agente spento ("attivo": false in agente/stato.json).');
    return;
  }
  const ig = instagram(stato);

  if (azione === 'leggi') return leggi(ig, stato);

  if (azione === 'rispondi') {
    const testo = resto.join(' ').trim();
    if (!id || !testo) throw new Error('Uso: node agente/commenti.js rispondi <id-commento> "testo della risposta"');
    if (testo.length > MAX_CARATTERI) throw new Error(`Risposta troppo lunga (${testo.length}/${MAX_CARATTERI}). Accorciala.`);
    const r = await ig.rispondi(id, testo);
    console.log(`✓ Risposto al commento ${id} (risposta ${r.id})`);
    return;
  }

  if (azione === 'nascondi') {
    if (!id) throw new Error('Uso: node agente/commenti.js nascondi <id-commento>');
    await ig.nascondi(id, true);
    console.log(`✓ Commento ${id} nascosto`);
    return;
  }

  if (azione === 'ignora') {
    if (!id) throw new Error('Uso: node agente/commenti.js ignora <id-commento> [motivo]');
    const ignorati = leggiIgnorati();
    ignorati[id] = { quando: lib.adessoLocale(stato.fuso_orario), motivo: resto.join(' ') || '' };
    fs.writeFileSync(IGNORATI, JSON.stringify(ignorati, null, 2) + '\n');
    console.log(`✓ Commento ${id} lasciato senza risposta (non verrà riproposto)`);
    return;
  }

  if (azione === 'commenta') {
    const testo = resto.join(' ').trim();
    if (!id || !testo) throw new Error('Uso: node agente/commenti.js commenta <id-post> "testo"');
    if (testo.length > MAX_CARATTERI) throw new Error(`Commento troppo lungo (${testo.length}/${MAX_CARATTERI}).`);
    const r = await ig.api.post(`${id}/comments`, { message: testo });
    console.log(`✓ Commento pubblicato sotto il post ${id} (${r.id})`);
    return;
  }

  throw new Error('Azioni disponibili: leggi, rispondi, nascondi, ignora, commenta');
}

main().catch(lib.esci);
