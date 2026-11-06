// Client minimo per l'API ufficiale di Instagram (Instagram API with Instagram Login)
// e, facoltativo, per Threads.
//
// Il token viaggia sempre nell'header "Authorization: Bearer", mai nell'URL.
// - In una sessione cloud di Claude il token è salvato come "segreto di rete":
//   il proxy lo inserisce da solo, qui basta un valore segnaposto.
// - Altrove (computer, GitHub Actions) va messo nella variabile IG_TOKEN.

const DEFAULT_BASE = 'https://graph.instagram.com';

class ErroreApi extends Error {
  constructor(messaggio, dettagli) {
    super(messaggio);
    this.dettagli = dettagli;
  }
}

function client({ base, versione, token }) {
  const radice = `${base.replace(/\/$/, '')}/${versione}`;

  async function chiama(metodo, percorso, parametri = {}) {
    const url = percorso.startsWith('http') ? new URL(percorso) : new URL(`${radice}/${percorso.replace(/^\//, '')}`);
    const opzioni = { method: metodo, headers: { Authorization: `Bearer ${token}` } };
    const coppie = Object.entries(parametri).filter(([, v]) => v !== undefined && v !== null);
    if (metodo === 'GET') {
      for (const [k, v] of coppie) url.searchParams.set(k, String(v));
    } else {
      opzioni.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opzioni.body = new URLSearchParams(coppie.map(([k, v]) => [k, String(v)])).toString();
    }

    let risposta;
    for (let tentativo = 1; ; tentativo++) {
      try {
        risposta = await fetch(url, opzioni);
      } catch (e) {
        if (tentativo < 3) { await pausa(2000 * tentativo); continue; }
        throw new ErroreApi(`Rete non raggiungibile (${url.host}): ${e.message}`);
      }
      if (risposta.status >= 500 && tentativo < 3) { await pausa(2000 * tentativo); continue; }
      break;
    }

    const testo = await risposta.text();
    let dati;
    try { dati = testo ? JSON.parse(testo) : {}; } catch { dati = { grezzo: testo.slice(0, 300) }; }
    if (!risposta.ok || dati.error) {
      const e = dati.error || {};
      throw new ErroreApi(
        `API ${risposta.status} su ${metodo} ${url.pathname}: ${e.message || dati.grezzo || 'errore sconosciuto'}`,
        { stato: risposta.status, codice: e.code, sottocodice: e.error_subcode },
      );
    }
    return dati;
  }

  // Segue la paginazione ("paging.next") fino a un massimo di pagine.
  async function tutte(percorso, parametri, maxPagine = 5) {
    const elementi = [];
    let pagina = await chiama('GET', percorso, parametri);
    for (let i = 0; ; i++) {
      elementi.push(...(pagina.data || []));
      const prossima = pagina.paging && pagina.paging.next;
      if (!prossima || i + 1 >= maxPagine) break;
      pagina = await chiama('GET', prossima);
    }
    return elementi;
  }

  return { chiama, tutte, get: (p, q) => chiama('GET', p, q), post: (p, q) => chiama('POST', p, q) };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Aspetta che un "contenitore" (bozza lato Instagram) sia pronto per la pubblicazione.
async function attendiPronto(api, idContenitore, { tentativi = 30, intervallo = 3000 } = {}) {
  for (let i = 0; i < tentativi; i++) {
    const { status_code: stato, status } = await api.get(idContenitore, { fields: 'status_code,status' });
    if (stato === 'FINISHED' || stato === 'PUBLISHED') return;
    if (stato === 'ERROR' || stato === 'EXPIRED') throw new ErroreApi(`Contenitore ${idContenitore}: ${stato} ${status || ''}`);
    await pausa(intervallo);
  }
  throw new ErroreApi(`Contenitore ${idContenitore} non pronto dopo ${tentativi} controlli`);
}

// ---------- Instagram ----------

function instagram(stato) {
  const api = client({
    base: process.env.IG_API_BASE || DEFAULT_BASE,
    versione: stato.api_versione || 'v25.0',
    token: process.env.IG_TOKEN || 'inserito-dal-proxy',
  });

  return {
    api,

    profilo: () => api.get('me', { fields: 'user_id,username,account_type,followers_count,follows_count,media_count' }),

    quota: async (igId) => {
      const r = await api.get(`${igId}/content_publishing_limit`, { fields: 'quota_usage,config' });
      const d = (r.data && r.data[0]) || {};
      return { usati: d.quota_usage || 0, totale: (d.config && d.config.quota_total) || 50 };
    },

    mediaRecenti: (igId, limite = 25) =>
      api.tutte(`${igId}/media`, { fields: 'id,caption,timestamp,permalink,like_count,comments_count,media_type', limit: limite }, 1),

    // Carosello: 2-10 immagini JPEG raggiungibili da un link pubblico.
    async pubblicaCarosello(igId, urls, didascalia) {
      if (urls.length < 1 || urls.length > 10) throw new ErroreApi(`Servono da 1 a 10 immagini, ne ho ${urls.length}`);
      let creazione;
      if (urls.length === 1) {
        creazione = await api.post(`${igId}/media`, { image_url: urls[0], caption: didascalia });
      } else {
        const figli = [];
        for (const url of urls) {
          const { id } = await api.post(`${igId}/media`, { image_url: url, is_carousel_item: true });
          figli.push(id);
        }
        for (const id of figli) await attendiPronto(api, id);
        creazione = await api.post(`${igId}/media`, { media_type: 'CAROUSEL', children: figli.join(','), caption: didascalia });
      }
      await attendiPronto(api, creazione.id);
      const { id } = await api.post(`${igId}/media_publish`, { creation_id: creazione.id });
      const info = await api.get(id, { fields: 'id,permalink,timestamp' });
      return info;
    },

    commenti: (mediaId) => api.tutte(`${mediaId}/comments`, {
      fields: 'id,text,username,timestamp,hidden,like_count,replies{id,text,username,timestamp}',
      limit: 50,
    }),

    rispondi: (commentoId, testo) => api.post(`${commentoId}/replies`, { message: testo }),

    nascondi: (commentoId, nascosto = true) => api.post(commentoId, { hide: nascosto }),

    // Restituisce { metrica: valore } con le metriche disponibili; ignora quelle non supportate.
    async insights(mediaId, metriche) {
      const valore = (m) => (m.total_value ? m.total_value.value : m.values && m.values[0] ? m.values[0].value : null);
      try {
        const r = await api.get(`${mediaId}/insights`, { metric: metriche.join(',') });
        return Object.fromEntries((r.data || []).map((m) => [m.name, valore(m)]));
      } catch {
        const out = {};
        for (const metrica of metriche) {
          try {
            const r = await api.get(`${mediaId}/insights`, { metric: metrica });
            if (r.data && r.data[0]) out[metrica] = valore(r.data[0]);
          } catch { /* metrica non disponibile per questo post */ }
        }
        return out;
      }
    },

    // Rinnovo del token a lunga durata (60 giorni). Restituisce i giorni di validità.
    async rinnovaToken() {
      const base = process.env.IG_API_BASE || DEFAULT_BASE;
      const r = await api.chiama('GET', `${base}/refresh_access_token`, { grant_type: 'ig_refresh_token' });
      return Math.round((r.expires_in || 0) / 86400);
    },
  };
}

// ---------- Threads (facoltativo, spento di default) ----------

function threads(stato) {
  const api = client({
    base: process.env.THREADS_API_BASE || 'https://graph.threads.net',
    versione: (stato.threads && stato.threads.api_versione) || 'v1.0',
    token: process.env.THREADS_TOKEN || 'inserito-dal-proxy',
  });
  return {
    async pubblicaCarosello(urls, testo) {
      const figli = [];
      for (const url of urls) {
        const { id } = await api.post('me/threads', { media_type: 'IMAGE', image_url: url, is_carousel_item: true });
        figli.push(id);
      }
      const { id } = await api.post('me/threads', { media_type: 'CAROUSEL', children: figli.join(','), text: testo.slice(0, 500) });
      await pausa(30000); // Threads consiglia di attendere ~30 secondi prima di pubblicare
      return api.post('me/threads_publish', { creation_id: id });
    },
  };
}

module.exports = { instagram, threads, ErroreApi };
