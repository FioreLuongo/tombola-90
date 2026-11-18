const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateVercelGuidePDF() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Guida Deploy Vercel Passo-Passo - Luongo Tombola 90');
  pdfDoc.setAuthor('LUONGO Tombola 90 Italia - Gold Edition');
  pdfDoc.setSubject('Configurazione e Messa Online su Vercel accanto a Render (tombola-90)');
  pdfDoc.setCreator('Luongo Tombola 90 Italia');
  pdfDoc.setProducer('pdf-lib (Standard A4 Compat)');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const gold = rgb(0.83, 0.68, 0.21);
  const darkNavy = rgb(0.05, 0.08, 0.2);
  const vercelBlack = rgb(0.07, 0.09, 0.13);
  const textDark = rgb(0.12, 0.16, 0.23);
  const textMuted = rgb(0.38, 0.43, 0.52);
  const boxBg = rgb(0.98, 0.97, 0.93);
  const codeBg = rgb(0.93, 0.95, 0.98);
  const greenBg = rgb(0.92, 0.98, 0.94);
  const green = rgb(0.06, 0.5, 0.25);
  const red = rgb(0.75, 0.15, 0.15);
  const blue = rgb(0.05, 0.35, 0.72);

  const totalPages = 3;

  function addHeaderFooter(page, pageNum) {
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 44, width, height: 44, color: darkNavy });
    page.drawRectangle({ x: 0, y: height - 47, width, height: 3, color: gold });

    page.drawText('LUONGO TOMBOLA 90 ITALIA - GOLD EDITION', {
      x: 35,
      y: height - 27,
      size: 11,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('GUIDA DEPLOY VERCEL PASSO-PASSO', {
      x: width - 235,
      y: height - 27,
      size: 8.5,
      font: fontBold,
      color: gold,
    });

    page.drawLine({
      start: { x: 35, y: 36 },
      end: { x: width - 35, y: 36 },
      thickness: 0.8,
      color: rgb(0.82, 0.86, 0.92),
    });
    page.drawText('Hosting Doppio: Render (Backend/WS) + Vercel (CDN) | Guida Stampabile A4', {
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

  function drawSectionBadge(page, x, y, stepNum, title) {
    page.drawRectangle({ x, y: y - 4, width: 22, height: 18, color: vercelBlack });
    page.drawText(String(stepNum), {
      x: x + 7.5,
      y: y + 1,
      size: 10,
      font: fontBold,
      color: gold,
    });
    page.drawText(title, {
      x: x + 30,
      y: y + 1,
      size: 11.2,
      font: fontBold,
      color: darkNavy,
    });
  }

  // =========================================================================
  // PAGINA 1: ARCHITETTURA VERCEL + RENDER & PASSO 1 (GITHUB + VERCEL.JSON)
  // =========================================================================
  const page1 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page1, 1);
  let y = 762;

  page1.drawText('Come Pubblicare Tombola 90 anche su Vercel (Oltre a Render)', {
    x: 35,
    y,
    size: 16,
    font: fontBold,
    color: darkNavy,
  });
  y -= 17;
  page1.drawText('Guida completa passo-passo per attivare https://tombola-90.vercel.app gratis in 2 minuti.', {
    x: 35,
    y,
    size: 9.5,
    font: fontRegular,
    color: textMuted,
  });
  y -= 24;

  // Riquadro architettura doppia
  page1.drawRectangle({
    x: 35,
    y: y - 122,
    width: 525,
    height: 122,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1.2,
  });
  page1.drawText('ARCHITETTURA DOPPIA RENDER + VERCEL (TUTTO GIA\' PREDISPOSTO)', {
    x: 45,
    y: y - 16,
    size: 9.5,
    font: fontBold,
    color: darkNavy,
  });

  const archRows = [
    ['Render (Attivo):', 'https://tombola-90.onrender.com   (Node.js + WebSocket wss:///ws + Server DB)'],
    ['Vercel (Nuovo):', 'https://tombola-90.vercel.app     (CDN Globale ultraveloce + HTTPS gratuito)'],
    ['File Vercel:', 'vercel.json   (gia\' configurato con framework Vite, dist e rewrite SPA)'],
    ['Database Cloud:', 'Firebase (agile-lamp-6xq1s) + Appwrite (6af8bbbf003dea6b4e91) condivisi'],
    ['Collegamento Live:', 'Impostando VITE_WS_URL su Vercel puoi usare il WebSocket di Render anche da Vercel'],
  ];
  let ay = y - 35;
  archRows.forEach(([label, val]) => {
    page1.drawText(label, { x: 45, y: ay, size: 8.6, font: fontBold, color: textDark });
    page1.drawText(val, { x: 145, y: ay, size: 8.1, font: fontMono, color: blue });
    ay -= 17;
  });
  y -= 142;

  // PASSO 1: GitHub
  drawSectionBadge(page1, 35, y, 1, 'PASSO 1: CARICA O AGGIORNA IL PROGETTO SU GITHUB');
  y -= 20;
  const step1Lines = [
    'Vercel si collega direttamente alla tua repository GitHub (la stessa usata per Render):',
    '1. Dalla Console Regia di Tombola 90, clicca "Scarica Progetto Completo (.ZIP)" se vuoi i file sul PC.',
    '2. Estrai la cartella sul PC e verifica che nella radice ci sia il file "vercel.json" e "package.json".',
    '3. Invia tutti i file aggiornati su GitHub eseguendo nel terminale dentro la cartella del progetto:',
  ];
  step1Lines.forEach((line) => {
    page1.drawText(line, { x: 40, y, size: 8.7, font: fontRegular, color: textDark });
    y -= 14.5;
  });

  y -= 4;
  page1.drawRectangle({
    x: 40,
    y: y - 62,
    width: 515,
    height: 62,
    color: codeBg,
    borderColor: blue,
    borderWidth: 0.8,
  });
  const gitCmds = [
    'git add .',
    'git commit -m "Configurazione Vercel + Render Tombola 90"',
    'git branch -M main',
    'git push -u origin main',
  ];
  let gy = y - 14;
  gitCmds.forEach((cmd) => {
    page1.drawText(cmd, { x: 52, y: gy, size: 8.6, font: fontMono, color: darkNavy });
    gy -= 13.5;
  });
  y -= 82;

  // Box verifica vercel.json
  drawSectionBadge(page1, 35, y, 2, 'PASSO 2: COSA CONTIENE IL FILE vercel.json (GIA\' PRONTO)');
  y -= 20;
  page1.drawText('Il progetto include gia\' il file vercel.json ottimizzato per Vite SPA e rotte API:', {
    x: 40,
    y,
    size: 8.7,
    font: fontRegular,
    color: textDark,
  });
  y -= 14;
  page1.drawRectangle({
    x: 40,
    y: y - 102,
    width: 515,
    height: 102,
    color: codeBg,
    borderColor: rgb(0.78, 0.82, 0.9),
    borderWidth: 0.8,
  });
  const vercelJsonLines = [
    '{',
    '  "framework": "vite",',
    '  "buildCommand": "npm run build",',
    '  "outputDirectory": "dist",',
    '  "rewrites": [ { "source": "/((?!api/).*)", "destination": "/index.html" } ]',
    '}',
  ];
  let vy = y - 16;
  vercelJsonLines.forEach((line) => {
    page1.drawText(line, { x: 52, y: vy, size: 8.5, font: fontMono, color: blue });
    vy -= 14;
  });
  y -= 122;

  page1.drawRectangle({
    x: 35,
    y: y - 44,
    width: 525,
    height: 44,
    color: greenBg,
    borderColor: green,
    borderWidth: 0.8,
  });
  page1.drawText('NOTA IMPORTANTE SU RENDER E VERCEL INSIEME', {
    x: 45,
    y: y - 15,
    size: 8.8,
    font: fontBold,
    color: green,
  });
  page1.drawText('Render continua a eseguire il server Node.js (server.ts + WebSocket /ws). Vercel pubblica il frontend', {
    x: 45,
    y: y - 28,
    size: 8.2,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('statico su CDN globale: i due siti possono convivere senza alcun conflitto usando lo stesso repository!', {
    x: 45,
    y: y - 39,
    size: 8.2,
    font: fontRegular,
    color: textDark,
  });

  // =========================================================================
  // PAGINA 2: IMPORTAZIONE SU VERCEL DASHBOARD, BUILD SETTINGS & ENV VARS
  // =========================================================================
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page2, 2);
  y = 762;

  drawSectionBadge(page2, 35, y, 3, 'PASSO 3: IMPORTA E PUBBLICA SU VERCEL (DASHBOARD WEB)');
  y -= 20;

  const step3Lines = [
    '1. Apri il browser su:  https://vercel.com  e clicca "Sign Up" o "Log In" -> scegli "Continue with GitHub".',
    '2. Autorizza Vercel ad accedere al tuo account GitHub.',
    '3. Nella schermata principale (Overview), clicca in alto a destra su "Add New..." -> "Project".',
    '4. Nella lista "Import Git Repository", cerca la repository "tombola-90" e clicca "Import".',
    '5. Nella schermata "Configure Project", verifica questi parametri esatti (Vercel li rileva in automatico):',
  ];
  step3Lines.forEach((line) => {
    page2.drawText(line, { x: 40, y, size: 8.7, font: fontRegular, color: textDark });
    y -= 15;
  });
  y -= 6;

  // Tabella Build Settings Vercel
  page2.drawRectangle({
    x: 40,
    y: y - 120,
    width: 515,
    height: 120,
    color: rgb(1, 1, 1),
    borderColor: gold,
    borderWidth: 1,
  });
  page2.drawRectangle({
    x: 40,
    y: y - 22,
    width: 515,
    height: 22,
    color: vercelBlack,
  });
  page2.drawText('IMPOSTAZIONI BUILD SU VERCEL (CONFIGURE PROJECT)', {
    x: 50,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const buildRows = [
    ['Project Name:', 'tombola-90   (generera\' https://tombola-90.vercel.app)'],
    ['Framework Preset:', 'Vite'],
    ['Root Directory:', './   (lascia radice principale)'],
    ['Build Command:', 'npm run build'],
    ['Output Directory:', 'dist'],
    ['Install Command:', 'npm install'],
  ];
  let by = y - 36;
  buildRows.forEach(([k, v], idx) => {
    if (idx % 2 === 1) {
      page2.drawRectangle({ x: 41, y: by - 4, width: 513, height: 15, color: codeBg });
    }
    page2.drawText(k, { x: 50, y: by, size: 8.6, font: fontBold, color: textDark });
    page2.drawText(v, { x: 185, y: by, size: 8.5, font: fontMono, color: blue });
    by -= 15.5;
  });
  y -= 138;

  // PASSO 4: Variabili d'Ambiente per collegare Render
  drawSectionBadge(page2, 35, y, 4, 'PASSO 4: COLLEGAMENTO LIVE VERCEL <-> RENDER (ENVIRONMENT VARIABLES)');
  y -= 20;
  const envIntro = [
    'Prima di cliccare "Deploy", apri la tendina "Environment Variables" su Vercel se vuoi che il sito su Vercel',
    'usi in tempo reale il WebSocket di Render per comandare la TV da un altro dispositivo:',
  ];
  envIntro.forEach((line) => {
    page2.drawText(line, { x: 40, y, size: 8.7, font: fontRegular, color: textDark });
    y -= 14;
  });
  y -= 4;

  page2.drawRectangle({
    x: 40,
    y: y - 58,
    width: 515,
    height: 58,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1,
  });
  page2.drawText('Key (Nome Variabile)', { x: 52, y: y - 15, size: 8.4, font: fontBold, color: textMuted });
  page2.drawText('Value (Valore da incollare)', { x: 215, y: y - 15, size: 8.4, font: fontBold, color: textMuted });
  page2.drawText('VITE_APP_URL', { x: 52, y: y - 32, size: 8.8, font: fontMono, color: blue });
  page2.drawText('https://tombola-90.onrender.com', { x: 215, y: y - 32, size: 8.8, font: fontMono, color: darkNavy });
  page2.drawText('VITE_WS_URL', { x: 52, y: y - 47, size: 8.8, font: fontMono, color: blue });
  page2.drawText('wss://tombola-90.onrender.com/ws', { x: 215, y: y - 47, size: 8.8, font: fontMono, color: darkNavy });
  y -= 74;

  page2.drawText('* Nota: Se NON aggiungi queste variabili, Vercel funziona comunque al 100% usando Firebase, Appwrite', {
    x: 40,
    y,
    size: 8.2,
    font: fontRegular,
    color: textMuted,
  });
  y -= 12;
  page2.drawText('  e la sincronia locale BroadcastChannel tra schede dello stesso browser (zero errori).', {
    x: 40,
    y,
    size: 8.2,
    font: fontRegular,
    color: textMuted,
  });
  y -= 24;

  // PASSO 5: Deploy & CLI alternativa
  drawSectionBadge(page2, 35, y, 5, 'PASSO 5: CLICCA "DEPLOY" (OPPURE USA VERCEL CLI DA TERMINALE)');
  y -= 20;
  page2.drawText('Clicca il pulsante nero "Deploy". Dopo ~30 secondi vedrai i coriandoli e il tuo URL attivo:', {
    x: 40,
    y,
    size: 8.7,
    font: fontBold,
    color: green,
  });
  y -= 16;
  page2.drawText('https://tombola-90.vercel.app', { x: 52, y, size: 10.5, font: fontMono, color: blue });
  y -= 22;

  page2.drawText('In alternativa, puoi pubblicare direttamente dal terminale del tuo computer con 3 comandi:', {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  y -= 10;
  page2.drawRectangle({
    x: 40,
    y: y - 48,
    width: 515,
    height: 48,
    color: codeBg,
    borderColor: blue,
    borderWidth: 0.7,
  });
  page2.drawText('npm install -g vercel', { x: 52, y: y - 14, size: 8.5, font: fontMono, color: darkNavy });
  page2.drawText('vercel login', { x: 52, y: y - 27, size: 8.5, font: fontMono, color: darkNavy });
  page2.drawText('vercel --prod', { x: 52, y: y - 40, size: 8.5, font: fontMono, color: darkNavy });

  // =========================================================================
  // PAGINA 3: AUTORIZZAZIONE DOMINI FIREBASE/APPWRITE, TEST TV & ERRORI
  // =========================================================================
  const page3 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page3, 3);
  y = 762;

  drawSectionBadge(page3, 35, y, 6, 'PASSO 6: AUTORIZZA IL DOMINIO VERCEL SU FIREBASE & APPWRITE');
  y -= 20;

  page3.drawText('A) Console Firebase (Obbligatorio per Cassa Cloud & Profili Regia):', {
    x: 40,
    y,
    size: 9.2,
    font: fontBold,
    color: darkNavy,
  });
  y -= 15;
  const fbAuthLines = [
    '  1. Apri https://console.firebase.google.com -> seleziona il progetto "agile-lamp-6xq1s".',
    '  2. Menu a sinistra -> Authentication -> scheda in alto Settings -> sezione "Authorized domains".',
    '  3. Clicca "Add domain" e incolla il tuo dominio Vercel (senza https://):',
    '     tombola-90.vercel.app   (e il tuo eventuale dominio personalizzato)',
    '  4. Clicca "Add" / "Salva".',
  ];
  fbAuthLines.forEach((line, idx) => {
    page3.drawText(line, {
      x: 40,
      y,
      size: 8.5,
      font: idx === 3 ? fontMono : fontRegular,
      color: idx === 3 ? blue : textDark,
    });
    y -= 14;
  });
  y -= 10;

  page3.drawText('B) Console Appwrite (Solo se hai collegato anche Appwrite Cloud):', {
    x: 40,
    y,
    size: 9.2,
    font: fontBold,
    color: darkNavy,
  });
  y -= 15;
  const awAuthLines = [
    '  1. Apri https://appwrite.io/projects/6af8bbbf003dea6b4e91/overview -> sezione Platforms.',
    '  2. Verifica che esista la piattaforma Web con Hostname "*" (asterisco autorizza sia Render che Vercel).',
    '  3. In alternativa aggiungi una piattaforma Web specifica con Hostname: tombola-90.vercel.app',
  ];
  awAuthLines.forEach((line) => {
    page3.drawText(line, { x: 40, y, size: 8.5, font: fontRegular, color: textDark });
    y -= 14;
  });
  y -= 14;

  // Box verifica finale & Smart TV
  drawSectionBadge(page3, 35, y, 7, 'PASSO 7: VERIFICA FUNZIONAMENTO SU PC, SMART TV & REGIA');
  y -= 20;
  page3.drawRectangle({
    x: 35,
    y: y - 76,
    width: 525,
    height: 76,
    color: greenBg,
    borderColor: green,
    borderWidth: 1,
  });
  const checkLines = [
    '[OK] PC / Tablet / Regia:  https://tombola-90.vercel.app  (entra in Regia con la tua password)',
    '[OK] Smart TV Samsung/LG:  https://tombola-90.vercel.app/?tv=1  (attiva Dark Mode & Kiosk Fullscreen)',
    '[OK] Controllo Cassa Cloud: In Regia -> "Cassa Cloud" -> verifica pillola verde Firebase (e Appwrite)',
    '[OK] Aggiornamenti futuri: Ogni "git push" su GitHub aggiorna automaticamente sia Render che Vercel!',
  ];
  let cy = y - 16;
  checkLines.forEach((cl) => {
    page3.drawText(cl, { x: 45, y: cy, size: 8.3, font: fontBold, color: textDark });
    cy -= 17;
  });
  y -= 98;

  // Troubleshooting Vercel
  page3.drawText('RISOLUZIONE RAPIDA EVENTUALI ERRORI SU VERCEL (TROUBLESHOOTING)', {
    x: 35,
    y,
    size: 10.2,
    font: fontBold,
    color: darkNavy,
  });
  y -= 14;

  const errs = [
    ['Errore 404 NOT_FOUND su refresh pagina', 'Verifica che il file vercel.json sia nella cartella principale della repository GitHub.'],
    ['Build Failed su Vercel', 'Imposta Build Command = "npm run build" e Output Directory = "dist" in Project Settings.'],
    ['WebSocket offline da Vercel su 2 dispositivi', 'Aggiungi VITE_APP_URL e VITE_WS_URL (es. wss://tombola-90.onrender.com/ws) e clicca Redeploy.'],
    ['Firebase non salva / Errore Auth Domain', 'Aggiungi tombola-90.vercel.app in Firebase Console -> Authentication -> Authorized domains.'],
    ['Errore CORS su Appwrite da Vercel', 'Aggiungi Platform -> Web -> Hostname "*" (o tombola-90.vercel.app) su Appwrite Overview.'],
  ];

  errs.forEach(([errTitle, errFix]) => {
    page3.drawRectangle({
      x: 35,
      y: y - 30,
      width: 525,
      height: 28,
      color: codeBg,
      borderColor: rgb(0.84, 0.87, 0.92),
      borderWidth: 0.6,
    });
    page3.drawText(errTitle, { x: 42, y: y - 12, size: 8.3, font: fontBold, color: red });
    page3.drawText(errFix, { x: 42, y: y - 24, size: 8, font: fontRegular, color: textDark });
    y -= 33;
  });

  // useObjectStreams: false garantisce tabelle xref classiche compatibili al 100% con Adobe Acrobat
  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const outPath = path.resolve(__dirname, '../public/Guida_Deploy_Vercel_Tombola90.pdf');
  fs.writeFileSync(outPath, pdfBytes);

  const tsOutPath = path.resolve(__dirname, '../src/vercel-guide-pdf-data.ts');
  const base64Data = Buffer.from(pdfBytes).toString('base64');
  fs.writeFileSync(
    tsOutPath,
    `// File generato automaticamente da scripts/generate-vercel-guide-pdf.cjs\nexport const VERCEL_GUIDE_PDF_BASE64 = "${base64Data}";\n`
  );

  console.log(`PDF Vercel generato con successo in: ${outPath} (${pdfBytes.length} bytes, ${totalPages} pagine) e Base64 TS in: ${tsOutPath}`);
}

generateVercelGuidePDF().catch((err) => {
  console.error('Errore generazione PDF Vercel:', err);
  process.exit(1);
});
