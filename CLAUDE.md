# Disconnessi

Profilo Instagram che "disconnette" le frasi motivazionali dei grandi imprenditori: mostra cosa dicono davvero, chi paga il conto e che alternativa c'è. Tutto in italiano.

- Concept, voce, format, fonti, regole legali: `docs/`
- Post (uno per file, con il loro stato): `post/`
- Generatore di immagini: `generatore/render.js` (`--pubblica` crea i JPEG in `pubblici/`)
- Agente (pubblicazione, commenti, statistiche): `agente/`

**Se sei in una sessione automatica dell'agente, segui `agente/ISTRUZIONI.md`.** In particolare: controlla l'interruttore in `agente/stato.json`, non pubblicare mai citazioni non verificate, scrivi nel diario e fai push alla fine.

Prima di modificare gli script esegui `npm test`, che fa una prova completa contro un finto Instagram, senza toccare l'account vero.
