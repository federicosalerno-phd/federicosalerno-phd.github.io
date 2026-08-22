# Sito personale di Federico Salerno

Sito statico pubblicato su GitHub Pages: https://federicosalerno-phd.github.io
Repo: https://github.com/federicosalerno-phd/federicosalerno-phd.github.io (branch `main`)

## Struttura

- `index.html`: unica pagina del sito, con CSS e JS inline.
- `assets/`: immagini e file statici. `assets/avatar.jpg` è la foto profilo (480 px); `assets/avatar-1024.png` è la sorgente, non referenziata.
- `federico_salerno_cv.pdf`: CV linkato dalla pagina.
- `drafts/`: bozze di design locali, ignorate da git. `drafts/NOTES.md` contiene brief, decisioni e stato del redesign.
- `.claude/agents/designer.md` e `refiner.md`: subagent su Opus per creare varianti (effort xhigh) e per rifinirle (effort high). Il thread principale gira su Sonnet.
- Nessun build step, nessun framework: quello che è nel repo è esattamente quello che viene pubblicato.

## Come lavoriamo

- Federico descrive le modifiche, anche con screenshot o esempi di template. Tu le implementi.
- Quando Federico scrive «continua», riparti dallo stato di drafts/NOTES.md (all'avvio è già nel contesto grazie al hook) senza rifare il brief.
- Federico tiene aperto il sito con Live Server di VS Code (http://127.0.0.1:5500/): ogni salvataggio ricarica la pagina, non devi "mostrare" nulla in chat. Se Live Server non è attivo ricordaglielo (pulsante "Go Live" nella barra di stato), in alternativa `python -m http.server 5500` dalla root del repo.
- Alla fine di ogni modifica scrivi in 2-3 righe cosa è cambiato e cosa guardare nel browser.
- Modifiche piccole (testo, link, stile): implementale direttamente. Modifiche di design (layout, tipografia, palette, nuove sezioni): delegale al subagent refiner; nuove varianti intere al subagent designer.
- Quando Federico passa un template o un esempio, estrai le caratteristiche da replicare (layout, gerarchia, tipografia, interazioni) e adattale al sito. Non incollare interi template.
- Contenuti del sito in inglese. Non inventare pubblicazioni, date, affiliazioni o numeri: se manca un dato, chiedilo.

## Risparmio token

- Risposte brevi in italiano, massimo 5 righe salvo richiesta, niente riepiloghi passo per passo, niente codice o contenuti di file in chat.
- Il thread principale non legge i file in `drafts/` e non scrive CSS: delega. Leggi `index.html` a blocchi (grep o intervalli di righe), mai per intero se non serve. Non rileggere file non cambiati.
- Edit mirati sul blocco interessato; un file si riscrive per intero solo quando lo si crea da zero.
- Repo di un file: niente subagent oltre a designer e refiner, niente agenti di esplorazione, niente ricerche web salvo richiesta.
- Niente screenshot di routine: verifica Federico in Live Server. Playwright, se configurato, solo su richiesta.
- Output dei comandi limitato (`git diff --stat`, `grep`, `head`), mai diff o log completi.
- A fine fase suggerisci `/clear` in una riga: lo stato è in questo file e in `drafts/NOTES.md`, basta scrivere "continua".
- Hook di contesto: se nel prompt compare una nota «[hook contesto]», seguila e chiudi la risposta con l'invito ad aprire una nuova chat.

## Compact instructions

Quando compatti conserva: fase in corso, variante scelta, decisioni di design (palette, font, spaziature), feedback di Federico ancora aperto, cosa resta da fare. Scarta output dei comandi e contenuti dei file.

## Vincoli tecnici

- Sito statico e self-contained, senza build step e senza framework. Librerie esterne solo via CDN e solo se necessarie: proponile prima. Google Fonts va bene.
- Immagini in `assets/`, ottimizzate (sotto i 200 KB). Mai immagini inline in base64.
- Percorsi assoluti dalla root (`/assets/...`, `/federico_salerno_cv.pdf`): funzionano in locale e su GitHub Pages.
- Mantieni sempre nell'`<head>` charset, viewport, `google-site-verification`, `<title>`, `lang="en"`, e i link esistenti (DOI, ORCID, Google Scholar, LinkedIn, email, CV).
- Responsive: verifica a 375 px e 1280 px. Ogni sezione ha un `id` univoco e, se in nav, la voce con `href="#id"`.
- Palette, font e spaziature come variabili CSS in `:root`, niente valori ad hoc sparsi.

## Redesign in corso (fase attuale)

Obiettivo: sostituire il design attuale con uno molto più minimal ma bello e gradevole, con struttura ampliata (nuove sezioni oltre ai contenuti esistenti).

Brief v1 (2026-08-22, dark/warm/sans geometrico) sostituito dal brief v2 (2026-08-22) sotto: struttura multi-pagina e nuove sezioni. Le 3 varianti prodotte con il brief v1 sono superate, restano solo come riferimento di stile.

Brief v2 raccolto da Federico:
- Tema, tipografia, palette, foto profilo: come brief v1 (solo scuro, sans geometrico max 2 famiglie, palette calda desaturata su fondo scuro con un solo accento per variante, foto piccola discreta con `/assets/avatar.jpg` come placeholder da sostituire).
- **Struttura: multi-pagina.** Home = bio molto corta + foto + teaser delle sezioni (non tutte allo stesso livello: la home non deve mettere tutto in primo piano). Ogni sezione è una pagina separata linkata dalla home.
- **Sezioni** (ordine libero, da decidere per gerarchia visiva):
  - **My Creations**: portfolio di creazioni personali, presentate per foto; i modelli 3D devono essere ruotabili/visualizzabili in 3D.
  - **Biomedical Tools & Research**: portfolio di lavori fatti al lavoro/ricerca (guide di taglio, framework/piattaforme di benchmarking), sempre con modelli visualizzabili e spiegazione; include anche 2 app biomediche.
  - **Academic CV**: percorso da dopo la laurea (borsa di predoc, dottorato, ecc. con descrizioni) più formazione (liceo, università, ecc.).
  - **My Dogs**: foto dei cani.
- **Modelli 3D**: `<model-viewer>` (web component Google, via CDN, glTF/GLB) — nessun file reale ancora, usare placeholder (es. modello demo pubblico di model-viewer.dev) finché Federico non fornisce i .glb/.gltf.
- **Contenuti nuove sezioni**: non ancora forniti da Federico → placeholder chiaramente marcati (stesso pattern dell'avatar), MAI inventare nomi/date/istituzioni reali. Contenuti esistenti (bio attuale, pubblicazioni, link) restano quelli veri di `index.html`.
- Tutti i testi in inglese.
- Riferimenti raccolti via web (2026-08-22): hero con bio corta + 3-5 lavori in evidenza; griglia teaser con link cliccabili a pagine di dettaglio; molto spazio bianco, gerarchia chiara tra sezioni. Fonti: [Colorlib portfolio examples](https://colorlib.com/wp/best-portfolio-websites/), [Figma portfolio examples](https://www.figma.com/resource-library/portfolio-website-examples/).

Scope esplorazione varianti: 5-6 varianti, ciascuna = home page completa + **una** pagina di dettaglio campione (My Creations, per mostrare foto+3D) a scopo dimostrativo dell'interazione teaser→dettaglio. Le altre pagine di dettaglio si costruiscono solo dopo la scelta della variante.

Feedback v3 su round 1 (varianti 1-6.html, ora superate ma riusabili come riferimento):
- **Home ancora più minimale**: SOLO bio cortissima + foto + elenco verticale delle sezioni, una voce per riga. Niente altro (niente "Selected Publications", niente testi di teaser, niente contenuti extra in home).
- Apertura sezione: lascia decidere al designer la soluzione migliore per aprire/dettagliare la sezione scelta (resta l'architettura multi-pagina già decisa, ma la transizione/interazione è a discrezione del designer).
- Rimuovere ovunque la scritta "3D Lab".
- Mai il carattere `&`: riscrivere per esteso ("and") o riformulare.
- Mai trattini/en-dash tra parole tipo "parola — parola": usare virgole, due punti, o riformulare.
- Più colori per i pulsanti/voci delle sezioni (non più un accento unico per variante), sempre nella famiglia calda desaturata del brief.
- Pulsanti/voci a **riempimento pieno**, non a contorno (niente bordi/outline).
- Font **rigorosamente sans serif** (nessuna serif in nessuna variante).
- Nuovo giro di varianti diverse per stile, impaginazione e font.

1. Brief: raccolto (v1 + v2 sopra).
2. Varianti: delega al subagent designer passandogli il brief v2 e lo scope sopra. Produce per ciascuna variante una home + pagina dettaglio campione in `drafts/`, più `drafts/index.html` (indice comparativo) e `drafts/NOTES.md`. Federico guarda http://127.0.0.1:5500/drafts/.
3. Iterazione: per ogni feedback di Federico delega al subagent refiner indicando il file/variante e il feedback testuale. Riporta a Federico in 2 righe cosa guardare. Non leggere i file.
4. Pagine di dettaglio restanti: una volta scelta la variante, delega al designer o refiner la costruzione delle pagine mancanti (Biomedical Tools & Research, Academic CV, My Dogs) sullo stesso template.
5. Promozione: quando Federico approva, copia i file scelti da `drafts/` alle destinazioni finali (struttura multi-pagina: aggiorna la sezione "Struttura" di questo file di conseguenza), verifica con grep che ogni pagina contenga `google-site-verification`, viewport, `<title>`, `lang="en"`, i link esistenti (DOI, ORCID, Scholar, LinkedIn, email, CV) dove pertinente (`git show HEAD:index.html` per confronto). Se manca qualcosa, delega la correzione al refiner. Poi svuota `drafts/` tranne `NOTES.md`, sostituisci questa sezione con una riga ("Redesign completato il <data>"), commit `Redesign site` e chiedi conferma prima del push. Il design vecchio resta nella storia git.

## Verifica prima di ogni commit

1. HTML ben formato: tag chiusi, nessun `id` duplicato, ogni `href="#..."` della nav punta a un `id` esistente.
2. Nessun errore in console e controllo visivo desktop e mobile: li fa Federico in Live Server, digli cosa guardare.
3. Tutti i link, interni ed esterni, ancora validi.

## Git

- Prima di una nuova modifica: `git status` e `git pull`.
- Commit dopo ogni modifica coerente e verificata; messaggi brevi in inglese all'imperativo (`Add projects section`, `Fix nav spacing on mobile`). Un commit per modifica logica.
- `main` è il sito pubblico: GitHub Pages ripubblica entro 1-2 minuti da ogni push. Push a richiesta conclusa e verificata; per modifiche grandi di layout chiedi conferma prima del push.
- `drafts/` non va mai committato. Niente stati intermedi o rotti online. Mai `git push --force`, mai riscrivere la storia: per annullare usa `git revert`.
