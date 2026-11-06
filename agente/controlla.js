#!/usr/bin/env node
/*
 * Controllo generale: dice in parole semplici cosa funziona e cosa no.
 *
 *   node agente/controlla.js
 */
const lib = require('./lib');
const { instagram } = require('./ig');

const ok = (t) => console.log(`✓ ${t}`);
const no = (t, come) => console.log(`✗ ${t}${come ? `\n    → ${come}` : ''}`);
const info = (t) => console.log(`· ${t}`);

async function main() {
  let stato;
  try {
    stato = lib.leggiStato();
    (stato.attivo ? ok : info)(`Agente ${stato.attivo ? 'ACCESO' : 'spento'} · modalità "${stato.modalita}"`);
  } catch (e) {
    return no('agente/stato.json illeggibile', e.message);
  }

  // Coda dei post
  const post = lib.elencoPost();
  const conta = (s) => post.filter((p) => (p.meta.stato || 'bozza') === s).length;
  info(`Post: ${conta('pronto')} pronti · ${conta('da_approvare')} da approvare · ${conta('bozza')} bozze · ${conta('pubblicato')} pubblicati · ${conta('bloccato')} bloccati`);
  const pronti = post.filter((p) => p.meta.stato === 'pronto').sort((a, b) => (a.meta.data || '').localeCompare(b.meta.data || ''));
  for (const p of pronti) {
    const immagini = lib.immaginiPost(p.nome).length;
    const difetti = [];
    if (!p.meta.data) difetti.push('manca la data');
    if (!p.meta.fonte_url) difetti.push('manca fonte_url');
    if (!p.meta.verificato) difetti.push('manca verificato');
    if (immagini !== p.slide.length) difetti.push(`immagini ${immagini}/${p.slide.length}`);
    (difetti.length ? no : ok)(`${p.meta.data || '????'} ${p.nome}${difetti.length ? ` (${difetti.join(', ')})` : ''}`);
  }
  if (pronti.length < (stato.coda_minima || 6)) info(`La coda è sotto il minimo (${pronti.length}/${stato.coda_minima || 6}): serve una sessione di redazione.`);

  // Token e account
  const ig = instagram(stato);
  try {
    const p = await ig.profilo();
    ok(`Collegato a @${p.username} (${p.account_type || 'tipo sconosciuto'}) · follower ${p.followers_count ?? '?'}`);
    const q = await ig.quota(p.user_id || p.id);
    ok(`Quota pubblicazioni: ${q.usati}/${q.totale} nelle ultime 24 ore`);
  } catch (e) {
    no(`Instagram non risponde: ${e.message}`,
      'Controlla che il token sia salvato (segreto di rete per graph.instagram.com) e non scaduto. Vedi docs/06-autopilota.md');
  }

  // Scadenza token
  if (stato.token_scadenza) {
    const giorni = Math.round((new Date(stato.token_scadenza) - Date.now()) / 86400000);
    (giorni > 10 ? ok : no)(`Token valido ancora ${giorni} giorni (scade il ${stato.token_scadenza})`,
      giorni > 10 ? '' : 'Rinnovalo: node agente/token.js oppure rigeneralo dalla dashboard Meta');
  } else {
    info('Scadenza del token non registrata in stato.json ("token_scadenza")');
  }

  // Immagini raggiungibili online
  const conImmagini = pronti.find((p) => lib.immaginiPost(p.nome).length);
  if (conImmagini) {
    try {
      const [url] = lib.urlImmagini(conImmagini.nome, lib.immaginiPost(conImmagini.nome).slice(0, 1), stato);
      const r = await fetch(url, { method: 'HEAD' });
      (r.ok ? ok : no)(`Immagini online: ${r.status} ${r.headers.get('content-type')}`, r.ok ? '' : url);
    } catch (e) {
      no('Immagini non raggiungibili', e.message);
    }
  }
}

main().catch(lib.esci);
