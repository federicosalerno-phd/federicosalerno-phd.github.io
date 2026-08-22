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

Obiettivo: sostituire il design attuale con uno molto più minimal ma bello e gradevole; contenuti invariati.

Brief raccolto da Federico (fase 1 e 2 completate il 2026-08-22, da passare al subagent designer):
- Tema: **solo scuro**. Niente `prefers-color-scheme`, niente variante chiara.
- Tipografia: **sans geometrico** (Inter, Manrope, Space Grotesk o simili). Massimo due famiglie.
- Palette: **calda su fondo scuro**. Accenti tra rosso, ambra, giallo, terracotta e marrone; desaturati e caldi, "quasi pastello", mai accesi o fluo. Anche il fondo scuro può essere leggermente caldo. Un solo accento per variante.
- Foto profilo: **sì ma discreta** (piccola, accanto al nome). Federico non userà quella attuale: `/assets/avatar.jpg` è un segnaposto, il CSS deve gestire ritaglio e dimensioni (`object-fit: cover`) così che basti sostituire il file.
- Riferimenti: nessuno fornito, decide il designer. Target: siti personali di ricercatori ben fatti, tipografici, arieggiati, essenziali.
- Le tre varianti devono differire per layout e gerarchia, non solo per sfumatura d'accento.

1. Brief: al massimo 5 domande secche a Federico (chiaro, scuro o entrambi con `prefers-color-scheme`; serif editoriale o sans geometrico; monocromo o un colore d'accento; foto profilo sì o no; riferimenti, anche screenshot o URL). Se risponde "decidi tu", scegli e dichiara le scelte.
2. Varianti: delega al subagent designer, passandogli il brief. Produce `drafts/a.html`, `b.html`, `c.html`, `drafts/index.html` e `drafts/NOTES.md`. Federico guarda http://127.0.0.1:5500/drafts/.
3. Iterazione: per ogni feedback di Federico delega al subagent refiner indicando il file della variante scelta e il feedback testuale. Riporta a Federico in 2 righe cosa guardare. Non leggere i file.
4. Promozione: quando Federico approva una variante, copia `drafts/<x>.html` su `index.html`, verifica con grep che contenga `google-site-verification`, viewport, `<title>`, `lang="en"`, `/federico_salerno_cv.pdf` e gli stessi link DOI, ORCID, Scholar, LinkedIn ed email del vecchio `index.html` (`git show HEAD:index.html`). Se manca qualcosa, delega la correzione al refiner. Poi svuota `drafts/` tranne `NOTES.md`, sostituisci questa sezione con una riga ("Redesign completato il <data>"), commit `Redesign site` e chiedi conferma prima del push. Il design vecchio resta nella storia git.

## Verifica prima di ogni commit

1. HTML ben formato: tag chiusi, nessun `id` duplicato, ogni `href="#..."` della nav punta a un `id` esistente.
2. Nessun errore in console e controllo visivo desktop e mobile: li fa Federico in Live Server, digli cosa guardare.
3. Tutti i link, interni ed esterni, ancora validi.

## Git

- Prima di una nuova modifica: `git status` e `git pull`.
- Commit dopo ogni modifica coerente e verificata; messaggi brevi in inglese all'imperativo (`Add projects section`, `Fix nav spacing on mobile`). Un commit per modifica logica.
- `main` è il sito pubblico: GitHub Pages ripubblica entro 1-2 minuti da ogni push. Push a richiesta conclusa e verificata; per modifiche grandi di layout chiedi conferma prima del push.
- `drafts/` non va mai committato. Niente stati intermedi o rotti online. Mai `git push --force`, mai riscrivere la storia: per annullare usa `git revert`.
