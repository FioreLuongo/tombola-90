const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createGuidePDF() {
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
  const blue = rgb(0.02, 0.5, 0.85);

  function addHeader(page, pageNum, totalPages) {
    const { width, height } = page.getSize();
    // Top banner bar
    page.drawRectangle({
      x: 0,
      y: height - 45,
      width: width,
      height: 45,
      color: darkNavy,
    });
    page.drawRectangle({
      x: 0,
      y: height - 48,
      width: width,
      height: 3,
      color: gold,
    });
    page.drawText('LUONGO TOMBOLA 90 ITALIA - GUIDA UFFICIALE DEPLOY ONLINE', {
      x: 35,
      y: height - 28,
      size: 10.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    page.drawText('RENDER, VERCEL, CLOUDFLARE, FIREBASE (100% GRATIS)', {
      x: width - 295,
      y: height - 28,
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
    page.drawText('Luongo Tombola 90 Italia - Gold Edition | Guida Deploy ad hoc con GitHub', {
      x: 35,
      y: 22,
      size: 8,
      font: fontRegular,
      color: textMuted,
    });
    page.drawText(`Pagina ${pageNum} di ${totalPages}`, {
      x: width - 95,
      y: 22,
      size: 8,
      font: fontBold,
      color: textMuted,
    });
  }

  // ==========================================
  // PAGINA 1: CREDENZIALI & RENDER (AD HOC)
  // ==========================================
  let page1 = pdfDoc.addPage([595.28, 841.89]);
  addHeader(page1, 1, 3);
  let y = 760;

  // Title
  page1.drawText('Messa Online Gratuita con GitHub & Hosting Top-Tier', {
    x: 35,
    y,
    size: 18,
    font: fontBold,
    color: darkNavy,
  });
  y -= 20;

  page1.drawText('Istruzioni passo-passo per pubblicare su Render, Vercel, Cloudflare Pages o Firebase con Database.', {
    x: 35,
    y,
    size: 9.5,
    font: fontRegular,
    color: textMuted,
  });
  y -= 26;

  // Box info credenziali e stato
  page1.drawRectangle({
    x: 35,
    y: y - 82,
    width: 525,
    height: 82,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1,
  });

  page1.drawText('RIEPILOGO CREDENZIALI & DATABASE ATTIVO', {
    x: 45,
    y: y - 16,
    size: 10,
    font: fontBold,
    color: darkNavy,
  });
  page1.drawText('- Password di Accesso Regia Console:  tombola90  (oppure admin)', {
    x: 45,
    y: y - 31,
    size: 9,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('- Database Cloud Attivo:  Google Cloud Firebase Firestore (NoSQL, piano Spark 100% Free)', {
    x: 45,
    y: y - 46,
    size: 9,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('- Progetto Firebase:  agile-lamp-6xq1s  (DB: ai-studio-luongotombola90i-7d9a...)', {
    x: 45,
    y: y - 60,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('- Costo Mensile:  0,00 EUR / Mese (Tutti i servizi scelti offrono livelli gratuiti perenni)', {
    x: 45,
    y: y - 74,
    size: 8.5,
    font: fontBold,
    color: green,
  });
  y -= 98;

  // Sezione GitHub
  page1.drawText('FASE 1: Inviare il Progetto su GitHub (Comune per tutti gli hosting)', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  page1.drawText('1. Crea una nuova repository su https://github.com/new chiamata "tombola-90" (Public).', {
    x: 40,
    y,
    size: 8.8,
    font: fontRegular,
    color: textDark,
  });
  y -= 14;
  page1.drawText('2. Lancia questi comandi dal tuo terminale nella cartella del progetto:', {
    x: 40,
    y,
    size: 8.8,
    font: fontRegular,
    color: textDark,
  });
  y -= 16;

  // Code Block Git
  page1.drawRectangle({
    x: 35,
    y: y - 60,
    width: 525,
    height: 60,
    color: codeBg,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  const gitCommands = [
    'git add .',
    'git commit -m "Luongo Tombola 90 Gold Edition"',
    'git branch -M main',
    'git remote add origin https://github.com/TUO-USERNAME/tombola-90.git',
    'git push -u origin main',
  ];

  let codeY = y - 13;
  gitCommands.forEach(cmd => {
    page1.drawText(cmd, { x: 45, y: codeY, size: 8, font: fontMono, color: darkNavy });
    codeY -= 11.5;
  });
  y -= 75;

  // Sezione RENDER
  page1.drawText('FASE 2: CONFIGURAZIONE PASSO-PASSO AD HOC SU RENDER (100% GRATIS)', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: blue,
  });
  y -= 16;

  page1.drawText('Render (https://render.com) e uno degli hosting cloud piu potenti al mondo. Per Tombola 90 usiamo', {
    x: 40,
    y,
    size: 8.8,
    font: fontRegular,
    color: textDark,
  });
  y -= 13;
  page1.drawText('la tipologia "Static Site", che su Render e COMPLETAMENTE GRATUITA PER SEMPRE e NON VA IN SLEEP!', {
    x: 40,
    y,
    size: 8.8,
    font: fontBold,
    color: green,
  });
  y -= 18;

  const renderSteps = [
    'Passo 1: Accedi a https://render.com e clicca "Get Started for Free" -> Scegli "GitHub".',
    'Passo 2: Nella Dashboard di Render, clicca in alto a destra sul pulsante blu "+ New" -> Scegli "Static Site".',
    'Passo 3: Collega la tua repository GitHub "tombola-90" cliccando su "Connect".',
    'Passo 4: Compila la schermata di configurazione con questi parametri esatti:',
    '   - Name:  tombola-90',
    '   - Branch:  main',
    '   - Root Directory:  (lascia vuoto)',
    '   - Build Command:  npm run build',
    '   - Publish Directory:  dist',
    'Passo 5 (IMPORTANTE - Regola di Rewrite SPA): Scorri in basso su "Advanced" -> "Redirects/Rewrites":',
    '   - Clicca su "Add Rule"',
    '   - Source:  /*',
    '   - Destination:  /index.html',
    '   - Action:  Rewrite',
    '   (Nota: abbiamo anche incluso il file render.yaml nel progetto che imposta questa regola in automatico!)',
    'Passo 6: Clicca sul pulsante "Create Static Site". In 1 minuto il tuo sito e online con HTTPS!',
    '   Il tuo URL sara:  https://tombola-90.onrender.com',
  ];

  renderSteps.forEach(st => {
    page1.drawText(st, {
      x: 40,
      y,
      size: 8.4,
      font: st.startsWith('Passo') ? fontBold : (st.startsWith('   -') ? fontMono : fontRegular),
      color: textDark,
    });
    y -= 13.5;
  });

  // ==========================================
  // PAGINA 2: VERCEL, CLOUDFLARE PAGES, FIREBASE
  // ==========================================
  let page2 = pdfDoc.addPage([595.28, 841.89]);
  addHeader(page2, 2, 3);
  y = 760;

  page2.drawText('OPZIONE ALTERNATIVA 2: Vercel (Velocissimo, Zero Configurazione)', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  const vercelSteps = [
    '1. Accedi a https://vercel.com con GitHub.',
    '2. Clicca "Add New..." -> "Project" -> Clicca "Import" accanto a "tombola-90".',
    '3. Rileva automaticamente Vite. Lascia tutto predefinito (Build: npm run build, Output: dist).',
    '4. Clicca "Deploy". In 30 secondi il sito e online all\'indirizzo: https://tombola-90.vercel.app',
  ];
  vercelSteps.forEach(st => {
    page2.drawText(st, { x: 40, y, size: 8.6, font: fontRegular, color: textDark });
    y -= 14;
  });
  y -= 12;

  page2.drawText('OPZIONE ALTERNATIVA 3: Cloudflare Pages (La piu veloce al mondo)', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  const cfSteps = [
    'Cloudflare Pages sfrutta la rete Anycast globale con banda illimitata e protezione DDoS di livello enterprise.',
    '1. Accedi a https://dash.cloudflare.com -> Clicca su "Workers & Pages" nel menu a sinistra.',
    '2. Clicca su "Create application" -> Seleziona la scheda "Pages" -> "Connect to Git".',
    '3. Seleziona la repository "tombola-90" e clicca "Begin setup".',
    '4. Impostazioni di Build:',
    '   - Framework preset:  Vite',
    '   - Build command:  npm run build',
    '   - Build output directory:  dist',
    '5. Clicca su "Save and Deploy". Abbiamo gia creato il file "_redirects" per il routing perfetto!',
    '6. Il tuo URL sara tipo: https://tombola-90.pages.dev (certificato SSL immediato).',
  ];
  cfSteps.forEach(st => {
    page2.drawText(st, { x: 40, y, size: 8.5, font: st.startsWith('   -') ? fontMono : fontRegular, color: textDark });
    y -= 14;
  });
  y -= 12;

  page2.drawText('OPZIONE ALTERNATIVA 4: Firebase Hosting (Nativo con il Database)', {
    x: 35,
    y,
    size: 12,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  const fbHostingSteps = [
    'Poiche il tuo database e gia su Firebase, puoi ospitare anche il sito web sullo stesso account gratuito!',
    'Vantaggio: Nessun bisogno di autorizzare nuovi domini perche risiede gia all\'interno di Firebase.',
    'Abbiamo gia creato il file di configurazione "firebase.json" nel progetto. Per distribuirlo:',
    '1. Installa Firebase CLI (se non lo hai):  npm install -g firebase-tools',
    '2. Fai il login:  firebase login',
    '3. Compila il progetto:  npm run build',
    '4. Lancia il deploy:  firebase deploy --only hosting',
    '5. Il sito sara online su: https://agile-lamp-6xq1s.web.app  (oppure .firebaseapp.com)',
  ];
  fbHostingSteps.forEach(st => {
    page2.drawText(st, { x: 40, y, size: 8.5, font: st.includes('firebase') ? fontMono : fontRegular, color: textDark });
    y -= 14;
  });
  y -= 16;

  // Tabella comparativa hosting
  page2.drawText('TABELLA COMPARATIVA DEGLI HOSTING GRATUITI', {
    x: 35,
    y,
    size: 10.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 16;

  page2.drawRectangle({
    x: 35,
    y: y - 80,
    width: 525,
    height: 80,
    color: codeBg,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  const tableRows = [
    'Piattaforma       Costo      Sleep/Standby    Banda Mensile   Configurazione',
    '-----------------------------------------------------------------------------',
    'Render (Static)   0 EUR      MAI (Zero sleep) 100 GB / mese   Facile (render.yaml pronto)',
    'Vercel            0 EUR      MAI (Edge CDN)   100 GB / mese   Automatica (1 Click)',
    'Cloudflare Pages  0 EUR      MAI (Anycast)    ILLIMITATA      Facile (_redirects pronto)',
    'Firebase Hosting  0 EUR      MAI (Google CDN) 10 GB / mese    Nativa (firebase.json pronto)',
  ];

  let tableY = y - 14;
  tableRows.forEach((r, idx) => {
    page2.drawText(r, {
      x: 42,
      y: tableY,
      size: 8,
      font: idx <= 1 ? fontBold : fontMono,
      color: idx === 0 ? darkNavy : textDark,
    });
    tableY -= 13;
  });

  // ==========================================
  // PAGINA 3: FIREBASE DOMINIO, REGOLE & SICUREZZA
  // ==========================================
  let page3 = pdfDoc.addPage([595.28, 841.89]);
  addHeader(page3, 3, 3);
  y = 760;

  page3.drawText('FASE 3: Collegamento Database Firebase per Qualsiasi Hosting Scelto', {
    x: 35,
    y,
    size: 13,
    font: fontBold,
    color: darkNavy,
  });
  y -= 18;

  page3.drawText('Qualunque sia l\'hosting scelto (Render, Vercel o Cloudflare), per permettere la sincronizzazione', {
    x: 35,
    y,
    size: 9.2,
    font: fontRegular,
    color: textDark,
  });
  y -= 13;
  page3.drawText('del Montepremi Non Vinti in tempo reale, devi autorizzare il dominio su Firebase Console:', {
    x: 35,
    y,
    size: 9.2,
    font: fontRegular,
    color: textDark,
  });
  y -= 20;

  const authSteps = [
    '1. Apri il browser e vai su:  https://console.firebase.google.com',
    '2. Seleziona il progetto "agile-lamp-6xq1s".',
    '3. Dal menu laterale sinistro entra in "Authentication" -> Clicca sulla scheda "Settings".',
    '4. Nella sezione "Authorized domains" clicca sul pulsante "Add domain".',
    '5. Inserisci il dominio che hai ottenuto dal tuo hosting, ad esempio:',
    '   - Se usi Render:      tombola-90.onrender.com',
    '   - Se usi Vercel:      tombola-90.vercel.app',
    '   - Se usi Cloudflare:  tombola-90.pages.dev',
    '   (Importante: inserisci solo il dominio, SENZA https:// e senza barre finali).',
    '6. Clicca su "Save".',
    'Da questo istante la console di Regia e il tabellone TV dialogheranno con Firestore senza blocchi!',
  ];

  authSteps.forEach(st => {
    page3.drawText(st, {
      x: 40,
      y,
      size: 8.8,
      font: st.startsWith('   -') ? fontMono : fontRegular,
      color: textDark,
    });
    y -= 14.5;
  });
  y -= 18;

  // Box Istruzioni Regia e Gioco Live
  page3.drawRectangle({
    x: 35,
    y: y - 130,
    width: 525,
    height: 130,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1,
  });

  page3.drawText('COME UTILIZZARE IL SISTEMA QUANDO E ONLINE', {
    x: 45,
    y: y - 18,
    size: 10,
    font: fontBold,
    color: darkNavy,
  });
  page3.drawText('1. Vista Giocatori (Tabellone TV / Schermo Sala):', {
    x: 45,
    y: y - 35,
    size: 9,
    font: fontBold,
    color: textDark,
  });
  page3.drawText('   Apri il link pubblico su Smart TV o proiettore e premi "Modalita TV". Tutti vedranno', {
    x: 45,
    y: y - 48,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  page3.drawText('   le estrazioni con animazione 3D delle tessere, voce Smorfia, countdown circolare e badge premi.', {
    x: 45,
    y: y - 60,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  page3.drawText('2. Vista Regia (Controllo Amministratore):', {
    x: 45,
    y: y - 76,
    size: 9,
    font: fontBold,
    color: textDark,
  });
  page3.drawText('   Apri il sito su un tablet o portatile, clicca su "Regia" in alto, inserisci la password "tombola90".', {
    x: 45,
    y: y - 89,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  page3.drawText('   Dalla Regia gestisci play/pausa, ritmo estrazioni, generazione cartelle A4, loghi TV e la', {
    x: 45,
    y: y - 101,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  page3.drawText('   Cassa Cloud Montepremi Non Vinti (salvataggio, richiamo e storico movimenti).', {
    x: 45,
    y: y - 113,
    size: 8.5,
    font: fontRegular,
    color: textDark,
  });
  y -= 148;

  // Riepilogo finale
  page3.drawText('Progetto verificato con successo: pronto per il caricamento su GitHub e il deploy immediato!', {
    x: 35,
    y,
    size: 9,
    font: fontBold,
    color: green,
  });

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(__dirname, '../public/Guida_Messa_Online_GitHub_Hosting.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Updated PDF created successfully at: ${outputPath} (${pdfBytes.length} bytes)`);
}

createGuidePDF().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
