const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateExactOnlineGuidePDF() {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const gold = rgb(0.83, 0.68, 0.21); // #d4af37
  const darkNavy = rgb(0.05, 0.08, 0.2); // #0d1738
  const textDark = rgb(0.12, 0.16, 0.23); // #1f2937
  const textMuted = rgb(0.35, 0.42, 0.52); // #475569
  const codeBg = rgb(0.93, 0.95, 0.98); // #edf2f7
  const boxBg = rgb(0.99, 0.98, 0.94); // Light gold tint
  const green = rgb(0.08, 0.55, 0.28);
  const blue = rgb(0.02, 0.45, 0.82);

  const totalPages = 3;

  pdfDoc.setTitle('Guida Ufficiale Messa Online - Luongo Tombola 90');
  pdfDoc.setAuthor('Tombola 90 Gold Edition');
  pdfDoc.setSubject('Guida Passo-Passo per la Pubblicazione su Render, Cloudflare, Firebase e Vercel');
  pdfDoc.setCreator('Luongo Tombola 90 Engineering');
  pdfDoc.setProducer('pdf-lib v1.17.1');

  function addHeaderFooter(page, pageNum) {
    const { width, height } = page.getSize();
    // Header Bar
    page.drawRectangle({
      x: 0,
      y: height - 44,
      width: width,
      height: 44,
      color: darkNavy,
    });
    page.drawRectangle({
      x: 0,
      y: height - 47,
      width: width,
      height: 3,
      color: gold,
    });
    page.drawText('LUONGO TOMBOLA 90 ITALIA - GUIDA UFFICIALE MESSA ONLINE', {
      x: 35,
      y: height - 28,
      size: 10.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('RENDER • CLOUDFLARE • FIREBASE • VERCEL (100% GRATIS)', {
      x: width - 300,
      y: height - 28,
      size: 8,
      font: fontBold,
      color: gold,
    });

    // Footer
    page.drawLine({
      start: { x: 35, y: 34 },
      end: { x: width - 35, y: 34 },
      thickness: 0.8,
      color: rgb(0.8, 0.85, 0.9),
    });
    page.drawText('Guida Passo-Passo per la Messa Online Gratuita | Documento Stampabile A4', {
      x: 35,
      y: 20,
      size: 8,
      font: fontRegular,
      color: textMuted,
    });
    page.drawText(`Pagina ${pageNum} di ${totalPages}`, {
      x: width - 95,
      y: 20,
      size: 8,
      font: fontBold,
      color: textMuted,
    });
  }

  // =========================================================================
  // PAGINA 1: CREDENZIALI, GITHUB & CONFIGURAZIONE AD HOC SU RENDER
  // =========================================================================
  const page1 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page1, 1);
  let y = 765;

  page1.drawText('Guida Passo-Passo: Come Mettere il Progetto Online Gratis', {
    x: 35,
    y,
    size: 16.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 18;

  page1.drawText('Configurazioni ad hoc per Render, Cloudflare Pages, Firebase Hosting e Vercel con Database Cloud.', {
    x: 35,
    y,
    size: 9.5,
    font: fontRegular,
    color: textMuted,
  });
  y -= 26;

  // Box Credenziali Rapide
  page1.drawRectangle({
    x: 35,
    y: y - 75,
    width: 525,
    height: 75,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1,
  });

  page1.drawText('DATI & CREDENZIALI CHIAVE DEL TUO SISTEMA', {
    x: 45,
    y: y - 16,
    size: 9.5,
    font: fontBold,
    color: darkNavy,
  });
  page1.drawText('- Accesso Console Regia:  Protetto da Crittografia SHA-256 (Password Riservata)', {
    x: 45,
    y: y - 31,
    size: 9,
    font: fontBold,
    color: darkNavy,
  });
  page1.drawText('- Database Cloud Attivo:  Google Cloud Firebase Firestore (NoSQL, piano Spark 100% Free)', {
    x: 45,
    y: y - 45,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('- ID Progetto Firebase:  agile-lamp-6xq1s  (DB: ai-studio-luongotombola90i-7d9a...)', {
    x: 45,
    y: y - 58,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('- Costo Mensile:  0,00 EUR / Mese (Tutti i servizi scelti sono gratuiti per sempre)', {
    x: 45,
    y: y - 70,
    size: 8.5,
    font: fontBold,
    color: green,
  });
  y -= 95;

  // FASE PRELIMINARE: GITHUB
  page1.drawText('FASE PRELIMINARE: Inviare il Codice a GitHub (Passo Comune)', {
    x: 35,
    y,
    size: 11.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 15;

  page1.drawText('1. Crea una nuova repository su https://github.com/new chiamata "tombola-90" (Public).', {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  y -= 13;
  page1.drawText('2. Lancia questi comandi dal terminale nella cartella del tuo progetto:', {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  y -= 16;

  // Code Block Git
  page1.drawRectangle({
    x: 35,
    y: y - 58,
    width: 525,
    height: 58,
    color: codeBg,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  const gitLines = [
    'git add .',
    'git commit -m "Tombola 90 Gold Edition"',
    'git branch -M main',
    'git remote add origin https://github.com/TUO-USERNAME/tombola-90.git',
    'git push -u origin main',
  ];

  let gitY = y - 12;
  gitLines.forEach(l => {
    page1.drawText(l, { x: 45, y: gitY, size: 8, font: fontMono, color: darkNavy });
    gitY -= 10.5;
  });
  y -= 75;

  // SEZIONE 1: RENDER
  page1.drawText('1. CONFIGURAZIONE PASSO-PASSO AD HOC SU RENDER (100% Gratis)', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: blue,
  });
  y -= 15;

  page1.drawText('Su Render, a differenza dei Web Services backend che vanno in sleep dopo 15 minuti di inattivita,', {
    x: 40,
    y,
    size: 8.6,
    font: fontRegular,
    color: textDark,
  });
  y -= 12.5;
  page1.drawText('i "Static Sites" sono GRATUITI PER SEMPRE E NON VANNO MAI IN SLEEP!', {
    x: 40,
    y,
    size: 8.6,
    font: fontBold,
    color: green,
  });
  y -= 16;

  page1.drawText('I file gia pronti nel tuo progetto:', {
    x: 40,
    y,
    size: 8.6,
    font: fontBold,
    color: darkNavy,
  });
  y -= 12.5;
  page1.drawText('Abbiamo creato il file render.yaml nella radice del progetto, che indica a Render di compilare', {
    x: 40,
    y,
    size: 8.4,
    font: fontRegular,
    color: textDark,
  });
  y -= 12.5;
  page1.drawText('con Vite e reindirizzare tutte le rotte verso index.html (Single Page Application).', {
    x: 40,
    y,
    size: 8.4,
    font: fontRegular,
    color: textDark,
  });
  y -= 16;

  page1.drawText('Procedura passo-passo:', {
    x: 40,
    y,
    size: 8.6,
    font: fontBold,
    color: darkNavy,
  });
  y -= 14;

  const renderSteps = [
    'Passo 1: Vai su https://render.com e fai il login cliccando su "GitHub".',
    'Passo 2: Nella tua Dashboard di Render clicca in alto a destra sul pulsante blu "+ New" -> seleziona "Static Site".',
    'Passo 3: Clicca sul pulsante "Connect" accanto al tuo repository "tombola-90".',
    'Passo 4: Compila i campi (quasi tutti gia automatici):',
    '   * Name:               tombola-90',
    '   * Branch:             main',
    '   * Root Directory:     (lascia vuoto)',
    '   * Build Command:      npm run build',
    '   * Publish Directory:  dist',
    'Passo 5 (Verifica Rewrite SPA): Scorrendo in basso nella sezione "Advanced" -> "Redirects/Rewrites",',
    '   grazie al file render.yaml troverai gia impostato:  Source: /*  |  Destination: /index.html  |  Action: Rewrite',
    'Passo 6: Clicca su "Create Static Site". In circa 60 secondi il sito sara compilato e online con il tuo URL:',
    '   https://tombola-90.onrender.com  (con certificato HTTPS gratuito e attivo)',
  ];

  renderSteps.forEach(rs => {
    page1.drawText(rs, {
      x: rs.startsWith('   *') ? 48 : 40,
      y,
      size: 8.2,
      font: rs.startsWith('Passo') ? fontBold : (rs.startsWith('   *') || rs.includes('onrender.com') ? fontMono : fontRegular),
      color: textDark,
    });
    y -= 12.8;
  });

  // =========================================================================
  // PAGINA 2: CLOUDFLARE PAGES, FIREBASE HOSTING & VERCEL
  // =========================================================================
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page2, 2);
  y = 765;

  page2.drawText('2. ALTERNATIVA TOP: CLOUDFLARE PAGES (Velocita Record & Traffico Illimitato)', {
    x: 35,
    y,
    size: 11.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  page2.drawText('Cloudflare Pages e celebre per essere la piattaforma piu veloce al mondo per siti statici/Vite,', {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  y -= 12.5;
  page2.drawText('senza limiti di banda mensile e con protezione DDoS automatica.', {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  y -= 15;

  const cfSteps = [
    '1. Vai su https://dash.cloudflare.com (crea un account gratuito in 30 secondi).',
    '2. Nel menu a sinistra clicca su "Workers & Pages" -> scheda in alto "Pages" -> "Connect to Git".',
    '3. Seleziona il repository "tombola-90" e clicca "Begin setup".',
    '4. Configurazione:',
    '   - Framework preset:        Vite',
    '   - Build command:           npm run build',
    '   - Build output directory:  dist',
    '5. Clicca su "Save and Deploy" (il file public/_redirects e gia incluso nel progetto per gestire i reindirizzamenti).',
    '6. Il sito sara attivo su: https://tombola-90.pages.dev',
  ];

  cfSteps.forEach(cs => {
    page2.drawText(cs, {
      x: cs.startsWith('   -') ? 48 : 40,
      y,
      size: 8.3,
      font: cs.startsWith('   -') || cs.includes('.pages.dev') ? fontMono : fontRegular,
      color: textDark,
    });
    y -= 13;
  });
  y -= 12;

  // SEZIONE 3: FIREBASE HOSTING
  page2.drawText('3. ALTERNATIVA NATIVA: GOOGLE FIREBASE HOSTING', {
    x: 35,
    y,
    size: 11.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 15;

  page2.drawText('Dato che il database Firestore ai-studio-luongotombola90i-7d9a7964-caed-43e3-a2ea-3f12d876f720', {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  y -= 12.5;
  page2.drawText('si trova gia sul tuo progetto Firebase agile-lamp-6xq1s, puoi ospitare il sito web direttamente con Firebase Hosting.', {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  y -= 12.5;
  page2.drawText('Vantaggio unico: non serve autorizzare nessun dominio esterno perche risiede gia nello stesso account!', {
    x: 40,
    y,
    size: 8.5,
    font: fontBold,
    color: green,
  });
  y -= 15;

  page2.drawText('Abbiamo gia configurato il file firebase.json. Per distribuire basta lanciare dal tuo terminale:', {
    x: 40,
    y,
    size: 8.4,
    font: fontRegular,
    color: textDark,
  });
  y -= 15;

  // Code Block Firebase
  page2.drawRectangle({
    x: 35,
    y: y - 50,
    width: 525,
    height: 50,
    color: codeBg,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  const fbLines = [
    'npm install -g firebase-tools',
    'firebase login',
    'npm run build',
    'firebase deploy --only hosting',
  ];

  let fbY = y - 11;
  fbLines.forEach(l => {
    page2.drawText(l, { x: 45, y: fbY, size: 8, font: fontMono, color: darkNavy });
    fbY -= 10.5;
  });
  y -= 62;

  page2.drawText('Il sito sara subito live all\'indirizzo: https://agile-lamp-6xq1s.web.app', {
    x: 40,
    y,
    size: 8.5,
    font: fontBold,
    color: textDark,
  });
  y -= 18;

  // SEZIONE 4: VERCEL
  page2.drawText('4. VERCEL (1-Click Deploy Super Rapido)', {
    x: 35,
    y,
    size: 11.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 15;

  const vercelSteps = [
    '1. Accedi a https://vercel.com con GitHub.',
    '2. Dalla dashboard clicca su "Add New..." -> "Project" -> Clicca "Import" accanto a "tombola-90".',
    '3. Vercel rilevera automaticamente Vite con le regole del file vercel.json preconfigurato.',
    '4. Clicca sul pulsante "Deploy". Il sito sara attivo in 30 secondi su: https://tombola-90.vercel.app',
  ];

  vercelSteps.forEach(vs => {
    page2.drawText(vs, {
      x: 40,
      y,
      size: 8.3,
      font: vs.includes('.vercel.app') ? fontMono : fontRegular,
      color: textDark,
    });
    y -= 13;
  });

  // =========================================================================
  // PAGINA 3: FASE FINALE (FIREBASE DOMAINS), SICUREZZA & FAQ
  // =========================================================================
  const page3 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page3, 3);
  y = 765;

  page3.drawText('FASE FINALE: Abilitare il Database sul Dominio Scelto', {
    x: 35,
    y,
    size: 13,
    font: fontBold,
    color: blue,
  });
  y -= 17;

  page3.drawText('Se scegli Render, Cloudflare o Vercel, ricordati di autorizzare il dominio su Firebase per consentire', {
    x: 35,
    y,
    size: 9,
    font: fontRegular,
    color: textDark,
  });
  y -= 12.5;
  page3.drawText('la sincronizzazione e il salvataggio in tempo reale della Cassa Montepremi Non Vinti:', {
    x: 35,
    y,
    size: 9,
    font: fontRegular,
    color: textDark,
  });
  y -= 18;

  const authList = [
    '1. Apri la Console Firebase:  https://console.firebase.google.com',
    '2. Seleziona il progetto:  agile-lamp-6xq1s',
    '3. Vai su "Authentication" (menu a sinistra) -> scheda "Settings" in alto -> "Authorized domains".',
    '4. Clicca sul pulsante "Add domain" e incolla il tuo link (senza https:// e senza barre finali):',
    '   * Se hai usato Render:      tombola-90.onrender.com',
    '   * Se hai usato Cloudflare:  tombola-90.pages.dev',
    '   * Se hai usato Vercel:      tombola-90.vercel.app',
    '5. Clicca su "Salva". Da questo istante il database Firestore e collegato sia in locale che online!',
  ];

  authList.forEach(al => {
    page3.drawText(al, {
      x: al.startsWith('   *') ? 48 : 40,
      y,
      size: 8.5,
      font: al.startsWith('   *') ? fontMono : fontRegular,
      color: textDark,
    });
    y -= 14;
  });
  y -= 16;

  // Box Istruzioni d'uso
  page3.drawRectangle({
    x: 35,
    y: y - 110,
    width: 525,
    height: 110,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1,
  });

  page3.drawText('COME UTILIZZARE IL GIOCO ONLINE (DOPPIO SCHERMO TV & REGIA)', {
    x: 45,
    y: y - 16,
    size: 9.5,
    font: fontBold,
    color: darkNavy,
  });

  const usageLines = [
    'SCHERMO TV (Pubblico/Sala): Apri il link pubblico del tuo sito su una Smart TV, monitor o proiettore',
    'e clicca in alto su "Modalita TV". Apparira il grande tabellone con animazioni 3D flip a 180 gradi,',
    'il countdown radiale circolare, la voce della Smorfia Napoletana e il badge rollover premi.',
    'CONSOLE REGIA (Amministratore): Apri il sito da un tablet, telefono o computer portatile, clicca su "Regia"',
    'ed entra inserendo la tua password riservata (crittografata SHA-256).',
    'Dalla Regia comandi in tempo reale: estrazione automatica/singola, velocita countdown, generazione cartelle A4,',
    'trasmissione di loghi live sullo schermo TV e il salvataggio/richiamo del Montepremi nel Database Cloud.',
  ];

  let uY = y - 32;
  usageLines.forEach(ul => {
    page3.drawText(ul, {
      x: 45,
      y: uY,
      size: 7.9,
      font: ul.startsWith('SCHERMO') || ul.startsWith('CONSOLE') || ul.includes('SHA-256') ? fontBold : fontRegular,
      color: textDark,
    });
    uY -= 11.5;
  });
  y -= 125;

  // Box Riepilogo File del Progetto
  page3.drawRectangle({
    x: 35,
    y: y - 90,
    width: 525,
    height: 90,
    color: codeBg,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  page3.drawText('FILE DI CONFIGURAZIONE GIA INCLUSI NEL CODICE SORGENTE', {
    x: 45,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: darkNavy,
  });

  const configFiles = [
    'render.yaml                       - Blueprint Render con rewrite SPA e build automatica.',
    'public/_redirects, netlify.toml   - Regole per Cloudflare Pages e Netlify (100% SPA).',
    'firebase.json, firestore.rules    - Configurazione Hosting Firebase e regole di sicurezza Database.',
    'vercel.json                       - Regole di routing per Vercel.',
    'public/tombola-90-...zip   - Archivio ZIP completo scaricabile dalla Regia.',
  ];

  let cfY = y - 29;
  configFiles.forEach(cf => {
    page3.drawText(cf, {
      x: 45,
      y: cfY,
      size: 7.7,
      font: fontMono,
      color: textDark,
    });
    cfY -= 11.5;
  });
  y -= 105;

  page3.drawText('PROGETTO COMPLETO, COLLAUDATO E PRONTO PER LA PUBBLICAZIONE IN RETE!', {
    x: 35,
    y,
    size: 9.5,
    font: fontBold,
    color: green,
  });

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(__dirname, '../public/Guida_Messa_Online_GitHub_Hosting.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Guida Messa Online PDF created successfully at: ${outputPath} (${pdfBytes.length} bytes)`);
}

generateExactOnlineGuidePDF().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
