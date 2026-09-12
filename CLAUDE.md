# Sito personale di Federico Salerno

Sito statico pubblicato su GitHub Pages: https://federicosalerno-phd.github.io
Repo: https://github.com/federicosalerno-phd/federicosalerno-phd.github.io (branch `main`)

## Struttura

- Sito multi-pagina, ogni pagina con CSS e JS inline (stile "Ledger": fill unico `--btn` color `#85664e`, IBM Plex Sans, righe piene senza contorno il cui riempimento non è un colore ma il negativo di quello che hanno dietro, `backdrop-filter:invert(1) brightness(...)`: il reticolo di fondo le attraversa invece di fermarsi al loro bordo, e dove `backdrop-filter` manca resta il fill pieno di prima; quanto della perturbazione sopravvive sulla banda lo decide `--band-fill`, 62%: è la quota di `--btn` pieno stesa sopra l'inversione, 100% banda opaca con la perturbazione che le passa solo attorno, 0% reticolo che la attraversa per intero. L'hover di righe e bottoni è la banda sollevata dal foglio: `scale(1.04)` dal proprio centro con un overshoot del 18% su una `linear()` scritta a mano (540 ms; `cubic-bezier(.34,1.32,.52,1)` a 460 ms dove `linear()` manca), e nello stesso momento il riempimento si apre — il `color-mix` di `--btn` va a zero e resta la sola inversione a `brightness(.987)`, così il reticolo attraversa la banda scelta a piena forza invece che come traccia al 62% — mentre la barretta nel margine cresce 80 ms più tardi, su transform e non sul proprio box (un box che cambia misura dentro una superficie in `backdrop-filter` che sta scalando ri-rasterizza quel layer ogni frame). Ogni pagina porta tre stati nel `<body>`: `data-hover="spring"` (questo), `data-hover="wipe"` (il riempimento che scorre con la cresta `--sel-lead`, blocco ancora nel foglio) e nessun attributo (l'hover originale a scambio di colore)): `index.html` (home, bio corta più elenco verticale delle sezioni; la foto profilo da 48 px si apre a schermo con un click: FLIP sul solo `transform` con la curva delle righe `--idx-ease`, resta circolare per tutto il viaggio (la scala è uniforme, un ritaglio tondo resta tondo), la miniatura resta nascosta finché il ritratto è fuori, si chiude con click, Escape o scroll ricalcolando ogni volta il rettangolo della miniatura; sorgente grande `assets/avatar-960.jpg`, 139 KB, precaricata al primo hover), `about.html`, `projects.html` (My projects, portfolio con foto e modelli 3D via `<model-viewer>`), `biomedical.html` (Biomedical tools and research: indice della sezione con una riga per lavoro, che apre `biomedical-artifact.html` — metodologia metrologica AR tooltip tracking, Computers in Industry 2026 — e `biomedical-platform.html` — piattaforma di benchmarking, SN Computer Science 2026, entrambe con modello 3D reale), `cv.html` (Academic CV, contenuti reali), `dogs.html` (My dogs, quattro foto reali di Ludovico).
- `assets/`: immagini e file statici. `assets/avatar.jpg` è la foto profilo (480 px); `assets/avatar-1024.png` è la sorgente, non referenziata. `assets/creations/<slug>/` per ogni progetto di My projects (model, photos, download); `assets/papers/` PDF e copertine delle pubblicazioni; `assets/biomedical/` asset dei lavori Biomedical (`tooltip-artifact/`, `benchmarking-platform/`: model, photos, download); `assets/dogs/` foto di Ludovico (`ludovico-01..04.jpg`).
- `assets/js/mesh-field.js`: unica eccezione al JS inline, perché identico su tutte e otto le pagine. Reticolo triangolato in WebGL vanilla su un `<canvas>` fisso a `z-index:-1`, con maglia volutamente irregolare (`JITTER 0.36`: le facce variano in forma e dimensione come in una mesh non strutturata). Il reticolo non è ovunque: si dissolve allontanandosi dal cursore su `HALO` (820 px), partendo da `REST_A`. La faccia in cui il cursore si trova davvero è individuata sulla CPU con il test baricentrico (ricerca locale sulle celle vicine, ~50 test per frame) e passata allo shader come uniform `u_hot`: solo quella è riempita a `HOT_A 0.40` e in tinta, un gradino netto sopra tutto il resto. Le altre facce prendono il valore di una caduta liscia al proprio baricentro, quantizzato in `STEPS 5` gradini, così gli anelli si accendono per gradi discreti e non come sfumatura; `JAG` dà a ogni faccia una soglia propria, ricavata dal suo baricentro, che spezza la silhouette lungo il reticolo invece di lasciarla tonda. Il riempimento di ogni faccia è rientrato di `INSET` rispetto ai propri spigoli, così finisce esattamente sotto la linea che la disegna e non sborda mai; il contesto WebGL è creato con `antialias: true` (4 campioni), perché senza multisampling i lati obliqui di un triangolo pieno sono una scalinata. Il foglio si solleva di `PEAK` (9 px: la differenza fra un foglio che si piega e una bolla). Niente simulazione: formula chiusa della posizione del puntatore, che non è filtrata (`POINTER_TAU 0`: nessuna inerzia, la faccia sta sotto il cursore e non dietro), quindi a cursore fermo il frame successivo è identico e il rAF si ferma; tre draw call su buffer statici. Colore: nessuna tinta vera, il sito non ne ha. `TINT #aebfc8` con `TINT_MIX 0.55` è l'accento del sito portato appena verso il blu, una temperatura e non un colore (`TINT_MIX 0` per un reticolo in grigi piatti). La card delle citazioni entra con `--idx-ease`, la stessa curva delle righe della home, e porta a sinistra la barra verticale che è il segno delle righe del sito, che cresce in altezza mentre la card si posa; l'uscita è più corta e su una curva più secca. Colonna di lettura (`--measure`) al 50% con rampa di 100 px. Si spegne con `prefers-reduced-motion`, su puntatori grossolani, senza WebGL e su `<body data-mesh-field="off">`. Dopo una quarantina di movimenti del puntatore e `HINT_AFTER` ms dal primo, una volta sola per browser (`localStorage`, chiave `mesh-field-hint`), compare in basso a destra la scritta «Click a triangle»: senza, l'easter egg non lo troverebbe nessuno. Qualsiasi click la archivia, mostrata o no. Cliccando una faccia esce una citazione (autore, anno, luogo) in una card accanto al triangolo scelto: sul click e non sull'hover, perché un cursore fermo su una pagina di solito appartiene a qualcuno che sta leggendo. Una alla volta, `QUOTE_REST` di pausa prima che se ne apra un'altra, si chiude da sola dopo `QUOTE_HOLD`, con il click o con Escape. Le frasi stanno in `assets/js/quotes.js` (~250 voci, formato `[testo, autore, anno, luogo]`), caricato in `requestIdleCallback` e mai al primo paint; l'estrazione è a sacchetto (indici mescolati e consumati senza reinserimento), quindi escono tutte prima che una si ripeta. Metà sono citazioni vere attribuite con prudenza (le incerte sono marcate «attributed to», le apocrife note sono state escluse), metà sono battute riconoscibili come tali dall'attribuzione. Tutto in inglese come il resto del sito, con qualche frase lasciata in lingua originale seguita dalla resa inglese. Le quattro alternative scartate (`aurora`, `dots`, `flow`, `contours`) restano in `drafts/bg/` con la pagina di confronto `drafts/bg/preview.html?v=slug`; per cambiare basta copiare `drafts/bg/<slug>.js` su questo file.
- `federico_salerno_cv.pdf`: CV linkato dalle pagine.
- `drafts/`: bozze di design locali, ignorate da git. `drafts/NOTES.md` contiene brief, decisioni e stato del redesign.
- `.claude/agents/designer.md` e `refiner.md`: subagent su Opus per creare varianti (effort xhigh) e per rifinirle (effort high). Il thread principale gira su Fable 5 a effort massimo, tenuto fisso da Federico (da 2026-08-24; prima era Sonnet).
- Nessun build step, nessun framework: quello che è nel repo è esattamente quello che viene pubblicato.

## Come lavoriamo

- Federico descrive le modifiche, anche con screenshot o esempi di template. Tu le implementi.
- Quando Federico scrive «continua», riparti dallo stato di drafts/NOTES.md (all'avvio è già nel contesto grazie al hook) senza rifare il brief.
- Continuità tra chat: `drafts/NOTES.md` DEVE aprirsi con una sezione `## Stato corrente` di 10-20 righe — ultima cosa fatta, commit recenti, punti aperti di Federico, prossimo passo — che va AGGIORNATA (riscritta, non accumulata) alla fine di ogni fase di lavoro e prima di suggerire una nuova chat. Il log storico dettagliato segue sotto, in append. Una nuova chat legge lo Stato corrente e sa esattamente dove si era: se ti accorgi che manca o è vecchio, ricostruiscilo da git log e dal fondo del file prima di lavorare.
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

## Redesign

Redesign completato il 2026-08-23 (variante "Ledger"): sito promosso da `drafts/` alla struttura multi-pagina descritta sopra. Aperto: contenuti reali di Biomedical tools and research e My dogs (ancora placeholder), assegnazione definitiva dei colori per sezione, collocazione dei contatti (per ora solo nel footer di ogni pagina). Il design precedente resta nella storia git.

## Verifica prima di ogni commit

1. HTML ben formato: tag chiusi, nessun `id` duplicato, ogni `href="#..."` della nav punta a un `id` esistente.
2. Nessun errore in console e controllo visivo desktop e mobile: li fa Federico in Live Server, digli cosa guardare.
3. Tutti i link, interni ed esterni, ancora validi.

## Git

- Prima di una nuova modifica: `git status` e `git pull`.
- Commit dopo ogni modifica coerente e verificata; messaggi brevi in inglese all'imperativo (`Add projects section`, `Fix nav spacing on mobile`). Un commit per modifica logica. Nessuna riga `Co-Authored-By: Claude` nei messaggi: Federico è l'unico autore (sua richiesta, 2026-08-26).
- `main` è il sito pubblico: GitHub Pages ripubblica entro 1-2 minuti da ogni push. Commit e push AUTOMATICI, senza chiedere conferma: dopo ogni modifica logica completata e verificata fai il commit, e pusha subito (regola di Federico, 2026-08-26). Non accumulare mai più di 2-3 modifiche logiche non committate nel working tree.
- `drafts/` non va mai committato. Niente stati intermedi o rotti online. Mai `git push --force`, mai riscrivere la storia: per annullare usa `git revert`.
