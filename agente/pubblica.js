#!/usr/bin/env node
/*
 * Pubblica su Instagram il prossimo post in coda.
 *
 *   node agente/pubblica.js           pubblica il primo post "pronto" con data già passata
 *   node agente/pubblica.js --prova   fa tutti i controlli ma non pubblica niente
 *
 * Un post viene pubblicato solo se:
 *   - l'agente è acceso (agente/stato.json → "attivo": true)
 *   - nel file del post c'è "stato: pronto" e una "data" già passata (ora italiana)
 *   - ha "fonte_url" e "verificato" compilati (la citazione è stata controllata)
 *   - le immagini JPEG sono in pubblici/<post>/ e raggiungibili online
 *   - oggi non è già uscito un altro post
 */
const lib = require('./lib');
const { instagram, threads } = require('./ig');

async function main() {
  const prova = process.argv.includes('--prova');
  const stato = lib.leggiStato();
  if (!stato.attivo) {
    console.log('Agente spento ("attivo": false in agente/stato.json). Non pubblico niente.');
    return;
  }

  const adesso = lib.adessoLocale(stato.fuso_orario);
  const inCoda = lib.elencoPost()
    .filter((p) => p.meta.stato === 'pronto' && p.meta.data && p.meta.data <= adesso)
    .sort((a, b) => a.meta.data.localeCompare(b.meta.data));

  if (!inCoda.length) {
    const prossimo = lib.elencoPost().filter((p) => p.meta.stato === 'pronto').sort((a, b) => (a.meta.data || '').localeCompare(b.meta.data || ''))[0];
    console.log(`Niente da pubblicare adesso (${adesso}).${prossimo ? ` Prossimo: ${prossimo.nome} il ${prossimo.meta.data}.` : ' La coda è vuota.'}`);
    return;
  }

  const post = inCoda[0];
  console.log(`Post in uscita: ${post.nome} (previsto ${post.meta.data})`);

  // --- controlli sul contenuto ---
  const problemi = [];
  if (!/^https?:\/\//.test(post.meta.fonte_url || '')) problemi.push('manca "fonte_url" (link alla fonte originale della citazione)');
  if (!post.meta.verificato) problemi.push('manca "verificato" (data e modo in cui è stata controllata la fonte)');
  const { testo: didascalia, problemi: pDidascalia } = lib.componiDidascalia(post);
  problemi.push(...pDidascalia);
  const immagini = lib.immaginiPost(post.nome);
  if (immagini.length !== post.slide.length) {
    problemi.push(`immagini in pubblici/${post.nome}/: ${immagini.length}, slide nel post: ${post.slide.length}. Rigenera con: node generatore/render.js ${post.nome} --pubblica`);
  }
  if (problemi.length) {
    lib.aggiornaMeta(post.file, { stato: 'bloccato', nota: problemi.join('; ') });
    throw new Error(`Post ${post.nome} bloccato:\n  - ${problemi.join('\n  - ')}`);
  }

  // --- controlli sull'account ---
  const ig = instagram(stato);
  const profilo = await ig.profilo();
  const igId = profilo.user_id || profilo.id;
  const recenti = await ig.mediaRecenti(igId, 25);

  // Già pubblicato? (succede se una sessione precedente non ha fatto in tempo a salvarlo)
  const inizio = didascalia.slice(0, 80);
  const doppione = recenti.find((m) => (m.caption || '').startsWith(inizio));
  if (doppione) {
    lib.aggiornaMeta(post.file, { stato: 'pubblicato', media_id: doppione.id, permalink: doppione.permalink, pubblicato_il: doppione.timestamp });
    console.log(`Era già online (${doppione.permalink}): segnato come pubblicato.`);
    return;
  }

  const oggi = adesso.slice(0, 10);
  const uscitoOggi = recenti.find((m) => lib.adessoLocale(stato.fuso_orario, new Date(m.timestamp)).startsWith(oggi));
  if (uscitoOggi) {
    console.log(`Oggi è già uscito un post (${uscitoOggi.permalink}). Questo slitta alla prossima esecuzione.`);
    return;
  }

  const quota = await ig.quota(igId);
  if (quota.usati >= quota.totale) throw new Error(`Limite di pubblicazione raggiunto (${quota.usati}/${quota.totale} nelle ultime 24 ore).`);

  const urls = lib.urlImmagini(post.nome, immagini, stato);
  for (const url of urls) {
    const r = await fetch(url, { method: 'HEAD' });
    const tipo = r.headers.get('content-type') || '';
    if (!r.ok || !/image\/jpe?g/.test(tipo)) throw new Error(`Immagine non raggiungibile o non JPEG (${r.status} ${tipo}): ${url}`);
  }

  if (prova) {
    console.log(`PROVA riuscita: @${profilo.username}, ${urls.length} immagini raggiungibili, didascalia di ${didascalia.length} caratteri, quota ${quota.usati}/${quota.totale}. Non ho pubblicato niente.`);
    return;
  }

  // --- pubblicazione ---
  const pubblicato = await ig.pubblicaCarosello(igId, urls, didascalia);
  lib.aggiornaMeta(post.file, {
    stato: 'pubblicato',
    media_id: pubblicato.id,
    permalink: pubblicato.permalink,
    pubblicato_il: lib.adessoLocale(stato.fuso_orario),
  });
  console.log(`✓ Pubblicato: ${pubblicato.permalink}`);

  if (stato.threads && stato.threads.attivo) {
    try {
      const testo = post.meta.threads || post.didascalia.split(/\n\s*\n/).slice(0, 2).join('\n\n');
      const t = await threads(stato).pubblicaCarosello(urls, testo);
      lib.aggiornaMeta(post.file, { threads_id: t.id });
      console.log(`✓ Pubblicato anche su Threads (${t.id})`);
    } catch (e) {
      console.warn(`⚠ Threads non riuscito (Instagram è andato bene): ${e.message}`);
    }
  }
}

main().catch(lib.esci);
