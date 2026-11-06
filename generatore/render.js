#!/usr/bin/env node
/*
 * Trasforma i post scritti in /post/*.md in immagini PNG 1080x1350
 * pronte per un carosello Instagram, più un file con la didascalia.
 *
 *   npm run render            -> tutti i post
 *   npm run render -- 03      -> solo i post il cui nome contiene "03"
 *
 * Risultato in /output/<nome-post>/
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const POST_DIR = path.join(ROOT, 'post');
const OUT_DIR = path.join(ROOT, 'output');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const css = fs.readFileSync(path.join(__dirname, 'stile.css'), 'utf8');

// I font sono dentro il repo: le immagini escono uguali su ogni computer.
const FONT = [['Inter Local', 'Inter.ttf'], ['Serif Local', 'SourceSerif4.ttf'], ['Mono Local', 'JetBrainsMono.ttf']];
const fontFace = FONT.map(([famiglia, file]) => {
  const b64 = fs.readFileSync(path.join(__dirname, 'font', file)).toString('base64');
  return `@font-face { font-family: "${famiglia}"; src: url(data:font/ttf;base64,${b64}) format("truetype"); font-weight: 100 900; }`;
}).join('\n');

const TIPI = ['citazione', 'disconnessione', 'testo', 'dato', 'domanda', 'didascalia'];

// ---------- lettura del file .md ----------

function leggiPost(file) {
  const testo = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const blocchi = testo.split(/^---\s*$/m).map((b) => b.trim()).filter(Boolean);

  const meta = {};
  for (const riga of blocchi.shift().split('\n')) {
    const m = riga.match(/^([\w-]+):\s*(.*)$/);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  }

  const slide = [];
  let didascalia = '';
  for (const blocco of blocchi) {
    const righe = blocco.split('\n');
    const testa = righe.shift().match(/^\[(\w+)\]\s*(.*)$/);
    if (!testa || !TIPI.includes(testa[1])) {
      throw new Error(`${path.basename(file)}: ogni blocco deve iniziare con un tipo tra ${TIPI.join(', ')}`);
    }
    const [, tipo, etichetta] = testa;
    let fonte = '';
    const corpo = righe.filter((r) => {
      const m = r.match(/^fonte:\s*(.*)$/i);
      if (m) { fonte = m[1].trim(); return false; }
      return true;
    }).join('\n').trim();

    if (tipo === 'didascalia') { didascalia = corpo; continue; }
    slide.push({ tipo, etichetta: etichetta.trim(), corpo, fonte });
  }
  return { meta, slide, didascalia };
}

// ---------- da testo a HTML ----------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return esc(s)
    .replace(/"([^"\n]+)"/g, '“$1”')
    .replace(/'/g, '’')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\n/g, '<br>');
}

const paragrafi = (s) => s.split(/\n\s*\n/).map((p) => `<p>${inline(p.trim())}</p>`).join('');

function piede(n, totale, extra = '') {
  return `<footer><span>${esc(config.handle)}</span>${extra}<span>${n}/${totale}</span></footer>`;
}

function slideHtml(s, i, totale, post) {
  const n = i + 1;
  const fonte = s.fonte ? `<div class="fonte">Fonte: ${inline(s.fonte)}</div>` : '';

  switch (s.tipo) {
    case 'citazione':
      return `<div class="slide hustle">
        <div class="tag">${inline(s.etichetta || 'Come te la vendono')}</div>
        <div class="fit" data-min="56" data-max="132"><blockquote>“${inline(s.corpo)}”</blockquote></div>
        <div class="autore">— ${inline(post.meta.autore || '')}<span>${inline(s.fonte || post.meta.fonte || '')}</span></div>
        ${piede(n, totale, '<span>scorri →</span>')}
      </div>`;

    case 'disconnessione': {
      const prima = post.slide.find((x) => x.tipo === 'citazione');
      const originale = prima ? `<div class="originale">“${inline(prima.corpo)}”</div>` : '';
      return `<div class="slide disc">
        <div class="tag"><span class="punto"></span>${inline(s.etichetta || 'Disconnessione')}</div>
        ${originale}
        <div class="fit" data-min="40" data-max="96"><div class="testo">${paragrafi(s.corpo)}</div></div>
        ${fonte}
        ${piede(n, totale)}
      </div>`;
    }

    case 'dato': {
      const [numero, ...resto] = s.corpo.split('\n');
      return `<div class="slide chiaro dato">
        <div class="tag">${inline(s.etichetta || 'Il dato')}</div>
        <div class="fit" data-min="30"><div class="gruppo">
          <div class="numero">${inline(numero)}</div>
          <div class="testo">${paragrafi(resto.join('\n').trim())}</div>
        </div></div>
        ${fonte}
        ${piede(n, totale)}
      </div>`;
    }

    case 'domanda':
      return `<div class="slide verde">
        <div class="tag">${inline(s.etichetta || 'Ora tocca a te')}</div>
        <div class="fit" data-min="44" data-max="92"><div class="testo">${paragrafi(s.corpo)}</div></div>
        <div class="cta">${inline(post.meta.cta || config.cta)}</div>
        ${piede(n, totale)}
      </div>`;

    default: // testo
      return `<div class="slide chiaro">
        <div class="tag">${inline(s.etichetta || '')}</div>
        <div class="fit" data-min="34" data-max="68"><div class="testo">${paragrafi(s.corpo)}</div></div>
        ${fonte}
        ${piede(n, totale)}
      </div>`;
  }
}

const pagina = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
<style>${fontFace}\n${css}</style></head><body></body></html>`;

// Parte dalla dimensione massima e rimpicciolisce il testo finché non entra
// nello spazio disponibile (lasciando un po' di respiro sopra e sotto).
function adattaTesto() {
  for (const box of document.querySelectorAll('.fit')) {
    const dentro = box.firstElementChild;
    if (!dentro) continue;
    const minimo = parseFloat(box.dataset.min || '32');
    if (box.dataset.max) dentro.style.fontSize = box.dataset.max + 'px';
    let size = parseFloat(getComputedStyle(dentro).fontSize);
    const spazio = box.clientHeight * 0.85;
    const sborda = () => dentro.offsetHeight > spazio || dentro.scrollWidth > dentro.clientWidth + 1;
    while (sborda() && size > minimo) {
      size -= 2;
      dentro.style.fontSize = size + 'px';
    }
    if (dentro.offsetHeight > box.clientHeight || dentro.scrollWidth > dentro.clientWidth + 1) box.dataset.troppo = '1';
  }
  return document.querySelectorAll('[data-troppo]').length;
}

// ---------- main ----------

(async () => {
  const filtro = process.argv[2] || '';
  const files = fs.readdirSync(POST_DIR)
    .filter((f) => f.endsWith('.md') && f.includes(filtro))
    .sort();
  if (!files.length) { console.log('Nessun post trovato in /post'); return; }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  // Carica la pagina (con i font) una volta sola, poi cambia solo il contenuto.
  await page.setContent(pagina);
  await page.evaluate((famiglie) => Promise.all(famiglie.flatMap((f) =>
    [400, 700, 900].map((w) => document.fonts.load(`${w} 40px "${f}"`)))), FONT.map(([f]) => f));

  for (const f of files) {
    const nome = f.replace(/\.md$/, '');
    const post = leggiPost(path.join(POST_DIR, f));
    const dir = path.join(OUT_DIR, nome);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    for (let i = 0; i < post.slide.length; i++) {
      await page.evaluate((html) => { document.body.innerHTML = html; }, slideHtml(post.slide[i], i, post.slide.length, post));
      const troppo = await page.evaluate(adattaTesto);
      if (troppo) console.warn(`  ⚠ ${nome} slide ${i + 1}: testo troppo lungo, accorcialo`);
      await page.screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, '0')}.png`) });
    }

    const hashtag = post.meta.hashtag ? `\n\n${post.meta.hashtag}` : '';
    fs.writeFileSync(path.join(dir, 'didascalia.txt'), post.didascalia + hashtag + '\n');

    console.log(`✓ ${nome}: ${post.slide.length} slide`);
    if (post.meta.verifica) console.log(`  → prima di pubblicare verifica: ${post.meta.verifica}`);
  }

  await browser.close();
  console.log(`\nFatto. Trovi tutto in ${path.relative(process.cwd(), OUT_DIR) || OUT_DIR}/`);
})().catch((e) => { console.error(e.message); process.exit(1); });
