#!/usr/bin/env node
/*
 * Prova completa degli script dell'agente contro un FINTO Instagram locale.
 * Non tocca l'account vero e non serve nessun token.
 *
 *   npm test
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');

// ---------- finto Instagram ----------

function avviaFintoInstagram() {
  const richieste = [];
  const db = {
    media: [{ id: 'm0', caption: 'Un post vecchio', timestamp: '2020-01-01T10:00:00+0000', permalink: 'https://instagram.com/p/vecchio' }],
    commenti: {
      m0: [],
    },
    contenitori: {},
    risposte: [],
    nascosti: [],
  };
  let n = 0;

  const server = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const p = Object.fromEntries(new URLSearchParams(corpo));
      richieste.push({ metodo: req.method, percorso: url.pathname, auth: req.headers.authorization, p, q: Object.fromEntries(url.searchParams) });
      const json = (code, dati) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(dati)); };

      if (url.pathname.startsWith('/img/')) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        return res.end();
      }
      if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        return json(401, { error: { message: 'manca il token', code: 190 } });
      }
      const parti = url.pathname.split('/').filter(Boolean); // [versione, ...]
      const [, a, b] = parti;

      if (url.pathname === '/refresh_access_token') return json(200, { access_token: 'x', token_type: 'bearer', expires_in: 5184000 });
      if (a === 'me') return json(200, { id: 'app1', user_id: 'IG1', username: 'disconnessi', account_type: 'MEDIA_CREATOR', followers_count: 42, media_count: db.media.length });
      if (a === 'IG1' && b === 'content_publishing_limit') return json(200, { data: [{ quota_usage: 1, config: { quota_total: 50 } }] });
      if (a === 'IG1' && b === 'media' && req.method === 'GET') return json(200, { data: db.media });
      if (a === 'IG1' && b === 'media' && req.method === 'POST') {
        const id = `c${++n}`;
        db.contenitori[id] = p;
        return json(200, { id });
      }
      if (a === 'IG1' && b === 'media_publish') {
        const c = db.contenitori[p.creation_id];
        const id = `m${++n}`;
        db.media.unshift({ id, caption: c.caption, timestamp: new Date().toISOString(), permalink: `https://instagram.com/p/${id}` });
        db.commenti[id] = [
          { id: 'k1', text: 'Verissimo, grazie', username: 'anna', timestamp: '2026-01-01T10:00:00+0000', hidden: false, replies: { data: [] } },
          { id: 'k2', text: 'Già risposto', username: 'bruno', timestamp: '2026-01-01T10:01:00+0000', hidden: false, replies: { data: [{ id: 'r1', username: 'disconnessi', text: 'Grazie!', timestamp: new Date().toISOString() }] } },
          { id: 'k3', text: 'insulto', username: 'troll', timestamp: '2026-01-01T10:02:00+0000', hidden: true, replies: { data: [] } },
          { id: 'k4', text: 'Nostro commento', username: 'disconnessi', timestamp: '2026-01-01T10:03:00+0000', hidden: false, replies: { data: [] } },
        ];
        return json(200, { id });
      }
      if (b === 'comments' && req.method === 'POST') { db.nostri = (db.nostri || []).concat({ media: a, testo: p.message }); return json(200, { id: `k${++n}x` }); }
      if (b === 'comments') return json(200, { data: db.commenti[a] || [] });
      if (b === 'replies') { db.risposte.push({ id: a, testo: p.message }); return json(200, { id: `r${++n}` }); }
      if (b === 'insights') return json(200, { data: [{ name: 'reach', values: [{ value: 120 }] }, { name: 'saved', total_value: { value: 7 } }] });
      if (a && a.startsWith('c')) return json(200, { id: a, status_code: 'FINISHED' });
      if (a && a.startsWith('m') && !b) return json(200, db.media.find((m) => m.id === a) || {});
      if (a && a.startsWith('k') && req.method === 'POST') { db.nascosti.push(a); return json(200, { success: true }); }
      return json(404, { error: { message: `percorso non previsto: ${req.method} ${url.pathname}` } });
    });
  });
  return new Promise((ok) => server.listen(0, () => ok({ server, richieste, db, porta: server.address().port })));
}

// ---------- cartella di prova (copia minima del progetto) ----------

function preparaCartella(porta) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disconnessi-prova-'));
  fs.mkdirSync(path.join(dir, 'agente'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'post'));
  const stato = JSON.parse(fs.readFileSync(path.join(REPO, 'agente', 'stato.json'), 'utf8'));
  stato.attivo = true;
  fs.writeFileSync(path.join(dir, 'agente', 'stato.json'), JSON.stringify(stato, null, 2));

  // Post 1: pronto, con fonte e immagini → deve uscire.
  let testo = fs.readFileSync(path.join(REPO, 'post', '01-musk-40-ore.md'), 'utf8');
  testo = testo.replace(/^stato:.*\n/m, '').replace(/^/, 'stato: pronto\ndata: 2020-01-02 18:15\nfonte_url: https://example.org/fonte\nverificato: 2026-11-06, prova automatica\n');
  fs.writeFileSync(path.join(dir, 'post', '01-musk-40-ore.md'), testo);
  const img = path.join(dir, 'pubblici', '01-musk-40-ore');
  fs.mkdirSync(img, { recursive: true });
  for (let i = 1; i <= 6; i++) fs.writeFileSync(path.join(img, `0${i}.jpg`), 'finto');

  // Post 2: pronto ma senza fonte → deve essere bloccato, non pubblicato.
  testo = fs.readFileSync(path.join(REPO, 'post', '02-jack-ma-996.md'), 'utf8');
  testo = testo.replace(/^stato:.*\n/m, '').replace(/^/, 'stato: pronto\ndata: 2020-01-03 18:15\n');
  fs.writeFileSync(path.join(dir, 'post', '02-jack-ma-996.md'), testo);

  return { dir, env: { ...process.env, DISCONNESSI_ROOT: dir, IG_API_BASE: `http://127.0.0.1:${porta}`, IG_TOKEN: 'token-di-prova', IMMAGINI_BASE_URL: `http://127.0.0.1:${porta}/img` } };
}

const esegui = (script, args, env) => new Promise((ok) => {
  execFile('node', [path.join(REPO, 'agente', script), ...args], { env }, (err, stdout, stderr) => ok({ codice: err ? err.code : 0, out: stdout + stderr }));
});

// ---------- prove ----------

(async () => {
  const finto = await avviaFintoInstagram();
  const { dir, env } = preparaCartella(finto.porta);
  const meta = (f) => fs.readFileSync(path.join(dir, 'post', f), 'utf8').split(/^---/m)[0];
  let r;

  r = await esegui('pubblica.js', ['--prova'], env);
  assert.strictEqual(r.codice, 0, r.out);
  assert.match(r.out, /PROVA riuscita/);
  assert.ok(!finto.richieste.some((x) => x.percorso.endsWith('media_publish')), 'in prova non deve pubblicare');
  console.log('✓ pubblica --prova: controlla tutto e non pubblica');

  r = await esegui('pubblica.js', [], env);
  assert.strictEqual(r.codice, 0, r.out);
  assert.match(r.out, /Pubblicato: https:\/\/instagram.com\/p\//);
  const carosello = Object.values(finto.db.contenitori).find((c) => c.media_type === 'CAROUSEL');
  assert.strictEqual(carosello.children.split(',').length, 6);
  assert.match(carosello.caption, /#disconnessi/);
  assert.match(meta('01-musk-40-ore.md'), /stato: pubblicato/);
  assert.match(meta('01-musk-40-ore.md'), /permalink: https:\/\/instagram.com\/p\//);
  assert.ok(finto.richieste.filter((x) => x.percorso !== '/img').every((x) => x.percorso.startsWith('/img') || x.auth === 'Bearer token-di-prova'), 'token sempre nell\'header');
  assert.ok(finto.richieste.every((x) => !('access_token' in x.q)), 'token mai nell\'URL');
  console.log('✓ pubblica: carosello di 6 immagini uscito, file del post aggiornato, token solo nell\'header');

  r = await esegui('pubblica.js', [], env);
  assert.strictEqual(r.codice, 1, r.out);
  assert.match(r.out, /bloccato/);
  assert.match(meta('02-jack-ma-996.md'), /stato: bloccato/);
  console.log('✓ pubblica: un post senza fonte verificata viene bloccato, non pubblicato');

  r = await esegui('commenti.js', ['leggi'], env);
  assert.strictEqual(r.codice, 0, r.out);
  const dati = JSON.parse(r.out);
  assert.deepStrictEqual(dati.da_gestire.map((c) => c.id), ['k1']);
  assert.strictEqual(dati.risposte_ultime_24h, 1);
  console.log('✓ commenti leggi: trova solo i commenti non ancora gestiti');

  r = await esegui('commenti.js', ['rispondi', 'k1', 'Grazie a te 🌱'], env);
  assert.strictEqual(r.codice, 0, r.out);
  assert.deepStrictEqual(finto.db.risposte, [{ id: 'k1', testo: 'Grazie a te 🌱' }]);
  r = await esegui('commenti.js', ['rispondi', 'k1', 'x'.repeat(500)], env);
  assert.strictEqual(r.codice, 1);
  r = await esegui('commenti.js', ['nascondi', 'k9'], env);
  assert.strictEqual(r.codice, 0, r.out);
  assert.deepStrictEqual(finto.db.nascosti, ['k9']);
  finto.db.commenti[finto.db.media[0].id].push({ id: 'k5', text: '🔥', username: 'carla', timestamp: '2026-01-01T11:00:00+0000', hidden: false, replies: { data: [] } });
  r = await esegui('commenti.js', ['ignora', 'k5', 'solo emoji'], env);
  assert.strictEqual(r.codice, 0, r.out);
  r = await esegui('commenti.js', ['leggi'], env);
  assert.ok(!JSON.parse(r.out).da_gestire.some((c) => c.id === 'k5'), 'un commento ignorato non va riproposto');
  r = await esegui('commenti.js', ['commenta', finto.db.media[0].id, 'Rettifica: la data giusta è il 2019.'], env);
  assert.strictEqual(r.codice, 0, r.out);
  assert.strictEqual(finto.db.nostri.length, 1);
  console.log('✓ commenti: risponde, rifiuta risposte troppo lunghe, nasconde, ignora, pubblica rettifiche');

  r = await esegui('statistiche.js', ['36500'], env);
  assert.strictEqual(r.codice, 0, r.out);
  assert.match(r.out, /\| 01-musk-40-ore \| La Disconnessione \|/);
  assert.match(r.out, /120/);
  console.log('✓ statistiche: legge i numeri e li collega al file del post');

  r = await esegui('token.js', [], env);
  assert.strictEqual(r.codice, 0, r.out);
  assert.match(r.out, /valido 60 giorni/);
  assert.ok(!/token-di-prova/.test(r.out), 'il token non va mai stampato');
  console.log('✓ token: rinnovo registrato, token mai stampato');

  r = await esegui('controlla.js', [], env);
  assert.strictEqual(r.codice, 0, r.out);
  assert.match(r.out, /Collegato a @disconnessi/);
  console.log('✓ controlla: diagnostica completa');

  // Interruttore spento: niente deve partire.
  const stato = JSON.parse(fs.readFileSync(path.join(dir, 'agente', 'stato.json'), 'utf8'));
  stato.attivo = false;
  fs.writeFileSync(path.join(dir, 'agente', 'stato.json'), JSON.stringify(stato));
  const prima = finto.richieste.length;
  r = await esegui('pubblica.js', [], env);
  assert.match(r.out, /Agente spento/);
  r = await esegui('commenti.js', ['leggi'], env);
  assert.match(r.out, /Agente spento/);
  assert.strictEqual(finto.richieste.length, prima);
  console.log('✓ interruttore: con "attivo": false non parte nessuna chiamata');

  finto.server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\nTutte le prove sono passate.');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
