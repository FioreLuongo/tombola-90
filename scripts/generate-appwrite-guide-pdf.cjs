const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateAppwriteGuidePDF() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Guida Configurazione Appwrite Cloud - Luongo Tombola 90');
  pdfDoc.setAuthor('LUONGO Tombola 90 Italia - Gold Edition');
  pdfDoc.setSubject('Configurazione Passo-Passo Database Appwrite tombola_db (6af8bbbf003dea6b4e91)');
  pdfDoc.setCreator('Luongo Tombola 90 Italia');
  pdfDoc.setProducer('pdf-lib (Standard A4 Compat)');
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const gold = rgb(0.83, 0.68, 0.21);
  const darkNavy = rgb(0.05, 0.08, 0.2);
  const textDark = rgb(0.12, 0.16, 0.23);
  const textMuted = rgb(0.38, 0.43, 0.52);
  const boxBg = rgb(0.98, 0.97, 0.93);
  const codeBg = rgb(0.93, 0.95, 0.98);
  const greenBg = rgb(0.92, 0.98, 0.94);
  const green = rgb(0.06, 0.5, 0.25);
  const red = rgb(0.75, 0.15, 0.15);
  const blue = rgb(0.05, 0.35, 0.72);
  const appwritePink = rgb(0.85, 0.16, 0.38);

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
    page.drawText('GUIDA CONFIGURAZIONE APPWRITE CLOUD', {
      x: width - 255,
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
    page.drawText('Progetto Appwrite: 6af8bbbf003dea6b4e91 | Guida Stampabile A4', {
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
    page.drawRectangle({ x, y: y - 4, width: 22, height: 18, color: darkNavy });
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
      size: 11.5,
      font: fontBold,
      color: darkNavy,
    });
  }

  // =========================================================================
  // PAGINA 1: PARAMETRI PROGETTO, WEB PLATFORM (CORS) & CREAZIONE DATABASE
  // =========================================================================
  const page1 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page1, 1);
  let y = 762;

  page1.drawText('Configurazione Passo-Passo di Appwrite Cloud (In Inglese)', {
    x: 35,
    y,
    size: 16.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 17;
  page1.drawText('Istruzioni esatte per risolvere l\'errore 404 e attivare la sincronizzazione su Appwrite.', {
    x: 35,
    y,
    size: 9.5,
    font: fontRegular,
    color: textMuted,
  });
  y -= 24;

  // Riquadro riepilogo parametri esatti del progetto dell'utente
  page1.drawRectangle({
    x: 35,
    y: y - 122,
    width: 525,
    height: 122,
    color: boxBg,
    borderColor: gold,
    borderWidth: 1.2,
  });
  page1.drawText('PARAMETRI ESATTI DEL TUO PROGETTO APPWRITE (DA COPIARE UGUALI)', {
    x: 45,
    y: y - 16,
    size: 9.5,
    font: fontBold,
    color: darkNavy,
  });

  const summaryRows = [
    ['Console Progetto:', 'https://appwrite.io/projects/6af8bbbf003dea6b4e91/overview'],
    ['API Endpoint:', 'https://fra.cloud.appwrite.io/v1'],
    ['Project ID:', '6af8bbbf003dea6b4e91'],
    ['Database ID:', 'tombola_db   (NON lasciare l\'ID casuale automatico!)'],
    ['Collection / Table ID:', '1) jackpot_bank   2) unclaimed_history   3) regia_config'],
  ];
  let sy = y - 36;
  summaryRows.forEach(([label, val]) => {
    page1.drawText(label, { x: 45, y: sy, size: 8.8, font: fontBold, color: textDark });
    page1.drawText(val, { x: 165, y: sy, size: 8.6, font: fontMono, color: blue });
    sy -= 17;
  });
  y -= 138;

  // Spiegazione errore 404
  page1.drawRectangle({
    x: 35,
    y: y - 48,
    width: 525,
    height: 48,
    color: rgb(1, 0.95, 0.95),
    borderColor: red,
    borderWidth: 0.8,
  });
  page1.drawText('PERCHE\' APPARE "Risorsa Appwrite non trovata (404)"?', {
    x: 45,
    y: y - 16,
    size: 9,
    font: fontBold,
    color: red,
  });
  page1.drawText('Il Project ID (6af8bbbf003dea6b4e91) esiste, ma dentro Appwrite Console non hai ancora creato il Database', {
    x: 45,
    y: y - 30,
    size: 8.3,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('con ID "tombola_db" oppure le 3 Tabelle/Collezioni ("jackpot_bank", "unclaimed_history", "regia_config").', {
    x: 45,
    y: y - 41,
    size: 8.3,
    font: fontRegular,
    color: textDark,
  });
  y -= 66;

  // PASSO 1: Web Platform
  drawSectionBadge(page1, 35, y, 1, 'PASSO 1: AUTORIZZA IL SITO WEB (Platforms -> Web)');
  y -= 20;
  const step1Lines = [
    '1. Apri il tuo progetto Appwrite:  https://appwrite.io/projects/6af8bbbf003dea6b4e91/overview',
    '2. Nella schermata "Overview", scorri fino a "Integrations" / "Platforms" e clicca "+ Add platform".',
    '3. Scegli "Web" (Web App).',
    '4. Nel campo "Name" scrivi:   Tombola 90',
    '5. Nel campo "Hostname" scrivi:   *   (asterisco: autorizza localhost, AI Studio, Render, Vercel, ecc.)',
    '   Se preferisci un dominio specifico, aggiungi poi anche "tombola-90.onrender.com" e "localhost".',
    '6. Clicca "Next" fino al termine ("Create" / "Skip optional steps").',
  ];
  step1Lines.forEach((line) => {
    page1.drawText(line, { x: 40, y, size: 8.7, font: fontRegular, color: textDark });
    y -= 14;
  });
  y -= 14;

  // PASSO 2: Creazione Database
  drawSectionBadge(page1, 35, y, 2, 'PASSO 2: CREA IL DATABASE CON ID "tombola_db"');
  y -= 20;
  const step2Lines = [
    '1. Nel menu laterale sinistro di Appwrite Console, clicca su "Databases".',
    '2. Clicca sul pulsante rosa/blu "Create database".',
    '3. Nel campo "Name" scrivi:   Tombola DB',
    '4. ATTENZIONE AL CAMPO "Database ID" (passaggio fondamentale!):',
    '   Appwrite genera un codice casuale di default. NON lasciarlo casuale!',
    '   Clicca sull\'icona della matita o "Edit" accanto a Database ID e scrivi esattamente:   tombola_db',
    '5. Clicca "Create" per confermare la creazione del database.',
  ];
  step2Lines.forEach((line) => {
    const isWarn = line.includes('ATTENZIONE') || line.includes('tombola_db');
    page1.drawText(line, {
      x: 40,
      y,
      size: 8.7,
      font: isWarn ? fontBold : fontRegular,
      color: line.includes('ATTENZIONE') ? appwritePink : textDark,
    });
    y -= 14;
  });

  // Nota terminologia Appwrite
  y -= 12;
  page1.drawRectangle({
    x: 35,
    y: y - 46,
    width: 525,
    height: 46,
    color: codeBg,
    borderColor: blue,
    borderWidth: 0.8,
  });
  page1.drawText('NOTA INTERFACCIA APPWRITE (TABLES vs COLLECTIONS)', {
    x: 45,
    y: y - 15,
    size: 8.8,
    font: fontBold,
    color: blue,
  });
  page1.drawText('Nelle versioni recenti di Appwrite Cloud i termini "Collection / Attributes / Documents" possono chiamarsi', {
    x: 45,
    y: y - 28,
    size: 8.2,
    font: fontRegular,
    color: textDark,
  });
  page1.drawText('"Table / Columns / Rows". I passaggi, gli ID e i tipi dei dati da inserire a Pagina 2 sono identici!', {
    x: 45,
    y: y - 40,
    size: 8.2,
    font: fontRegular,
    color: textDark,
  });

  // =========================================================================
  // PAGINA 2: LE 3 COLLEZIONI / TABELLE E GLI ATTRIBUTI ESATTI
  // =========================================================================
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page2, 2);
  y = 762;

  drawSectionBadge(page2, 35, y, 3, 'PASSO 3: CREA LE 3 TABELLE / COLLEZIONI E LE COLONNE (ATTRIBUTES)');
  y -= 18;
  page2.drawText('Dentro il database "tombola_db", clicca "Create table" (o "Create collection") per ognuna delle 3 schede.', {
    x: 35,
    y,
    size: 8.8,
    font: fontRegular,
    color: textMuted,
  });
  y -= 14;
  page2.drawText('IMPORTANTE: imposta sempre l\'ID manuale con la matita (es. jackpot_bank), NON lasciare ID casuali! Rispetta maiuscole/minuscole.', {
    x: 35,
    y,
    size: 8.3,
    font: fontBold,
    color: red,
  });
  y -= 20;

  function drawSchemaTable(title, tableId, rows) {
    const headerH = 22;
    const rowH = 16;
    const totalH = headerH + 18 + rows.length * rowH + 8;

    page2.drawRectangle({
      x: 35,
      y: y - totalH,
      width: 525,
      height: totalH,
      color: rgb(1, 1, 1),
      borderColor: gold,
      borderWidth: 1,
    });
    page2.drawRectangle({
      x: 35,
      y: y - headerH,
      width: 525,
      height: headerH,
      color: darkNavy,
    });
    page2.drawText(title, { x: 44, y: y - 15, size: 9.5, font: fontBold, color: rgb(1, 1, 1) });
    page2.drawText(`ID esatto: ${tableId}`, { x: 355, y: y - 15, size: 9.5, font: fontMono, color: gold });

    let ry = y - headerH - 14;
    page2.drawText('Nome Colonna / Key', { x: 44, y: ry, size: 8, font: fontBold, color: textMuted });
    page2.drawText('Tipo (Type)', { x: 205, y: ry, size: 8, font: fontBold, color: textMuted });
    page2.drawText('Size', { x: 295, y: ry, size: 8, font: fontBold, color: textMuted });
    page2.drawText('Required', { x: 355, y: ry, size: 8, font: fontBold, color: textMuted });
    page2.drawText('Default Value', { x: 425, y: ry, size: 8, font: fontBold, color: textMuted });

    ry -= 6;
    page2.drawLine({
      start: { x: 40, y: ry },
      end: { x: 555, y: ry },
      thickness: 0.6,
      color: rgb(0.85, 0.88, 0.93),
    });

    ry -= 12;
    rows.forEach((r, idx) => {
      if (idx % 2 === 1) {
        page2.drawRectangle({ x: 36, y: ry - 4, width: 523, height: rowH, color: codeBg });
      }
      page2.drawText(r[0], { x: 44, y: ry, size: 8.5, font: fontMono, color: blue });
      page2.drawText(r[1], { x: 205, y: ry, size: 8.5, font: fontBold, color: textDark });
      page2.drawText(r[2], { x: 295, y: ry, size: 8.5, font: fontRegular, color: textDark });
      page2.drawText(r[3], { x: 355, y: ry, size: 8.5, font: fontRegular, color: textDark });
      page2.drawText(r[4], { x: 425, y: ry, size: 8.5, font: fontRegular, color: textMuted });
      ry -= rowH;
    });

    y -= totalH + 14;
  }

  drawSchemaTable('1) TABELLA CASSA MONTEPREMI', 'jackpot_bank', [
    ['accumulatedUnclaimed', 'Float', '-', 'No (o Yes)', '0'],
    ['currentGameUnclaimed', 'Float', '-', 'No', '0'],
    ['currency', 'String', '8', 'No', 'EUR / € (lascia vuoto o €)'],
    ['lastUpdated', 'String', '40', 'No', '(lascia vuoto)'],
    ['totalGamesRecorded', 'Integer', '-', 'No', '0'],
  ]);

  drawSchemaTable('2) TABELLA STORICO MOVIMENTI', 'unclaimed_history', [
    ['timestamp', 'String', '40', 'Yes', '-'],
    ['gameId', 'String', '64', 'Yes', '-'],
    ['type', 'String', '32', 'Yes', '-'],
    ['amount', 'Float', '-', 'Yes', '-'],
    ['balanceAfter', 'Float', '-', 'Yes', '-'],
    ['prizeCategory', 'String', '64', 'No', 'all'],
    ['note', 'String', '250', 'No', '(lascia vuoto)'],
  ]);

  drawSchemaTable('3) TABELLA CONFIGURAZIONE REGIA', 'regia_config', [
    ['activeProfileId', 'String', '64', 'Yes', '-'],
    ['payloadJson', 'String', '4000', 'Yes', '-'],
    ['updatedAt', 'String', '40', 'Yes', '-'],
  ]);

  page2.drawRectangle({
    x: 35,
    y: y - 42,
    width: 525,
    height: 42,
    color: boxBg,
    borderColor: gold,
    borderWidth: 0.9,
  });
  page2.drawText('SUGGERIMENTO: ATTENDI LO STATO "Available" SU TUTTE LE COLONNE', {
    x: 45,
    y: y - 15,
    size: 8.8,
    font: fontBold,
    color: darkNavy,
  });
  page2.drawText('Dopo aver aggiunto le colonne (Columns / Attributes), attendi 2-3 secondi che lo stato diventi "Available" (verde)', {
    x: 45,
    y: y - 28,
    size: 8.2,
    font: fontRegular,
    color: textDark,
  });
  page2.drawText('prima di passare al Passo 4 (Permessi) a Pagina 3.', {
    x: 45,
    y: y - 38,
    size: 8.2,
    font: fontRegular,
    color: textDark,
  });

  // =========================================================================
  // PAGINA 3: PERMESSI "Any", TEST IN REGIA & RISOLUZIONE ERRORI
  // =========================================================================
  const page3 = pdfDoc.addPage([595.28, 841.89]);
  addHeaderFooter(page3, 3);
  y = 762;

  drawSectionBadge(page3, 35, y, 4, 'PASSO 4: IMPOSTA I PERMESSI SU TUTTE E 3 LE TABELLE (OBBLIGATORIO)');
  y -= 20;
  const permLines = [
    'Senza i permessi pubblici abilitati, Appwrite risponde con Errore 401/403. Esegui questi passaggi su',
    'TUTTE E 3 le tabelle ("jackpot_bank", "unclaimed_history" e "regia_config"):',
    '  1. Apri la tabella -> clicca sulla scheda "Settings" in alto.',
    '  2. Scorri fino alla sezione "Permissions".',
    '  3. Clicca "+ Add role" -> scegli "Any" (All guests and users).',
    '  4. Spunta le caselle:  [x] Create   [x] Read   [x] Update   (opzionale: Delete).',
    '  5. Clicca sul pulsante "Update" in basso a destra per salvare i permessi.',
    '  * Nota sicurezza: se invece vuoi usare il ruolo "Users", vai su Auth -> Settings -> abilita "Anonymous"',
    '    e spunta "Attiva Sessione Anonima Appwrite" nella modale Dual-DB di Tombola 90.',
  ];
  permLines.forEach((line, i) => {
    page3.drawText(line, {
      x: 40,
      y,
      size: 8.7,
      font: i === 1 || line.includes('Create') ? fontBold : fontRegular,
      color: line.includes('Create') ? green : textDark,
    });
    y -= 14.5;
  });
  y -= 12;

  drawSectionBadge(page3, 35, y, 5, 'PASSO 5: COLLEGA E VERIFICA IN CONSOLE REGIA');
  y -= 20;
  const connectLines = [
    '1. Apri LUONGO TOMBOLA 90 ITALIA -> entra nella "Console Regia".',
    '2. Nel box "Cassa Cloud Montepremi Non Vinti", clicca il pulsante "Dual-DB".',
    '3. Controlla che i 6 campi contengano esattamente:',
    '   - API Endpoint Appwrite:            https://fra.cloud.appwrite.io/v1',
    '   - Project ID Appwrite:              6af8bbbf003dea6b4e91',
    '   - Database ID Appwrite:             tombola_db',
    '   - Collection ID Cassa Montepremi:  jackpot_bank',
    '   - Collection ID Storico Movimenti:  unclaimed_history',
    '   - Collection ID Configurazione:     regia_config',
    '4. Clicca "Salva & Connetti Appwrite".',
  ];
  connectLines.forEach((line) => {
    const isCode = line.startsWith('   - ');
    page3.drawText(line, {
      x: 40,
      y,
      size: isCode ? 8.3 : 8.8,
      font: isCode ? fontMono : fontRegular,
      color: isCode ? blue : textDark,
    });
    y -= 14;
  });

  y -= 6;
  page3.drawRectangle({
    x: 35,
    y: y - 38,
    width: 525,
    height: 38,
    color: greenBg,
    borderColor: green,
    borderWidth: 1,
  });
  page3.drawText('RISULTATO ATTESO: TUTTI E 3 I DATABASE CONNESSI IN TEMPO REALE', {
    x: 45,
    y: y - 15,
    size: 9.2,
    font: fontBold,
    color: green,
  });
  page3.drawText('[OK] Firebase Firestore: Connesso   |   [OK] Server DB Integrato: Attivo   |   [OK] Appwrite: Connesso', {
    x: 45,
    y: y - 29,
    size: 8.6,
    font: fontBold,
    color: textDark,
  });
  y -= 58;

  // Troubleshooting table
  page3.drawText('RISOLUZIONE RAPIDA EVENTUALI ERRORI (TROUBLESHOOTING)', {
    x: 35,
    y,
    size: 10.5,
    font: fontBold,
    color: darkNavy,
  });
  y -= 14;

  const errs = [
    ['Errore 404 (Database not found)', 'Il Database su Appwrite ha un ID casuale invece di "tombola_db". Crealo impostando ID = tombola_db.'],
    ['Errore 404 (Collection/Table)', 'Manca una delle 3 tabelle o l\'ID non corrisponde esattamente (jackpot_bank / unclaimed_history / regia_config).'],
    ['Errore 401 / 403 (Permessi)', 'Hai dimenticato il ruolo "Any" con Create + Read + Update nella scheda Settings -> Permissions della tabella.'],
    ['Errore 400 (Invalid structure)', 'Nome colonna errato (es. tutto minuscolo invece di accumulatedUnclaimed) o campo Required lasciato vuoto.'],
    ['Errore CORS / Network Error', 'Aggiungi Platform -> Web -> Hostname "*" in Appwrite Console -> Overview -> Platforms.'],
  ];

  errs.forEach(([errCode, fix]) => {
    page3.drawRectangle({
      x: 35,
      y: y - 30,
      width: 525,
      height: 28,
      color: codeBg,
      borderColor: rgb(0.84, 0.87, 0.92),
      borderWidth: 0.6,
    });
    page3.drawText(errCode, { x: 42, y: y - 12, size: 8.3, font: fontBold, color: red });
    page3.drawText(fix, { x: 42, y: y - 24, size: 8, font: fontRegular, color: textDark });
    y -= 33;
  });

  // useObjectStreams: false garantisce tabelle xref classiche compatibili con tutti i lettori PDF / Adobe Acrobat
  const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
  const outPath = path.resolve(__dirname, '../public/Guida_Configurazione_Appwrite_Tombola90.pdf');
  fs.writeFileSync(outPath, pdfBytes);

  const tsOutPath = path.resolve(__dirname, '../src/appwrite-guide-pdf-data.ts');
  const base64Data = Buffer.from(pdfBytes).toString('base64');
  fs.writeFileSync(
    tsOutPath,
    `// File generato automaticamente da scripts/generate-appwrite-guide-pdf.cjs\nexport const APPWRITE_GUIDE_PDF_BASE64 = "${base64Data}";\n`
  );

  console.log(`PDF Appwrite generato con successo in: ${outPath} (${pdfBytes.length} bytes, ${totalPages} pagine) e Base64 TS in: ${tsOutPath}`);
}

generateAppwriteGuidePDF().catch((err) => {
  console.error('Errore generazione PDF Appwrite:', err);
  process.exit(1);
});
