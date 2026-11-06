// Utilità condivise dagli script dell'agente: percorsi, stato, post, orari.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(process.env.DISCONNESSI_ROOT || path.join(__dirname, '..'));
const POST_DIR = path.join(ROOT, 'post');
const PUB_DIR = path.join(ROOT, 'pubblici');
const STATO_FILE = path.join(ROOT, 'agente', 'stato.json');

const { leggiPost } = require('../generatore/render.js');

// ---------- stato (l'interruttore dell'agente) ----------

function leggiStato() {
  return JSON.parse(fs.readFileSync(STATO_FILE, 'utf8'));
}

function scriviStato(stato) {
  fs.writeFileSync(STATO_FILE, JSON.stringify(stato, null, 2) + '\n');
}

// ---------- post ----------

function elencoPost() {
  return fs.readdirSync(POST_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const file = path.join(POST_DIR, f);
      const post = leggiPost(file);
      return { file, nome: f.replace(/\.md$/, ''), ...post };
    });
}

// Aggiorna (o aggiunge) righe "chiave: valore" nell'intestazione di un post.
function aggiornaMeta(file, valori) {
  const testo = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fine = testo.search(/^---\s*$/m);
  let testa = fine === -1 ? testo : testo.slice(0, fine);
  const resto = fine === -1 ? '' : testo.slice(fine);
  testa = testa.replace(/\n+$/, '');
  for (const [k, v] of Object.entries(valori)) {
    const riga = `${k}: ${v}`;
    const re = new RegExp(`^${k}:.*$`, 'm');
    testa = re.test(testa) ? testa.replace(re, riga) : `${testa}\n${riga}`;
  }
  fs.writeFileSync(file, `${testa}\n${resto}`);
}

// Didascalia completa (testo + hashtag), con i controlli dei limiti Instagram.
function componiDidascalia(post) {
  const hashtag = (post.meta.hashtag || '').trim();
  const testo = `${post.didascalia.trim()}${hashtag ? `\n\n${hashtag}` : ''}`;
  const problemi = [];
  const n = (testo.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  if (testo.length > 2200) problemi.push(`didascalia troppo lunga (${testo.length}/2200 caratteri)`);
  if (n > 5) problemi.push(`troppi hashtag (${n}, massimo 5)`);
  if (!post.didascalia.trim()) problemi.push('didascalia vuota');
  return { testo, problemi };
}

function immaginiPost(nome) {
  const dir = path.join(PUB_DIR, nome);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort().map((f) => path.join(dir, f));
}

// ---------- link pubblici alle immagini ----------

// Instagram scarica le immagini da un link pubblico. Di default usiamo GitHub:
// il link punta al commit esatto, quindi non cambia mai.
function urlImmagini(nome, files, stato) {
  const base = process.env.IMMAGINI_BASE_URL || stato.immagini_base_url;
  const rel = files.map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
  if (base) return rel.map((r) => `${base.replace(/\/$/, '')}/${r}`);

  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  const remoto = git('remote', 'get-url', 'origin');
  const m = remoto.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/);
  if (!m) throw new Error(`Non riesco a capire il repository GitHub da: ${remoto}`);
  const sha = git('log', '-1', '--format=%H', '--', `pubblici/${nome}`);
  if (!sha) throw new Error(`Le immagini di ${nome} non sono ancora in un commit. Fai commit e push prima di pubblicare.`);
  if (!git('branch', '-r', '--contains', sha)) {
    throw new Error(`Il commit con le immagini di ${nome} non è ancora su GitHub. Fai push prima di pubblicare.`);
  }
  return rel.map((r) => `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${sha}/${r}`);
}

// ---------- orari (sempre ora italiana) ----------

function adessoLocale(fuso = 'Europe/Rome', data = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// ---------- output ----------

function esci(errore) {
  console.error(`✗ ${errore.message || errore}`);
  process.exit(1);
}

module.exports = {
  ROOT, POST_DIR, PUB_DIR, leggiStato, scriviStato, elencoPost, aggiornaMeta,
  componiDidascalia, immaginiPost, urlImmagini, adessoLocale, esci,
};
