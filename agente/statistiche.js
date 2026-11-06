#!/usr/bin/env node
/*
 * Raccoglie i numeri dell'account e dei post recenti.
 *
 *   node agente/statistiche.js [giorni]    (default: 30)
 *
 * Stampa una tabella e salva i dati grezzi in report/dati/AAAA-MM-GG.json,
 * così ogni settimana si può confrontare con la precedente.
 */
const fs = require('fs');
const path = require('path');
const lib = require('./lib');
const { instagram } = require('./ig');

async function main() {
  const giorni = Number(process.argv[2]) || 30;
  const stato = lib.leggiStato();
  const ig = instagram(stato);
  const metriche = stato.metriche || ['reach', 'views', 'saved', 'shares', 'total_interactions'];

  const profilo = await ig.profilo();
  const igId = profilo.user_id || profilo.id;
  const limite = Date.now() - giorni * 86400000;
  const media = (await ig.mediaRecenti(igId, 50)).filter((m) => new Date(m.timestamp).getTime() >= limite);

  // Collega ogni post Instagram al suo file in /post (per sapere il format).
  const perId = Object.fromEntries(lib.elencoPost().filter((p) => p.meta.media_id).map((p) => [p.meta.media_id, p]));

  const righe = [];
  for (const m of media) {
    const valori = await ig.insights(m.id, metriche);
    const file = perId[m.id];
    righe.push({
      data: lib.adessoLocale(stato.fuso_orario, new Date(m.timestamp)),
      post: file ? file.nome : (m.caption || '').split('\n')[0].slice(0, 40),
      format: file ? file.meta.format || '' : '',
      like: m.like_count || 0,
      commenti: m.comments_count || 0,
      ...valori,
      link: m.permalink,
    });
  }

  const oggi = lib.adessoLocale(stato.fuso_orario).slice(0, 10);
  const dir = path.join(lib.ROOT, 'report', 'dati');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${oggi}.json`), JSON.stringify({ data: oggi, profilo, post: righe }, null, 2) + '\n');

  const colonne = ['data', 'post', 'format', 'like', 'commenti', ...metriche];
  console.log(`@${profilo.username} · follower ${profilo.followers_count ?? '?'} · post totali ${profilo.media_count ?? '?'} · ultimi ${giorni} giorni\n`);
  console.log(`| ${colonne.join(' | ')} |`);
  console.log(`|${colonne.map(() => '---').join('|')}|`);
  for (const r of righe) console.log(`| ${colonne.map((c) => r[c] ?? '–').join(' | ')} |`);
  console.log(`\nDati salvati in report/dati/${oggi}.json`);
}

main().catch(lib.esci);
