const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateCompleteProjectReportPDF() {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const gold = rgb(0.83, 0.68, 0.21); // #d4af37
  const darkNavy = rgb(0.05, 0.08, 0.2); // #0d1738
  const textDark = rgb(0.12, 0.16, 0.23); // #1f2937
  const textMuted = rgb(0.4, 0.45, 0.55); // #64748b
  const codeBg = rgb(0.94, 0.96, 0.98); // #f1f5f9
  const boxBg = rgb(0.98, 0.97, 0.93); // Light gold tint
  const green = rgb(0.1, 0.6, 0.3);
  const blue = rgb(0.02, 0.45, 0.8);
  const red = rgb(0.85, 0.2, 0.2);

  const totalPages = 4;

  function addHeader(page, pageNum) {
    const { width, height } = page.getSize();
    // Top banner bar
    page.drawRectangle({
      x: 0,
      y: height - 42,
      width: width,
      height: 42,
      color: darkNavy,
    });
    page.drawRectangle({
      x: 0,
      y: height - 45,
      width: width,
      height: 3,
      color: gold,
    });
    page.drawText('LUONGO TOMBOLA 90 ITALIA - GOLD EDITION', {
      x: 35,
      y: height - 26,
      size: 11,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('DOCUMENTAZIONE TECNICA & GUIDA OPERATIVA COMPLETA', {
      x: width - 295,
      y: height - 26,
      size: 8,
      font: fontBold,
      color: gold,
    });

    // Footer
    page.drawLine({
      start: { x: 35, y: 35 },
      end: { x: width - 35, y: 35 },
      thickness: 0.8,
      color: rgb(0.8, 0.85, 0.9),
    });
    page.drawText('Documento Tecnico Ufficiale | Luongo Tombola 90 Italia - Stampabile formato A4', {
      x: 35,
      y: 22,
      size: 8,
      font: fontRegular,
      color: textMuted,
    });
    page.drawText(`Pagina ${pageNum} di ${totalPages}`, {
      x: width - 90,
      y: 22,
      size: 8,
      font: fontBold,
      color: textMuted,
    });
  }

  // =========================================================================
  // PAGINA 1: OVERVIEW ARCHITETTURA, TABELLONE TV & COUNTDOWN CIRCOLARE
  // =========================================================================
  const page1 = pdfDoc.addPage([595.28, 841.89]);
  addHeader(page1, 1);
  let y = 765;

  page1.drawText('Guida Completa al Progetto & Funzionalità Realizzate', {
    x: 35,
    y,
    size: 17,
    font: fontBold,
    color: darkNavy,
  });
  y -= 18;

  page1.drawText('Report dettagliato di tutte le implementazioni grafiche, logiche, database e configurazioni deploy.', {
    x: 35,
    y,
    size: 9.5,
    font: fontRegular,
    color: textMuted,
  });
  y -= 26;

  // Box 1: Scheda Tecnica e Credenziali
  page1.drawRectangle({
    x: 35,
    y: y - 85,
    width: 525,
    height: 85,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1,
  });

  page1.drawText('SCHEDA TECNICA & CREDENZIALI DEL PROGETTO', {
    x: 45,
    y: y - 16,
    size: 10,
    font: fontBold,
    color: darkNavy,
  });
  page1.drawText('- Nome Applicazione:  LUONGO TOMBOLA 90 ITALIA - GOLD EDITION (v.15.15.0)', {
    x: 45,
    y: y - 32,
    size: 8.8,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('- Password di Accesso Regia:  tombola90  (oppure admin)', {
    x: 45,
    y: y - 46,
    size: 8.8,
    font: fontBold,
    color: darkNavy,
  });
  page1.drawText('- Database Cloud:  Google Cloud Firebase Firestore (ID: ai-studio-luongotombola90i-7d9a...)', {
    x: 45,
    y: y - 60,
    size: 8.8,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('- Tecnologie:  Vite SPA, TypeScript, Tailwind CSS, Web Speech API (TTS), Firebase SDK v13', {
    x: 45,
    y: y - 74,
    size: 8.8,
    font: fontRegular,
    color: textDark,
  });
  y -= 102;

  // Sezione 1: Schermo TV & Esperienza Spettatori
  page1.drawText('1. TABELLONE TV STUDIO & ESPERIENZA DI GIOCO LIVE', {
    x: 35,
    y,
    size: 11.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  const tvItems = [
    'Tabellone 90 Numeri 3D Flip: Ogni numero estratto esegue un\'animazione tridimensionale di rotazione',
    'a 180 gradi (flip) che scopre la pedina colorata in stile showroom televisivo:',
    '  * Numeri Ordinari estratti: tessera circolare rossa ad alto contrasto con numero dorato lucido.',
    '  * Numero Gold estratto: tessera circolare verde smeraldo brillante con stella dorata pulsante.',
    'Timer Radiale Circolare SVG Animato: Nel Box Countdown il semplice testo statico e stato sostituito',
    'da un anello di progresso circolare luminoso che si svuota progressivamente in tempo reale ogni secondo,',
    'con scala numerica pulsante sincronizzata (5s, 4s, 3s, 2s, 1s) e selettore ritmi (3s, 5s, 7s, 10s).',
    'Sintesi Vocale Smorfia Napoletana: Lettura vocale automatica dei numeri estratti con dizionario completo',
    'della Smorfia Napoletana e Italiana tradizionale (voce umana italiana ottimizzata con Web Speech).',
    'Box Montepremi & Quote Live: Visualizzazione immediata di Montepremi totale con ripartizione percentuali:',
    '  - Numero Gold (5%), Ambo (5%), Terno (10%), Quaterna (15%), Cinquina (20%), Tombola (45%).',
    'Doppio Tema Dark/Light ad Altissimo Contrasto: Ottimizzato per TV 4K, 8K e maxi-schermi da sala.',
  ];

  tvItems.forEach(line => {
    page1.drawText(line, {
      x: line.startsWith('  *') || line.startsWith('  -') ? 48 : 40,
      y,
      size: 8.5,
      font: line.includes('Flip:') || line.includes('Animato:') || line.includes('Napoletana:') || line.includes('Live:') || line.includes('Contrasto:') ? fontBold : fontRegular,
      color: textDark,
    });
    y -= 13.5;
  });
  y -= 10;

  // Sezione 2: Console Regia
  page1.drawText('2. CONSOLE REGIA & GESTIONE DIRETTA BROADCAST', {
    x: 35,
    y,
    size: 11.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  const regiaItems = [
    'Accesso Protetto: La regia si apre con password ("tombola90" o "admin") con blocco sessione temporaneo.',
    'Pulsante Schermo Intero Regia: Nuovo pulsante in testata per passare a tutto schermo durante gli eventi.',
    'Banco Estrazioni & Controlli: Tasti Play Automatico, Pausa, Estrai Singolo e Reset Partita.',
    'Mini-Tabellone 90 Numeri: Griglia di monitoraggio compatta in tempo reale per verificare i numeri estratti.',
    'Gestione Loghi & Grafiche TV: Box dedicato per caricare immagini personalizzate, scegliere watermark o',
    'banner promozionali e trasmetterli in diretta sul tabellone TV con slider di opacita e posizione.',
    'Algoritmo Anti-Vincita (Difficolta Matematica): Calcola in tempo reale la densita delle cartelle attive e',
    'ritarda matematicamente l\'estrazione dei numeri che chiuderebbero combinazioni premature.',
  ];

  regiaItems.forEach(line => {
    page1.drawText(`- ${line}`, {
      x: 40,
      y,
      size: 8.5,
      font: fontRegular,
      color: textDark,
    });
    y -= 13.5;
  });

  // =========================================================================
  // PAGINA 2: DATABASE CLOUD, CASSA NON VINTI & CARTELLE A4
  // =========================================================================
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  addHeader(page2, 2);
  y = 765;

  page2.drawText('3. DATABASE CLOUD FIREBASE & CASSA MONTEPREMI NON VINTI', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: darkNavy,
  });
  y -= 18;

  page2.drawText('Una delle funzionalita cardine richieste: memorizzazione sicura dei premi non vinti e rollover tra partite.', {
    x: 35,
    y,
    size: 9.5,
    font: fontRegular,
    color: textMuted,
  });
  y -= 24;

  // Box Dettaglio Database
  page2.drawRectangle({
    x: 35,
    y: y - 110,
    width: 525,
    height: 110,
    color: codeBg,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  page2.drawText('STRUTTURA DATI & FUNZIONAMENTO CLOUD (FIREBASE FIRESTORE)', {
    x: 45,
    y: y - 16,
    size: 9.5,
    font: fontBold,
    color: darkNavy,
  });

  const dbRows = [
    'Collezione /jackpot_bank/main : Contiene il saldo consolidato salvato dalle partite precedenti.',
    '  - accumulatedUnclaimed (number): Totale euro accumulati non assegnati.',
    '  - lastUpdated (timestamp ISO): Data e ora dell\'ultimo movimento.',
    '  - totalGamesRecorded (number): Contatore partite salvate nel sistema.',
    'Collezione /unclaimed_history : Registro di controllo contabile (audit log) di ogni operazione:',
    '  - type: deposit_expired (deposito scadenza), recalled_into_game (richiamo), reset (azzeramento).',
    '  - amount: Importo movimentato in euro.',
    '  - balanceAfter: Nuovo saldo risultante nella cassa cloud.',
  ];

  let dbY = y - 32;
  dbRows.forEach(row => {
    page2.drawText(row, {
      x: 45,
      y: dbY,
      size: 8,
      font: row.startsWith('  -') ? fontMono : fontRegular,
      color: textDark,
    });
    dbY -= 12;
  });
  y -= 125;

  // Come si usa la Cassa Cloud in Regia
  page2.drawText('COME FUNZIONA LA GESTIONE IN CONSOLE REGIA:', {
    x: 35,
    y,
    size: 10.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  const cloudSteps = [
    'Pulsante "Salva in Cloud": Quando uno o piu premi scadono (es. Numero Gold non uscito entro 25 estr. o',
    'combinazioni non realizzate), l\'importo entra nella cassa della partita. Cliccando "Salva in Cloud", la somma',
    'viene registrata istantaneamente nel Database Cloud e azzerata localmente.',
    'Pulsante "Richiama nel Montepremi": Nelle partite successive, l\'amministratore vede il totale accumulato.',
    'Cliccando "Richiama", il saldo del database viene prelevato e iniettato nel Montepremi della partita attuale:',
    '  * Tutte le quote dei premi vengono ricalcolate al rialzo istantaneamente.',
    '  * Sullo Schermo TV compare il badge azzurro: "Include € XX.XX da partite precedenti".',
    'Interruttore "Auto-salva a fine partita / reset": Se attivo (default ON), quando la partita viene resettata',
    'o conclusa, il montepremi residuo non vinto viene salvato in automatico nel Cloud per sicurezza.',
    'Pulsanti "Sincronizza" e "Azzera Database": Per aggiornare i dati o resettare la cassa con popup di conferma.',
  ];

  cloudSteps.forEach(cs => {
    page2.drawText(cs, {
      x: cs.startsWith('  *') ? 48 : 40,
      y,
      size: 8.5,
      font: cs.startsWith('Pulsante') || cs.startsWith('Interruttore') ? fontBold : fontRegular,
      color: textDark,
    });
    y -= 13.5;
  });
  y -= 10;

  // Sezione 4: Generatore Cartelle A4 (4 Colori)
  page2.drawText('4. GENERATORE CARTELLE A4 (4 COLORI: BLU, ARANCIO, VERDE, GIALLO)', {
    x: 35,
    y,
    size: 11.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  const cartelleItems = [
    'Impaginazione Fogli A4: Ogni foglio A4 ospita 24 cartelle suddivise in 4 strisce verticali da 6 cartelle ciascuna.',
    'Codici Univoci Cartella: Formato professionale: TOM001.G1.F001.C01 ... C24 con identificativo colore.',
    'Attivazione Selettiva Colori: L\'amministratore puo attivare o disattivare i colori delle cartelle in gioco.',
    '  Il sistema controlla e convalida le vincite esclusivamente sulle cartelle dei colori attivi!',
    'Esportazione PDF & Stampa Diretta: Tasto per generare il PDF A4 ad alta risoluzione pronto per la tipografia.',
  ];

  cartelleItems.forEach(line => {
    page2.drawText(`* ${line}`, {
      x: 40,
      y,
      size: 8.5,
      font: fontRegular,
      color: textDark,
    });
    y -= 13.5;
  });

  // =========================================================================
  // PAGINA 3: MESSA ONLINE CON GITHUB & RENDER (DETTAGLIO AD HOC)
  // =========================================================================
  const page3 = pdfDoc.addPage([595.28, 841.89]);
  addHeader(page3, 3);
  y = 765;

  page3.drawText('5. GUIDA ALLA MESSA ONLINE GRATUITA CON GITHUB & RENDER', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: darkNavy,
  });
  y -= 18;

  page3.drawText('Configurazione passo-passo ad hoc per avere il sito web online su Render (Zero Sleep, 100% Free Forever).', {
    x: 35,
    y,
    size: 9.5,
    font: fontRegular,
    color: textMuted,
  });
  y -= 24;

  page3.drawText('FASE 1: Inviare il Codice su GitHub', {
    x: 35,
    y,
    size: 10.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 14;

  // Box comandi git
  page3.drawRectangle({
    x: 35,
    y: y - 55,
    width: 525,
    height: 55,
    color: codeBg,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  const gitLines = [
    'git add .',
    'git commit -m "Luongo Tombola 90 Italia Gold Edition"',
    'git branch -M main',
    'git remote add origin https://github.com/TUO-USERNAME/tombola-90.git',
    'git push -u origin main',
  ];

  let gitY = y - 12;
  gitLines.forEach(l => {
    page3.drawText(l, { x: 45, y: gitY, size: 7.8, font: fontMono, color: darkNavy });
    gitY -= 10.5;
  });
  y -= 70;

  page3.drawText('FASE 2: Configurazione su Render.com (Static Site)', {
    x: 35,
    y,
    size: 10.5,
    font: fontBold,
    color: blue,
  });
  y -= 15;

  const renderSteps = [
    '1. Accedi a https://render.com con il tuo account GitHub.',
    '2. Dalla Dashboard clicca in alto a destra su "+ New" -> Seleziona "Static Site".',
    '3. Collega la repository GitHub "tombola-90" cliccando su "Connect".',
    '4. Imposta i seguenti parametri esatti:',
    '   * Name:               tombola-90',
    '   * Branch:             main',
    '   * Build Command:      npm run build',
    '   * Publish Directory:  dist',
    '5. File di configurazione "render.yaml": Abbiamo gia inserito il file di configurazione nel progetto che',
    '   crea in automatico la regola di Rewrite:  /*  ->  /index.html  (essenziale per le app Vite/React).',
    '6. Clicca su "Create Static Site". In 60 secondi il sito sara online su: https://tombola-90.onrender.com',
  ];

  renderSteps.forEach(rs => {
    page3.drawText(rs, {
      x: rs.startsWith('   *') ? 48 : 40,
      y,
      size: 8.5,
      font: rs.startsWith('   *') ? fontMono : fontRegular,
      color: textDark,
    });
    y -= 13.5;
  });
  y -= 12;

  page3.drawText('FASE 3: Autorizzare il Dominio su Firebase Console (1 Minuto)', {
    x: 35,
    y,
    size: 10.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 15;

  const fbAuthSteps = [
    'Per consentire al database di sincronizzare i dati anche dal nuovo indirizzo web online:',
    '1. Apri https://console.firebase.google.com e seleziona il progetto agile-lamp-6xq1s.',
    '2. Nel menu a sinistra vai su Authentication -> scheda Settings -> Authorized domains.',
    '3. Clicca su "Add domain" e inserisci:  tombola-90.onrender.com  (senza https://).',
    '4. Clicca su "Save". Ora il database Firestore e collegato sia in locale che online!',
  ];

  fbAuthSteps.forEach(as => {
    page3.drawText(as, {
      x: 40,
      y,
      size: 8.5,
      font: as.includes('.onrender.com') ? fontBold : fontRegular,
      color: textDark,
    });
    y -= 13.5;
  });
  y -= 15;

  // Box Hosting Alternativi
  page3.drawRectangle({
    x: 35,
    y: y - 55,
    width: 525,
    height: 55,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1,
  });

  page3.drawText('HOSTING ALTERNATIVI GIA SUPPORTATI NEL PROGETTO', {
    x: 45,
    y: y - 14,
    size: 9,
    font: fontBold,
    color: darkNavy,
  });
  page3.drawText('- Vercel: Importa la repo su vercel.com (deploy istantaneo con vercel.json preconfigurato).', {
    x: 45,
    y: y - 27,
    size: 8,
    font: fontRegular,
    color: textDark,
  });
  page3.drawText('- Cloudflare Pages: Connetti a dash.cloudflare.com (velocita Anycast e banda illimitata con _redirects).', {
    x: 45,
    y: y - 39,
    size: 8,
    font: fontRegular,
    color: textDark,
  });
  page3.drawText('- Firebase Hosting: Deploy diretto con "firebase deploy --only hosting" con firebase.json preconfigurato.', {
    x: 45,
    y: y - 51,
    size: 8,
    font: fontRegular,
    color: textDark,
  });

  // =========================================================================
  // PAGINA 4: MANUALE D'USO GIOCATORI & REGIA, FAQ & RIEPILOGO FILE
  // =========================================================================
  const page4 = pdfDoc.addPage([595.28, 841.89]);
  addHeader(page4, 4);
  y = 765;

  page4.drawText('6. MANUALE OPERATIVO DURANTE LA DIRETTA DI GIOCO', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: darkNavy,
  });
  y -= 18;

  const liveWorkflow = [
    '1. Preparazione Prima della Partita:',
    '   - L\'amministratore apre la pagina Cartelle (o usa la Regia) per generare i Fogli A4 (4 Colori).',
    '   - Stampa o assegna le cartelle ai giocatori partecipanti.',
    '   - Dalla Regia attiva esclusivamente i colori delle cartelle distribuite (es. Blu e Arancione ON).',
    '   - Imposta il Montepremi totale iniziale (es. 200,00 EUR) e la valuta preferita (EUR, GBP, USD).',
    '   - Se nella cassa Cloud ci sono fondi rimasti da partite precedenti, clicca "Richiama nel Montepremi".',
    '2. Avvio del Tabellone per il Pubblico (Schermo TV):',
    '   - Sullo schermo TV o proiettore della sala si apre la vista principale e si preme "Modalita TV".',
    '   - I giocatori vedono il grande tabellone dorato a 90 numeri e il countdown radiale luminoso.',
    '3. Estrazione dei Numeri:',
    '   - L\'amministratore dalla Regia preme "Play Automatico" oppure "Estrai Singolo".',
    '   - Il sistema estrae i numeri applicando l\'Intelligenza Estrazioni e l\'algoritmo matematico.',
    '   - La voce legge il numero e la Smorfia napoletana, mentre la tessera sul tabellone compie il flip 3D.',
    '4. Vincita e Gestione Premi:',
    '   - Il sistema convalida automaticamente la prima cartella attiva che chiude la combinazione.',
    '   - Sullo schermo TV appare il banner animato con la cartella vincente e l\'importo del premio.',
    '   - Se una combinazione o il Numero Gold non esce entro il limite di estrazioni, il premio va nei Non Vinti.',
    '5. Conclusione Partita & Rollover:',
    '   - Quando viene realizzata la Tombola, l\'amministratore clicca "Salva in Cloud" (o lascia l\'auto-salva)',
    '     per trasferire nel Database Cloud i fondi rimasti da usare nella partita successiva.',
  ];

  liveWorkflow.forEach(lw => {
    page4.drawText(lw, {
      x: lw.startsWith('   -') ? 48 : 40,
      y,
      size: 8.3,
      font: lw.startsWith('1.') || lw.startsWith('2.') || lw.startsWith('3.') || lw.startsWith('4.') || lw.startsWith('5.') ? fontBold : fontRegular,
      color: textDark,
    });
    y -= 13;
  });
  y -= 10;

  // Box Riepilogo File del Progetto
  page4.drawRectangle({
    x: 35,
    y: y - 100,
    width: 525,
    height: 100,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1,
  });

  page4.drawText('MAPPA DEI FILE PRINCIPALI DEL PROGETTO', {
    x: 45,
    y: y - 16,
    size: 9.5,
    font: fontBold,
    color: darkNavy,
  });

  const filesMap = [
    'index.html                         - Interfaccia completa TV Studio, Regia e Generatore Cartelle.',
    'src/tombola-controller.js          - Logica del gioco, estrazioni, TTS voce, vincite e regia.',
    'src/firebase-jackpot-service.ts    - Connessione e sincronizzazione Cloud Firestore (Cassa Non Vinti).',
    'src/tombola-luxury.css             - Design e stile Gold Edition di lusso (temi Dark e Light).',
    'render.yaml, vercel.json           - File di configurazione per deploy immediato su Render e Vercel.',
    'firebase.json, firestore.rules     - Configurazione Hosting Firebase e regole di sicurezza database.',
    'public/Guida_Messa_Online_...pdf   - Questa guida tecnica stampabile in formato PDF.',
    'public/tombola-90-compl...  - Archivio ZIP completo pronto per il download o upload su GitHub.',
  ];

  let fY = y - 30;
  filesMap.forEach(fm => {
    page4.drawText(fm, {
      x: 45,
      y: fY,
      size: 7.6,
      font: fontMono,
      color: textDark,
    });
    fY -= 11.5;
  });
  y -= 115;

  page4.drawText('PROGETTO COMPLETO, COLLAUDATO E PRONTO PER LA MESSA ONLINE UFFICIALE!', {
    x: 35,
    y,
    size: 9.5,
    font: fontBold,
    color: green,
  });

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(__dirname, '../public/Guida_Completa_Progetto_Tombola90_Gold.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Complete Project PDF created successfully at: ${outputPath} (${pdfBytes.length} bytes)`);
}

generateCompleteProjectReportPDF().catch(err => {
  console.error('Error generating complete project PDF:', err);
  process.exit(1);
});
