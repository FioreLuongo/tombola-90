# 🎲 LUONGO TOMBOLA 90 ITALIA - GOLD EDITION

Edizione Gold di lusso per **Luongo Tombola 90 Italia** con tabellone TV studio, animazione 3D estrazioni, generatore cartelle A4 (4 colori), Intelligenza Estrazioni, Smorfia Napoletana, Console Regia e **Database Cloud Firebase Firestore** per i Montepremi Non Vinti (Rollover Jackpot).

---

## 🔑 Credenziali, Password & Database

- **Password Console Regia:** `tombola90` (oppure `admin`)
- **Database Cloud:** Google Cloud Firebase Firestore (NoSQL)
- **ID Database Firestore:** `ai-studio-luongotombola90i-7d9a7964-caed-43e3-a2ea-3f12d876f720`
- **Progetto Firebase:** `agile-lamp-6xq1s`
- **Costi di Hosting & Database:** **0,00 € (100% Free Forever con GitHub + Render / Vercel / Cloudflare + Firebase Spark)**

---

## 🚀 FASE 1: Inviare il Progetto su GitHub (Passo Comune)

1. Accedi a [GitHub](https://github.com) (crea un account gratuito se non ne hai uno).
2. Clicca su **"+"** in alto a destra ➔ **"New repository"**.
3. Assegna il nome `tombola-90`, seleziona **Public** e clicca su **"Create repository"** (non spuntare "Add README").
4. Esegui questi comandi nel terminale del tuo progetto:

```bash
git add .
git commit -m "Luongo Tombola 90 Italia Gold Edition"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/tombola-90.git
git push -u origin main
```
*(Sostituisci `TUO-USERNAME` con il tuo nome utente di GitHub).*

---

## 🌐 FASE 2: Scegli il Tuo Hosting Gratuito Preferito

### 🟢 OPZIONE A: RENDER (Consigliato - 100% Free & Zero Sleep)

Render è un hosting cloud di livello professionale. Usiamo la tipologia **Static Site**, che su Render è **completamente gratuita per sempre e non va mai in standby/sleep**!

1. Accedi a **[render.com](https://render.com)** cliccando su **"Get Started"** ➔ **"GitHub"**.
2. Dalla dashboard clicca in alto a destra su **"+ New"** ➔ seleziona **"Static Site"**.
3. Clicca **"Connect"** accanto al repository `tombola-90`.
4. Inserisci questi parametri:
   - **Name:** `tombola-90`
   - **Branch:** `main`
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`
5. *(Opzionale - Regola SPA)*: Abbiamo già incluso il file `render.yaml` nel progetto che imposta automaticamente il rewrite `/*` ➔ `/index.html`.
6. Clicca su **"Create Static Site"**.
7. In circa 1 minuto il tuo sito sarà online con HTTPS su:
   `https://tombola-90.onrender.com`

---

### ⚡ OPZIONE B: VERCEL (1-Click Deploy)

1. Accedi a **[vercel.com](https://vercel.com)** con GitHub.
2. Dalla dashboard clicca su **"Add New..."** ➔ **"Project"**.
3. Clicca **"Import"** accanto alla tua repository `tombola-90`.
4. Vercel rileverà automaticamente Vite (`npm run build`, output: `dist`).
5. Clicca **"Deploy"**.
6. Il sito sarà attivo in 30 secondi su:
   `https://tombola-90.vercel.app`

---

### 🛡️ OPZIONE C: CLOUDFLARE PAGES (Velocità Record & Banda Illimitata)

1. Accedi a **[dash.cloudflare.com](https://dash.cloudflare.com)**.
2. Nel menu a sinistra clicca su **"Workers & Pages"** ➔ scheda **"Pages"** ➔ **"Connect to Git"**.
3. Seleziona `tombola-90` e clicca **"Begin setup"**.
4. Impostazioni:
   - **Framework:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Clicca **"Save and Deploy"** (il file `public/_redirects` è già incluso nel progetto).
6. Il sito sarà online su `https://tombola-90.pages.dev`.

---

### 🔥 OPZIONE D: FIREBASE HOSTING (Nativo nello stesso account Google)

Poiché il database è già su Firebase, puoi pubblicare anche il sito web direttamente con Google Firebase Hosting:

```bash
npm install -g firebase-tools
firebase login
npm run build
firebase deploy --only hosting
```
*(Il file `firebase.json` è già preconfigurato nel progetto).*

---

## 🔒 FASE 3: Autorizzare il Dominio su Firebase Console

Qualunque hosting tu abbia scelto (Render, Vercel o Cloudflare), per consentire al database di sincronizzare i dati:

1. Apri la **[Console Firebase](https://console.firebase.google.com)** e seleziona il progetto **`agile-lamp-6xq1s`**.
2. Nel menu a sinistra vai su **Authentication** ➔ scheda **Settings** ➔ **Authorized domains** *(Domini autorizzati)*.
3. Clicca **"Add domain"** e aggiungi il tuo dominio:
   - Se usi Render: `tombola-90.onrender.com`
   - Se usi Vercel: `tombola-90.vercel.app`
   - Se usi Cloudflare: `tombola-90.pages.dev`
4. Clicca su **Salva**. Il database Firestore è ora attivo e perfettamente sincronizzato!

---

## 📄 Guida Ufficiale in PDF

Una guida illustrata di 3 pagine è disponibile all'interno del progetto:
- Percorso: `public/Guida_Messa_Online_GitHub_Hosting.pdf`
- Oppure scaricabile dal pulsante blu **"Guida Online (PDF)"** nella barra superiore della Console Regia.
