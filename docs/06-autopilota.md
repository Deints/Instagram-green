# 6. Il pilota automatico

In parole semplici: **tu crei il profilo e mi dai la "chiave" per usarlo. Da lì in poi scrivo, verifico, pubblico, rispondo e analizzo i numeri da solo, con sessioni automatiche a orari fissi.** Tu intervieni solo quando te lo chiedo.

## Cosa fa da solo

| Cosa | Quando |
|---|---|
| Scrive i nuovi post, **verifica le citazioni** sulla fonte originale, crea le immagini | martedì e sabato |
| Pubblica il carosello | lunedì, mercoledì e venerdì alle 18:15 |
| Risponde ai commenti, nasconde insulti e spam | ogni giorno alle 13 e alle 21, e dopo ogni post |
| Legge le statistiche, scrive un report, adatta hashtag, format e orari | sabato |
| Prepara le proposte di collaborazione per altri account | sabato |

Ogni sessione scrive cosa ha fatto in `agente/diario.md`. I report sono in `report/`.

## Cosa NON fa (e perché)

| Cosa | Perché |
|---|---|
| Seguire, mettere like o commentare su altri profili in automatico | È vietato dalle regole di Instagram e porta al ban. L'API ufficiale non lo permette |
| Mandare messaggi a chi non ci ha scritto | L'API non lo permette, e sarebbe spam |
| Inviare le proposte di collaborazione | Le scrivo io, le invii tu: un messaggio da una persona funziona molto meglio |
| Reel con musica di tendenza | L'API non dà accesso alla libreria musicale. Per ora: solo caroselli |
| Pubblicità a pagamento | Spende soldi: la decisione è tua |
| Rispondere ai messaggi privati | Non ancora: è il prossimo passo, se vorrai |

## Cosa devi fare tu

### Una volta sola (circa 30 minuti)

1. **Crea il profilo Instagram** con il nome scelto (vedi `docs/01-concept.md`).
2. **Passa ad account professionale:** nell'app, *Impostazioni → Tipo di account e strumenti → Passa a un account professionale → Creator*.
3. **Crea l'app per l'API** su [developers.facebook.com](https://developers.facebook.com):
   1. accedi (anche con un account Facebook nuovo) → *Le mie app* → *Crea app*;
   2. come caso d'uso scegli quello per **gestire messaggi e contenuti su Instagram** ("Instagram API");
   3. nel pannello dell'app apri *Instagram → Configurazione API con login di Instagram*;
   4. alla voce *Genera token di accesso* aggiungi il tuo profilo Instagram e accedi. Se ti chiede di accettare un invito come tester, fallo dall'app Instagram (*Impostazioni → App e siti web*);
   5. concedi i permessi per **contenuti, commenti e statistiche**;
   6. **genera il token** e tienilo da parte: è una lunga stringa di lettere e numeri.

   L'app può restare in modalità "sviluppo": per gestire il **tuo** profilo non serve la revisione di Meta. I nomi dei menu possono cambiare un po'. Se ti blocchi, dimmi cosa vedi e ti guido.
4. **Dimmi "fatto".** Ti apro un modulo sicuro in cui incollare il token. **Non scriverlo mai in chat.**

Poi faccio io:

- collego il token e controllo che tutto risponda (`node agente/controlla.js`);
- verifico le fonti dei 9 post pronti e li metto in calendario;
- creo le attività automatiche;
- accendo l'interruttore.

### Ogni tanto

- **Leggi `agente/da-fare-umano.md`.** Lì trovi:
  - le proposte di collaborazione da inviare;
  - i commenti delicati;
  - le cose che richiedono una persona.

  Per le urgenze ti mando una notifica.
- **Ogni ~50 giorni forse dovrai rinnovare il token.** Il token dura 60 giorni. Provo a rinnovarlo da solo: se non ci riesco, ti avviso per tempo e ti servono 2 minuti.

## Come controllarlo

| Vuoi… | Fai così |
|---|---|
| Fermare tutto | Dimmelo, oppure metti `"attivo": false` in `agente/stato.json` |
| Bloccare un post prima che esca | Nel file in `post/` scrivi `stato: bloccato` (i post sono programmati con almeno 48 ore di anticipo) |
| Approvare ogni post prima che esca | Metti `"modalita": "revisione"` in `stato.json`. I nuovi post resteranno `da_approvare` finché non li cambi in `pronto` |
| Cambiare giorni e orari | Modifica `calendario` in `stato.json` e dimmelo, così sposto anche le attività automatiche |
| Vedere cosa ha fatto | `agente/diario.md` (una riga per sessione) e `report/` (una volta a settimana) |

## Costi

- **Meta/Instagram:** gratis.
- **GitHub:** gratis (le immagini sono servite dal repository pubblico).
- **Claude:** le sessioni automatiche (circa 20 brevi a settimana) usano il tuo piano Claude.

## Trasparenza

Consiglio di scriverlo in bio, per esempio «🌱 Curato con l'aiuto di un'IA · fonti sempre verificate». È onesto, ti protegge e si sposa con il personaggio del "visitatore da un altro pianeta". In ogni caso, se qualcuno lo chiede nei commenti, l'agente risponde con sincerità.

## Come funziona dentro (per curiosità)

```
 Sessioni automatiche (Claude)          Script nel repo                 Instagram
 ─────────────────────────────          ───────────────                 ─────────
 Redazione  → scrive e verifica   →  generatore/render.js  → JPEG in pubblici/ (online su GitHub)
 Pubblicazione                    →  agente/pubblica.js    → API ufficiale → carosello pubblicato
 Community  → decide le risposte  →  agente/commenti.js    → API ufficiale → risposte / nascosti
 Crescita   → analizza e adatta   →  agente/statistiche.js → API ufficiale → numeri
                    ↑
       memoria: diario, report, stato di ogni post (tutto nel repo)
```

Gli script si provano senza toccare l'account vero con `npm test` (usa un finto Instagram).
