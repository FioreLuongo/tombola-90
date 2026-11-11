function startTombolaApp() {
    // ===== VARIABILI GLOBALI =====
    let extractedNumbers =[];
    let countdownInterval;
    let currentTimer = 5;
    let isRunning = false;
    let remainingTime = currentTimer;
    let startTime = null;
    let gameTimerInterval;
    let gameSeconds = 0;
    let extractionCount = 0;
    let extractionStartTime = null;
    let lastExtractionTime = null;
    let extractionsPerMinute = 0;
    let audioEnabled = true;
    let sharedAudioCtx = null;
    let speechSynthesis = window.speechSynthesis;
    let speechSupported = false;
    let cartelleGameId = "TOM001";
    let generatedCartelle =[];
    let isPausedForWin = false;
    let aiIntelligenceEnabled = true;

    // ===== VARIABILI PER IL NUMERO GOLD =====
    let numeroGold = null;
    let goldWon = false;
    let goldExpired = false;
    let goldWinningCartella = null;

    // ===== NUOVA VARIABILE PER IL MONTE PREMI NON VINTI =====
    let unclaimedGoldTotal = 0;

    // ===== CONFIGURAZIONE SOGLIE SCADENZA PREMI (BOX A REGIA) =====
    const prizeDelaysConfig = {
        gold: { max: 25, expired: false, potShare: 0.05, label: 'Numero Gold' },
        ambo: { max: 20, expired: false, potShare: 0.05, label: 'Ambo' },
        terno: { max: 35, expired: false, potShare: 0.10, label: 'Terno' },
        quaterna: { max: 50, expired: false, potShare: 0.15, label: 'Quaterna' },
        cinquina: { max: 65, expired: false, potShare: 0.20, label: 'Cinquina' },
        tombola: { max: 85, expired: false, potShare: 0.45, label: 'Tombola' }
    };

    // ===== ALGORITMO DIFFICOLTÀ VINCITE / ANTI-VINCITA (BOX B REGIA) =====
    const antiWinDifficultyConfig = {
        enabled: true,
        level: 'high', // 'high', 'medium', 'normal', 'random'
        forcedMin: {
            ambo: 15,
            terno: 28,
            quaterna: 42,
            cinquina: 58,
            tombola: 75
        },
        monitoredCardsCount: 0,
        blockedNumbersCount: 0,
        difficultyIndex: 88
    };

    // ===== CONFIGURAZIONE GESTIONE VINCITE (AUTO-RIPRESA & LIVE) =====
    let winHandlingMode = localStorage.getItem('tombola_win_handling_mode') || 'autoresume_5';
    let wasAutoRunningBeforeWin = false;
    let winAutoResumeInterval = null;
    let winAutoResumeSecondsLeft = 5;
    let isWinPausedManually = false;


    // ===== CRITTOGRAFIA SHA-256 ACCESSO REGIA AMMINISTRATORE =====
    // Verifica crittografica SHA-256: nessuna credenziale in chiaro presente nel sorgente
    const REGIA_ADMIN_HASH = "0963b527665a0b16ee41b216670054f97bf79d2da5cda69104f64bd1fa5fc042";

    async function computeSha256(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const buffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function isRegiaAdminAuthenticated() {
        return sessionStorage.getItem('regia_admin_auth') === 'true';
    }

    // AI Advanced Data
    let aiAdvancedData = {
        lastAnalysis: null,
        cartelleAnalysis: {},
        coverageIndex: 0,
        extractionHistory:[],
        distributionMap: {},
        cartellaProgress: {},
        winPrediction: {},
        colorDistribution: {},
        extractionSequence: [],
        optimalExtractions:[],
        winDelay: {
            ambo: { targetExtractions: 0, currentDelay: 0 },
            terno: { targetExtractions: 0, currentDelay: 0 },
            quaterna: { targetExtractions: 0, currentDelay: 0 },
            cinquina: { targetExtractions: 0, currentDelay: 0 },
            tombola: { targetExtractions: 0, currentDelay: 0 }
        }
    };

    let cartelleWins = {
        gold: { won: false, cartellaId: null, number: null, winCount: 0 },
        ambo: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
        terno: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
        quaterna: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
        cinquina: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
        tombola: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, gameEnded: false, winCount: 0, preventedCount: 0 }
    };

    let winningNumbersByCartella = {};
    let activeColorSheets = { blue: [], orange: [], green: [], yellow:[] };
    let participatingGiocatori = 0;

    let gameStats = {
        startTime: null, endTime: null, totalExtractions: 0, extractedNumbers: [],
        remainingNumbers:[], durationSeconds: 0, winStats: { gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0 },
        extractionSpeed: 0, gameId: "TOM001", activeCards: 0, extractionFrequency: 0,
        extractionDensity: { low: 0, mid: 0, high: 0, display: '0/0/0%' },
        reactionTimes:[], numberDistribution: {}, hotSequences: 0, coldSequences: 0,
        tensDistribution: {}, extractionEfficiency: 0, lastWinTime: null,
        colorStats: {
            blue: { cartelle: 0, active: 0, gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0, totalWins: 0 },
            orange: { cartelle: 0, active: 0, gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0, totalWins: 0 },
            green: { cartelle: 0, active: 0, gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0, totalWins: 0 },
            yellow: { cartelle: 0, active: 0, gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0, totalWins: 0 }
        },
        prizeStats: { totalPrize: 0, goldPrize: 0, amboPrize: 0, ternoPrize: 0, quaternaPrize: 0, cinquinaPrize: 0, tombolaPrize: 0, currency: "€" }
    };

    let allNumbers = Array.from({length: 90}, (_, i) => i + 1);
    let voiceEnabled = true;

    const numberWords = {
        it: {},
        en: {
            1:"one",2:"two",3:"three",4:"four",5:"five",6:"six",7:"seven",8:"eight",9:"nine",10:"ten",
            11:"eleven",12:"twelve",13:"thirteen",14:"fourteen",15:"fifteen",16:"sixteen",17:"seventeen",18:"eighteen",19:"nineteen",20:"twenty",
            21:"twenty-one",22:"twenty-two",23:"twenty-three",24:"twenty-four",25:"twenty-five",26:"twenty-six",27:"twenty-seven",28:"twenty-eight",29:"twenty-nine",30:"thirty",
            31:"thirty-one",32:"thirty-two",33:"thirty-three",34:"thirty-four",35:"thirty-five",36:"thirty-six",37:"thirty-seven",38:"thirty-eight",39:"thirty-nine",40:"forty",
            41:"forty-one",42:"forty-two",43:"forty-three",44:"forty-four",45:"forty-five",46:"forty-six",47:"forty-seven",48:"forty-eight",49:"forty-nine",50:"fifty",
            51:"fifty-one",52:"fifty-two",53:"fifty-three",54:"fifty-four",55:"fifty-five",56:"fifty-six",57:"fifty-seven",58:"fifty-eight",59:"fifty-nine",60:"sixty",
            61:"sixty-one",62:"sixty-two",63:"sixty-three",64:"sixty-four",65:"sixty-five",66:"sixty-six",67:"sixty-seven",68:"sixty-eight",69:"sixty-nine",70:"seventy",
            71:"seventy-one",72:"seventy-two",73:"seventy-three",74:"seventy-four",75:"seventy-five",76:"seventy-six",77:"seventy-seven",78:"seventy-eight",79:"seventy-nine",80:"eighty",
            81:"eighty-one",82:"eighty-two",83:"eighty-three",84:"eighty-four",85:"eighty-five",86:"eighty-six",87:"eighty-seven",88:"eighty-eight",89:"eighty-nine",90:"ninety"
        }
    };

    const translations = {
        it: {
            appTitle: "LUONGO Tombola 90 Italia - GOLD EDITION", navHome: "Home", navCards: "Cartelle", fullscreenText: "Schermo intero", themeLight: "Light", themeDark: "Dark",
            extractedNumberTitle: "Numero Estratto", lastNumbersTitle: "Ultimi 5", prizePoolTitle: "Montepremi", goldText: "Numero Gold", amboText: "Ambo", ternoText: "Terno",
            quaternaText: "Quaterna", cinquinaText: "Cinquina", tombolaText: "Tombola", winsTitle: "Vincite", winGoldText: "Gold:",
            winAmboText: "Ambo:", winTernoText: "Terno:", winQuaternaText: "Quaterna:", winCinquinaText: "Cinquina:", winTombolaText: "Tombola:", countdownTitle: "Countdown", playText: "Play",
            pauseText: "Pausa", extractText: "Estrai", resetText: "Reset", popupTitle: "Tombola Completata!", popupMessage: "Tutti i 90 numeri sono stati estratti. Congratulazioni!",
            audioOn: "Audio ON", audioOff: "Audio OFF", smorfiaFallback: "Significato non disponibile", cartelleTitle: "Generatore Cartelle Tombola 90",
            generateText: "Genera Cartelle", exportText: "Esporta PDF", exportJsonText: "Esporta JSON", importJsonText: "Importa JSON",
            resetCartelleText: "Reset Cartelle", closeText: "Chiudi", gameIdLabel: "ID Gioco:", numGiocatoriLabel: "Numero Giocatori:",
            startSheetLabel: "Foglio Iniziale:", participatingGiocatoriLabel: "Giocatori Partecipanti:", importJsonTitle: "Importa Cartelle da JSON",
            confirmImportText: "Importa Cartelle", totalCartelleLabel: "Cartelle Totali", totalFogliLabel: "Fogli Totali", totalGiocatoriLabel: "Giocatori",
            totalParticipatingLabel: "Partecipanti", winNotificationGold: "NUMERO GOLD ESTRATTO!", winNotificationGoldExpired: "NUMERO GOLD SCADUTO! Il premio è stato accantonato.",
            winNotificationAmbo: "AMBO VINTO!", winNotificationTerno: "TERNO VINTO!",
            winNotificationQuaterna: "QUATERNA VINTA!", winNotificationCinquina: "CINQUINA VINTA!", winNotificationTombola: "TOMBOLA VINTA!", boxATitle: "Numero Gold",
            boxBTitle: "Colore Cartelle", colorBlue: "Blue", colorOrange: "Orange", colorGreen: "Green", colorYellow: "Yellow", extractedLabel: "Estratti:",
            remainingLabel: "Rimanenti:", progressLabel: "Progresso:", hoursLabel: "Ore", minutesLabel: "Minuti", secondsLabel: "Secondi", langIT: "IT", langEN: "EN",
            themeLightText: "Light", themeDarkText: "Dark", jackpotTitle: "Ultima Vincente", tombolaItaliaText: "Tombola Italia",
            winDetailsText: "Dettagli:", currencyEuro: "€", currencyPound: "£", currencyDollar: "$", statsText: "Statistiche", tvModeText: "Modalità TV",
            voiceText: "Voce", statsTitle: "Statistiche Partita", aiIntelligenceText: "Intelligenza Estrazioni", aiStatusActive: "Intelligenza Estrazioni: ATTIVA",
            aiStatusInactive: "Intelligenza Estrazioni: DISATTIVATA", aiAnalysisTitle: "Analisi Intelligenza Estrazioni V12.3.3", cartelleListTitle: "Lista Numeri Cartelle",
            cartelleListSubtitle: "Attiva/Disattiva i fogli per il gioco.", noCartelleMessage: "Genera le cartelle per visualizzare la lista dei numeri",
            toggleAll: "Attiva/Disattiva Tutti", activeSheets: "Fogli Attivi", sheet: "Foglio", player: "Giocatore", cartelleInSheet: "Cartelle nel foglio",
            active: "Attivo", inactive: "Inattivo", unclaimedPotTitle: "Montepremi Non Vinti"
        },
        en: {
            appTitle: "LUONGO Tombola 90 Italia - GOLD EDITION", navHome: "Home", navCards: "Cards", fullscreenText: "Fullscreen", themeLight: "Light", themeDark: "Dark",
            extractedNumberTitle: "Extracted Number", lastNumbersTitle: "Last 5", prizePoolTitle: "Prize Pool", goldText: "Gold Number", amboText: "Ambo", ternoText: "Terno",
            quaternaText: "Quaterna", cinquinaText: "Cinquina", tombolaText: "Tombola", winsTitle: "Wins", winGoldText: "Gold:",
            winAmboText: "Ambo:", winTernoText: "Terno:", winQuaternaText: "Quaterna:", winCinquinaText: "Cinquina:", winTombolaText: "Tombola:", countdownTitle: "Countdown", playText: "Play",
            pauseText: "Pause", extractText: "Extract", resetText: "Reset", popupTitle: "Tombola Completed!", popupMessage: "All 90 numbers have been extracted. Congratulations!",
            audioOn: "Audio ON", audioOff: "Audio OFF", smorfiaFallback: "Meaning not available", cartelleTitle: "Tombola 90 Cards Generator",
            generateText: "Generate Cards", exportText: "Export PDF", exportJsonText: "Export JSON", importJsonText: "Import JSON",
            resetCartelleText: "Reset Cards", closeText: "Close", gameIdLabel: "Game ID:", numGiocatoriLabel: "Number of Players:",
            startSheetLabel: "Starting Sheet:", participatingGiocatoriLabel: "Participating Players:", importJsonTitle: "Import Cards from JSON",
            confirmImportText: "Import Cards", totalCartelleLabel: "Total Cards", totalFogliLabel: "Total Sheets", totalGiocatoriLabel: "Players",
            totalParticipatingLabel: "Participants", winNotificationGold: "GOLD NUMBER EXTRACTED!",
            winNotificationGoldExpired: "GOLD NUMBER EXPIRED! The prize has been set aside.",
            winNotificationAmbo: "AMBO WON!", winNotificationTerno: "TERNO WON!",
            winNotificationQuaterna: "QUATERNA WON!", winNotificationCinquina: "CINQUINA WON!", winNotificationTombola: "TOMBOLA WON!", boxATitle: "Gold Number",
            boxBTitle: "Card Colors", colorBlue: "Blue", colorOrange: "Orange", colorGreen: "Green", colorYellow: "Yellow", extractedLabel: "Extracted:",
            remainingLabel: "Remaining:", progressLabel: "Progress:", hoursLabel: "Hours", minutesLabel: "Minutes", secondsLabel: "Seconds", langIT: "IT", langEN: "EN",
            themeLightText: "Light", themeDarkText: "Dark", jackpotTitle: "Last Winner", tombolaItaliaText: "Tombola Italia",
            winDetailsText: "Details:", currencyEuro: "€", currencyPound: "£", currencyDollar: "$", statsText: "Statistics", tvModeText: "TV Mode",
            voiceText: "Voice", statsTitle: "Game Statistics", aiIntelligenceText: "Extraction Intelligence", aiStatusActive: "Extraction Intelligence: ACTIVE",
            aiStatusInactive: "Extraction Intelligence: INACTIVE", aiAnalysisTitle: "Extraction Intelligence Analysis V12.3.3", cartelleListTitle: "Card Numbers List",
            cartelleListSubtitle: "Activate/Deactivate sheets for the game.", noCartelleMessage: "Generate cards to view the numbers list",
            toggleAll: "Toggle All", activeSheets: "Active Sheets", sheet: "Sheet", player: "Player", cartelleInSheet: "Cards in sheet",
            active: "Active", inactive: "Inactive", unclaimedPotTitle: "Unclaimed Prize Pool"
        }
    };

    
    const smorfiaItaliana = {
        1: "L'Italia", 2: "La bambina", 3: "La gatta", 4: "Il maiale", 5: "La mano",
        6: "Quella che guarda in terra", 7: "Il fucile", 8: "La Madonna", 9: "La prole", 10: "I fagioli",
        11: "I topi", 12: "I soldati", 13: "Sant'Antonio", 14: "L'ubriaco", 15: "Il ragazzo",
        16: "Il fondoschiena", 17: "La disgrazia", 18: "Il sangue", 19: "La risata", 20: "La festa",
        21: "La donna", 22: "Il pazzo", 23: "Lo scemo", 24: "Le guardie", 25: "Natale",
        26: "La piccola Anna", 27: "Il pitale", 28: "Il seno", 29: "Il padre dei bambini", 30: "Le palle del tenente",
        31: "Il padrone di casa", 32: "Il capitone", 33: "Gli anni di Cristo", 34: "La testa", 35: "L'uccellino",
        36: "Le nacchere", 37: "Il monaco", 38: "Le bastonate", 39: "La corda al collo", 40: "La noia",
        41: "Il coltello", 42: "Il caffè", 43: "La donna al balcone", 44: "Le carceri", 45: "Il buon vino",
        46: "Il denaro", 47: "Il morto", 48: "Il morto che parla", 49: "Il pezzo di carne", 50: "Il pane",
        51: "Il giardino", 52: "La mamma", 53: "Il vecchio", 54: "Il cappello", 55: "La musica",
        56: "La caduta", 57: "Il gobbo", 58: "Il pacco", 59: "I peli", 60: "Il lamento",
        61: "Il cacciatore", 62: "Il morto ammazzato", 63: "La sposa", 64: "La giacca", 65: "Il pianto",
        66: "Le due zitelle", 67: "Il totano nella chitarra", 68: "La minestra cotta", 69: "Sottosopra", 70: "Il palazzo",
        71: "L'uomo di poco valore", 72: "La meraviglia", 73: "L'ospedale", 74: "La grotta", 75: "Pulcinella",
        76: "La fontana", 77: "I diavoletti", 78: "La bella ragazza", 79: "Il ladro", 80: "La bocca",
        81: "I fiori", 82: "La tavola imbandita", 83: "Il maltempo", 84: "La chiesa", 85: "Le anime del purgatorio",
        86: "La bottega", 87: "I pidocchi", 88: "I caciocavalli", 89: "La vecchia", 90: "La paura"
    };

    const smorfiaNapolitana = {
        1: "L'Italia", 2: "'A criatura", 3: "'A jatta", 4: "'O puorco", 5: "'A mano",
        6: "Chella che guarda 'nterra", 7: "'A scuppetta", 8: "'A maronna", 9: "'A figliata", 10: "'E fasule",
        11: "'E surice", 12: "'E surdate", 13: "Sant'Antonio", 14: "'O mbriaco", 15: "'O guaglione",
        16: "'O culo", 17: "'A disgrazia", 18: "'O sanghe", 19: "'A resata", 20: "'A festa",
        21: "'A femmena", 22: "'O pazzo", 23: "'O scemo", 24: "'E gguardie", 25: "Natale",
        26: "Nanninella", 27: "'O cantero", 28: "'E zzizze", 29: "'O pate d''e criature", 30: "'E ppalle d''o tenente",
        31: "'O padrone 'e casa", 32: "'O capitone", 33: "L'anne 'e Cristo", 34: "'A capa", 35: "L'aucelluzzo",
        36: "'E castagnelle", 37: "'O monaco", 38: "'E mmazzate", 39: "'A funa 'nganna", 40: "'A paposcia",
        41: "'O curtiello", 42: "'O ccafè", 43: "'A femmena 'nganna", 44: "'E ccancelle", 45: "'O vino buono",
        46: "'E denare", 47: "'O muorto", 48: "'O muorto che parla", 49: "'O piezzo 'e carne", 50: "'O ppane",
        51: "'O ciardino", 52: "'A mamma", 53: "'O viecchio", 54: "'O cappiello", 55: "'A museca",
        56: "'A caruta", 57: "'O scartellato", 58: "'O paccotto", 59: "'E pile", 60: "'O lamento",
        61: "'O cacciatore", 62: "'O muorto acciso", 63: "'A sposa", 64: "'A sciammeria", 65: "'O chianto",
        66: "'E ddoie zetelle", 67: "'O totano int''a chitarra", 68: "'A zuppa cotta", 69: "'Sott'e 'ncoppo", 70: "'O palazzo",
        71: "L'ommo 'e merda", 72: "'A meraviglia", 73: "'O spitale", 74: "'A rotta", 75: "Pullecenella",
        76: "'A funtana", 77: "'E riavulille", 78: "'A bella figliola", 79: "'O mariuolo", 80: "'A vocca",
        81: "'E sciure", 82: "'A tavula 'mbandita", 83: "'O maletiempo", 84: "'A cchiesa", 85: "L'aneme 'o priatorio",
        86: "'A puteca", 87: "'E perucchie", 88: "'E casecavalle", 89: "'A vecchia", 90: "'A paura"
    };

    let currentLanguage = 'it';

    // ===== FUNZIONI UTILITY =====
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    let cachedVoiceIT = null;
    let cachedVoiceEN = null;
    let voicesLoaded = false;

    function loadVoices() {
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return;
        voicesLoaded = true;

        const itVoices = voices.filter(v => v.lang.startsWith('it'));
        const enVoices = voices.filter(v => v.lang.startsWith('en'));

        function pickBestItalianVoice(list) {
            if (!list.length) return null;
            // Cerca prima voci premium online/cloud per una qualità molto superiore
            const premiumNames =['Google italiano', 'Microsoft Elsa Online', 'Microsoft Diego Online', 'Lucia', 'Cosimo'];
            for (let name of premiumNames) {
                const premiumVoice = list.find(v => v.name.includes(name));
                if (premiumVoice) return premiumVoice;
            }
            // Fallback sulla prima voce locale disponibile
            return list.find(v => v.localService) || list[0];
        }

        function pickBestEnglishVoice(list) {
            if (!list.length) return null;
            return list.find(v => v.name.includes('Google') || v.name.includes('Microsoft Aria')) || list[0];
        }

        cachedVoiceIT = pickBestItalianVoice(itVoices);
        cachedVoiceEN = pickBestEnglishVoice(enVoices);
    }

    // Carica voci al primo utilizzo e quando cambiano (alcuni browser le caricano async)
    if ('speechSynthesis' in window) {
        window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
        loadVoices(); // tentativo sincrono per browser che le espongono subito
    }

    // Pulisce gli apostrofi napoletani per evitare che la voce robotica faccia pause strane
    function cleanTextForTTS(text) {
        if (!text) return "";
        // Rimuove l'apostrofo a inizio parola (es. 'A jatta -> A jatta) per una lettura fluida in italiano
        return text.replace(/'([a-zA-Z])/g, "$1").replace(/\s+/g, " ").trim();
    }

    function speakNumber(num) {
        if (!voiceEnabled || !('speechSynthesis' in window)) return;
        if (!voicesLoaded) loadVoices(); 

        let text, lang, voice;
        if (currentLanguage === 'it') {
            const significatoIt = smorfiaItaliana[num] || smorfiaNapolitana[num] || '';
            text = significatoIt ? ("Numero " + num + ": " + significatoIt) : ("Numero " + num);
            lang = 'it-IT';
            voice = cachedVoiceIT;
        } else {
            const numberWord = numberWords.en[num] || num.toString();
            text = "Number " + num + ": " + numberWord;
            lang = 'en-US';
            voice = cachedVoiceEN;
        }

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang;
        utter.rate = 0.88; // Dizione scandita e naturale in italiano perfetto
        utter.pitch = 1.0;
        if (voice) utter.voice = voice;

        window.speechSynthesis.cancel();
        setTimeout(() => { window.speechSynthesis.speak(utter); }, 50);
    }

    function updateSmorfiaDisplay(num) {
        const labelEl = document.getElementById('smorfiaLabel');
        const textEl = document.getElementById('smorfiaText');
        if (!labelEl || !textEl) return;

        if (num === null || num === undefined || isNaN(num)) {
            labelEl.textContent = currentLanguage === 'it' ? 'La Smorfia (Italiano):' : 'Smorfia:';
            textEl.textContent = '--';
            return;
        }

        labelEl.textContent = currentLanguage === 'it' ? 'La Smorfia (Italiano):' : 'Smorfia:';
        if (currentLanguage === 'it') {
            const itMeaning = smorfiaItaliana[num];
            const napMeaning = smorfiaNapolitana[num];
            if (itMeaning && napMeaning && itMeaning !== napMeaning) {
                textEl.textContent = itMeaning + " — " + napMeaning;
            } else {
                textEl.textContent = itMeaning || napMeaning || translations.it.smorfiaFallback;
            }
        } else {
            textEl.textContent = numberWords.en[num] || translations.en.smorfiaFallback;
        }
    }

    function isGiocatoreParticipating(playerNumber) {
        if (participatingGiocatori === 0) return true;
        return playerNumber <= participatingGiocatori;
    }

    function isColorActive(colorType) {
        if (!colorType) return false;
        const sheets = activeColorSheets[colorType];
        if (!sheets || sheets.length === 0) return false;
        return sheets.some(s => s.active);
    }

    function isCartellaActive(cartellaId) {
        const cartella = generatedCartelle.find(c => c.id === cartellaId);
        if (!cartella || !cartella.colorType) return false;
        if (!isGiocatoreParticipating(cartella.playerNumber)) return false;
        return isColorActive(cartella.colorType);
    }

    // ===== FUNZIONI PER IL NUOVO BOX MONTEPREMI NON VINTI =====
    function updateUnclaimedPotDisplay() {
        const currency = document.getElementById('currencySelect').value;
        document.getElementById('unclaimedPotDisplay').textContent = `${currency} ${unclaimedGoldTotal.toFixed(2)}`;
    }

    // ===== FUNZIONI PER IL NUMERO GOLD =====
    function getGoldNumberForExtraction() {
        if (numeroGold !== null) return numeroGold;

        const newGold = Math.floor(Math.random() * 90) + 1;
        numeroGold = newGold;
        goldWon = false;
        goldExpired = false;
        goldWinningCartella = null;

        updateBoxAGold();
        updateGoldNumberOnBoard();

        return numeroGold;
    }

    function updateGoldNumberOnBoard() {
        document.querySelectorAll('.number').forEach(num => {
            num.classList.remove('gold-star-board', 'gold-extracted-circle');
        });

        if (numeroGold !== null) {
            const goldElement = document.getElementById(`number-${numeroGold}`);
            if (goldElement) {
                goldElement.classList.add('gold-star-board');
            }
        }
    }

    function applyGoldExtractedVisual() {
        if (numeroGold === null) return;
        const goldElement = document.getElementById(`number-${numeroGold}`);
        if (goldElement) {
            goldElement.classList.remove('gold-star-board', 'extracted');
            goldElement.classList.add('gold-extracted-circle');
        }
    }

    function checkPrizeExpirations() {
        const count = extractedNumbers.length;
        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
        const currency = document.getElementById('currencySelect').value || '€';
        let newExpired = false;

        // 1. Controllo Scadenza Numero Gold
        if (!goldWon && !goldExpired && count >= prizeDelaysConfig.gold.max && !extractedNumbers.includes(numeroGold)) {
            goldExpired = true;
            prizeDelaysConfig.gold.expired = true;
            const goldPrizeAmount = prizePool * prizeDelaysConfig.gold.potShare;
            unclaimedGoldTotal += goldPrizeAmount;
            newExpired = true;
            logRegiaEvent(`⚠️ SCADENZA GOLD: Numero Gold (${numeroGold}) non uscito entro ${prizeDelaysConfig.gold.max} estr.! ${currency} ${goldPrizeAmount.toFixed(2)} trasferiti a Cassa Non Vinti.`, 'warn');
            showGoldExpiredNotification(goldPrizeAmount);
        }

        // 2. Controllo Scadenza Combinazioni (Ambo, Terno, Quaterna, Cinquina, Tombola)
        const prizeKeys = ['ambo', 'terno', 'quaterna', 'cinquina', 'tombola'];
        prizeKeys.forEach(k => {
            const conf = prizeDelaysConfig[k];
            if (!conf) return;
            const winData = cartelleWins[k];
            const isWon = winData && winData.won;

            if (!isWon && !conf.expired && count >= conf.max) {
                conf.expired = true;
                newExpired = true;
                const amt = prizePool * conf.potShare;
                unclaimedGoldTotal += amt;
                logRegiaEvent(`⚠️ SCADENZA PREMIO: ${conf.label} non realizzato entro ${conf.max} estr.! ${currency} ${amt.toFixed(2)} trasferiti a Cassa Non Vinti.`, 'warn');
            }
        });

        if (newExpired) {
            updateUnclaimedPotDisplay();
            syncRegiaUI();
        }
    }

    function checkGoldExpiration() {
        checkPrizeExpirations();
    }

    function handleGoldExtraction(winningCartellaId) {
        if (goldWon || goldExpired) return;

        goldWon = true;
        goldWinningCartella = winningCartellaId;
        cartelleWins.gold.won = true;
        cartelleWins.gold.cartellaId = winningCartellaId;
        cartelleWins.gold.number = numeroGold;
        cartelleWins.gold.winCount++;

        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
        const goldPrizeAmount = prizePool * 0.05;

        const goldElement = document.getElementById(`number-${numeroGold}`);
        if (goldElement) {
            goldElement.classList.remove('gold-star-board', 'extracted');
            goldElement.classList.add('gold-extracted-circle');
        }

        showGoldExtractedNotification(winningCartellaId, goldPrizeAmount);
        updateWinsDisplay();
    }

    function showGoldExtractedNotification(cartellaId, premio) {
        const currency = document.getElementById('currencySelect').value;
        const notifica = document.createElement('div');
        notifica.className = 'win-notification';
        notifica.innerHTML = `
            <div class="win-notification-title">
                <i class="fas fa-star gold-text"></i>
                ${translations[currentLanguage].winNotificationGold}
            </div>
            <div class="win-notification-details">
                Numero Gold: ${numeroGold}<br>
                Cartella Vincente: ${cartellaId}<br>
                Premio: ${currency}${premio.toFixed(2)}
            </div>
            <button class="win-notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.appendChild(notifica);
        setTimeout(() => { if (notifica.parentNode) notifica.remove(); }, 5000);
        playSound('win');
    }

    function showGoldExpiredNotification(premio) {
        const currency = document.getElementById('currencySelect').value;
        const notifica = document.createElement('div');
        notifica.className = 'win-notification';
        notifica.innerHTML = `
            <div class="win-notification-title">
                <i class="fas fa-hourglass-end gold-text"></i>
                ${translations[currentLanguage].winNotificationGoldExpired}
            </div>
            <div class="win-notification-details">
                Numero Gold: ${numeroGold} (non estratto entro 7 turni)<br>
                Premio accantonato: ${currency}${premio.toFixed(2)}
            </div>
            <button class="win-notification-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.appendChild(notifica);
        setTimeout(() => { if (notifica.parentNode) notifica.remove(); }, 5000);
        playSound('win');
    }

    function updateBoxAGold() {
        const goldDisplay = document.getElementById('goldNumberDisplay');
        if (!goldDisplay) return;
        goldDisplay.textContent = numeroGold !== null ? numeroGold : '?';
    }

    // ===== FUNZIONI PER LA GESTIONE DEL MONTEPREMI NON VINTI A FINE GIOCO =====
    function assignUnclaimedPotToTombolaWinner(tombolaCartellaId) {
        if (unclaimedGoldTotal <= 0) return;
        const currency = document.getElementById('currencySelect').value;
        const premioExtra = unclaimedGoldTotal;
        showExtraWinPopup(tombolaCartellaId, premioExtra, currency);
        unclaimedGoldTotal = 0;
        updateUnclaimedPotDisplay();
        if (window.TombolaSync) {
            window.TombolaSync.broadcastUnclaimedUpdate(unclaimedGoldTotal);
        }
    }

    function handleGameEndWithoutTombola() {
        // Se non ci sono vincite per la tombola, il premio NON deve essere ridistribuito.
        // Deve andare direttamente nel montepremi non vinti!
        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
        const currency = document.getElementById('currencySelect').value || '€';

        if (!cartelleWins.tombola.won && !prizeDelaysConfig.tombola.expired) {
            prizeDelaysConfig.tombola.expired = true;
            const tombolaPrizeAmt = prizePool * (prizeDelaysConfig.tombola.potShare || 0.45);
            unclaimedGoldTotal += tombolaPrizeAmt;
            logRegiaEvent(`⚠️ Partita terminata senza Tombola: premio di ${currency} ${tombolaPrizeAmt.toFixed(2)} accantonato in Montepremi Non Vinti (NON ridistribuito).`, 'warn');
        }

        updateUnclaimedPotDisplay();
        syncRegiaUI();

        if (window.TombolaSync) {
            window.TombolaSync.broadcastUnclaimedUpdate(unclaimedGoldTotal);
        }

        showUnclaimedPreservedPopup();
    }

    // Compatibilità: reindirizza qualsiasi chiamata residua a non ridistribuire
    function assignUnclaimedPotToAllActiveCards() {
        handleGameEndWithoutTombola();
    }

    function showExtraWinPopup(cartellaId, premio, currency) {
        const popup = document.getElementById('winPopup');
        const title = document.getElementById('winPopupTitle');
        const details = document.getElementById('winPopupDetails');
        const winNumbers = document.getElementById('winPopupNumbers');
        const cartellaIdElement = document.getElementById('winPopupCartellaId');
        const winners = document.getElementById('winPopupWinners');

        if (!popup || !title || !details || !winNumbers || !cartellaIdElement || !winners) return;

        title.textContent = 'PREMIO EXTRA GOLD!';
        details.textContent = currentLanguage === 'it' ? 'Il Montepremi Non Vinti va a questa cartella!' : 'The Unclaimed Prize Pool goes to this card!';
        winNumbers.textContent = '';
        cartellaIdElement.textContent = cartellaId;
        cartellaIdElement.style.display = 'block';
        winners.innerHTML = `${currentLanguage === 'it' ? 'Premio Extra:' : 'Extra Prize:'} ${currency}${premio.toFixed(2)}`;

        popup.style.display = 'flex';
        playSound('win');
    }

    function showUnclaimedPreservedPopup() {
        const popup = document.getElementById('winPopup');
        const title = document.getElementById('winPopupTitle');
        const details = document.getElementById('winPopupDetails');
        const winNumbers = document.getElementById('winPopupNumbers');
        const cartellaIdElement = document.getElementById('winPopupCartellaId');
        const winners = document.getElementById('winPopupWinners');

        if (!popup || !title || !details || !winNumbers || !cartellaIdElement || !winners) return;
        const currency = document.getElementById('currencySelect').value || '€';

        title.textContent = currentLanguage === 'it' ? 'PARTITA TERMINATA SENZA TOMBOLA' : 'GAME ENDED WITHOUT TOMBOLA';
        details.innerHTML = currentLanguage === 'it'
            ? `<div style="font-size: 14px; line-height: 1.6; color: #f8fafc;">
                 Nessuna cartella ha realizzato la <b>Tombola</b>.<br>
                 <span style="color: #facc15; font-weight: bold;">Il premio non viene ridistribuito</span>, ma è stato accantonato nel <b>Montepremi Non Vinti</b> per le prossime partite!
               </div>`
            : `<div style="font-size: 14px; line-height: 1.6; color: #f8fafc;">
                 No card achieved <b>Tombola</b>.<br>
                 <span style="color: #facc15; font-weight: bold;">The prize is not redistributed</span>; it has been saved to the <b>Unclaimed Prize Pool</b> for upcoming games!
               </div>`;
        winNumbers.textContent = '';
        cartellaIdElement.style.display = 'none';
        winners.innerHTML = `<div style="font-size: 16px; font-weight: 900; color: #22c55e; margin-top: 10px;">
            ${currentLanguage === 'it' ? 'Saldo Attuale Montepremi Non Vinti:' : 'Current Unclaimed Pool:'} ${currency} ${unclaimedGoldTotal.toFixed(2)}
        </div>`;

        popup.style.display = 'flex';
        playSound('win');
    }

    // ===== FUNZIONI AI =====
    function analyzeAllCartelleAdvanced() {
        if (!generatedCartelle.length || !aiIntelligenceEnabled) return;

        const activeCartelle = generatedCartelle.filter(c => isCartellaActive(c.id));
        if (activeCartelle.length === 0) return;

        aiAdvancedData.distributionMap = {};
        for (let i = 1; i <= 90; i++) aiAdvancedData.distributionMap[i] = 0;

        activeCartelle.forEach(cartella => {
            cartella.numbers.forEach(n => {
                aiAdvancedData.distributionMap[n.number]++;
            });
        });

        aiAdvancedData.cartelleAnalysis = {};
        aiAdvancedData.cartellaProgress = {};
        aiAdvancedData.winPrediction = { ambo: [], terno:[], quaterna: [], cinquina: [], tombola:[] };

        activeCartelle.forEach(cartella => {
            const extractedCount = cartella.numbers.filter(n => extractedNumbers.includes(n.number)).length;
            const total = cartella.numbers.length;
            const progress = (extractedCount / total) * 100;

            let dangerScore = 0;
            let missingNumbers =[];
            let winningPotential = { ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0 };

            for (let row = 0; row < 3; row++) {
                const rowNumbers = cartella.numbers.filter(n => n.row === row).map(n => n.number);
                const extractedInRow = rowNumbers.filter(n => extractedNumbers.includes(n)).length;
                const missingInRow = rowNumbers.filter(n => !extractedNumbers.includes(n));

                missingNumbers.push(...missingInRow);

                if (extractedInRow === 1 && missingInRow.length > 0) {
                    dangerScore += 10;
                    winningPotential.ambo += missingInRow.length * 15;
                }
                if (extractedInRow === 2 && !cartella.wins.ambo && missingInRow.length > 0) {
                    dangerScore += 30;
                    winningPotential.terno += missingInRow.length * 25;
                }
                if (extractedInRow === 3 && !cartella.wins.terno && missingInRow.length > 0) {
                    dangerScore += 60;
                    winningPotential.quaterna += missingInRow.length * 40;
                }
                if (extractedInRow === 4 && !cartella.wins.quaterna && missingInRow.length > 0) {
                    dangerScore += 100;
                    winningPotential.cinquina += missingInRow.length * 60;
                }
                if (extractedCount >= 12 && !cartella.wins.tombola) {
                    const missingTombola = cartella.numbers.filter(n => !extractedNumbers.includes(n.number)).length;
                    if (missingTombola <= 3) {
                        dangerScore += 200;
                        winningPotential.tombola += missingTombola * 100;
                    }
                }
            }

            aiAdvancedData.cartelleAnalysis[cartella.id] = {
                cartellaId: cartella.id, playerNumber: cartella.playerNumber,
                colorType: cartella.colorType, extractedCount, progress, dangerScore,
                missingNumbers:[...new Set(missingNumbers)],
                winningPotential
            };

            aiAdvancedData.cartellaProgress[cartella.id] = progress;

            if (winningPotential.ambo > 0 && !cartella.wins.ambo && !cartelleWins.ambo.won) {
                aiAdvancedData.winPrediction.ambo.push({ cartellaId: cartella.id, numbers: missingNumbers.slice(0, 2), priority: dangerScore });
            }
            if (winningPotential.terno > 0 && !cartella.wins.terno && !cartelleWins.terno.won) {
                aiAdvancedData.winPrediction.terno.push({ cartellaId: cartella.id, numbers: missingNumbers.slice(0, 3), priority: dangerScore });
            }
            if (winningPotential.quaterna > 0 && !cartella.wins.quaterna && !cartelleWins.quaterna.won) {
                aiAdvancedData.winPrediction.quaterna.push({ cartellaId: cartella.id, numbers: missingNumbers.slice(0, 4), priority: dangerScore });
            }
            if (winningPotential.cinquina > 0 && !cartella.wins.cinquina && !cartelleWins.cinquina.won) {
                aiAdvancedData.winPrediction.cinquina.push({ cartellaId: cartella.id, numbers: missingNumbers.slice(0, 5), priority: dangerScore });
            }
            if (winningPotential.tombola > 0 && !cartella.wins.tombola && !cartelleWins.tombola.won) {
                aiAdvancedData.winPrediction.tombola.push({ cartellaId: cartella.id, numbers: missingNumbers, priority: dangerScore });
            }
        });

        let coverage = 0;
        let totalNumbersInActive = 0;
        activeCartelle.forEach(cartella => {
            cartella.numbers.forEach(n => {
                if (extractedNumbers.includes(n)) coverage++;
                totalNumbersInActive++;
            });
        });
        aiAdvancedData.coverageIndex = totalNumbersInActive ? (coverage / totalNumbersInActive) * 100 : 0;

        const activeCount = activeCartelle.length;
        aiAdvancedData.winDelay.ambo.targetExtractions = Math.min(30, Math.floor(activeCount * 1.5));
        aiAdvancedData.winDelay.terno.targetExtractions = Math.min(45, Math.floor(activeCount * 2));
        aiAdvancedData.winDelay.quaterna.targetExtractions = Math.min(60, Math.floor(activeCount * 2.5));
        aiAdvancedData.winDelay.cinquina.targetExtractions = Math.min(75, Math.floor(activeCount * 3));
        aiAdvancedData.winDelay.tombola.targetExtractions = Math.min(90, Math.floor(activeCount * 4));

        aiAdvancedData.lastAnalysis = new Date();
        updateAIAnalysisDisplay();
    }

    function selectOptimalNumberWithAdvancedAI() {
        let availableNumbers = allNumbers.filter(n => !extractedNumbers.includes(n));
        if (availableNumbers.length === 0) return null;

        const activeCartelle = generatedCartelle.filter(c => isCartellaActive(c.id));
        antiWinDifficultyConfig.monitoredCardsCount = activeCartelle.length;

        // Se non ci sono cartelle o modalità casuale
        if (activeCartelle.length === 0 || !aiIntelligenceEnabled || !antiWinDifficultyConfig.enabled || antiWinDifficultyConfig.level === 'random') {
            antiWinDifficultyConfig.blockedNumbersCount = 0;
            antiWinDifficultyConfig.difficultyIndex = 0;
            return availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
        }

        analyzeAllCartelleAdvanced();

        const totalExtracted = extractedNumbers.length;
        let blockedCount = 0;

        // Assegna un punteggio di rischio (penalità anti-vincita) ad ogni numero disponibile
        let numberRisks = availableNumbers.map(num => {
            let riskScore = 0;
            let blocksWin = false;

            activeCartelle.forEach(cartella => {
                if (!cartella.numbers.some(n => n.number === num)) return;

                let willTombola = false, willCinquina = false, willQuaterna = false, willTerno = false, willAmbo = false;

                if (!cartella.wins.tombola && !cartelleWins.tombola.won && !prizeDelaysConfig.tombola.expired && cartella.extractedNumbers.length === 14) {
                    willTombola = true;
                }

                for (let row = 0; row < 3; row++) {
                    const rowNumbers = cartella.numbers.filter(n => n.row === row).map(n => n.number);
                    if (!rowNumbers.includes(num)) continue;

                    const extractedInRow = rowNumbers.filter(n => extractedNumbers.includes(n)).length;
                    if (extractedInRow === 4 && !cartella.wins.cinquina && !cartelleWins.cinquina.won && !prizeDelaysConfig.cinquina.expired) willCinquina = true;
                    if (extractedInRow === 3 && !cartella.wins.quaterna && !cartelleWins.quaterna.won && !prizeDelaysConfig.quaterna.expired) willQuaterna = true;
                    if (extractedInRow === 2 && !cartella.wins.terno && !cartelleWins.terno.won && !prizeDelaysConfig.terno.expired) willTerno = true;
                    if (extractedInRow === 1 && !cartella.wins.ambo && !cartelleWins.ambo.won && !prizeDelaysConfig.ambo.expired) willAmbo = true;
                }

                const forced = antiWinDifficultyConfig.forcedMin;

                // Penalità elevate se il numero causerebbe una vincita PRIMA della soglia forzata di ritardo:
                if (willTombola && totalExtracted < forced.tombola) { riskScore += 1000000; blocksWin = true; }
                if (willCinquina && totalExtracted < forced.cinquina) { riskScore += 500000; blocksWin = true; }
                if (willQuaterna && totalExtracted < forced.quaterna) { riskScore += 250000; blocksWin = true; }
                if (willTerno && totalExtracted < forced.terno) { riskScore += 100000; blocksWin = true; }
                if (willAmbo && totalExtracted < forced.ambo) { riskScore += 50000; blocksWin = true; }

                // In modalità Difficoltà Alta: penalità per concentrazione su cartelle già avanzate (spalma estrazioni)
                if (antiWinDifficultyConfig.level === 'high') {
                    riskScore += (cartella.extractedNumbers ? cartella.extractedNumbers.length : 0) * 3;
                } else if (antiWinDifficultyConfig.level === 'medium') {
                    riskScore += (cartella.extractedNumbers ? cartella.extractedNumbers.length : 0);
                }
            });

            // Ritarda uscita del Numero Gold se sotto soglia
            if (numeroGold && num === numeroGold && !goldWon && !goldExpired) {
                if (totalExtracted < Math.floor(prizeDelaysConfig.gold.max * 0.75)) {
                    riskScore += 40000;
                    blocksWin = true;
                }
            }

            if (blocksWin) blockedCount++;

            // Evita ripetizioni immediate in cronologia
            if (aiAdvancedData.extractionHistory.slice(-3).includes(num)) riskScore += 10;

            return { num, riskScore };
        });

        antiWinDifficultyConfig.blockedNumbersCount = blockedCount;
        const ratio = blockedCount / Math.max(1, availableNumbers.length);
        antiWinDifficultyConfig.difficultyIndex = Math.min(98, Math.max(45, Math.round(ratio * 70) + 40));

        // Ordina dal rischio più basso (più sicuro, che ritarda le vincite) al più alto
        numberRisks.sort((a, b) => a.riskScore - b.riskScore);

        const lowestRisk = numberRisks[0].riskScore;
        const safestNumbers = numberRisks.filter(n => n.riskScore === lowestRisk).map(n => n.num);

        const selected = safestNumbers[Math.floor(Math.random() * safestNumbers.length)];

        aiAdvancedData.extractionHistory.push(selected);
        if (aiAdvancedData.extractionHistory.length > 30) aiAdvancedData.extractionHistory.shift();

        return selected;
    }

    function toggleAIIntelligence() {
        aiIntelligenceEnabled = !aiIntelligenceEnabled;
        const btn = document.getElementById('aiIntelligenceBtn');
        if (aiIntelligenceEnabled) {
            btn.classList.add('active');
            if (generatedCartelle.length > 0) analyzeAllCartelleAdvanced();
        } else {
            btn.classList.remove('active');
        }
    }

    function updateAIAnalysisDisplay() {
        const panel = document.getElementById('aiAnalysisPanel');
        const content = document.getElementById('aiAnalysisContent');
        if (!panel || !content) return;

        if (!aiIntelligenceEnabled || !generatedCartelle.length) {
            content.innerHTML = `<div class="ai-analysis-item"><span class="ai-analysis-label">Stato:</span><span class="ai-analysis-value">${aiIntelligenceEnabled ? 'Analisi in corso...' : 'Disattivata'}</span></div>`;
            return;
        }

        const activeCartelle = generatedCartelle.filter(c => isCartellaActive(c.id)).length;

        let html = `<div class="ai-analysis-item"><span class="ai-analysis-label">Ultima analisi:</span><span class="ai-analysis-value">${aiAdvancedData.lastAnalysis ? aiAdvancedData.lastAnalysis.toLocaleTimeString() : 'Mai'}</span></div>`;
        html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Cartelle attive:</span><span class="ai-analysis-value">${activeCartelle}</span></div>`;
        html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Copertura media:</span><span class="ai-analysis-value">${aiAdvancedData.coverageIndex ? aiAdvancedData.coverageIndex.toFixed(1) : '0'}%</span></div>`;
        html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Estratti totali:</span><span class="ai-analysis-value">${extractedNumbers.length}</span></div>`;
        html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Algoritmo:</span><span class="ai-analysis-value">Strict Mathematical Risk Pro</span></div>`;

        if (activeCartelle > 0) {
            const avgProgress = generatedCartelle.filter(c => isCartellaActive(c.id)).reduce((acc, c) => {
                const ext = c.numbers.filter(n => extractedNumbers.includes(n.number)).length;
                return acc + (ext / c.numbers.length * 100);
            }, 0) / activeCartelle;
            html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Progresso medio:</span><span class="ai-analysis-value">${avgProgress.toFixed(1)}%</span></div>`;
        }

        const mostNeeded = Object.entries(aiAdvancedData.distributionMap || {}).sort((a,b) => a[1] - b[1]).slice(0,5).map(e => e[0]).join(', ');
        if (mostNeeded) html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Numeri meno coperti:</span><span class="ai-analysis-value">${mostNeeded}</span></div>`;

        html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Obiettivo Ambo:</span><span class="ai-analysis-value">${aiAdvancedData.winDelay.ambo.targetExtractions || 30} estratti</span></div>`;
        html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Obiettivo Terno:</span><span class="ai-analysis-value">${aiAdvancedData.winDelay.terno.targetExtractions || 45} estratti</span></div>`;
        html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Obiettivo Quaterna:</span><span class="ai-analysis-value">${aiAdvancedData.winDelay.quaterna.targetExtractions || 60} estratti</span></div>`;
        html += `<div class="ai-analysis-item"><span class="ai-analysis-label">Obiettivo Cinquina:</span><span class="ai-analysis-value">${aiAdvancedData.winDelay.cinquina.targetExtractions || 75} estratti</span></div>`;

        content.innerHTML = html;
    }

    function showAIAnalysisPanel() {
        document.getElementById('aiAnalysisPanel').classList.add('active');
        updateAIAnalysisDisplay();
    }

    function hideAIAnalysisPanel() {
        document.getElementById('aiAnalysisPanel').classList.remove('active');
    }

    function toggleVoice() {
        voiceEnabled = !voiceEnabled;
        const btn = document.getElementById('voiceControlBtn');
        const icon = btn.querySelector('i');
        const text = btn.querySelector('span');
        if (voiceEnabled) {
            icon.className = 'fas fa-volume-up';
            btn.classList.remove('muted');
            text.textContent = currentLanguage === 'it' ? 'Voce' : 'Voice';
        } else {
            icon.className = 'fas fa-volume-mute';
            btn.classList.add('muted');
            text.textContent = currentLanguage === 'it' ? 'Muto' : 'Mute';
        }
    }

    // ===== FUNZIONE PER VERIFICARE SE SI PUÒ INIZIARE IL GIOCO (CON POPUP) =====
    function canStartGame() {
        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
        if (prizePool <= 0) {
            showErrorPopup(currentLanguage === 'it' ? "Inserire un Montepremi valido (>0) per iniziare." : "Enter a valid Prize Pool (>0) to start.");
            return false;
        }
        if (generatedCartelle.length === 0) {
            showErrorPopup(currentLanguage === 'it' ? "Generare le cartelle prima di iniziare." : "Generate cards before starting.");
            return false;
        }
        const hasActiveSheet = Object.values(activeColorSheets).some(sheets => sheets.some(s => s.active));
        if (!hasActiveSheet) {
            showErrorPopup(currentLanguage === 'it' ? "Attivare almeno un foglio colore per iniziare." : "Activate at least one color sheet to start.");
            return false;
        }
        return true;
    }

    function showErrorPopup(message) {
        document.getElementById('errorPopupMessage').textContent = message;
        document.getElementById('errorPopup').style.display = 'flex';
    }

    function showSuccessPopup(message) {
        // Usa lo stesso popup di errore ma con colore verde per i successi
        const popup = document.getElementById('errorPopup');
        const msg = document.getElementById('errorPopupMessage');
        msg.textContent = message;
        popup.style.display = 'flex';
        const box = popup.querySelector('.error-popup-box') || popup.firstElementChild;
        if (box) {
            box.style.borderTop = '5px solid #2ecc71';
            setTimeout(() => { box.style.borderTop = ''; }, 3000);
        }
        setTimeout(() => { popup.style.display = 'none'; }, 3000);
    }

    let pendingConfirmAction = null;

    function showConfirmDialog(title, message, onConfirm) {
        const popup = document.getElementById('confirmPopup');
        const titleEl = document.getElementById('confirmPopupTitle');
        const msgEl = document.getElementById('confirmPopupMessage');
        if (!popup || !titleEl || !msgEl) {
            if (onConfirm) onConfirm();
            return;
        }
        titleEl.textContent = title;
        msgEl.innerHTML = message;
        pendingConfirmAction = onConfirm;
        popup.style.display = 'flex';
    }

    function closeConfirmDialog() {
        const popup = document.getElementById('confirmPopup');
        if (popup) popup.style.display = 'none';
        pendingConfirmAction = null;
    }

    // ===== FUNZIONI PRINCIPALI DEL GIOCO =====
    function initializeBoard() {
        const board = document.getElementById('board');
        if (!board) return;
        board.innerHTML = '';
        for (let i = 1; i <= 90; i++) {
            const numberElement = document.createElement('div');
            numberElement.classList.add('number');
            numberElement.textContent = i;
            numberElement.id = `number-${i}`;
            board.appendChild(numberElement);
        }
    }

    function initColorControls() {
        const colorControls = document.getElementById('colorControls');
        if (!colorControls) return;
        colorControls.innerHTML = '';
        const colors =[
            { id: 'blue', name: translations[currentLanguage].colorBlue, code: 'BLUE' },
            { id: 'orange', name: translations[currentLanguage].colorOrange, code: 'ORANGE' },
            { id: 'green', name: translations[currentLanguage].colorGreen, code: 'GREEN' },
            { id: 'yellow', name: translations[currentLanguage].colorYellow, code: 'YELLOW' }
        ];

        colors.forEach(color => {
            const control = document.createElement('div');
            control.className = `color-control`;
            control.dataset.color = color.id;

            const colorName = document.createElement('div');
            colorName.className = 'color-name';
            const dot = document.createElement('div');
            dot.className = `color-dot ${color.id}`;
            const text = document.createElement('span');
            text.textContent = color.name;
            colorName.appendChild(dot);
            colorName.appendChild(text);

            const toggleContainer = document.createElement('div');
            toggleContainer.style.display = 'flex';
            toggleContainer.style.alignItems = 'center';
            toggleContainer.style.gap = '5px';

            const toggle = document.createElement('label');
            toggle.className = 'color-toggle';
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = activeColorSheets[color.id] && activeColorSheets[color.id].some(s => s.active);

            toggleInput.addEventListener('change', function() {
                const colorType = color.id;
                const isActive = this.checked;
                if (activeColorSheets[colorType]) {
                    activeColorSheets[colorType].forEach(sheet => { sheet.active = isActive; });
                }
                updateCartelleExtractedNumbers();
                updateWinsDisplay();
                updateGameStats();
                if (aiIntelligenceEnabled) analyzeAllCartelleAdvanced();
            });

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'color-toggle-slider';
            toggle.appendChild(toggleInput);
            toggle.appendChild(toggleSlider);
            toggleContainer.appendChild(toggle);

            control.appendChild(colorName);
            control.appendChild(toggleContainer);
            colorControls.appendChild(control);
        });
    }

    function updateColorSheetsFromCartelle() {
        activeColorSheets = { blue: [], orange: [], green: [], yellow:[] };
        generatedCartelle.forEach(cartella => {
            const colorType = cartella.colorType;
            const colorCode = cartella.color;
            if (colorType && activeColorSheets[colorType]) {
                const existing = activeColorSheets[colorType].find(s => s.code === colorCode);
                if (existing) existing.count++;
                else activeColorSheets[colorType].push({ code: colorCode, active: false, count: 1 });
            }
        });
        initColorControls();
        syncRegiaUI();
    }

    // Algoritmo matematico autentico per una singola cartella della Tombola Italiana:
    // 15 numeri su 3 righe da 5 numeri ciascuna, 9 colonne (1-9, 10-19, ..., 80-90),
    // ordinamento strettamente crescente per colonna, nessuna cella sovrapposta.
    function generateSingleCartellaNumbers() {
        for (let attempt = 0; attempt < 1000; attempt++) {
            const colRanges = [
                Array.from({length: 9}, (_, i) => 1 + i),
                Array.from({length: 10}, (_, i) => 10 + i),
                Array.from({length: 10}, (_, i) => 20 + i),
                Array.from({length: 10}, (_, i) => 30 + i),
                Array.from({length: 10}, (_, i) => 40 + i),
                Array.from({length: 10}, (_, i) => 50 + i),
                Array.from({length: 10}, (_, i) => 60 + i),
                Array.from({length: 10}, (_, i) => 70 + i),
                Array.from({length: 11}, (_, i) => 80 + i)
            ];

            const colCounts = [1, 1, 1, 1, 1, 1, 1, 1, 1];
            let extra = 6;
            while (extra > 0) {
                const randCol = Math.floor(Math.random() * 9);
                if (colCounts[randCol] < 3) {
                    colCounts[randCol]++;
                    extra--;
                }
            }

            const colNumbers = [];
            for (let c = 0; c < 9; c++) {
                const pool = [...colRanges[c]];
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                const picked = pool.slice(0, colCounts[c]).sort((a, b) => a - b);
                colNumbers.push(picked);
            }

            let rowCounts = [0, 0, 0];
            let assigned = [];
            let possible = true;

            for (let c = 0; c < 9; c++) {
                const nums = colNumbers[c];
                const count = nums.length;
                if (count === 3) {
                    if (rowCounts[0] < 5 && rowCounts[1] < 5 && rowCounts[2] < 5) {
                        rowCounts[0]++; rowCounts[1]++; rowCounts[2]++;
                        assigned.push({ number: nums[0], column: c, row: 0 });
                        assigned.push({ number: nums[1], column: c, row: 1 });
                        assigned.push({ number: nums[2], column: c, row: 2 });
                    } else {
                        possible = false;
                        break;
                    }
                } else if (count === 2) {
                    const pairs = [[0, 1], [0, 2], [1, 2]].sort(() => Math.random() - 0.5);
                    let placed = false;
                    for (const [r1, r2] of pairs) {
                        if (rowCounts[r1] < 5 && rowCounts[r2] < 5) {
                            rowCounts[r1]++; rowCounts[r2]++;
                            assigned.push({ number: nums[0], column: c, row: r1 });
                            assigned.push({ number: nums[1], column: c, row: r2 });
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) { possible = false; break; }
                } else if (count === 1) {
                    const singleRows = [0, 1, 2].sort((a, b) => rowCounts[a] - rowCounts[b]);
                    let placed = false;
                    for (const r of singleRows) {
                        if (rowCounts[r] < 5) {
                            rowCounts[r]++;
                            assigned.push({ number: nums[0], column: c, row: r });
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) { possible = false; break; }
                }
            }

            if (possible && rowCounts[0] === 5 && rowCounts[1] === 5 && rowCounts[2] === 5) {
                assigned.sort((a, b) => {
                    if (a.row !== b.row) return a.row - b.row;
                    return a.column - b.column;
                });
                return assigned;
            }
        }

        // Fallback robusto se i tentativi casuali non convergessero
        return generateCartellaNumbersForSheet()[0];
    }

    function generateCartellaNumbersForSheet() {
        const columns =[];
        columns.push(Array.from({length: 9}, (_, i) => i + 1));
        for (let c = 1; c <= 7; c++) columns.push(Array.from({length: 10}, (_, i) => c * 10 + i));
        columns.push(Array.from({length: 11}, (_, i) => 80 + i));

        columns.forEach(col => {
            for (let i = col.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [col[i], col[j]] = [col[j], col[i]];
            }
        });

        let layout = Array(6).fill(0).map(() => Array(9).fill(0));
        const colDistributions = [[2,2,2,1,1,1], [2,2,2,2,1,1], [2,2,2,2,1,1],[2,2,2,2,1,1], [2,2,2,2,1,1],[2,2,2,2,1,1], [2,2,2,2,1,1],[2,2,2,2,1,1], [2,2,2,2,2,1]
        ];

        for (let c = 0; c < 9; c++) {
            const dist =[...colDistributions[c]];
            for (let i = dist.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [dist[i], dist[j]] = [dist[j], dist[i]];
            }
            for (let r = 0; r < 6; r++) layout[r][c] = dist[r];
        }

        let balanced = false;
        while (!balanced) {
            balanced = true;
            for (let i = 0; i < 6; i++) {
                const sum = layout[i].reduce((a,b) => a+b, 0);
                if (sum !== 15) {
                    balanced = false;
                    const diff = 15 - sum;
                    for (let j = 0; j < 6; j++) {
                        if (i === j) continue;
                        const sumJ = layout[j].reduce((a,b) => a+b, 0);
                        if ((diff > 0 && sumJ > 15) || (diff < 0 && sumJ < 15)) {
                            for (let c = 0; c < 9; c++) {
                                if (diff > 0 && layout[j][c] > layout[i][c]) {
                                    const temp = layout[i][c];
                                    layout[i][c] = layout[j][c];
                                    layout[j][c] = temp;
                                    break;
                                } else if (diff < 0 && layout[i][c] > layout[j][c]) {
                                    const temp = layout[i][c];
                                    layout[i][c] = layout[j][c];
                                    layout[j][c] = temp;
                                    break;
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }

        const sheetOutput =[];
        for (let i = 0; i < 6; i++) {
            const cardLayout = layout[i];
            const cardRawNumbers =[];

            for (let c = 0; c < 9; c++) {
                const count = cardLayout[c];
                for (let k = 0; k < count; k++) {
                    const val = columns[c].pop();
                    cardRawNumbers.push({ number: val, column: c });
                }
            }

            const colsInCard = {};
            cardRawNumbers.forEach(n => {
                if(!colsInCard[n.column]) colsInCard[n.column] = [];
                colsInCard[n.column].push(n);
            });

            let success = false;
            let assignedRows =[];
            let attempts = 0;

            while (!success && attempts < 2000) {
                attempts++;
                const rowCounts = [0,0,0];
                const finalAssignment =[];
                let possible = true;

                for (let c = 0; c < 9; c++) {
                    if (!colsInCard[c]) continue;
                    const nums = colsInCard[c];
                    let availableRows = [0,1,2];
                    availableRows.sort(() => Math.random() - 0.5);

                    for (let nIdx = 0; nIdx < nums.length; nIdx++) {
                        const numObj = nums[nIdx];
                        let placed = false;
                        for (let rIdx = 0; rIdx < availableRows.length; rIdx++) {
                            const r = availableRows[rIdx];
                            if (rowCounts[r] < 5) {
                                rowCounts[r]++;
                                finalAssignment.push({ number: numObj.number, column: numObj.column, row: r });
                                availableRows.splice(rIdx,1);
                                rIdx--;
                                placed = true;
                                break;
                            }
                        }
                        if (!placed) { possible = false; break; }
                    }
                    if (!possible) break;
                }

                if (possible && rowCounts[0] === 5 && rowCounts[1] === 5 && rowCounts[2] === 5) {
                    success = true;
                    assignedRows = finalAssignment;
                }
            }

            if (!success) return generateCartellaNumbersForSheet();

            assignedRows.sort((a,b) => {
                if (a.row !== b.row) return a.row - b.row;
                return a.column - b.column;
            });

            sheetOutput.push(assignedRows);
        }
        return sheetOutput;
    }

    function createCartella(gameId, sheetNumber, cartellaNumber, colorCode, playerNumber, numbers, stripCardNum = 1) {
        const playerLetter = 'G' + playerNumber;
        const colorName = colorCode.charAt(0).toUpperCase() + colorCode.slice(1);
        const cartellaId = `${gameId}.${playerLetter}.F${sheetNumber.toString().padStart(3,'0')}.C${cartellaNumber.toString().padStart(2,'0')}.${colorName}${stripCardNum}`;

        const cartellaData = {
            id: cartellaId,
            gameId,
            sheetNumber,
            cartellaNumber,
            stripCardIndex: stripCardNum,
            color: `${colorName}${playerLetter}`,
            colorType: colorCode,
            playerNumber,
            numbers,
            extractedNumbers: [],
            wins: { ambo: false, terno: false, quaterna: false, cinquina: false, tombola: false },
            winningNumbers: []
        };

        generatedCartelle.push(cartellaData);
        winningNumbersByCartella[cartellaId] = [];
        return cartellaData;
    }

    function renderCartelle() {
        const container = document.getElementById('cartelleContainer');
        if (!container) return;
        container.innerHTML = '';

        if (generatedCartelle.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 50px; color: #666;">Nessuna cartella generata. Clicca su "Genera Cartelle" per iniziare.</div>';
            return;
        }

        const fogliMap = {};
        generatedCartelle.forEach(cartella => {
            if (!fogliMap[cartella.sheetNumber]) fogliMap[cartella.sheetNumber] = [];
            fogliMap[cartella.sheetNumber].push(cartella);
        });

        const sortedSheets = Object.keys(fogliMap).sort((a,b) => a - b);

        sortedSheets.forEach(sheetNumber => {
            const cartelleInSheet = fogliMap[sheetNumber].sort((a,b) => a.cartellaNumber - b.cartellaNumber);
            const foglio = document.createElement('div');
            foglio.className = 'foglio-a4 jumbo-sheet';

            const firstCartella = cartelleInSheet[0];
            const foglioHeader = document.createElement('div');
            foglioHeader.className = 'foglio-header jumbo-sheet-header';

            const titleBox = document.createElement('div');
            titleBox.className = 'foglio-title';
            titleBox.innerHTML = `<div class="sheet-official-logo"><span class="sheet-logo-dice">🎲</span><span class="sheet-logo-title">LUONGO TOMBOLA 90 ITALIA</span><span class="sheet-logo-gold">GOLD EDITION</span></div><span class="jumbo-badge-4col">4 COLORI &bull; 24 CARTELLE</span>`;

            const info = document.createElement('div');
            info.className = 'foglio-info';
            info.innerHTML = `<span>${currentLanguage === 'it' ? 'Gioco' : 'Game'}: <b>${cartelleGameId}</b></span>
                            <span>${currentLanguage === 'it' ? 'Foglio' : 'Sheet'}: <b>${sheetNumber}</b></span>
                            <span>${currentLanguage === 'it' ? 'Giocatore' : 'Player'}: <b>${firstCartella ? firstCartella.playerNumber : 1}</b></span>
                            <span><b>90 NUMERI</b> (SERIE DA 6 PER STRISCIA)</span>`;

            foglioHeader.appendChild(titleBox);
            foglioHeader.appendChild(info);
            foglio.appendChild(foglioHeader);

            // Layout a 4 colonne di strisce affiancate in foglio A4 Landscape in cronologia:
            // Colonna 1: Blue (6 cartelle)
            // Colonna 2: Orange (6 cartelle)
            // Colonna 3: Green (6 cartelle)
            // Colonna 4: Yellow (6 cartelle)
            const gridLayout = document.createElement('div');
            gridLayout.className = 'jumbo-grid-layout';

            const colorStripsConfig = [
                { key: 'blue', label: 'Blue', prefix: 3260 },
                { key: 'orange', label: 'Orange', prefix: 3270 },
                { key: 'green', label: 'Green', prefix: 3280 },
                { key: 'yellow', label: 'Yellow', prefix: 3290 }
            ];

            const createStripElement = (cards, colorName, colorLabel, serialPrefix) => {
                const strip = document.createElement('div');
                strip.className = `jumbo-strip strip-${colorName}`;
                strip.dataset.color = colorName;

                cards.forEach(cartellaData => {
                    const cartella = document.createElement('div');
                    cartella.className = 'cartella jumbo-cartella';
                    cartella.dataset.id = cartellaData.id;
                    cartella.dataset.color = cartellaData.colorType;
                    cartella.dataset.sheet = cartellaData.sheetNumber;
                    cartella.dataset.card = cartellaData.cartellaNumber;
                    cartella.dataset.player = cartellaData.playerNumber;

                    if (!isGiocatoreParticipating(cartellaData.playerNumber)) {
                        cartella.classList.add('non-participating');
                        cartella.style.opacity = '0.6';
                        cartella.style.borderStyle = 'dashed';
                    }

                    if (cartellaData.wins?.tombola || cartellaData.winningRow === -1) {
                        cartella.classList.add('win-tombola-cartella');
                    }

                    // Ribbon laterale col nome colore ruotato (YELLOW, GREEN, ORANGE, BLUE)
                    const ribbon = document.createElement('div');
                    ribbon.className = `jumbo-ribbon ${cartellaData.colorType}`;
                    const ribbonText = document.createElement('span');
                    ribbonText.className = 'jumbo-ribbon-text';
                    ribbonText.textContent = colorLabel.toUpperCase();
                    ribbon.appendChild(ribbonText);

                    // Centro: griglia 3x9
                    const centerBox = document.createElement('div');
                    centerBox.className = 'jumbo-card-center';

                    const cartellaGrid = document.createElement('div');
                    cartellaGrid.className = 'cartella-grid jumbo-grid';

                    for (let row = 0; row < 3; row++) {
                        for (let col = 0; col < 9; col++) {
                            const cell = document.createElement('div');
                            cell.className = 'cartella-cell empty';
                            cell.dataset.row = row;
                            cell.dataset.col = col;
                            cartellaGrid.appendChild(cell);
                        }
                    }

                    cartellaData.numbers.forEach(numData => {
                        const cellIndex = numData.row * 9 + numData.column;
                        const cell = cartellaGrid.children[cellIndex];
                        if (cell) {
                            cell.className = 'cartella-cell has-number';
                            cell.textContent = numData.number;
                            cell.dataset.number = numData.number;
                            cell.dataset.row = numData.row;
                            cell.dataset.col = numData.column;
                        }
                    });

                    centerBox.appendChild(cartellaGrid);

                    // Lato destro: codice seriale verticale
                    const serialBox = document.createElement('div');
                    serialBox.className = 'jumbo-card-serial';
                    const serialTop = document.createElement('span');
                    serialTop.className = 'serial-num';
                    serialTop.textContent = `T${serialPrefix + cartellaData.cartellaNumber}`;
                    const serialBottom = document.createElement('span');
                    serialBottom.className = 'serial-num';
                    serialBottom.textContent = `S${4630 + (cartellaData.stripCardIndex || 1)}`;
                    serialBox.appendChild(serialTop);
                    serialBox.appendChild(serialBottom);

                    // Mini badge se vincita
                    const winEntries = Object.entries(cartellaData.wins).filter(([_, v]) => v);
                    if (winEntries.length > 0) {
                        const winBadge = document.createElement('div');
                        winBadge.className = 'jumbo-win-tag';
                        winBadge.textContent = winEntries.map(([k]) => k.toUpperCase()).join(' • ');
                        cartella.appendChild(winBadge);
                    }

                    cartella.appendChild(ribbon);
                    cartella.appendChild(centerBox);
                    cartella.appendChild(serialBox);
                    strip.appendChild(cartella);
                });

                // Watermark footer della striscia (GOLD EDITION © e SERIE)
                const stripFooter = document.createElement('div');
                stripFooter.className = 'jumbo-strip-footer';
                stripFooter.innerHTML = `<span>SERIE ${colorLabel.toUpperCase()} (1-90)</span><span>GOLD EDITION &copy;</span>`;
                strip.appendChild(stripFooter);

                return strip;
            };

            // Aggiungi le 4 strisce affiancate in sequenza (Yellow, Green, Orange, Blue)
            colorStripsConfig.forEach(cfg => {
                const cards = cartelleInSheet.filter(c => c.colorType === cfg.key);
                gridLayout.appendChild(createStripElement(cards, cfg.key, cfg.label, cfg.prefix));
            });

            foglio.appendChild(gridLayout);
            container.appendChild(foglio);
        });

        updateCartelleStats();
        updateCartelleExtractedNumbers();
        updateGameStats();
        if (aiIntelligenceEnabled) analyzeAllCartelleAdvanced();
    }

    function updateCartelleStats() {
        document.getElementById('totalCartelle').textContent = generatedCartelle.length;
        const uniqueSheets = new Set(generatedCartelle.map(c => c.sheetNumber));
        document.getElementById('totalFogli').textContent = uniqueSheets.size;
        const uniquePlayers = new Set(generatedCartelle.map(c => c.playerNumber));
        document.getElementById('totalGiocatori').textContent = uniquePlayers.size;
        document.getElementById('totalParticipatingGiocatori').textContent = participatingGiocatori;
    }

    function updateCartelleExtractedNumbers() {
        // Aggiorna lo stato visivo delle strisce in base a quali colori sono attivi
        document.querySelectorAll('.jumbo-strip').forEach(strip => {
            const color = strip.dataset.color;
            if (color) {
                const active = isColorActive(color);
                strip.classList.toggle('inactive-strip', !active);
            }
        });

        document.querySelectorAll('.cartella-cell.has-number').forEach(cell => {
            const number = parseInt(cell.dataset.number);
            const cartellaElement = cell.closest('.cartella');
            const cartellaId = cartellaElement ? cartellaElement.dataset.id : null;
            const isActive = isCartellaActive(cartellaId);

            // MARCARE SOLO LE CARTELLE DELLA STRISCIA/COLORE ATTIVO!
            if (isActive && extractedNumbers.includes(number)) {
                if (number === numeroGold) {
                    // NUMERO GOLD: MARCATO IN GIALLO (rettangolare, no cerchio)
                    cell.className = 'cartella-cell has-number extracted-gold';
                    cell.style.background = '#facc15';
                    cell.style.color = '#713f12';
                    cell.style.border = '1px solid #ca8a04';
                    cell.style.borderRadius = '3px';
                    cell.style.fontWeight = '900';
                    cell.style.boxShadow = '0 0 6px rgba(250, 204, 21, 0.6)';
                } else if (winningNumbersByCartella[cartellaId] && winningNumbersByCartella[cartellaId].includes(number)) {
                    // NUMERO VINCENTE: EVIDENZIATO IN VERDE (NON LAMPEGGIANTE)
                    cell.className = 'cartella-cell has-number winning-number';
                    cell.style.background = '#16a34a';
                    cell.style.color = '#ffffff';
                    cell.style.border = '2px solid #ffffff';
                    cell.style.borderRadius = '3px';
                    cell.style.fontWeight = '950';
                    cell.style.boxShadow = '0 0 10px rgba(22, 163, 74, 0.8)';
                    cell.style.animation = 'none';
                } else {
                    // NUMERO ESTRATTO REGOLARE (NON VINCENTE): RIMANE IN ROSSO
                    cell.className = 'cartella-cell has-number extracted';
                    cell.style.background = '#dc2626';
                    cell.style.color = '#ffffff';
                    cell.style.border = '1px solid #b91c1c';
                    cell.style.borderRadius = '3px';
                    cell.style.fontWeight = '900';
                    cell.style.boxShadow = '0 0 4px rgba(220, 38, 38, 0.45)';
                    cell.style.animation = 'none';
                }
            } else {
                // Cartella/striscia NON attiva oppure numero non estratto: NON MARCARE!
                cell.className = 'cartella-cell has-number';
                cell.style.background = '';
                cell.style.color = '';
                cell.style.border = '';
                cell.style.borderRadius = '';
                cell.style.boxShadow = '';
                cell.style.fontWeight = '';
            }
        });

        // Riapplica l'evidenziazione visiva dorata sul bordo della cartella in caso di Tombola
        document.querySelectorAll('.cartella').forEach(cartEl => {
            const cid = cartEl.dataset.id;
            const cartData = generatedCartelle.find(c => c.id === cid);
            if (!cartData) return;

            if (cartData.wins?.tombola || cartData.winningRow === -1) {
                cartEl.classList.add('win-tombola-cartella');
            }
            // Su richiesta esplicita dell'utente: NON evidenziamo l'intera riga o le caselle vuote in giallo.
            // SOLO i numeri vincenti effettivi vengono evidenziati in rosso.
        });
    }

    function showWinPopup(type, cartelleIds, numbers, isManual = false, resumeSeconds = 5) {
        const popup = document.getElementById('winPopup');
        const title = document.getElementById('winPopupTitle');
        const details = document.getElementById('winPopupDetails');
        const winNumbers = document.getElementById('winPopupNumbers');
        const cartellaIdElement = document.getElementById('winPopupCartellaId');
        const winners = document.getElementById('winPopupWinners');
        const autoResumeBox = document.getElementById('winAutoResumeBox');
        const pauseBtn = document.getElementById('winPopupPauseBtn');
        const closeBtn = document.getElementById('winPopupClose');

        if (!popup || !title || !details || !winNumbers || !cartellaIdElement || !winners) return;

        let typeText, message, prizeAmount = 0, currency = document.getElementById('currencySelect').value;
        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;

        switch(type) {
            case 'gold':
                typeText = currentLanguage === 'it' ? 'NUMERO GOLD' : 'GOLD NUMBER';
                message = currentLanguage === 'it' ? 'Complimenti! Hai estratto il Numero Gold!' : 'Congratulations! You extracted the Gold Number!';
                prizeAmount = prizePool * 0.05;
                break;
            case 'ambo':
                typeText = currentLanguage === 'it' ? 'AMBO' : 'AMBO';
                message = currentLanguage === 'it' ? 'Complimenti! È stato fatto Ambo!' : 'Congratulations! Ambo has been made!';
                prizeAmount = prizePool * 0.05;
                break;
            case 'terno':
                typeText = currentLanguage === 'it' ? 'TERNO' : 'TERNO';
                message = currentLanguage === 'it' ? 'Complimenti! È stato fatto Terno!' : 'Congratulations! Terno has been made!';
                prizeAmount = prizePool * 0.10;
                break;
            case 'quaterna':
                typeText = currentLanguage === 'it' ? 'QUATERNA' : 'QUATERNA';
                message = currentLanguage === 'it' ? 'Complimenti! È stata fatta Quaterna!' : 'Congratulations! Quaterna has been made!';
                prizeAmount = prizePool * 0.15;
                break;
            case 'cinquina':
                typeText = currentLanguage === 'it' ? 'CINQUINA' : 'CINQUINA';
                message = currentLanguage === 'it' ? 'Complimenti! È stata fatta Cinquina!' : 'Congratulations! Cinquina has been made!';
                prizeAmount = prizePool * 0.20;
                break;
            case 'tombola':
                typeText = currentLanguage === 'it' ? 'TOMBOLA' : 'TOMBOLA';
                message = currentLanguage === 'it' ? 'TOMBOLA! IL GIOCO È TERMINATO!' : 'TOMBOLA! THE GAME IS OVER!';
                prizeAmount = prizePool * 0.45;
                break;
        }

        title.textContent = typeText + '!';
        details.textContent = message;
        winNumbers.textContent = numbers.join(', ');
        cartellaIdElement.textContent = cartelleIds[0];
        cartellaIdElement.style.display = 'block';

        let winnersText = '';
        if (cartelleIds.length === 1) {
            winnersText = currentLanguage === 'it' ? `Vincitore: ${cartelleIds[0]}` : `Winner: ${cartelleIds[0]}`;
        } else {
            winnersText = currentLanguage === 'it' ? `Vincitori: ${cartelleIds.join(', ')} (Premio suddiviso)` : `Winners: ${cartelleIds.join(', ')} (Prize split)`;
        }
        winnersText += `<br><strong>${currency}${prizeAmount.toFixed(2)}</strong>`;
        winners.innerHTML = winnersText;

        // Gestione Auto-Ripresa o Manuale
        clearInterval(winAutoResumeInterval);
        isWinPausedManually = false;

        if (isManual || type === 'tombola') {
            if (autoResumeBox) autoResumeBox.style.display = 'none';
            if (pauseBtn) pauseBtn.style.display = 'none';
            if (closeBtn) closeBtn.innerHTML = currentLanguage === 'it' ? '<i class="fas fa-check"></i> CONTINUA' : '<i class="fas fa-check"></i> CONTINUE';
        } else {
            if (autoResumeBox) autoResumeBox.style.display = 'block';
            if (pauseBtn) {
                pauseBtn.style.display = 'inline-flex';
                pauseBtn.className = 'win-popup-btn win-pause-btn';
                pauseBtn.innerHTML = currentLanguage === 'it' ? '<i class="fas fa-pause"></i> PAUSA PER VERIFICA' : '<i class="fas fa-pause"></i> PAUSE TO VERIFY';
            }
            if (closeBtn) closeBtn.innerHTML = currentLanguage === 'it' ? '<i class="fas fa-play"></i> CONTINUA SUBITO' : '<i class="fas fa-play"></i> RESUME NOW';

            const resumeLabel = document.getElementById('winAutoResumeText');
            if (resumeLabel) {
                resumeLabel.innerHTML = currentLanguage === 'it' 
                    ? `Ripresa automatica estrazione in <b id="winAutoResumeCountdown">${resumeSeconds}</b>s`
                    : `Auto-resuming in <b id="winAutoResumeCountdown">${resumeSeconds}</b>s`;
            }

            const fillBar = document.getElementById('winAutoResumeBar');
            if (fillBar) {
                fillBar.style.transition = 'none';
                fillBar.style.width = '100%';
                setTimeout(() => {
                    fillBar.style.transition = `width ${resumeSeconds}s linear`;
                    fillBar.style.width = '0%';
                }, 50);
            }

            winAutoResumeSecondsLeft = resumeSeconds;
            winAutoResumeInterval = setInterval(() => {
                winAutoResumeSecondsLeft--;
                const countdownEl = document.getElementById('winAutoResumeCountdown');
                if (winAutoResumeSecondsLeft > 0) {
                    if (countdownEl) countdownEl.textContent = winAutoResumeSecondsLeft;
                } else {
                    clearInterval(winAutoResumeInterval);
                    closeWinPopupAndResume();
                }
            }, 1000);
        }

        popup.style.display = 'flex';
        playSound('win');
    }

    function closeWinPopupAndResume() {
        clearInterval(winAutoResumeInterval);
        const popup = document.getElementById('winPopup');
        if (popup) popup.style.display = 'none';
        isPausedForWin = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('extractBtn').disabled = false;
        document.getElementById('cleanBtn').disabled = false;
        syncRegiaUI();

        // Se l'estrazione automatica era attiva prima della vincita, RIPARTE AUTOMATICAMENTE
        if (wasAutoRunningBeforeWin && !cartelleWins.tombola.gameEnded && extractedNumbers.length < 90) {
            wasAutoRunningBeforeWin = false;
            startTimer();
            logRegiaEvent('Estrazione ripresa automaticamente senza interruzione.', 'info');
            syncRegiaUI();
        }
    }

    function showFloatingWinBanner(type, cartelleIds, numbers) {
        const banner = document.getElementById('winFloatingBanner');
        const title = document.getElementById('winBannerTitle');
        const sub = document.getElementById('winBannerSub');
        if (!banner || !title || !sub) return;

        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
        const currency = document.getElementById('currencySelect').value || '€';
        let pct = 0.05;
        if (type === 'terno') pct = 0.10;
        else if (type === 'quaterna') pct = 0.15;
        else if (type === 'cinquina') pct = 0.20;

        title.textContent = `${type.toUpperCase()}! Cartella ${cartelleIds[0]}`;
        sub.textContent = `Numeri vincenti: ${numbers.join(', ')} • Premio: ${currency}${(prizePool * pct).toFixed(2)}`;

        banner.style.display = 'flex';
        clearTimeout(window._winBannerTimeout);
        window._winBannerTimeout = setTimeout(() => {
            banner.style.display = 'none';
        }, 6000);
    }

    function updateWinsDisplay() {
        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
        const currency = document.getElementById('currencySelect').value;

        // Gold (solo se vinto e non scaduto)
        document.getElementById('win-gold-count').textContent = cartelleWins.gold.winCount;
        if (cartelleWins.gold.won && !goldExpired && cartelleWins.gold.cartellaId && isCartellaActive(cartelleWins.gold.cartellaId)) {
            const prize = prizePool * 0.05;
            document.getElementById('win-gold-value').textContent = `${currency}${prize.toFixed(2)}`;
            document.getElementById('win-gold-details-large').innerHTML = `<span style="color: black; background-color: #d4f7dc; padding: 3px 6px; border-radius: 4px; font-size: 12px; width: 200px; display: inline-block;">${cartelleWins.gold.cartellaId}</span>`;
        } else {
            document.getElementById('win-gold-value').textContent = '--';
            document.getElementById('win-gold-details-large').innerHTML = '';
        }

        // Ambo
        document.getElementById('win-ambo-count').textContent = cartelleWins.ambo.winCount;
        if (cartelleWins.ambo.won && cartelleWins.ambo.cartellaId && isCartellaActive(cartelleWins.ambo.cartellaId)) {
            const prize = prizePool * 0.05;
            document.getElementById('win-ambo-value').textContent = `${currency}${prize.toFixed(2)}`;
            document.getElementById('win-ambo-details-large').innerHTML = `<span style="color: black; background-color: #d4f7dc; padding: 3px 6px; border-radius: 4px; font-size: 12px; width: 200px; display: inline-block;">${cartelleWins.ambo.cartellaId}</span>`;
        } else {
            document.getElementById('win-ambo-value').textContent = '--';
            document.getElementById('win-ambo-details-large').innerHTML = '';
        }

        // Terno
        document.getElementById('win-terno-count').textContent = cartelleWins.terno.winCount;
        if (cartelleWins.terno.won && cartelleWins.terno.cartellaId && isCartellaActive(cartelleWins.terno.cartellaId)) {
            const prize = prizePool * 0.10;
            document.getElementById('win-terno-value').textContent = `${currency}${prize.toFixed(2)}`;
            document.getElementById('win-terno-details-large').innerHTML = `<span style="color: black; background-color: #d4f7dc; padding: 3px 6px; border-radius: 4px; font-size: 12px; width: 200px; display: inline-block;">${cartelleWins.terno.cartellaId}</span>`;
        } else {
            document.getElementById('win-terno-value').textContent = '--';
            document.getElementById('win-terno-details-large').innerHTML = '';
        }

        // Quaterna
        document.getElementById('win-quaterna-count').textContent = cartelleWins.quaterna.winCount;
        if (cartelleWins.quaterna.won && cartelleWins.quaterna.cartellaId && isCartellaActive(cartelleWins.quaterna.cartellaId)) {
            const prize = prizePool * 0.15;
            document.getElementById('win-quaterna-value').textContent = `${currency}${prize.toFixed(2)}`;
            document.getElementById('win-quaterna-details-large').innerHTML = `<span style="color: black; background-color: #d4f7dc; padding: 3px 6px; border-radius: 4px; font-size: 12px; width: 200px; display: inline-block;">${cartelleWins.quaterna.cartellaId}</span>`;
        } else {
            document.getElementById('win-quaterna-value').textContent = '--';
            document.getElementById('win-quaterna-details-large').innerHTML = '';
        }

        // Cinquina
        document.getElementById('win-cinquina-count').textContent = cartelleWins.cinquina.winCount;
        if (cartelleWins.cinquina.won && cartelleWins.cinquina.cartellaId && isCartellaActive(cartelleWins.cinquina.cartellaId)) {
            const prize = prizePool * 0.20;
            document.getElementById('win-cinquina-value').textContent = `${currency}${prize.toFixed(2)}`;
            document.getElementById('win-cinquina-details-large').innerHTML = `<span style="color: black; background-color: #d4f7dc; padding: 3px 6px; border-radius: 4px; font-size: 12px; width: 200px; display: inline-block;">${cartelleWins.cinquina.cartellaId}</span>`;
        } else {
            document.getElementById('win-cinquina-value').textContent = '--';
            document.getElementById('win-cinquina-details-large').innerHTML = '';
        }

        // Tombola
        document.getElementById('win-tombola-count').textContent = cartelleWins.tombola.winCount;
        if (cartelleWins.tombola.won && cartelleWins.tombola.cartellaId && isCartellaActive(cartelleWins.tombola.cartellaId)) {
            const prize = prizePool * 0.45;
            document.getElementById('win-tombola-value').textContent = `${currency}${prize.toFixed(2)}`;
            document.getElementById('win-tombola-details-large').innerHTML = `<span style="color: black; background-color: #d4f7dc; padding: 3px 6px; border-radius: 4px; font-size: 12px; width: 200px; display: inline-block;">${cartelleWins.tombola.cartellaId}</span>`;
        } else {
            document.getElementById('win-tombola-value').textContent = '--';
            document.getElementById('win-tombola-details-large').innerHTML = '';
        }
    }

    function generateCartelle() {
        try {
            const gameId = document.getElementById('gameId').value || "TOM001";
            const numGiocatori = parseInt(document.getElementById('numGiocatori').value) || 1;
            const startSheet = parseInt(document.getElementById('startSheet').value) || 1;
            participatingGiocatori = parseInt(document.getElementById('participatingGiocatori').value) || 0;

            if (participatingGiocatori > numGiocatori) {
                participatingGiocatori = numGiocatori;
                document.getElementById('participatingGiocatori').value = numGiocatori;
                showErrorPopup(currentLanguage === 'it' ? "Il numero di partecipanti non può essere maggiore del numero totale di giocatori. Impostato a " + numGiocatori : "Number of participants cannot be greater than total players. Set to " + numGiocatori);
            }

            cartelleGameId = gameId;
            generatedCartelle =[];
            winningNumbersByCartella = {};

            cartelleWins = {
                gold: { won: false, cartellaId: null, number: null, winCount: 0 },
                ambo: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
                terno: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
                quaterna: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
                cinquina: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
                tombola: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, gameEnded: false, winCount: 0, preventedCount: 0 }
            };

            const colors = ['blue', 'orange', 'green', 'yellow'];
            for (let player = 1; player <= numGiocatori; player++) {
                const sheetNumber = startSheet + player - 1;
                let cartellaSheetCounter = 1;
                for (let colorIndex = 0; colorIndex < colors.length; colorIndex++) {
                    const color = colors[colorIndex];
                    // Ogni striscia ha 6 cartelle che contengono tutti i 90 numeri autentici della Tombola
                    const stripCards = generateCartellaNumbersForSheet();
                    for (let stripIndex = 0; stripIndex < 6; stripIndex++) {
                        const stripCardNum = stripIndex + 1;
                        const cartellaNum = cartellaSheetCounter++;
                        const numbers = stripCards[stripIndex];
                        createCartella(gameId, sheetNumber, cartellaNum, color, player, numbers, stripCardNum);
                    }
                }
            }

            updateColorSheetsFromCartelle();
            renderCartelle();
            updateWinsDisplay();
            updateGameStats();
            if (aiIntelligenceEnabled) analyzeAllCartelleAdvanced();

            if (generatedCartelle.length > 0) {
                getGoldNumberForExtraction();
            }

            showSuccessPopup(currentLanguage === 'it' ?
                `Generazione completata! Cartelle: ${generatedCartelle.length} (4 strisce x 6 cartelle = 24 per foglio) | Fogli: ${new Set(generatedCartelle.map(c => c.sheetNumber)).size} | Giocatori: ${numGiocatori}` :
                `Generation completed! Cards: ${generatedCartelle.length} (4 strips x 6 cards = 24 per sheet) | Sheets: ${new Set(generatedCartelle.map(c => c.sheetNumber)).size} | Players: ${numGiocatori}`);
        } catch(error) {
            console.error(error);
            showErrorPopup(`Errore: ${error.message}`);
        }
    }

    function resetCartelle() {
        showConfirmDialog(
            currentLanguage === 'it' ? "Reset Cartelle" : "Reset Cards",
            currentLanguage === 'it' 
                ? "Sei sicuro di voler resettare tutta la pagina delle cartelle?<br><strong>Tutte le cartelle generate andranno perse.</strong>" 
                : "Are you sure you want to reset all cards?<br><strong>All generated cards will be lost.</strong>",
            function() {
                executeResetCartelle();
            }
        );
    }

    function executeResetCartelle() {
        generatedCartelle = [];
        participatingGiocatori = 0;

        cartelleWins = {
            gold: { won: false, cartellaId: null, number: null, winCount: 0 },
            ambo: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
            terno: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
            quaterna: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
            cinquina: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
            tombola: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, gameEnded: false, winCount: 0, preventedCount: 0 }
        };

        winningNumbersByCartella = {};
        activeColorSheets = { blue: [], orange: [], green: [], yellow:[] };

        aiAdvancedData = {
            lastAnalysis: null, cartelleAnalysis: {}, coverageIndex: 0,
            extractionHistory:[], distributionMap: {}, cartellaProgress: {},
            winPrediction: {}, colorDistribution: {}, extractionSequence: [],
            optimalExtractions:[], winDelay: {
                ambo: { targetExtractions: 0, currentDelay: 0 },
                terno: { targetExtractions: 0, currentDelay: 0 },
                quaterna: { targetExtractions: 0, currentDelay: 0 },
                cinquina: { targetExtractions: 0, currentDelay: 0 },
                tombola: { targetExtractions: 0, currentDelay: 0 }
            }
        };

        if (numeroGold) {
            const oldGoldElement = document.getElementById(`number-${numeroGold}`);
            if (oldGoldElement) {
                oldGoldElement.classList.remove('gold-star-board', 'gold-extracted-circle');
            }
        }
        numeroGold = null;
        goldWon = false;
        goldExpired = false;
        goldWinningCartella = null;

        const autoSaveToggle = document.getElementById('regiaAutoSaveCloudToggle');
        if (autoSaveToggle && autoSaveToggle.checked && unclaimedGoldTotal > 0 && window.JackpotService) {
            const amountToSave = unclaimedGoldTotal;
            const currency = document.getElementById('currencySelect').value || '€';
            const gameId = document.getElementById('gameId').value || 'TOM001';
            window.JackpotService.saveUnclaimedToDatabase(
                amountToSave,
                currency,
                'all',
                gameId,
                `Auto-salvataggio fine partita ${gameId}`
            ).then(res => {
                if (res.success) {
                    logRegiaEvent(`💾 Auto-salvati ${currency} ${amountToSave.toFixed(2)} nel Database Cloud (Partita ${gameId}).`, 'success');
                    if (typeof refreshCloudHistoryUI === 'function') refreshCloudHistoryUI();
                }
            }).catch(e => console.warn('Auto-save error:', e));
        }
        unclaimedGoldTotal = 0;
        updateUnclaimedPotDisplay();

        const tvBadge = document.getElementById('tvRolloverBadge');
        if (tvBadge) tvBadge.style.display = 'none';

        document.getElementById('gameId').value = "TOM001";
        document.getElementById('numGiocatori').value = "1";
        document.getElementById('startSheet').value = "1";
        document.getElementById('participatingGiocatori').value = "0";

        const container = document.getElementById('cartelleContainer');
        if (container) container.innerHTML = '';

        document.getElementById('jackpot-title').style.display = 'flex';
        document.getElementById('winningCartellaDisplay').style.display = 'none';
        document.getElementById('winningCartellaDisplay').innerHTML = '';

        updateBoxAGold();
        updateGoldNumberOnBoard();
        updateCartelleStats();
        updateWinsDisplay();
        updateGameStats();
        initColorControls();
        updateAIAnalysisDisplay();
        renderCartelle();

        logRegiaEvent('Reset cartelle completato con successo.', 'warn');
        syncRegiaUI();
        showSuccessPopup(currentLanguage === 'it' ? "Cartelle resettate con successo!" : "Cards reset successfully!");
    }

    function exportCartelleToJSON() {
        try {
            const exportData = {
                gameId: cartelleGameId,
                exportDate: new Date().toISOString(),
                extractedNumbers: extractedNumbers,
                participatingGiocatori,
                numeroGold,
                goldWon,
                goldExpired,
                goldWinningCartella,
                unclaimedGoldTotal,
                cartelle: generatedCartelle.map(c => ({ ...c })),
                wins: cartelleWins,
                activeColorSheets,
                aiAdvancedData
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const linkElement = document.createElement('a');
            linkElement.href = url;
            linkElement.download = `Tombola_Gold_${cartelleGameId}_${new Date().getTime()}.json`;
            document.body.appendChild(linkElement);
            linkElement.click();
            document.body.removeChild(linkElement);
            URL.revokeObjectURL(url);
        } catch(error) {
            console.error(error);
            showErrorPopup("Errore export JSON");
        }
    }

    function importCartelleFromJSON(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (!data.gameId || !data.cartelle) throw new Error("Formato JSON non valido");

            cartelleGameId = data.gameId;
            generatedCartelle =[];
            winningNumbersByCartella = {};

            if (data.participatingGiocatori !== undefined) {
                participatingGiocatori = data.participatingGiocatori;
                document.getElementById('participatingGiocatori').value = participatingGiocatori;
            } else {
                participatingGiocatori = 0;
                document.getElementById('participatingGiocatori').value = 0;
            }

            if (data.unclaimedGoldTotal !== undefined) {
                unclaimedGoldTotal = data.unclaimedGoldTotal;
                updateUnclaimedPotDisplay();
            } else {
                unclaimedGoldTotal = 0;
                updateUnclaimedPotDisplay();
            }

            if (data.numeroGold) {
                numeroGold = data.numeroGold;
                goldWon = data.goldWon || false;
                goldExpired = data.goldExpired || false;
                goldWinningCartella = data.goldWinningCartella || null;
            } else {
                numeroGold = null;
                goldWon = false;
                goldExpired = false;
                goldWinningCartella = null;
            }

            data.cartelle.forEach(c => {
                const cartellaData = {
                    ...c,
                    extractedNumbers: c.extractedNumbers ||[],
                    wins: c.wins || { ambo: false, terno: false, quaterna: false, cinquina: false, tombola: false },
                    winningNumbers: c.winningNumbers ||[]
                };
                generatedCartelle.push(cartellaData);
                winningNumbersByCartella[cartellaData.id] = cartellaData.winningNumbers ||[];
            });

            if (data.wins) cartelleWins = data.wins;
            if (data.activeColorSheets) activeColorSheets = data.activeColorSheets;
            else updateColorSheetsFromCartelle();
            if (data.aiAdvancedData) aiAdvancedData = data.aiAdvancedData;

            document.getElementById('gameId').value = cartelleGameId;
            document.getElementById('numGiocatori').value = Math.max(...generatedCartelle.map(c => c.playerNumber));
            document.getElementById('startSheet').value = Math.min(...generatedCartelle.map(c => c.sheetNumber));

            document.querySelectorAll('.number').forEach(num => {
                num.classList.remove('gold-star-board', 'gold-extracted-circle');
            });
            updateGoldNumberOnBoard();

            updateBoxAGold();
            renderCartelle();
            updateWinsDisplay();
            updateGameStats();
            initColorControls();
            if (aiIntelligenceEnabled) analyzeAllCartelleAdvanced();

            if (generatedCartelle.length > 0 && numeroGold === null) {
                getGoldNumberForExtraction();
            }

            document.getElementById('jsonImportOverlay').classList.remove('active');
            document.getElementById('jsonImportTextarea').value = '';

            showSuccessPopup(currentLanguage === 'it' ? `Importate ${generatedCartelle.length} cartelle con successo!` : `Successfully imported ${generatedCartelle.length} cards!`);
        } catch(error) {
            console.error(error);
            showErrorPopup("Errore importazione JSON: " + error.message);
        }
    }

    async function exportToPDF() {
        const fogli = document.querySelectorAll('.foglio-a4');
        if (fogli.length === 0) {
            showErrorPopup(currentLanguage === 'it' ? 'Nessuna cartella generata' : 'No cards generated');
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'mm', 'a4');
            const gameId = cartelleGameId;
            const numCartelle = generatedCartelle.length;
            const timestamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
            const fileName = `Tombola_Gold_${gameId}_${numCartelle}Cartelle_${timestamp}.pdf`;

            const waitingMsg = document.createElement('div');
            waitingMsg.id = 'pdf-waiting-msg';
            waitingMsg.style.position = 'fixed';
            waitingMsg.style.top = '50%';
            waitingMsg.style.left = '50%';
            waitingMsg.style.transform = 'translate(-50%, -50%)';
            waitingMsg.style.backgroundColor = 'rgba(0,0,0,0.8)';
            waitingMsg.style.color = 'white';
            waitingMsg.style.padding = '20px';
            waitingMsg.style.borderRadius = '10px';
            waitingMsg.style.zIndex = '9999';
            waitingMsg.style.textAlign = 'center';
            waitingMsg.innerHTML = currentLanguage === 'it' ?
                '<i class="fas fa-spinner fa-spin"></i> Generazione PDF in corso...<br>Elaborazione fogli...' :
                '<i class="fas fa-spinner fa-spin"></i> Generating PDF...<br>Processing sheets...';
            document.body.appendChild(waitingMsg);

            pdf.setFillColor(21,101,192);
            pdf.rect(0,0,297,210,'F');
            pdf.setTextColor(255,255,255);
            pdf.setFont('helvetica','bold');
            pdf.setFontSize(26);
            pdf.text('LUONGO TOMBOLA 90 ITALIA - GOLD EDITION',148.5,45,null,null,'center');
            pdf.setFontSize(20);
            pdf.text(cartelleGameId,148.5,70,null,null,'center');
            pdf.setFontSize(16);
            pdf.text(`Cartelle generate: ${numCartelle} (24 per foglio A4)`,148.5,95,null,null,'center');
            pdf.text(`Fogli A4: ${fogli.length}`,148.5,110,null,null,'center');
            pdf.text(`Colori: Blu, Arancione, Verde, Giallo (6 cartelle per striscia)`,148.5,125,null,null,'center');
            pdf.text(`Data: ${new Date().toLocaleDateString('it-IT')}`,148.5,145,null,null,'center');
            pdf.setFontSize(12);
            pdf.text('Generato con LUONGO Tombola 90 Italia',148.5,190,null,null,'center');

            for (let i = 0; i < fogli.length; i++) {
                if (waitingMsg) waitingMsg.innerHTML = currentLanguage === 'it' ?
                    `<i class="fas fa-spinner fa-spin"></i> Generazione PDF in corso...<br>Foglio ${i+1} di ${fogli.length}` :
                    `<i class="fas fa-spinner fa-spin"></i> Generating PDF...<br>Sheet ${i+1} of ${fogli.length}`;

                await new Promise(resolve => setTimeout(resolve,10));
                const foglio = fogli[i];
                pdf.addPage('a4', 'l');
                const canvas = await html2canvas(foglio, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
                const imgData = canvas.toDataURL('image/jpeg',0.95);
                const pageWidth = 297;
                const pageHeight = 210;
                const imgProps = pdf.getImageProperties(imgData);
                let pdfWidth = pageWidth;
                let pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                if (pdfHeight > pageHeight) {
                    pdfHeight = pageHeight;
                    pdfWidth = (imgProps.width * pdfHeight) / imgProps.height;
                }

                const xOffset = (pageWidth - pdfWidth) / 2;
                const yOffset = (pageHeight - pdfHeight) / 2;
                pdf.addImage(imgData,'JPEG',xOffset,yOffset,pdfWidth,pdfHeight);
            }

            if (document.getElementById('pdf-waiting-msg')) document.body.removeChild(document.getElementById('pdf-waiting-msg'));
            pdf.save(fileName);
            showSuccessPopup(currentLanguage === 'it' ? `PDF salvato: ${fileName}` : `PDF saved: ${fileName}`);
        } catch(error) {
            console.error(error);
            if (document.getElementById('pdf-waiting-msg')) document.body.removeChild(document.getElementById('pdf-waiting-msg'));
            showErrorPopup("Error: " + error.message);
        }
    }

    function showCartelleSection() {
        document.getElementById('cartelleSection').classList.add('active');
        document.querySelector('.main-container').style.display = 'none';
        document.querySelector('header').style.display = 'none';
        document.querySelector('nav').style.display = 'none';
    }

    function hideCartelleSection() {
        document.getElementById('cartelleSection').classList.remove('active');
        document.querySelector('.main-container').style.display = 'block';
        document.querySelector('header').style.display = 'flex';
        document.querySelector('nav').style.display = 'flex';
    }

    function getAudioCtx() {
        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
            sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume();
        }
        return sharedAudioCtx;
    }

    function playSound(type) {
        if (!audioEnabled) return;
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'extract') {
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.5);
            } else if (type === 'win') {
                osc.frequency.setValueAtTime(523.25, ctx.currentTime);
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.5, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            }
        } catch(e) {
            console.log("Audio error:", e);
        }
    }

    function updateClock() {
        const now = new Date();
        document.getElementById('hours').textContent = String(now.getHours()).padStart(2,'0');
        document.getElementById('minutes').textContent = String(now.getMinutes()).padStart(2,'0');
        document.getElementById('seconds').textContent = String(now.getSeconds()).padStart(2,'0');
    }

    function updateCountdown() {
        const cdMain = document.getElementById('countdown');
        if (cdMain) cdMain.textContent = `${remainingTime}s`;

        const cdNum = document.getElementById('countdownNumber');
        if (cdNum) {
            cdNum.textContent = remainingTime;
            // Pulsing animation effect on each second tick
            cdNum.classList.remove('pulse');
            void cdNum.offsetWidth; // Force DOM reflow to retrigger CSS animation
            cdNum.classList.add('pulse');
        }

        const ring = document.getElementById('countdownProgressRing');
        if (ring) {
            const circumference = 238.761; // 2 * PI * 38
            const baseTimer = currentTimer > 0 ? currentTimer : 5;
            const progress = Math.max(0, Math.min(1, remainingTime / baseTimer));
            const offset = circumference * (1 - progress);
            ring.style.strokeDashoffset = offset;
        }

        const statusBadge = document.getElementById('countdownStatusBadge');
        const statusText = document.getElementById('countdownStatusText');
        if (statusBadge && statusText) {
            if (isRunning) {
                statusBadge.className = 'countdown-status-badge live';
                statusText.textContent = 'LIVE';
            } else if (isPausedForWin || (!isRunning && extractedNumbers.length > 0 && extractedNumbers.length < 90)) {
                statusBadge.className = 'countdown-status-badge paused';
                statusText.textContent = 'PAUSA';
            } else {
                statusBadge.className = 'countdown-status-badge ready';
                statusText.textContent = 'PRONTO';
            }
        }

        const cdRegia = document.getElementById('regiaCountdownDisplay');
        if (cdRegia) cdRegia.textContent = `${remainingTime}s`;
    }

    function updateExtractionStats() {
        document.getElementById('extractedCount').textContent = extractedNumbers.length;
        document.getElementById('remainingCount').textContent = 90 - extractedNumbers.length;
    }

    function updatePrizes() {
        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
        const currency = document.getElementById('currencySelect').value;

        if (!isNaN(prizePool) && prizePool > 0) {
            document.getElementById('goldPrize').innerHTML = `${currency}${(prizePool*0.05).toFixed(2)} <span class="percentage">(5%)</span>`;
            document.getElementById('amboPrize').innerHTML = `${currency}${(prizePool*0.05).toFixed(2)} <span class="percentage">(5%)</span>`;
            document.getElementById('ternoPrize').innerHTML = `${currency}${(prizePool*0.1).toFixed(2)} <span class="percentage">(10%)</span>`;
            document.getElementById('quaternaPrize').innerHTML = `${currency}${(prizePool*0.15).toFixed(2)} <span class="percentage">(15%)</span>`;
            document.getElementById('cinquinaPrize').innerHTML = `${currency}${(prizePool*0.2).toFixed(2)} <span class="percentage">(20%)</span>`;
            document.getElementById('tombolaPrize').innerHTML = `${currency}${(prizePool*0.45).toFixed(2)} <span class="percentage">(45%)</span>`;
        } else {
            document.getElementById('goldPrize').innerHTML = `-- <span class="percentage">(5%)</span>`;
            document.getElementById('amboPrize').innerHTML = `-- <span class="percentage">(5%)</span>`;
            document.getElementById('ternoPrize').innerHTML = `-- <span class="percentage">(10%)</span>`;
            document.getElementById('quaternaPrize').innerHTML = `-- <span class="percentage">(15%)</span>`;
            document.getElementById('cinquinaPrize').innerHTML = `-- <span class="percentage">(20%)</span>`;
            document.getElementById('tombolaPrize').innerHTML = `-- <span class="percentage">(45%)</span>`;
        }
        updateWinsDisplay();
        updateGameStats();
        updateUnclaimedPotDisplay();
    }

    function updateProgress() {
        const progress = (extractedNumbers.length / 90) * 100;
        document.getElementById('extractionProgress').style.width = `${progress}%`;
        document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
        updateExtractionStats();
    }

    // Regole Ufficiali Tombola: progressione premi strettamente sequenziale crescente
    function getSequentialActivePrize() {
        const sequence = ['ambo', 'terno', 'quaterna', 'cinquina', 'tombola'];
        for (const prize of sequence) {
            const isWon = cartelleWins[prize] && cartelleWins[prize].won;
            const isExpired = prizeDelaysConfig[prize] && prizeDelaysConfig[prize].expired;
            if (!isWon && !isExpired) {
                return prize;
            }
        }
        return null;
    }

    function checkCartelleWinsAdvanced(newNumber) {
        let newWins = false;
        let winningType = null, winningCartellaIds =[], winningNumbers =[];

        if (newNumber === numeroGold) {
            applyGoldExtractedVisual();

            if (!goldExpired && !goldWon && !prizeDelaysConfig.gold.expired) {
                const cartellaConGold = generatedCartelle.find(c => isCartellaActive(c.id) && c.numbers.some(n => n.number === numeroGold));
                if (cartellaConGold) {
                    goldWon = true;
                    goldWinningCartella = cartellaConGold.id;
                    cartelleWins.gold.won = true;
                    cartelleWins.gold.cartellaId = cartellaConGold.id;
                    cartelleWins.gold.number = numeroGold;
                    cartelleWins.gold.winCount++;
                    winningType = 'gold';
                    winningCartellaIds = [cartellaConGold.id];
                    winningNumbers = [numeroGold];
                    newWins = true;
                    gameStats.lastWinTime = Date.now();

                    if (!winningNumbersByCartella[cartellaConGold.id]) winningNumbersByCartella[cartellaConGold.id] = [];
                    winningNumbersByCartella[cartellaConGold.id].push(numeroGold);
                    cartellaConGold.winningNumbers = winningNumbersByCartella[cartellaConGold.id];

                    const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
                    const goldPrizeAmount = prizePool * 0.05;
                    showGoldExtractedNotification(cartellaConGold.id, goldPrizeAmount);
                    updateWinsDisplay();
                }
            } else if (prizeDelaysConfig.gold.expired) {
                logRegiaEvent(`Estratto Numero Gold ${numeroGold}, ma il premio era già SCADUTO (trasferito a Non Vinti).`, 'warn');
            }
        }

        // 1. Aggiorna extractedNumbers su tutte le cartelle attive che contengono newNumber
        generatedCartelle.forEach(cartella => {
            if (!isCartellaActive(cartella.id)) return;
            const hasNum = cartella.numbers.some(n => n.number === newNumber);
            if (hasNum && !cartella.extractedNumbers.includes(newNumber)) {
                cartella.extractedNumbers.push(newNumber);
            }
        });

        // 2. Regole Ufficiali Tombola - Verifica sequenziale crescente: Ambo -> Terno -> Quaterna -> Cinquina -> Tombola
        const activePrize = getSequentialActivePrize();
        let winningRowIndex = null;

        if (activePrize) {
            for (let cIdx = 0; cIdx < generatedCartelle.length; cIdx++) {
                const cartella = generatedCartelle[cIdx];
                if (!isCartellaActive(cartella.id)) continue;
                if (!cartella.numbers.some(n => n.number === newNumber)) continue;

                if (activePrize === 'tombola') {
                    if (!cartella.wins.tombola && cartella.extractedNumbers.length === 15 && !cartelleWins.tombola.won) {
                        if (prizeDelaysConfig.tombola.expired) {
                            cartella.wins.tombola = true;
                            logRegiaEvent(`Tombola completata su cartella #${cartella.id}, ma premio Tombola SCADUTO (andato a Non Vinti).`, 'warn');
                        } else {
                            const minTarget = antiWinDifficultyConfig.enabled ? antiWinDifficultyConfig.forcedMin.tombola : 0;
                            if (extractedNumbers.length >= minTarget || cartelleWins.tombola.preventedCount > 7) {
                                cartella.wins.tombola = true;
                                cartella.winningRow = -1;
                                cartella.winningNumbers = cartella.extractedNumbers.slice();
                                winningNumbersByCartella[cartella.id] = cartella.extractedNumbers.slice();
                                cartelleWins.tombola.won = true;
                                cartelleWins.tombola.cartellaId = cartella.id;
                                cartelleWins.tombola.winningRow = -1;
                                cartelleWins.tombola.numbers = cartella.extractedNumbers.slice();
                                cartelleWins.tombola.extractionCount = extractedNumbers.length;
                                cartelleWins.tombola.gameEnded = true;
                                cartelleWins.tombola.winCount++;
                                winningType = 'tombola';
                                winningCartellaIds.push(cartella.id);
                                winningNumbers = cartella.extractedNumbers.slice();
                                winningRowIndex = -1;
                                newWins = true;
                                gameStats.lastWinTime = Date.now();
                                break;
                            } else {
                                cartelleWins.tombola.preventedCount++;
                            }
                        }
                    }
                } else {
                    // Premi di riga: ambo (2), terno (3), quaterna (4), cinquina (5)
                    const requiredCount = activePrize === 'ambo' ? 2 :
                                          activePrize === 'terno' ? 3 :
                                          activePrize === 'quaterna' ? 4 : 5;

                    let prizeAwarded = false;
                    for (let row = 0; row < 3; row++) {
                        const rowNumbers = cartella.numbers.filter(n => n.row === row).map(n => n.number);
                        if (!rowNumbers.includes(newNumber)) continue;

                        const extractedInRow = rowNumbers.filter(n => extractedNumbers.includes(n));
                        if (extractedInRow.length >= requiredCount && !cartella.wins[activePrize] && !cartelleWins[activePrize].won) {
                            if (prizeDelaysConfig[activePrize].expired) {
                                cartella.wins[activePrize] = true;
                                logRegiaEvent(`${activePrize.toUpperCase()} su cartella #${cartella.id}, ma premio SCADUTO (andato a Montepremi Non Vinti).`, 'warn');
                            } else {
                                const minTarget = antiWinDifficultyConfig.enabled ? (antiWinDifficultyConfig.forcedMin[activePrize] || 0) : 0;
                                const maxPrevented = activePrize === 'ambo' ? 4 : activePrize === 'terno' ? 4 : activePrize === 'quaterna' ? 5 : 6;
                                if (extractedNumbers.length >= minTarget || cartelleWins[activePrize].preventedCount > maxPrevented) {
                                    const wonNums = extractedInRow.slice(0, requiredCount);
                                    cartella.wins[activePrize] = true;
                                    cartella.winningRow = row;
                                    cartella.winningNumbers = wonNums;
                                    winningNumbersByCartella[cartella.id] = wonNums;
                                    cartelleWins[activePrize].won = true;
                                    cartelleWins[activePrize].cartellaId = cartella.id;
                                    cartelleWins[activePrize].winningRow = row;
                                    cartelleWins[activePrize].numbers = wonNums;
                                    cartelleWins[activePrize].extractionCount = extractedNumbers.length;
                                    cartelleWins[activePrize].winCount++;
                                    winningType = activePrize;
                                    winningCartellaIds.push(cartella.id);
                                    winningNumbers = wonNums;
                                    winningRowIndex = row;
                                    newWins = true;
                                    gameStats.lastWinTime = Date.now();
                                    prizeAwarded = true;
                                    break;
                                } else {
                                    cartelleWins[activePrize].preventedCount++;
                                }
                            }
                        }
                    }
                    if (prizeAwarded) break;
                }
            }
        }

        if (newWins && winningType && winningCartellaIds.length > 0) {
            handleGameWinEvent(winningType, winningCartellaIds, winningNumbers, winningRowIndex);
        }

        updateWinsDisplay();
        updateCartelleExtractedNumbers();
        updateGameStats();
        if (document.getElementById('cartelleSection').classList.contains('active')) renderCartelle();
        if (aiIntelligenceEnabled) analyzeAllCartelleAdvanced();
    }

    function processExtractedNumber(newNumber, isFromRemote = false, customSmorfia = '') {
        if (!newNumber || extractedNumbers.includes(newNumber)) return;

        if (numeroGold === null && generatedCartelle.length > 0) {
            getGoldNumberForExtraction();
        }

        extractedNumbers.push(newNumber);
        extractionCount++;
        lastExtractionTime = Date.now();
        if (!extractionStartTime) extractionStartTime = Date.now();
        playSound('extract');
        speakNumber(newNumber);

        const currentNumberElement = document.getElementById('currentNumber');
        if (currentNumberElement) {
            currentNumberElement.textContent = newNumber;
            currentNumberElement.classList.add('extract-animation');
            setTimeout(() => { currentNumberElement.classList.remove('extract-animation'); }, 1000);
        }

        if (customSmorfia) {
            const smorfiaEl = document.getElementById('smorfiaText');
            if (smorfiaEl) smorfiaEl.textContent = customSmorfia;
        } else {
            updateSmorfiaDisplay(newNumber);
        }

        const numberElement = document.getElementById(`number-${newNumber}`);
        if (numberElement) {
            numberElement.classList.remove('flip-circle', 'flipping-to-green-phase1', 'flipping-to-green-phase2');
            numberElement.classList.add('extracted');
            if (newNumber !== numeroGold) {
                setTimeout(() => {
                    if (numberElement.classList.contains('extracted')) {
                        // Fase 1: La pedina ROSSA ruota sull'asse Y da 0° a 90° (va di taglio)
                        numberElement.classList.add('flipping-to-green-phase1');
                        setTimeout(() => {
                            if (numberElement.classList.contains('extracted')) {
                                // Fase 2: Al taglio esatto (90°), diventa VERDE e ruota da -90° a 0° tornando frontale
                                numberElement.classList.remove('flipping-to-green-phase1');
                                numberElement.classList.add('flip-circle', 'flipping-to-green-phase2');
                                setTimeout(() => {
                                    if (numberElement.classList.contains('extracted')) {
                                        numberElement.classList.remove('flipping-to-green-phase2');
                                    }
                                }, 450);
                            }
                        }, 400);
                    }
                }, 3000);
            }
        }

        checkGoldExpiration();

        updateLastNumbers(newNumber);
        updateProgress();
        updateGameStats(newNumber);

        if (generatedCartelle.length > 0) checkCartelleWinsAdvanced(newNumber);
        else updateCartelleExtractedNumbers();

        if (extractedNumbers.length >= 90) {
            setTimeout(showTombolaPopup, 500);
            if (!cartelleWins.tombola.won) {
                handleGameEndWithoutTombola();
            }
        }

        // Sincronizzazione Live immediata con la console Regia e il Mini-Tabellone
        syncRegiaUI();
        logRegiaEvent(`Estratto numero: ${newNumber} (${extractionCount}/90).`, 'info');

        // Trasmissione WebSocket in tempo reale a tutti gli schermi TV Studio connessi
        if (!isFromRemote && window.TombolaSync) {
            const smorfiaEl = document.getElementById('smorfiaText');
            const smText = smorfiaEl ? smorfiaEl.textContent : '';
            window.TombolaSync.broadcastExtract(newNumber, smText);
        }
    }

    function extractNumber() {
        if (!canStartGame()) return;

        if (numeroGold === null && generatedCartelle.length > 0) {
            getGoldNumberForExtraction();
        }

        if (extractedNumbers.length >= 90) { showTombolaPopup(); stopTimer(); return; }
        if (cartelleWins.tombola.gameEnded) {
            showErrorPopup(currentLanguage === 'it' ? "Il gioco è terminato! Qualcuno ha fatto Tombola." : "The game is over! Someone made Tombola.");
            return;
        }
        if (isPausedForWin) {
            showErrorPopup(currentLanguage === 'it' ? "L'estrazione è in pausa per una vincita. Clicca 'CONTINUA' nel popup per riprendere." : "Extraction is paused for a win. Click 'CONTINUA' in the popup to resume.");
            return;
        }

        let newNumber;
        newNumber = selectOptimalNumberWithAdvancedAI();

        if (newNumber === null) {
            if (extractedNumbers.length === 89) {
                showTombolaPopup();
                stopTimer();
                handleGameEndWithoutTombola();
            }
            return;
        }

        processExtractedNumber(newNumber, false);
    }

    function updateLastNumbers(newNumber) {
        const lastNumbers = document.querySelectorAll('.last-number-vertical');
        for (let i = 4; i > 0; i--) {
            lastNumbers[i].textContent = lastNumbers[i-1].textContent;
            lastNumbers[i].style.background = '#1565c0';
            lastNumbers[i].style.transform = 'scale(1)';
            lastNumbers[i].style.border = '2px solid white';
        }
        lastNumbers[0].textContent = newNumber;
        lastNumbers[0].style.background = '#2ecc71';
        lastNumbers[0].style.border = '2px solid gold';
        lastNumbers[0].style.transform = 'scale(1.1)';
    }

    function startTimer(fromRemote = false) {
        if (!canStartGame()) return;

        if (numeroGold === null && generatedCartelle.length > 0) {
            getGoldNumberForExtraction();
        }

        if (isPausedForWin) {
            showErrorPopup(currentLanguage === 'it' ? "L'estrazione è in pausa per una vincita. Clicca 'CONTINUA' nel popup per riprendere." : "Extraction is paused for a win. Click 'CONTINUA' in the popup to resume.");
            return;
        }
        if (cartelleWins.tombola.gameEnded) {
            showErrorPopup(currentLanguage === 'it' ? "Il gioco è terminato! Qualcuno ha fatto Tombola." : "The game is over! Someone made Tombola.");
            return;
        }
        if (!isRunning) {
            isRunning = true;
            document.getElementById('startBtn').disabled = true;
            document.getElementById('pauseBtn').disabled = false;
            updateCountdown();
            syncRegiaUI();
            if (!startTime) {
                startTime = new Date();
                gameTimerInterval = setInterval(() => {
                    gameSeconds++;
                },1000);
            }
            countdownInterval = setInterval(() => {
                remainingTime--;
                updateCountdown();
                if (remainingTime <= 0) {
                    extractNumber();
                    remainingTime = currentTimer;
                    updateCountdown();
                }
            },1000);

            if (!fromRemote && window.TombolaSync) {
                window.TombolaSync.broadcastStartTimer(currentTimer);
            }
        }
    }

    function stopTimer(fromRemote = false) {
        isRunning = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        clearInterval(countdownInterval);
        updateCountdown();
        syncRegiaUI();

        if (!fromRemote && window.TombolaSync) {
            window.TombolaSync.broadcastPauseTimer();
        }
    }

    function resetGame(fromRemote = false) {
        if (numeroGold) {
            const oldGoldElement = document.getElementById(`number-${numeroGold}`);
            if (oldGoldElement) {
                oldGoldElement.classList.remove('gold-star-board', 'gold-extracted-circle');
            }
        }

        extractedNumbers =[];
        extractionCount = 0;
        extractionStartTime = null;
        gameSeconds = 0;
        extractionsPerMinute = 0;
        isPausedForWin = false;

        cartelleWins = {
            gold: { won: false, cartellaId: null, number: null, winCount: 0 },
            ambo: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
            terno: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
            quaterna: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
            cinquina: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, winCount: 0, preventedCount: 0 },
            tombola: { won: false, cartellaId: null, numbers:[], extractionCount: Infinity, gameEnded: false, winCount: 0, preventedCount: 0 }
        };

        winningNumbersByCartella = {};

        aiAdvancedData = {
            lastAnalysis: null, cartelleAnalysis: {}, coverageIndex: 0,
            extractionHistory:[], distributionMap: {}, cartellaProgress: {},
            winPrediction: {}, colorDistribution: {}, extractionSequence: [],
            optimalExtractions:[], winDelay: {
                ambo: { targetExtractions: 0, currentDelay: 0 },
                terno: { targetExtractions: 0, currentDelay: 0 },
                quaterna: { targetExtractions: 0, currentDelay: 0 },
                cinquina: { targetExtractions: 0, currentDelay: 0 },
                tombola: { targetExtractions: 0, currentDelay: 0 }
            }
        };

        gameStats = {
            startTime: null, endTime: null, totalExtractions: 0, extractedNumbers: [],
            remainingNumbers:[], durationSeconds: 0, winStats: { gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0 },
            extractionSpeed: 0, gameId: cartelleGameId, activeCards: 0, extractionFrequency: 0,
            extractionDensity: { low: 0, mid: 0, high: 0, display: '0/0/0%' },
            reactionTimes:[], numberDistribution: {}, hotSequences: 0, coldSequences: 0,
            tensDistribution: {}, extractionEfficiency: 0, lastWinTime: null,
            colorStats: {
                blue: { cartelle: 0, active: 0, gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0, totalWins: 0 },
                orange: { cartelle: 0, active: 0, gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0, totalWins: 0 },
                green: { cartelle: 0, active: 0, gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0, totalWins: 0 },
                yellow: { cartelle: 0, active: 0, gold: 0, ambo: 0, terno: 0, quaterna: 0, cinquina: 0, tombola: 0, totalWins: 0 }
            },
            prizeStats: { totalPrize: 0, goldPrize: 0, amboPrize: 0, ternoPrize: 0, quaternaPrize: 0, cinquinaPrize: 0, tombolaPrize: 0, currency: "€" }
        };

        goldWon = false;
        goldExpired = false;
        goldWinningCartella = null;
        numeroGold = null;
        unclaimedGoldTotal = 0;
        Object.keys(prizeDelaysConfig).forEach(k => {
            prizeDelaysConfig[k].expired = false;
        });
        antiWinDifficultyConfig.blockedNumbersCount = 0;
        isRunning = false;
        lastExtractionTime = null;
        updateUnclaimedPotDisplay();
        updateBoxAGold();
        updateGoldNumberOnBoard();

        document.querySelectorAll('.number').forEach(num => {
            num.classList.remove('extracted', 'flip-circle', 'flipping-to-green-phase1', 'flipping-to-green-phase2', 'gold-star-board', 'gold-extracted-circle', 'board-cell-win');
        });

        document.querySelectorAll('.regia-board-cell').forEach(cell => {
            cell.classList.remove('regia-cell-win');
        });

        document.querySelectorAll('.cartella').forEach(cart => {
            cart.classList.remove('win-tombola-cartella');
            cart.querySelectorAll('.cartella-cell').forEach(cell => {
                cell.classList.remove('win-row-highlight', 'winning-number');
            });
        });

        generatedCartelle.forEach(c => {
            delete c.winningRow;
            delete c.winningType;
        });

        document.getElementById('currentNumber').textContent = '--';
        updateSmorfiaDisplay(null);

        const lastNumbers = document.querySelectorAll('.last-number-vertical');
        lastNumbers.forEach(num => {
            num.textContent = '--';
            num.style.background = '#1565c0';
            num.style.transform = 'scale(1)';
            num.style.border = '2px solid white';
        });

        document.getElementById('prizePool').value = '0';
        updatePrizes();

        document.getElementById('win-gold-value').textContent = '--';
        document.getElementById('win-ambo-value').textContent = '--';
        document.getElementById('win-terno-value').textContent = '--';
        document.getElementById('win-quaterna-value').textContent = '--';
        document.getElementById('win-cinquina-value').textContent = '--';
        document.getElementById('win-tombola-value').textContent = '--';
        document.getElementById('win-gold-count').textContent = '0';
        document.getElementById('win-ambo-count').textContent = '0';
        document.getElementById('win-terno-count').textContent = '0';
        document.getElementById('win-quaterna-count').textContent = '0';
        document.getElementById('win-cinquina-count').textContent = '0';
        document.getElementById('win-tombola-count').textContent = '0';
        document.getElementById('win-gold-details-large').innerHTML = '';
        document.getElementById('win-ambo-details-large').innerHTML = '';
        document.getElementById('win-terno-details-large').innerHTML = '';
        document.getElementById('win-quaterna-details-large').innerHTML = '';
        document.getElementById('win-cinquina-details-large').innerHTML = '';
        document.getElementById('win-tombola-details-large').innerHTML = '';

        Object.keys(activeColorSheets).forEach(color => {
            activeColorSheets[color].forEach(sheet => {
                sheet.active = false;
            });
        });

        document.getElementById('jackpot-title').style.display = 'flex';
        document.getElementById('winningCartellaDisplay').style.display = 'none';
        document.getElementById('winningCartellaDisplay').innerHTML = '';

        initColorControls();
        updateAIAnalysisDisplay();
        stopTimer();
        clearInterval(gameTimerInterval);
        remainingTime = currentTimer;
        updateCountdown();
        updateProgress();
        startTime = null;

        if (generatedCartelle.length > 0) {
            generatedCartelle.forEach(cartella => {
                cartella.extractedNumbers =[];
                cartella.wins = { ambo: false, terno: false, quaterna: false, cinquina: false, tombola: false };
                cartella.winningNumbers =[];
            });
        }

        document.getElementById('startBtn').disabled = false;
        document.getElementById('extractBtn').disabled = false;
        document.getElementById('cleanBtn').disabled = false;

        updateWinsDisplay();
        updateCartelleExtractedNumbers();
        updateGameStats();

        if (document.getElementById('cartelleSection').classList.contains('active')) renderCartelle();

        if (!fromRemote && window.TombolaSync) {
            window.TombolaSync.broadcastResetGame(true, parseFloat(document.getElementById('prizePool').value) || 0, document.getElementById('currencySelect').value);
        }
    }

    function showTombolaPopup() {
        document.getElementById('popupTitle').textContent = translations[currentLanguage].popupTitle;
        document.getElementById('popupMessage').textContent = translations[currentLanguage].popupMessage;
        document.getElementById('tombolaPopup').style.display = 'flex';
    }

    function updateLanguage() {
        const lang = translations[currentLanguage];
        const elementsToUpdate =[
            { id:'nav-home', text:lang.navHome }, { id:'nav-cards', text:lang.navCards },
            { id:'fullscreen-text', text:lang.fullscreenText }, { id:'theme-light', text:lang.themeLight },
            { id:'theme-dark', text:lang.themeDark }, { id:'extracted-number-title', text:lang.extractedNumberTitle },
            { id:'last-numbers-title', text:lang.lastNumbersTitle }, { id:'prize-pool-title', text:lang.prizePoolTitle },
            { id:'gold-text', text:lang.goldText }, { id:'ambo-text', text:lang.amboText },
            { id:'terno-text', text:lang.ternoText }, { id:'quaterna-text', text:lang.quaternaText },
            { id:'cinquina-text', text:lang.cinquinaText }, { id:'tombola-text', text:lang.tombolaText },
            { id:'wins-title', text:lang.winsTitle }, { id:'win-gold-text', text:lang.winGoldText },
            { id:'win-ambo-text', text:lang.winAmboText }, { id:'win-terno-text', text:lang.winTernoText },
            { id:'win-quaterna-text', text:lang.winQuaternaText }, { id:'win-cinquina-text', text:lang.winCinquinaText },
            { id:'win-tombola-text', text:lang.winTombolaText }, { id:'countdown-title', text:lang.countdownTitle },
            { id:'play-text', text:lang.playText }, { id:'pause-text', text:lang.pauseText },
            { id:'extract-text', text:lang.extractText }, { id:'reset-text', text:lang.resetText },
            { id:'box-a-title', text:lang.boxATitle }, { id:'box-b-title', text:lang.boxBTitle },
            { id:'cartelleTitle', text:lang.cartelleTitle }, { id:'generate-text', text:lang.generateText },
            { id:'export-text', text:lang.exportText }, { id:'export-json-text', text:lang.exportJsonText },
            { id:'import-json-text', text:lang.importJsonText }, { id:'reset-cartelle-text', text:lang.resetCartelleText },
            { id:'close-text', text:lang.closeText }, { id:'gameIdLabel', text:lang.gameIdLabel },
            { id:'numGiocatoriLabel', text:lang.numGiocatoriLabel }, { id:'startSheetLabel', text:lang.startSheetLabel },
            { id:'participatingGiocatoriLabel', text:lang.participatingGiocatoriLabel }, { id:'import-json-title', text:lang.importJsonTitle },
            { id:'confirm-import-text', text:lang.confirmImportText }, { id:'total-cartelle-label', text:lang.totalCartelleLabel },
            { id:'total-fogli-label', text:lang.totalFogliLabel }, { id:'total-giocatori-label', text:lang.totalGiocatoriLabel },
            { id:'total-participating-label', text:lang.totalParticipatingLabel }, { id:'extracted-label', text:lang.extractedLabel },
            { id:'remaining-label', text:lang.remainingLabel }, { id:'progress-label', text:lang.progressLabel },
            { id:'hours-label', text:lang.hoursLabel }, { id:'minutes-label', text:lang.minutesLabel },
            { id:'seconds-label', text:lang.secondsLabel }, { id:'lang-it', text:lang.langIT },
            { id:'lang-en', text:lang.langEN }, { id:'jackpot-title', text:lang.jackpotTitle },
            { id:'tombola-italia-text', text:lang.tombolaItaliaText }, { id:'tv-mode-text', text:lang.tvModeText },
            { id:'voice-text', text:lang.voiceText }, { id:'ai-intelligence-text', text:lang.aiIntelligenceText },
            { id:'aiAnalysisTitle', text:lang.aiAnalysisTitle }, { id:'unclaimed-pot-title', text:lang.unclaimedPotTitle }
        ];

        elementsToUpdate.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) el.textContent = item.text;
        });

        const audioText = document.getElementById('audio-text');
        if (audioText) audioText.textContent = audioEnabled ? lang.audioOn : lang.audioOff;

        if (document.getElementById('tombolaPopup').style.display === 'flex') {
            document.getElementById('popupTitle').textContent = lang.popupTitle;
            document.getElementById('popupMessage').textContent = lang.popupMessage;
        }

        if (document.getElementById('currentNumber').textContent !== '--') {
            const num = parseInt(document.getElementById('currentNumber').textContent);
            updateSmorfiaDisplay(isNaN(num) ? null : num);
        }

        updateBoxAGold();
        initColorControls();
        updateAIAnalysisDisplay();
        if (document.getElementById('cartelleSection').classList.contains('active')) renderCartelle();
    }

    function toggleAudio() {
        audioEnabled = !audioEnabled;
        const audioToggle = document.getElementById('audioToggle');
        const audioIcon = audioToggle.querySelector('i');
        const audioText = document.getElementById('audio-text');

        if (audioEnabled) {
            audioIcon.className = 'fas fa-volume-up';
            audioText.textContent = translations[currentLanguage].audioOn;
            audioToggle.style.background = '#f1c40f';
        } else {
            audioIcon.className = 'fas fa-volume-mute';
            audioText.textContent = translations[currentLanguage].audioOff;
            audioToggle.style.background = '#888';
        }
    }

    function updateGameStats(newNumber) {}

    function restoreGameStats() {}
    function saveGameStats() {}

    function renderMiniCartella(cartellaData) {
        const miniCartella = document.createElement('div');
        miniCartella.className = 'winning-cartella-mini';
        miniCartella.dataset.id = cartellaData.id;

        const header = document.createElement('div');
        header.className = 'mini-header';
        header.innerHTML = `<span>${cartellaData.id}</span><span>G${cartellaData.playerNumber}-C${cartellaData.cartellaNumber}</span>`;
        miniCartella.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'mini-grid';

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = document.createElement('div');
                cell.className = 'mini-cell empty';
                cell.dataset.row = row;
                cell.dataset.col = col;
                grid.appendChild(cell);
            }
        }

        cartellaData.numbers.forEach(numData => {
            const index = numData.row * 9 + numData.column;
            const cell = grid.children[index];
            if (cell) {
                cell.textContent = numData.number;
                cell.classList.remove('empty');

                if (numData.number === numeroGold && goldWon && cartellaData.id === goldWinningCartella) {
                    cell.style.background = '#FFD700';
                    cell.style.color = '#8B6910';
                    cell.style.fontWeight = '900';
                    cell.style.border = '2px solid #FFA500';
                } else if (extractedNumbers.includes(numData.number)) {
                    if (winningNumbersByCartella[cartellaData.id] && winningNumbersByCartella[cartellaData.id].includes(numData.number)) {
                        cell.classList.add('winning-number');
                    } else {
                        cell.classList.add('extracted');
                    }
                }
            }
        });

        miniCartella.appendChild(grid);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            document.getElementById('jackpot-title').style.display = 'flex';
            document.getElementById('winningCartellaDisplay').style.display = 'none';
            document.getElementById('winningCartellaDisplay').innerHTML = '';
        });

        miniCartella.appendChild(closeBtn);

        miniCartella.addEventListener('click', function(e) {
            if (e.target === closeBtn || closeBtn.contains(e.target)) return;
            showCartelleSection();
        });

        return miniCartella;
    }

    function displayWinningCartella(cartellaId) {
        const cartella = generatedCartelle.find(c => c.id === cartellaId);
        if (!cartella) return;

        const jackpotTitle = document.getElementById('jackpot-title');
        const winningDisplay = document.getElementById('winningCartellaDisplay');
        const winningWrapper = document.getElementById('winningCartellaWrapper');

        jackpotTitle.style.display = 'none';
        winningDisplay.style.display = 'flex';
        winningDisplay.innerHTML = '';

        const miniCartella = renderMiniCartella(cartella);
        winningDisplay.appendChild(miniCartella);
    }

    // ========================================================
    // EVIDENZIAZIONE VISIVA VINCITE (TABELLONE & CARTELLE)
    // ========================================================
    function highlightWinningElements(winningType, winningCartellaIds, winningNumbers, winningRowIndex) {
        // 1. Evidenziazione sul Tabellone principale (Box 4, #board) e mini-board Regia
        if (winningNumbers && winningNumbers.length > 0) {
            winningNumbers.forEach(num => {
                const boardTile = document.getElementById(`number-${num}`);
                if (boardTile) {
                    boardTile.classList.add('board-cell-win');
                }
                const regiaTile = document.getElementById(`regia-cell-${num}`);
                if (regiaTile) {
                    regiaTile.classList.add('regia-cell-win');
                }
            });
        }

        // 2. Evidenziazione SOLO dei numeri vincenti effettivi nelle cartelle dell'utente (in ROSSO)
        if (winningCartellaIds && winningCartellaIds.length > 0) {
            winningCartellaIds.forEach(cId => {
                const cartEls = document.querySelectorAll(`.cartella[data-id="${cId}"]`);
                cartEls.forEach(cartEl => {
                    if (winningType === 'tombola' || winningRowIndex === -1) {
                        cartEl.classList.add('win-tombola-cartella');
                    }
                    // Evidenzia ESCLUSIVAMENTE le caselle dei numeri vincenti in rosso, NON l'intera riga o le caselle vuote
                    if (winningNumbers && winningNumbers.length > 0) {
                        winningNumbers.forEach(wNum => {
                            const wCell = cartEl.querySelector(`.cartella-cell[data-number="${wNum}"]`);
                            if (wCell) {
                                wCell.classList.add('winning-number');
                                wCell.style.background = '#16a34a';
                                wCell.style.color = '#ffffff';
                                wCell.style.border = '2px solid #ffffff';
                                wCell.style.boxShadow = '0 0 10px rgba(22, 163, 74, 0.8)';
                                wCell.style.animation = 'none';
                            }
                        });
                    }
                });
            });
        }
    }

    // ========================================================
    // GESTIONE INTELLIGENTE VINCITE (AUTO-RIPRESA & LIVE STREAM)
    // ========================================================
    function handleGameWinEvent(winningType, winningCartellaIds, winningNumbers, winningRowIndex, fromRemote = false) {
        displayWinningCartella(winningCartellaIds[0]);
        highlightWinningElements(winningType, winningCartellaIds, winningNumbers, winningRowIndex);

        if (!fromRemote && window.TombolaSync) {
            window.TombolaSync.broadcastWin(winningType, winningCartellaIds, winningNumbers, winningRowIndex);
        }

        if (winningType === 'tombola') {
            stopTimer();
            isPausedForWin = true;
            cartelleWins.tombola.gameEnded = true;
            document.getElementById('startBtn').disabled = true;
            document.getElementById('pauseBtn').disabled = true;
            document.getElementById('extractBtn').disabled = true;
            document.getElementById('cleanBtn').disabled = true;
            assignUnclaimedPotToTombolaWinner(winningCartellaIds[0]);
            showWinPopup(winningType, winningCartellaIds, winningNumbers, true);
            logRegiaEvent(`👑 TOMBOLA VINTA sulla cartella ${winningCartellaIds[0]}! Gioco terminato.`, 'win');
            return;
        }

        // PER VINCITE INTERMEDIE (Ambo, Terno, Quaterna, Cinquina, Gold)
        if (winHandlingMode === 'banner_live') {
            // Modalità "Banner Live": l'estrazione non viene fermata!
            playSound('win');
            showFloatingWinBanner(winningType, winningCartellaIds, winningNumbers);
            logRegiaEvent(`Vincita ${winningType.toUpperCase()} registrata (cartella ${winningCartellaIds[0]}). Estrazione prosegue in flusso live.`, 'info');
        } else {
            // Modalità con auto-ripresa a tempo (consigliata) o manuale
            const wasRunning = isRunning;
            stopTimer();
            wasAutoRunningBeforeWin = wasRunning;
            isPausedForWin = true;
            document.getElementById('startBtn').disabled = true;
            document.getElementById('pauseBtn').disabled = true;
            document.getElementById('extractBtn').disabled = true;
            document.getElementById('cleanBtn').disabled = true;

            const isAutoResume = winHandlingMode.startsWith('autoresume_');
            let resumeSeconds = 5;
            if (winHandlingMode === 'autoresume_3') resumeSeconds = 3;
            else if (winHandlingMode === 'autoresume_8') resumeSeconds = 8;

            showWinPopup(winningType, winningCartellaIds, winningNumbers, !isAutoResume, resumeSeconds);
            logRegiaEvent(`Vincita ${winningType.toUpperCase()} (cartella ${winningCartellaIds[0]})! ${isAutoResume ? `Auto-ripresa tra ${resumeSeconds}s.` : 'In attesa conferma admin.'}`, 'warn');
        }
    }

    // ========================================================
    // ACCESSO AMMINISTRATORE REGIA (SICUREZZA CRITTOGRAFICA SHA-256)
    // ========================================================
    function requestRegiaAccess() {
        if (isRegiaAdminAuthenticated()) {
            openRegia();
        } else {
            showAdminLoginModal();
        }
    }

    function showAdminLoginModal() {
        const modal = document.getElementById('adminLoginModal');
        const input = document.getElementById('adminPasswordInput');
        const errorEl = document.getElementById('adminLoginError');
        if (errorEl) errorEl.style.display = 'none';
        if (input) {
            input.value = '';
            input.type = 'password';
            const eye = document.getElementById('adminEyeIcon');
            if (eye) eye.className = 'fas fa-eye';
        }
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => { if (input) input.focus(); }, 150);
        }
    }

    function hideAdminLoginModal() {
        const modal = document.getElementById('adminLoginModal');
        if (modal) modal.style.display = 'none';
    }

    async function verifyAdminPassword() {
        const input = document.getElementById('adminPasswordInput');
        const errorEl = document.getElementById('adminLoginError');
        const modalContent = document.querySelector('.admin-login-content');
        if (!input) return;

        const entered = input.value.trim();
        if (!entered) {
            if (errorEl) {
                errorEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Inserisci la password amministratore.';
                errorEl.style.display = 'block';
            }
            return;
        }

        const hashed = await computeSha256(entered);
        if (hashed === REGIA_ADMIN_HASH) {
            sessionStorage.setItem('regia_admin_auth', 'true');
            hideAdminLoginModal();
            openRegia();
            showSuccessPopup(currentLanguage === 'it' ? 'Accesso Regia autorizzato!' : 'Admin access authorized!');
        } else {
            if (errorEl) {
                errorEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Password non valida. Riprova.';
                errorEl.style.display = 'block';
            }
            if (modalContent) {
                modalContent.classList.remove('shake-anim');
                void modalContent.offsetWidth; // trigger reflow
                modalContent.classList.add('shake-anim');
            }
            input.value = '';
            input.focus();
        }
    }

    // ========================================================
    // GESTIONE PAGINA REGIA (DIRECTOR CONTROL ROOM)
    // ========================================================
    function openRegia() {
        document.getElementById('regiaSection').classList.add('active');
        document.querySelector('.main-container').style.display = 'none';
        document.querySelector('header').style.display = 'none';
        document.querySelector('nav').style.display = 'none';
        if (document.getElementById('cartelleSection').classList.contains('active')) {
            document.getElementById('cartelleSection').classList.remove('active');
        }
        initRegiaBoard();
        syncRegiaUI();
        logRegiaEvent('Pannello Regia aperto. Console attiva.', 'info');
    }

    function closeRegia() {
        document.getElementById('regiaSection').classList.remove('active');
        document.querySelector('.main-container').style.display = 'block';
        document.querySelector('header').style.display = 'flex';
        document.querySelector('nav').style.display = 'flex';
    }

    function initRegiaBoard() {
        const grid = document.getElementById('regiaBoardGrid');
        if (!grid) return;
        grid.innerHTML = '';
        for (let i = 1; i <= 90; i++) {
            const cell = document.createElement('div');
            cell.className = 'regia-board-cell';
            cell.id = `regia-cell-${i}`;
            cell.textContent = i;
            grid.appendChild(cell);
        }
        syncRegiaBoardCells();
    }

    function syncRegiaBoardCells() {
        for (let i = 1; i <= 90; i++) {
            const cell = document.getElementById(`regia-cell-${i}`);
            if (!cell) continue;
            cell.className = 'regia-board-cell';
            if (extractedNumbers.includes(i)) {
                cell.classList.add('extracted');
            }
            if (extractedNumbers.length > 0 && extractedNumbers[extractedNumbers.length - 1] === i) {
                cell.classList.add('last-extracted');
            }
            if (numeroGold === i) {
                cell.classList.add('gold');
            }
        }
        const badge = document.getElementById('regiaBoardStatus');
        if (badge) {
            badge.textContent = `${90 - extractedNumbers.length} Rimanenti`;
        }
    }

    function logRegiaEvent(text, type = 'info') {
        const logContent = document.getElementById('regiaLogContent');
        if (!logContent) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const timeStr = new Date().toLocaleTimeString('it-IT');
        entry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${text}`;
        logContent.appendChild(entry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    function syncRegiaUI() {
        // Estrazione
        const curNumEl = document.getElementById('regiaCurrentNumber');
        const curSmorfiaEl = document.getElementById('regiaSmorfiaText');
        const extStatEl = document.getElementById('regiaExtractedStat');
        const cdEl = document.getElementById('regiaCountdownDisplay');

        if (curNumEl) {
            curNumEl.textContent = extractedNumbers.length > 0 ? extractedNumbers[extractedNumbers.length - 1] : '--';
        }
        if (curSmorfiaEl) {
            if (extractedNumbers.length > 0) {
                const lastNum = extractedNumbers[extractedNumbers.length - 1];
                const itMeaning = smorfiaItaliana[lastNum] || smorfiaNapolitana[lastNum] || '';
                curSmorfiaEl.textContent = itMeaning ? `#${lastNum} - ${itMeaning}` : `#${lastNum}`;
            } else {
                curSmorfiaEl.textContent = "In attesa dell'inizio partita";
            }
        }
        if (extStatEl) {
            extStatEl.textContent = `${extractedNumbers.length} / 90 Estratti`;
        }
        if (cdEl) {
            cdEl.textContent = `${remainingTime}s`;
        }

        // Pulsanti comandi
        const startBtn = document.getElementById('regiaStartBtn');
        const pauseBtn = document.getElementById('regiaPauseBtn');
        const extractBtn = document.getElementById('regiaExtractBtn');
        if (startBtn) startBtn.disabled = isRunning || extractedNumbers.length >= 90;
        if (pauseBtn) pauseBtn.disabled = !isRunning;
        if (extractBtn) extractBtn.disabled = isRunning || extractedNumbers.length >= 90;

        // Chip tempo
        document.querySelectorAll('.regia-time-chips .regia-time-chip').forEach(chip => {
            const t = parseInt(chip.dataset.time);
            chip.classList.toggle('active', t === currentTimer);
        });

        // Voce e AI
        const vState = document.getElementById('regiaVoiceState');
        const vBtn = document.getElementById('regiaVoiceBtn');
        if (vState) vState.textContent = voiceEnabled ? 'ON' : 'OFF';
        if (vBtn) vBtn.classList.toggle('active', voiceEnabled);

        const aiState = document.getElementById('regiaAiState');
        const aiBtn = document.getElementById('regiaAiBtn');
        if (aiState) aiState.textContent = aiIntelligenceEnabled ? 'ON' : 'OFF';
        if (aiBtn) aiBtn.classList.toggle('active', aiIntelligenceEnabled);

        // Montepremi
        const poolInput = document.getElementById('regiaPrizePoolInput');
        const currSelect = document.getElementById('regiaCurrencySelect');
        const prizePool = parseFloat(document.getElementById('prizePool').value) || 0;
        const currency = document.getElementById('currencySelect').value;

        if (poolInput && document.activeElement !== poolInput) poolInput.value = prizePool;
        if (currSelect) currSelect.value = currency;

        const updatePrize = (id, pct) => {
            const el = document.getElementById(id);
            if (el) el.textContent = prizePool > 0 ? `${currency}${(prizePool * pct).toFixed(2)}` : '--';
        };
        updatePrize('regiaGoldPrize', 0.05);
        updatePrize('regiaAmboPrize', 0.05);
        updatePrize('regiaTernoPrize', 0.10);
        updatePrize('regiaQuaternaPrize', 0.15);
        updatePrize('regiaCinquinaPrize', 0.20);
        updatePrize('regiaTombolaPrize', 0.45);

        const unclaimedEl = document.getElementById('regiaUnclaimedVal');
        if (unclaimedEl) unclaimedEl.textContent = `${currency} ${unclaimedGoldTotal.toFixed(2)}`;

        // Colori
        let totalActiveColors = 0;
        const updateColorCount = (color, countId, toggleId) => {
            const sheets = activeColorSheets[color] || [];
            const count = sheets.reduce((sum, s) => sum + s.count, 0);
            const isActive = sheets.length > 0 ? sheets.some(s => s.active) : false;
            if (isActive) totalActiveColors++;
            const countEl = document.getElementById(countId);
            const toggleEl = document.getElementById(toggleId);
            if (countEl) countEl.textContent = `${count} cartelle (${isActive ? 'ATTIVO' : 'DISATTIVO'})`;
            if (toggleEl) toggleEl.checked = isActive;
        };
        updateColorCount('blue', 'regiaBlueCount', 'regiaToggleBlue');
        updateColorCount('orange', 'regiaOrangeCount', 'regiaToggleOrange');
        updateColorCount('green', 'regiaGreenCount', 'regiaToggleGreen');
        updateColorCount('yellow', 'regiaYellowCount', 'regiaToggleYellow');

        const colorsBadge = document.getElementById('regiaActiveColorsBadge');
        if (colorsBadge) {
            if (totalActiveColors === 0) {
                colorsBadge.textContent = "0 Colori (Tutti Inattivi)";
                colorsBadge.style.color = "#f87171";
                colorsBadge.style.background = "rgba(239, 68, 68, 0.15)";
            } else {
                colorsBadge.textContent = `${totalActiveColors} Colori Attivi`;
                colorsBadge.style.color = "#4ade80";
                colorsBadge.style.background = "rgba(16, 185, 129, 0.15)";
            }
        }

        // Vincite Live
        const winsContent = document.getElementById('regiaWinsContent');
        const winsBadge = document.getElementById('regiaTotalWinsBadge');
        if (winsContent) {
            const winKeys = ['gold', 'ambo', 'terno', 'quaterna', 'cinquina', 'tombola'];
            let activeWinsList = [];
            winKeys.forEach(k => {
                const w = cartelleWins[k];
                if (w && w.won && w.cartellaId) {
                    activeWinsList.push({ type: k.toUpperCase(), cartellaId: w.cartellaId, winCount: w.winCount });
                }
            });
            if (winsBadge) winsBadge.textContent = `${activeWinsList.length} Vincite`;

            if (activeWinsList.length === 0) {
                winsContent.innerHTML = '<div class="regia-empty-state">In attesa delle prime vincite...</div>';
            } else {
                winsContent.innerHTML = activeWinsList.map(item => `
                    <div class="regia-win-entry">
                        <span><b>${item.type}</b>: ${item.cartellaId}</span>
                        <span>Assegnato</span>
                    </div>
                `).join('');
            }
        }

        // Box A: Scadenza Premi & Montepremi Non Vinti
        const extCount = extractedNumbers.length;
        const prizeDelayKeys = ['gold', 'ambo', 'terno', 'quaterna', 'cinquina', 'tombola'];
        prizeDelayKeys.forEach(k => {
            const conf = prizeDelaysConfig[k];
            if (!conf) return;
            const capKey = k.charAt(0).toUpperCase() + k.slice(1);
            const inp = document.getElementById(`delayInput${capKey}`);
            const prog = document.getElementById(`delayProgress${capKey}`);
            const stat = document.getElementById(`delayStatus${capKey}`);

            if (inp && document.activeElement !== inp) inp.value = conf.max;
            if (prog) prog.textContent = `${extCount} / ${conf.max}`;
            if (stat) {
                const isWon = k === 'gold' ? goldWon : (cartelleWins[k] && cartelleWins[k].won);
                if (isWon) {
                    stat.className = 'delay-status-badge won';
                    stat.textContent = 'VINTO';
                } else if (conf.expired) {
                    stat.className = 'delay-status-badge expired';
                    stat.textContent = 'SCADUTO ➜ Cassa';
                } else {
                    stat.className = 'delay-status-badge';
                    stat.textContent = `Entro ${conf.max} estr.`;
                }
            }
        });

        // Box B: Algoritmo Difficoltà Vincite (Anti-Vincita)
        const masterToggle = document.getElementById('regiaDifficultyMasterToggle');
        const levelSelect = document.getElementById('regiaDifficultyLevelSelect');
        const minAmboInp = document.getElementById('forcedMinAmbo');
        const minTernoInp = document.getElementById('forcedMinTerno');
        const minQuaternaInp = document.getElementById('forcedMinQuaterna');
        const minCinquinaInp = document.getElementById('forcedMinCinquina');
        const minTombolaInp = document.getElementById('forcedMinTombola');

        if (masterToggle) masterToggle.checked = antiWinDifficultyConfig.enabled;
        if (levelSelect && document.activeElement !== levelSelect) levelSelect.value = antiWinDifficultyConfig.level;
        if (minAmboInp && document.activeElement !== minAmboInp) minAmboInp.value = antiWinDifficultyConfig.forcedMin.ambo;
        if (minTernoInp && document.activeElement !== minTernoInp) minTernoInp.value = antiWinDifficultyConfig.forcedMin.terno;
        if (minQuaternaInp && document.activeElement !== minQuaternaInp) minQuaternaInp.value = antiWinDifficultyConfig.forcedMin.quaterna;
        if (minCinquinaInp && document.activeElement !== minCinquinaInp) minCinquinaInp.value = antiWinDifficultyConfig.forcedMin.cinquina;
        if (minTombolaInp && document.activeElement !== minTombolaInp) minTombolaInp.value = antiWinDifficultyConfig.forcedMin.tombola;

        const monitoredEl = document.getElementById('regiaMonitoredCards');
        const blockedEl = document.getElementById('regiaBlockedNumbersCount');
        const diffIdxEl = document.getElementById('regiaDifficultyIndex');
        const diffBadge = document.getElementById('regiaDifficultyBadge');

        const activeCardsCount = generatedCartelle.filter(c => isCartellaActive(c.id)).length;
        if (monitoredEl) monitoredEl.textContent = `${activeCardsCount} cartelle (${activeCardsCount * 15} numeri)`;
        if (blockedEl) blockedEl.textContent = `${antiWinDifficultyConfig.blockedNumbersCount} numeri`;
        if (diffIdxEl) diffIdxEl.textContent = `${antiWinDifficultyConfig.difficultyIndex}% (${antiWinDifficultyConfig.level.toUpperCase()})`;
        if (diffBadge) {
            diffBadge.textContent = antiWinDifficultyConfig.enabled ? antiWinDifficultyConfig.level.toUpperCase() : 'DISATTIVO';
            diffBadge.style.color = antiWinDifficultyConfig.enabled ? '#facc15' : '#94a3b8';
        }

        // Win Handling Mode
        const winModeSel = document.getElementById('regiaWinModeSelect');
        if (winModeSel && document.activeElement !== winModeSel) {
            winModeSel.value = winHandlingMode;
        }

        // Mini board
        syncRegiaBoardCells();
    }

    // Regia & TV Custom Graphics Management
    const tvGraphicState = {
        enabled: false,
        src: '/assets/aistudio/image_5b55ca57.png',
        preset: 'screenshot',
        position: 'header_box1', // 'header_box1' | 'watermark_br' | 'watermark_tr' | 'floating_banner'
        scale: 100,
        opacity: 100,
        borderStyle: 'gold' // 'gold' | 'cyan' | 'clean'
    };

    const goldMedallionSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100" width="240" height="100">' +
        '<defs><linearGradient id="goldG" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '<stop offset="0%" stop-color="#fffbeb"/><stop offset="30%" stop-color="#facc15"/>' +
        '<stop offset="70%" stop-color="#ca8a04"/><stop offset="100%" stop-color="#854d0e"/>' +
        '</linearGradient></defs>' +
        '<rect x="4" y="4" width="232" height="92" rx="14" fill="#091028" stroke="url(#goldG)" stroke-width="3"/>' +
        '<circle cx="48" cy="50" r="28" fill="#1e1b4b" stroke="url(#goldG)" stroke-width="2.5"/>' +
        '<text x="48" y="58" font-size="24" font-weight="900" fill="#fef08a" text-anchor="middle" font-family="sans-serif">90</text>' +
        '<text x="140" y="44" font-size="16" font-weight="900" fill="url(#goldG)" text-anchor="middle" letter-spacing="2" font-family="sans-serif">GOLD EDITION</text>' +
        '<text x="140" y="66" font-size="11" font-weight="700" fill="#93c5fd" text-anchor="middle" letter-spacing="1" font-family="sans-serif">TOMBOLA ITALIA</text>' +
        '</svg>'
    );

    const sponsorBadgeSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100" width="240" height="100">' +
        '<defs><linearGradient id="cyanG" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '<stop offset="0%" stop-color="#e0f2fe"/><stop offset="35%" stop-color="#38bdf8"/>' +
        '<stop offset="100%" stop-color="#0284c7"/>' +
        '</linearGradient></defs>' +
        '<rect x="4" y="4" width="232" height="92" rx="14" fill="#071228" stroke="url(#cyanG)" stroke-width="3"/>' +
        '<text x="120" y="40" font-size="13" font-weight="800" fill="#38bdf8" text-anchor="middle" letter-spacing="3" font-family="sans-serif">★ SPONSOR UFFICIALE ★</text>' +
        '<text x="120" y="68" font-size="18" font-weight="900" fill="#f8fafc" text-anchor="middle" letter-spacing="1.5" font-family="sans-serif">VIP BROADCAST TV</text>' +
        '</svg>'
    );

    function applyTvGraphicState() {
        const previewImg = document.getElementById('regiaTvGraphicPreview');
        const previewPlaceholder = document.getElementById('regiaGraphicPlaceholder');
        const previewWrapper = document.getElementById('regiaPreviewImgWrapper');
        const badge = document.getElementById('regiaTvGraphicBadge');
        const toggle = document.getElementById('regiaTvGraphicToggle');

        if (previewImg) {
            previewImg.src = tvGraphicState.src;
            previewImg.style.display = tvGraphicState.src ? 'block' : 'none';
        }
        if (previewPlaceholder) {
            previewPlaceholder.style.display = tvGraphicState.src ? 'none' : 'flex';
        }
        if (previewWrapper) {
            previewWrapper.className = `regia-preview-img-wrapper border-${tvGraphicState.borderStyle}`;
        }
        if (badge) {
            if (tvGraphicState.enabled) {
                badge.className = 'regia-card-badge';
                badge.style.background = '#10b981';
                badge.style.color = '#ffffff';
                badge.textContent = 'TV LIVE';
            } else {
                badge.className = 'regia-card-badge';
                badge.style.background = 'rgba(255,255,255,0.1)';
                badge.style.color = '#94a3b8';
                badge.textContent = 'TV Disattivo';
            }
        }
        if (toggle && toggle.checked !== tvGraphicState.enabled) {
            toggle.checked = tvGraphicState.enabled;
        }

        const headerSlot = document.getElementById('headerTvGraphicSlot');
        const headerImg = document.getElementById('headerTvGraphicImg');
        const overlay = document.getElementById('tvGraphicOverlay');
        const overlayInner = document.getElementById('tvGraphicInner');
        const overlayImg = document.getElementById('tvGraphicOverlayImg');

        if (!tvGraphicState.enabled) {
            if (headerSlot) headerSlot.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
        } else {
            if (tvGraphicState.position === 'header_box1') {
                if (headerSlot && headerImg) {
                    headerImg.src = tvGraphicState.src;
                    headerSlot.style.display = 'inline-flex';
                    headerSlot.style.opacity = String(tvGraphicState.opacity / 100);
                    headerSlot.style.transform = `scale(${tvGraphicState.scale / 100})`;
                    headerSlot.className = `header-tv-graphic-slot border-${tvGraphicState.borderStyle}`;
                }
                if (overlay) overlay.style.display = 'none';
            } else {
                if (headerSlot) headerSlot.style.display = 'none';
                if (overlay && overlayImg && overlayInner) {
                    overlayImg.src = tvGraphicState.src;
                    overlay.style.display = 'flex';
                    overlay.className = `tv-graphic-overlay ${tvGraphicState.position === 'watermark_tr' ? 'watermark-tr' : tvGraphicState.position === 'floating_banner' ? 'floating-banner' : 'watermark-br'}`;
                    overlayInner.className = `tv-graphic-inner border-${tvGraphicState.borderStyle}`;
                    overlayInner.style.opacity = String(tvGraphicState.opacity / 100);
                    overlayInner.style.transform = `scale(${tvGraphicState.scale / 100})`;
                }
            }
        }

        try {
            localStorage.setItem('tombola_tv_graphic', JSON.stringify(tvGraphicState));
        } catch(e) {}

        if (window.TombolaSync) {
            window.TombolaSync.broadcastGraphicsUpdate(tvGraphicState);
        }
    }

    function initTvGraphicsManager() {
        try {
            const saved = localStorage.getItem('tombola_tv_graphic');
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.assign(tvGraphicState, parsed);
            }
        } catch(e) {}
        applyTvGraphicState();
        setupTvGraphicsListeners();
    }

    function setupTvGraphicsListeners() {
        const toggle = document.getElementById('regiaTvGraphicToggle');
        if (toggle) {
            toggle.addEventListener('change', function() {
                tvGraphicState.enabled = this.checked;
                applyTvGraphicState();
                logRegiaEvent(`Grafica Schermo TV: ${tvGraphicState.enabled ? 'ATTIVATA (LIVE)' : 'DISATTIVATA'}.`, tvGraphicState.enabled ? 'info' : 'warn');
            });
        }

        const uploadBtn = document.getElementById('regiaUploadGraphicBtn');
        const fileInput = document.getElementById('regiaGraphicFileInput');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', function(e) {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        tvGraphicState.src = evt.target.result;
                        tvGraphicState.preset = 'custom';
                        tvGraphicState.enabled = true;
                        document.querySelectorAll('.regia-preset-chip').forEach(c => c.classList.remove('active'));
                        applyTvGraphicState();
                        logRegiaEvent(`Caricata nuova grafica TV personalizzata: ${file.name}.`, 'info');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        const clearBtn = document.getElementById('regiaClearGraphicBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                tvGraphicState.enabled = false;
                applyTvGraphicState();
                logRegiaEvent('Grafica Schermo TV disattivata da Regia.', 'warn');
            });
        }

        const presetScreenshot = document.getElementById('presetUserScreenshotBtn');
        if (presetScreenshot) {
            presetScreenshot.addEventListener('click', function() {
                document.querySelectorAll('.regia-preset-chip').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                tvGraphicState.src = '/assets/aistudio/image_5b55ca57.png';
                tvGraphicState.preset = 'screenshot';
                tvGraphicState.enabled = true;
                applyTvGraphicState();
                logRegiaEvent('Applicata grafica preset: Screenshot Controlli.', 'info');
            });
        }

        const presetGold = document.getElementById('presetGoldLogoBtn');
        if (presetGold) {
            presetGold.addEventListener('click', function() {
                document.querySelectorAll('.regia-preset-chip').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                tvGraphicState.src = goldMedallionSvg;
                tvGraphicState.preset = 'gold';
                tvGraphicState.enabled = true;
                applyTvGraphicState();
                logRegiaEvent('Applicato logo preset: Medaglione Gold 24K Edition.', 'info');
            });
        }

        const presetSponsor = document.getElementById('presetSponsorBtn');
        if (presetSponsor) {
            presetSponsor.addEventListener('click', function() {
                document.querySelectorAll('.regia-preset-chip').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                tvGraphicState.src = sponsorBadgeSvg;
                tvGraphicState.preset = 'sponsor';
                tvGraphicState.enabled = true;
                applyTvGraphicState();
                logRegiaEvent('Applicato logo preset: Badge Sponsor VIP.', 'info');
            });
        }

        const posSelect = document.getElementById('regiaTvGraphicPositionSelect');
        if (posSelect) {
            posSelect.value = tvGraphicState.position;
            posSelect.addEventListener('change', function() {
                tvGraphicState.position = this.value;
                applyTvGraphicState();
                logRegiaEvent(`Posizione grafica TV impostata su: ${this.options[this.selectedIndex].text}.`, 'info');
            });
        }

        const scaleSlider = document.getElementById('regiaGraphicScale');
        const scaleVal = document.getElementById('regiaGraphicScaleVal');
        if (scaleSlider && scaleVal) {
            scaleSlider.value = tvGraphicState.scale;
            scaleVal.textContent = `${tvGraphicState.scale}%`;
            scaleSlider.addEventListener('input', function() {
                tvGraphicState.scale = parseInt(this.value);
                scaleVal.textContent = `${tvGraphicState.scale}%`;
                applyTvGraphicState();
            });
        }

        const opacitySlider = document.getElementById('regiaGraphicOpacity');
        const opacityVal = document.getElementById('regiaGraphicOpacityVal');
        if (opacitySlider && opacityVal) {
            opacitySlider.value = tvGraphicState.opacity;
            opacityVal.textContent = `${tvGraphicState.opacity}%`;
            opacitySlider.addEventListener('input', function() {
                tvGraphicState.opacity = parseInt(this.value);
                opacityVal.textContent = `${tvGraphicState.opacity}%`;
                applyTvGraphicState();
            });
        }

        const borderSelect = document.getElementById('regiaTvGraphicBorderSelect');
        if (borderSelect) {
            borderSelect.value = tvGraphicState.borderStyle;
            borderSelect.addEventListener('change', function() {
                tvGraphicState.borderStyle = this.value;
                applyTvGraphicState();
            });
        }
    }

    // ===== GESTIONE CASSA CLOUD MONTEPREMI NON VINTI (DATABASE FIREBASE) =====
    let cloudBankBalance = 0;
    let cloudBankCurrency = '€';
    let cloudBankConnected = false;

    async function initCloudJackpotManager() {
        const statusEl = document.getElementById('regiaCloudStatus');
        const balanceEl = document.getElementById('regiaCloudBalance');
        const updatedEl = document.getElementById('regiaCloudLastUpdated');
        
        if (!window.JackpotService) {
            if (statusEl) statusEl.innerHTML = '<span class="cloud-dot offline"></span> Modulo non pronto';
            return;
        }

        try {
            if (statusEl) statusEl.innerHTML = '<span class="cloud-dot online"></span> Connessione...';
            const ok = await window.JackpotService.initFirebaseJackpot();
            cloudBankConnected = ok;
            
            if (statusEl) {
                if (ok) {
                    statusEl.innerHTML = '<span class="cloud-dot online"></span> Connesso Cloud';
                } else {
                    statusEl.innerHTML = '<span class="cloud-dot offline"></span> Offline';
                }
            }

            // Inizializza saldo iniziale
            try {
                const initialBank = await window.JackpotService.getJackpotBank();
                cloudBankBalance = Number(initialBank.accumulatedUnclaimed) || 0;
                cloudBankCurrency = initialBank.currency || '€';
                if (balanceEl) {
                    balanceEl.textContent = `${cloudBankCurrency} ${cloudBankBalance.toFixed(2)}`;
                }
                if (updatedEl && initialBank.lastUpdated) {
                    try {
                        const d = new Date(initialBank.lastUpdated);
                        updatedEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    } catch (_) {
                        updatedEl.textContent = initialBank.lastUpdated;
                    }
                }
            } catch (err) {
                console.warn('Initial jackpot bank fetch:', err);
            }

            // Real-time subscription al documento di cassa
            window.JackpotService.subscribeToJackpotBank((bankData) => {
                cloudBankBalance = Number(bankData.accumulatedUnclaimed) || 0;
                cloudBankCurrency = bankData.currency || '€';
                if (balanceEl) {
                    balanceEl.textContent = `${cloudBankCurrency} ${cloudBankBalance.toFixed(2)}`;
                }
                if (updatedEl && bankData.lastUpdated) {
                    try {
                        const d = new Date(bankData.lastUpdated);
                        updatedEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    } catch (_) {
                        updatedEl.textContent = bankData.lastUpdated;
                    }
                }
                refreshCloudHistoryUI();
            });

            // Caricamento storico movimenti
            refreshCloudHistoryUI();
        } catch (err) {
            console.error('Error starting Cloud Jackpot Manager:', err);
            if (statusEl) statusEl.innerHTML = '<span class="cloud-dot offline"></span> Errore';
        }
    }

    async function refreshCloudHistoryUI() {
        const historyListEl = document.getElementById('regiaCloudHistoryList');
        if (!historyListEl || !window.JackpotService) return;

        try {
            const list = await window.JackpotService.getUnclaimedHistory(8);
            if (!list || list.length === 0) {
                historyListEl.innerHTML = '<div class="history-empty">Nessun movimento registrato finora</div>';
                return;
            }

            let html = '';
            for (const item of list) {
                const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
                let typeClass = 'deposit';
                let sign = '+';
                let label = 'Deposito';
                if (item.type === 'recalled_into_game') {
                    typeClass = 'recall';
                    sign = '-';
                    label = 'Richiamo';
                } else if (item.type === 'reset') {
                    typeClass = 'reset';
                    sign = '';
                    label = 'Azzera';
                }
                html += `
                    <div class="history-entry ${typeClass}">
                        <div class="entry-left">
                            <span class="entry-time"><i class="far fa-clock"></i> ${dateStr} - ${label} [${item.gameId || 'TOM'}]</span>
                            <span class="entry-note">${item.note || ''}</span>
                        </div>
                        <span class="entry-amount">${sign}€ ${(item.amount || 0).toFixed(2)}</span>
                    </div>
                `;
            }
            historyListEl.innerHTML = html;
        } catch (err) {
            console.warn('Failed rendering cloud history:', err);
        }
    }

    function initializeApp() {
        initializeBoard();
        setInterval(updateClock, 1000);
        updateClock();
        updateCountdown();
        updatePrizes();
        updateProgress();
        updateLanguage();
        initColorControls();
        updateAIAnalysisDisplay();
        restoreGameStats();
        document.getElementById('versionInfo').textContent = "v.15.15.0";

        numeroGold = null;
        updateBoxAGold();
        updateGoldNumberOnBoard();
        updateUnclaimedPotDisplay();

        document.getElementById('jackpot-title').style.display = 'flex';
        document.getElementById('winningCartellaDisplay').style.display = 'none';

        initRegiaBoard();
        syncRegiaUI();
        initTvGraphicsManager();
        initCloudJackpotManager();
    }

    function setupEventListeners() {
        document.getElementById('startBtn').addEventListener('click', startTimer);
        document.getElementById('pauseBtn').addEventListener('click', stopTimer);
        document.getElementById('extractBtn').addEventListener('click', extractNumber);
        document.getElementById('cleanBtn').addEventListener('click', function() {
            showConfirmDialog(
                currentLanguage === 'it' ? "Reset Partita" : "Reset Game",
                currentLanguage === 'it'
                    ? "Sei sicuro di voler resettare la partita?<br><strong>Tutti i numeri estratti andranno persi.</strong>"
                    : "Are you sure you want to reset the game?<br><strong>All extracted numbers will be lost.</strong>",
                function() {
                    resetGame();
                    logRegiaEvent('Reset partita effettuato da TV console.', 'warn');
                    syncRegiaUI();
                    showSuccessPopup(currentLanguage === 'it' ? "Partita resettata con successo!" : "Game reset successfully!");
                }
            );
        });
        document.getElementById('audioToggle').addEventListener('click', toggleAudio);
        document.getElementById('prizePool').addEventListener('input', function() {
            updatePrizes();
            syncRegiaUI();
            if (window.TombolaSync) {
                window.TombolaSync.broadcastPrizePoolUpdate(parseFloat(this.value) || 0, document.getElementById('currencySelect').value);
            }
        });
        document.getElementById('currencySelect').addEventListener('change', function() {
            updatePrizes();
            syncRegiaUI();
            if (window.TombolaSync) {
                window.TombolaSync.broadcastPrizePoolUpdate(parseFloat(document.getElementById('prizePool').value) || 0, this.value);
            }
        });

        document.querySelectorAll('.time-circle').forEach(circle => {
            circle.addEventListener('click', function() {
                document.querySelectorAll('.time-circle').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                currentTimer = parseInt(this.dataset.time);
                remainingTime = currentTimer;
                updateCountdown();
                syncRegiaUI();
            });
        });

        document.getElementById('fullscreenBtn').addEventListener('click', function() {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else document.exitFullscreen();
        });

        document.getElementById('themeSwitch').addEventListener('change', function() {
            document.body.classList.toggle('dark-mode');
        });

        document.getElementById('languageSwitch').addEventListener('change', function() {
            currentLanguage = this.checked ? 'en' : 'it';
            updateLanguage();
            syncRegiaUI();
        });

        document.getElementById('popupClose').addEventListener('click', function() {
            document.getElementById('tombolaPopup').style.display = 'none';
        });

        document.getElementById('tombolaPopup').addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });

        // Win Popup: Ripresa Automatica & Pausa Verifica
        const winPopupCloseBtn = document.getElementById('winPopupClose');
        if (winPopupCloseBtn) {
            winPopupCloseBtn.addEventListener('click', function() {
                closeWinPopupAndResume();
            });
        }

        const winPopupPause = document.getElementById('winPopupPauseBtn');
        if (winPopupPause) {
            winPopupPause.addEventListener('click', function() {
                isWinPausedManually = true;
                if (winAutoResumeInterval) {
                    clearInterval(winAutoResumeInterval);
                    winAutoResumeInterval = null;
                }
                const resumeBox = document.getElementById('winAutoResumeBox');
                if (resumeBox) {
                    resumeBox.innerHTML = '<span style="color:#f87171;font-weight:700;"><i class="fas fa-pause-circle"></i> Ripresa automatica messa IN PAUSA per verifica cartella. Clicca CONTINUA quando pronto.</span>';
                }
                logRegiaEvent('Ripresa automatica sospesa manualmente dall\'amministratore per controllo vincita.', 'warn');
            });
        }

        const winBannerClose = document.getElementById('winBannerCloseBtn');
        if (winBannerClose) {
            winBannerClose.addEventListener('click', function() {
                const banner = document.getElementById('winFloatingBanner');
                if (banner) banner.classList.remove('active');
            });
        }

        document.getElementById('winPopup').addEventListener('click', function(e) {
            if (e.target === this) return;
        });

        document.getElementById('errorPopupClose').addEventListener('click', function() {
            document.getElementById('errorPopup').style.display = 'none';
        });

        document.getElementById('errorPopup').addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });

        // Confirm Dialog Listeners
        const confirmCancelBtn = document.getElementById('confirmPopupCancel');
        if (confirmCancelBtn) {
            confirmCancelBtn.addEventListener('click', closeConfirmDialog);
        }

        const confirmOkBtn = document.getElementById('confirmPopupOk');
        if (confirmOkBtn) {
            confirmOkBtn.addEventListener('click', function() {
                if (pendingConfirmAction) {
                    const action = pendingConfirmAction;
                    closeConfirmDialog();
                    action();
                } else {
                    closeConfirmDialog();
                }
            });
        }

        const confirmPopup = document.getElementById('confirmPopup');
        if (confirmPopup) {
            confirmPopup.addEventListener('click', function(e) {
                if (e.target === this) closeConfirmDialog();
            });
        }

        // Navigation
        document.getElementById('navCartelleLink').addEventListener('click', function(e) {
            e.preventDefault();
            if (document.getElementById('regiaSection').classList.contains('active')) {
                closeRegia();
            }
            showCartelleSection();
        });

        document.getElementById('navHomeLink').addEventListener('click', function(e) {
            e.preventDefault();
            if (document.getElementById('cartelleSection').classList.contains('active')) hideCartelleSection();
            if (document.getElementById('regiaSection').classList.contains('active')) closeRegia();
        });

        // REGIA NAVIGATION & CONTROLS (Protetto da Password SHA-256)
        document.getElementById('navRegiaLink').addEventListener('click', function(e) {
            e.preventDefault();
            requestRegiaAccess();
        });

        document.getElementById('regiaCloseBtn').addEventListener('click', function() {
            closeRegia();
        });

        const regLockBtn = document.getElementById('regiaLockBtn');
        if (regLockBtn) {
            regLockBtn.addEventListener('click', function() {
                sessionStorage.removeItem('regia_admin_auth');
                closeRegia();
                showSuccessPopup(currentLanguage === 'it' ? "Regia bloccata. Password richiesta al prossimo accesso." : "Regia locked. Password required on next access.");
                logRegiaEvent('Sessione Regia bloccata dall\'amministratore.', 'warn');
            });
        }

        // Regia Fullscreen Control
        const regiaFsBtn = document.getElementById('regiaFullscreenBtn');
        if (regiaFsBtn) {
            regiaFsBtn.addEventListener('click', function() {
                if (!document.fullscreenElement) {
                    if (document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().catch(() => {});
                    }
                }
            });
        }

        document.addEventListener('fullscreenchange', function() {
            const isFs = !!document.fullscreenElement;
            const fsBtn = document.getElementById('regiaFullscreenBtn');
            const fsText = document.getElementById('regiaFullscreenText');
            if (fsBtn) {
                fsBtn.classList.toggle('active', isFs);
                const icon = fsBtn.querySelector('i');
                if (icon) icon.className = isFs ? 'fas fa-compress' : 'fas fa-expand';
            }
            if (fsText) {
                fsText.textContent = isFs 
                    ? (currentLanguage === 'it' ? 'Finestra' : 'Exit Fullscreen') 
                    : (currentLanguage === 'it' ? 'Schermo Intero' : 'Fullscreen');
            }
        });

        // Tabs for Unified Vincite & Log Card in Regia
        const tabSplit = document.getElementById('regiaTabSplitBtn');
        const tabWins = document.getElementById('regiaTabWinsBtn');
        const tabLog = document.getElementById('regiaTabLogBtn');
        const combinedCont = document.getElementById('regiaCombinedContent');
        if (tabSplit && tabWins && tabLog && combinedCont) {
            const setTabMode = (mode) => {
                tabSplit.classList.toggle('active', mode === 'split');
                tabWins.classList.toggle('active', mode === 'wins');
                tabLog.classList.toggle('active', mode === 'log');
                combinedCont.className = `regia-combined-content mode-${mode}`;
                logRegiaEvent(`Visualizzazione monitor/log impostata a: ${mode.toUpperCase()}.`, 'info');
            };
            tabSplit.addEventListener('click', () => setTabMode('split'));
            tabWins.addEventListener('click', () => setTabMode('wins'));
            tabLog.addEventListener('click', () => setTabMode('log'));
        }

        // Modal Login Amministratore Listeners
        const adminSubmit = document.getElementById('adminLoginSubmit');
        if (adminSubmit) adminSubmit.addEventListener('click', verifyAdminPassword);

        const adminCancel = document.getElementById('adminLoginCancel');
        if (adminCancel) adminCancel.addEventListener('click', hideAdminLoginModal);

        const adminClose = document.getElementById('adminLoginClose');
        if (adminClose) adminClose.addEventListener('click', hideAdminLoginModal);

        const adminModal = document.getElementById('adminLoginModal');
        if (adminModal) {
            adminModal.addEventListener('click', function(e) {
                if (e.target === this) hideAdminLoginModal();
            });
        }

        const adminPwdInput = document.getElementById('adminPasswordInput');
        if (adminPwdInput) {
            adminPwdInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    verifyAdminPassword();
                }
            });
        }

        const togglePwdBtn = document.getElementById('adminTogglePwdVisibility');
        if (togglePwdBtn && adminPwdInput) {
            togglePwdBtn.addEventListener('click', function() {
                const isPassword = adminPwdInput.getAttribute('type') === 'password';
                adminPwdInput.setAttribute('type', isPassword ? 'text' : 'password');
                const icon = togglePwdBtn.querySelector('i');
                if (icon) {
                    icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
                }
            });
        }

        // Win Handling Mode Select in Regia
        const winModeSelect = document.getElementById('regiaWinModeSelect');
        if (winModeSelect) {
            winModeSelect.addEventListener('change', function() {
                winHandlingMode = this.value;
                logRegiaEvent(`Modalità gestione vincite impostata su: ${this.options[this.selectedIndex].text}`, 'info');
            });
        }

        const regTvBtn = document.getElementById('regiaSwitchTvBtn');
        if (regTvBtn) regTvBtn.addEventListener('click', closeRegia);

        const regCartBtn = document.getElementById('regiaOpenCartelleBtn');
        if (regCartBtn) regCartBtn.addEventListener('click', function() {
            closeRegia();
            showCartelleSection();
        });

        document.getElementById('regiaStartBtn').addEventListener('click', function() {
            startTimer();
            logRegiaEvent('Avviata estrazione automatica da Regia.', 'info');
            syncRegiaUI();
        });

        document.getElementById('regiaPauseBtn').addEventListener('click', function() {
            stopTimer();
            logRegiaEvent('Pausa estrazione da Regia.', 'warn');
            syncRegiaUI();
        });

        document.getElementById('regiaExtractBtn').addEventListener('click', function() {
            extractNumber();
            syncRegiaUI();
        });

        document.getElementById('regiaResetBtn').addEventListener('click', function() {
            showConfirmDialog(
                currentLanguage === 'it' ? "Reset Partita (Regia)" : "Reset Game (Regia)",
                currentLanguage === 'it'
                    ? "Sei sicuro di voler resettare la partita da Regia?<br><strong>Tutti i dati andranno persi.</strong>"
                    : "Are you sure you want to reset the game from Regia?<br><strong>All data will be lost.</strong>",
                function() {
                    resetGame();
                    logRegiaEvent('Reset partita effettuato da console Regia.', 'warn');
                    syncRegiaUI();
                    showSuccessPopup(currentLanguage === 'it' ? "Partita resettata da Regia!" : "Game reset from Regia!");
                }
            );
        });

        document.querySelectorAll('.regia-time-chips .regia-time-chip').forEach(chip => {
            chip.addEventListener('click', function() {
                document.querySelectorAll('.regia-time-chips .regia-time-chip').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                currentTimer = parseInt(this.dataset.time);
                remainingTime = currentTimer;
                updateCountdown();
                // Sincronizza anche con le sfere del tabellone
                document.querySelectorAll('.time-circle').forEach(c => {
                    c.classList.toggle('active', parseInt(c.dataset.time) === currentTimer);
                });
                logRegiaEvent(`Intervallo estrazione impostato a ${currentTimer}s.`, 'info');
                syncRegiaUI();
            });
        });

        document.getElementById('regiaVoiceBtn').addEventListener('click', function() {
            toggleVoice();
            logRegiaEvent(`Voce cambiata: ${voiceEnabled ? 'ATTIVA' : 'DISATTIVATA'}.`, 'info');
            syncRegiaUI();
        });

        document.getElementById('regiaAiBtn').addEventListener('click', function() {
            toggleAIIntelligence();
            logRegiaEvent(`AI Intelligence cambiata: ${aiIntelligenceEnabled ? 'ATTIVA' : 'DISATTIVATA'}.`, 'info');
            syncRegiaUI();
        });

        document.getElementById('regiaTestVoiceBtn').addEventListener('click', function() {
            if ('speechSynthesis' in window) {
                const utter = new SpeechSynthesisUtterance("Regia Tombola novanta Italia: sistema audio attivo e sincronizzato.");
                utter.lang = 'it-IT';
                utter.rate = 0.9;
                if (cachedVoiceIT) utter.voice = cachedVoiceIT;
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utter);
                logRegiaEvent('Test voce annunciatore eseguito.', 'info');
            }
        });

        document.getElementById('regiaApplyPrizeBtn').addEventListener('click', function() {
            const val = parseFloat(document.getElementById('regiaPrizePoolInput').value) || 0;
            const curr = document.getElementById('regiaCurrencySelect').value;
            document.getElementById('prizePool').value = val;
            document.getElementById('currencySelect').value = curr;
            updatePrizes();
            logRegiaEvent(`Montepremi aggiornato a ${curr} ${val.toFixed(2)}.`, 'info');
            syncRegiaUI();
        });

        document.getElementById('regiaCurrencySelect').addEventListener('change', function() {
            document.getElementById('currencySelect').value = this.value;
            updatePrizes();
            syncRegiaUI();
        });

        document.getElementById('regiaResetUnclaimedBtn').addEventListener('click', function() {
            showConfirmDialog(
                currentLanguage === 'it' ? "Azzera Non Vinti Partita" : "Reset Current Unclaimed",
                currentLanguage === 'it'
                    ? "Sei sicuro di voler azzerare i premi non vinti della partita attuale?"
                    : "Are you sure you want to reset the current game's unclaimed prizes?",
                function() {
                    unclaimedGoldTotal = 0;
                    updateUnclaimedPotDisplay();
                    logRegiaEvent('Premi non vinti della partita attuale azzerati.', 'warn');
                    syncRegiaUI();
                    showSuccessPopup(currentLanguage === 'it' ? "Non Vinti partita azzerati!" : "Current unclaimed pot reset!");
                }
            );
        });

        // 1. Salva Montepremi Non Vinti in Cloud Database
        const saveCloudBtn = document.getElementById('regiaSaveToCloudBtn');
        if (saveCloudBtn) {
            saveCloudBtn.addEventListener('click', async function() {
                if (!window.JackpotService) {
                    showErrorPopup("Servizio Cloud non inizializzato.");
                    return;
                }
                if (unclaimedGoldTotal <= 0) {
                    showSuccessPopup(currentLanguage === 'it' 
                        ? "Nessun premio non vinto nella partita corrente da salvare." 
                        : "No unclaimed prizes in the current game to save.");
                    return;
                }

                const amountToSave = unclaimedGoldTotal;
                const currency = document.getElementById('currencySelect').value || '€';
                const gameId = document.getElementById('gameId').value || 'TOM001';

                saveCloudBtn.disabled = true;
                saveCloudBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';

                try {
                    const res = await window.JackpotService.saveUnclaimedToDatabase(
                        amountToSave,
                        currency,
                        'all',
                        gameId,
                        `Salvataggio manuale da Regia (Partita ${gameId})`
                    );

                    if (res.success) {
                        unclaimedGoldTotal = 0;
                        updateUnclaimedPotDisplay();
                        syncRegiaUI();
                        logRegiaEvent(`💾 Salvati ${currency} ${amountToSave.toFixed(2)} di premi non vinti nel Database Cloud!`, 'success');
                        showSuccessPopup(currentLanguage === 'it' 
                            ? `Salvati ${currency} ${amountToSave.toFixed(2)} nel Database Cloud!` 
                            : `Saved ${currency} ${amountToSave.toFixed(2)} to Cloud Database!`);
                        if (typeof refreshCloudHistoryUI === 'function') refreshCloudHistoryUI();
                    } else {
                        showErrorPopup("Errore nel salvataggio: " + (res.error || "Riprova"));
                    }
                } catch (err) {
                    console.error('Error saving to cloud bank:', err);
                    showErrorPopup("Errore di connessione al database Cloud.");
                } finally {
                    saveCloudBtn.disabled = false;
                    saveCloudBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Salva in Cloud';
                }
            });
        }

        // 2. Richiama Totale Salvato nel Montepremi della Partita Attuale
        const recallCloudBtn = document.getElementById('regiaRecallFromCloudBtn');
        if (recallCloudBtn) {
            recallCloudBtn.addEventListener('click', async function() {
                if (!window.JackpotService) {
                    showErrorPopup("Servizio Cloud non disponibile.");
                    return;
                }

                try {
                    recallCloudBtn.disabled = true;
                    recallCloudBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lettura...';
                    const currentBank = await window.JackpotService.getJackpotBank();
                    recallCloudBtn.disabled = false;
                    recallCloudBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Richiama nel Montepremi';

                    if (!currentBank || currentBank.accumulatedUnclaimed <= 0) {
                        showSuccessPopup(currentLanguage === 'it'
                            ? "Il Database Cassa Cloud è a zero (€ 0.00). Nessun montepremi salvato da richiamare."
                            : "Cloud Database Bank is empty (€ 0.00). No saved prizes to recall.");
                        return;
                    }

                    const amountToRecall = currentBank.accumulatedUnclaimed;
                    const currency = currentBank.currency || document.getElementById('currencySelect').value || '€';
                    const gameId = document.getElementById('gameId').value || 'TOM001';

                    showConfirmDialog(
                        currentLanguage === 'it' ? "Richiama Montepremi Cloud" : "Recall Cloud Jackpot",
                        currentLanguage === 'it'
                            ? `Vuoi richiamare <b>${currency} ${amountToRecall.toFixed(2)}</b> dal Database Cloud e aggiungerli al Montepremi della partita attuale?`
                            : `Do you want to recall <b>${currency} ${amountToRecall.toFixed(2)}</b> from the Cloud Database and add it to the current game's Prize Pool?`,
                        async function() {
                            recallCloudBtn.disabled = true;
                            recallCloudBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Richiamo...';

                            try {
                                const res = await window.JackpotService.recallUnclaimedIntoGame(
                                    amountToRecall,
                                    gameId,
                                    `Richiamo nel Montepremi partita ${gameId}`
                                );

                                if (res.success) {
                                    // Aggiunge al montepremi della partita corrente
                                    const currentPool = parseFloat(document.getElementById('prizePool').value) || 0;
                                    const newPool = Math.round((currentPool + res.recalledAmount) * 100) / 100;
                                    document.getElementById('prizePool').value = newPool.toFixed(2);
                                    
                                    updatePrizes();
                                    syncRegiaUI();

                                    // Mostra il badge di Rollover sulla TV
                                    const tvBadge = document.getElementById('tvRolloverBadge');
                                    const tvText = document.getElementById('tvRolloverText');
                                    if (tvBadge && tvText) {
                                        tvBadge.style.display = 'inline-flex';
                                        tvText.textContent = `Include ${currency} ${res.recalledAmount.toFixed(2)} da partite precedenti`;
                                    }

                                    logRegiaEvent(`💰 Riportati ${currency} ${res.recalledAmount.toFixed(2)} dal Database Cloud nel Montepremi della partita attuale!`, 'success');
                                    showSuccessPopup(currentLanguage === 'it'
                                        ? `Richiamati ${currency} ${res.recalledAmount.toFixed(2)} nel Montepremi attuale!`
                                        : `Recalled ${currency} ${res.recalledAmount.toFixed(2)} into current Prize Pool!`);
                                    if (typeof refreshCloudHistoryUI === 'function') refreshCloudHistoryUI();
                                } else {
                                    showErrorPopup("Errore nel richiamo: " + (res.error || "Riprova"));
                                }
                            } catch (err) {
                                console.error('Error recalling from cloud bank:', err);
                                showErrorPopup("Errore durante il richiamo dal database.");
                            } finally {
                                recallCloudBtn.disabled = false;
                                recallCloudBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Richiama nel Montepremi';
                            }
                        }
                    );
                } catch (err) {
                    recallCloudBtn.disabled = false;
                    recallCloudBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Richiama nel Montepremi';
                    showErrorPopup("Errore di connessione al database Cloud.");
                }
            });
        }

        // 3. Azzera Database Cassa Cloud
        const resetCloudBtn = document.getElementById('regiaResetCloudBtn');
        if (resetCloudBtn) {
            resetCloudBtn.addEventListener('click', function() {
                if (!window.JackpotService) return;
                const gameId = document.getElementById('gameId').value || 'TOM001';

                showConfirmDialog(
                    currentLanguage === 'it' ? "Azzera Database Cassa Cloud" : "Reset Cloud Database",
                    currentLanguage === 'it'
                        ? "Sei sicuro di voler <b>azzerare permanentemente</b> il saldo dei premi non vinti nel Database Cloud?<br><span style='color:#ef4444;'>Questa operazione non può essere annullata.</span>"
                        : "Are you sure you want to <b>permanently reset</b> the unclaimed pot in the Cloud Database?<br><span style='color:#ef4444;'>This cannot be undone.</span>",
                    async function() {
                        resetCloudBtn.disabled = true;
                        try {
                            const res = await window.JackpotService.resetJackpotBank(gameId, "Azzeramento manuale da Regia");
                            if (res.success) {
                                logRegiaEvent("Database Cassa Cloud azzerato dall'amministratore.", 'warn');
                                showSuccessPopup(currentLanguage === 'it' ? "Database Cassa Cloud azzerato!" : "Cloud Database Bank reset!");
                                if (typeof refreshCloudHistoryUI === 'function') refreshCloudHistoryUI();
                            } else {
                                showErrorPopup("Errore nell'azzeramento: " + (res.error || "Riprova"));
                            }
                        } catch (err) {
                            console.error('Error resetting cloud bank:', err);
                            showErrorPopup("Errore durante l'azzeramento.");
                        } finally {
                            resetCloudBtn.disabled = false;
                        }
                    }
                );
            });
        }

        // 4. Sincronizza Database Cloud Manualmente
        const syncCloudBtn = document.getElementById('regiaSyncCloudBtn');
        if (syncCloudBtn) {
            syncCloudBtn.addEventListener('click', async function() {
                if (!window.JackpotService) return;
                syncCloudBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                try {
                    const bank = await window.JackpotService.getJackpotBank();
                    const balanceEl = document.getElementById('regiaCloudBalance');
                    if (balanceEl) balanceEl.textContent = `${bank.currency || '€'} ${(bank.accumulatedUnclaimed || 0).toFixed(2)}`;
                    if (typeof refreshCloudHistoryUI === 'function') await refreshCloudHistoryUI();
                    showSuccessPopup("Database sincronizzato!");
                } catch (e) {
                    console.error('Sync error:', e);
                } finally {
                    syncCloudBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizza';
                }
            });
        }

        // Event listeners per Box A: Scadenza Premi
        const saveDelaysFromInputs = () => {
            const getVal = (id, def) => {
                const el = document.getElementById(id);
                return el ? (parseInt(el.value) || def) : def;
            };
            prizeDelaysConfig.gold.max = getVal('delayInputGold', 25);
            prizeDelaysConfig.ambo.max = getVal('delayInputAmbo', 20);
            prizeDelaysConfig.terno.max = getVal('delayInputTerno', 35);
            prizeDelaysConfig.quaterna.max = getVal('delayInputQuaterna', 50);
            prizeDelaysConfig.cinquina.max = getVal('delayInputCinquina', 65);
            prizeDelaysConfig.tombola.max = getVal('delayInputTombola', 85);
        };

        const delayBtn = document.getElementById('regiaApplyDelaysBtn');
        if (delayBtn) {
            delayBtn.addEventListener('click', function() {
                saveDelaysFromInputs();
                logRegiaEvent(`Soglie scadenza premi applicate: Gold (${prizeDelaysConfig.gold.max}), Ambo (${prizeDelaysConfig.ambo.max}), Terno (${prizeDelaysConfig.terno.max}), Quat (${prizeDelaysConfig.quaterna.max}), Cinq (${prizeDelaysConfig.cinquina.max}), Tomb (${prizeDelaysConfig.tombola.max}).`, 'info');
                syncRegiaUI();
                showSuccessPopup(currentLanguage === 'it' ? "Soglie scadenza premi salvate e attive!" : "Prize expiration thresholds saved!");
            });
        }

        const resetDelaysBtn = document.getElementById('regiaResetDelaysBtn');
        if (resetDelaysBtn) {
            resetDelaysBtn.addEventListener('click', function() {
                prizeDelaysConfig.gold.max = 25;
                prizeDelaysConfig.ambo.max = 20;
                prizeDelaysConfig.terno.max = 35;
                prizeDelaysConfig.quaterna.max = 50;
                prizeDelaysConfig.cinquina.max = 65;
                prizeDelaysConfig.tombola.max = 85;
                logRegiaEvent('Soglie scadenza premi ripristinate ai valori predefiniti.', 'info');
                syncRegiaUI();
            });
        }

        ['Gold', 'Ambo', 'Terno', 'Quaterna', 'Cinquina', 'Tombola'].forEach(k => {
            const inp = document.getElementById(`delayInput${k}`);
            if (inp) {
                inp.addEventListener('change', function() {
                    const key = k.toLowerCase();
                    if (prizeDelaysConfig[key]) {
                        prizeDelaysConfig[key].max = parseInt(this.value) || prizeDelaysConfig[key].max;
                        syncRegiaUI();
                    }
                });
            }
        });

        // Event listeners per Box B: Algoritmo Difficoltà Vincite (Anti-Vincita)
        const diffMasterToggle = document.getElementById('regiaDifficultyMasterToggle');
        if (diffMasterToggle) {
            diffMasterToggle.addEventListener('change', function() {
                antiWinDifficultyConfig.enabled = this.checked;
                logRegiaEvent(`Algoritmo Difficoltà Vincite: ${this.checked ? 'ATTIVATO' : 'DISATTIVATO'}.`, 'warn');
                syncRegiaUI();
            });
        }

        const diffLevelSelect = document.getElementById('regiaDifficultyLevelSelect');
        if (diffLevelSelect) {
            diffLevelSelect.addEventListener('change', function() {
                antiWinDifficultyConfig.level = this.value;
                logRegiaEvent(`Profilo Difficoltà impostato su: ${this.value.toUpperCase()}.`, 'info');
                syncRegiaUI();
            });
        }

        const setupForcedMinInput = (id, key) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', function() {
                    const v = parseInt(this.value);
                    if (!isNaN(v) && v > 0) {
                        antiWinDifficultyConfig.forcedMin[key] = v;
                        logRegiaEvent(`Ritardo minimo forzato per ${key.toUpperCase()}: ${v} estrazioni.`, 'info');
                        syncRegiaUI();
                    }
                });
            }
        };
        setupForcedMinInput('forcedMinAmbo', 'ambo');
        setupForcedMinInput('forcedMinTerno', 'terno');
        setupForcedMinInput('forcedMinQuaterna', 'quaterna');
        setupForcedMinInput('forcedMinCinquina', 'cinquina');
        setupForcedMinInput('forcedMinTombola', 'tombola');

        // Color toggles in Regia
        const setupColorToggle = (toggleId, colorKey) => {
            const el = document.getElementById(toggleId);
            if (!el) return;
            el.addEventListener('change', function() {
                const isActive = this.checked;
                if (activeColorSheets[colorKey]) {
                    activeColorSheets[colorKey].forEach(sheet => { sheet.active = isActive; });
                }
                updateCartelleExtractedNumbers();
                updateWinsDisplay();
                updateGameStats();
                if (aiIntelligenceEnabled) analyzeAllCartelleAdvanced();
                initColorControls();
                logRegiaEvent(`Cartelle colore ${colorKey.toUpperCase()}: ${isActive ? 'ATTIVATE' : 'DISATTIVATE'}.`, 'info');
                syncRegiaUI();
            });
        };
        setupColorToggle('regiaToggleBlue', 'blue');
        setupColorToggle('regiaToggleOrange', 'orange');
        setupColorToggle('regiaToggleGreen', 'green');
        setupColorToggle('regiaToggleYellow', 'yellow');

        document.getElementById('regiaQuickGenerateBtn').addEventListener('click', function() {
            generateCartelle();
            logRegiaEvent(`Generate cartelle A4 a 4 colori: ${generatedCartelle.length} cartelle pronte.`, 'info');
            syncRegiaUI();
        });

        document.getElementById('regiaQuickPrintBtn').addEventListener('click', function() {
            showCartelleSection();
            setTimeout(() => { window.print(); }, 400);
        });

        document.getElementById('regiaClearLogBtn').addEventListener('click', function() {
            const logContent = document.getElementById('regiaLogContent');
            if (logContent) {
                logContent.innerHTML = '<div class="log-entry info"><span class="log-time">LIVE</span> Registro pulito. Sistema pronto.</div>';
            }
        });

        // Cartelle Section Controls
        document.getElementById('generateCartelle').addEventListener('click', function() {
            generateCartelle();
            logRegiaEvent(`Generate ${generatedCartelle.length} cartelle in fogli A4.`, 'info');
            syncRegiaUI();
        });
        document.getElementById('exportPDF').addEventListener('click', exportToPDF);
        const printCartelleBtn = document.getElementById('printCartelleBtn');
        if (printCartelleBtn) {
            printCartelleBtn.addEventListener('click', function() { window.print(); });
        }
        document.getElementById('exportJSON').addEventListener('click', exportCartelleToJSON);

        document.getElementById('importJSON').addEventListener('click', function() {
            document.getElementById('jsonImportOverlay').classList.add('active');
        });

        document.getElementById('resetCartelle').addEventListener('click', function() {
            resetCartelle();
            logRegiaEvent('Cartelle resettate.', 'warn');
            syncRegiaUI();
        });
        document.getElementById('closeCartelle').addEventListener('click', hideCartelleSection);

        document.getElementById('participatingGiocatori').addEventListener('change', function() {
            const numGiocatori = parseInt(document.getElementById('numGiocatori').value) || 1;
            let partValue = parseInt(this.value) || 0;
            if (partValue < 0) partValue = 0;
            if (partValue > numGiocatori) {
                partValue = numGiocatori;
                this.value = numGiocatori;
                showErrorPopup(currentLanguage === 'it' ? "Il numero di partecipanti non può essere maggiore del numero totale di giocatori. Impostato a " + numGiocatori : "Number of participants cannot be greater than total players. Set to " + numGiocatori);
            }
            participatingGiocatori = partValue;
            if (generatedCartelle.length > 0) {
                updateCartelleStats();
                updateWinsDisplay();
                updateCartelleExtractedNumbers();
                updateGameStats();
                if (aiIntelligenceEnabled) analyzeAllCartelleAdvanced();
                if (document.getElementById('cartelleSection').classList.contains('active')) renderCartelle();
                syncRegiaUI();
            }
        });

        document.getElementById('closeJsonImport').addEventListener('click', function() {
            document.getElementById('jsonImportOverlay').classList.remove('active');
            document.getElementById('jsonImportTextarea').value = '';
            document.getElementById('jsonFileUpload').value = '';
        });

        document.getElementById('confirmJsonImport').addEventListener('click', function() {
            const jsonData = document.getElementById('jsonImportTextarea').value;
            if (jsonData.trim()) importCartelleFromJSON(jsonData);
            else showErrorPopup(currentLanguage === 'it' ? "Per favore, incolla il JSON nel campo di testo o carica un file." : "Please paste JSON in the text field or upload a file.");
        });

        document.getElementById('jsonFileUpload').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    document.getElementById('jsonImportTextarea').value = e.target.result;
                };
                reader.readAsText(file);
            }
        });

        document.getElementById('voiceControlBtn').addEventListener('click', function() {
            toggleVoice();
            syncRegiaUI();
        });
        document.getElementById('aiIntelligenceBtn').addEventListener('click', function() {
            toggleAIIntelligence();
            syncRegiaUI();
        });
        document.getElementById('aiIntelligenceBtn').addEventListener('dblclick', function(e) {
            e.preventDefault();
            showAIAnalysisPanel();
        });

        document.getElementById('aiAnalysisClose').addEventListener('click', hideAIAnalysisPanel);
        document.getElementById('aiAnalysisPanel').addEventListener('click', function(e) {
            if (e.target === this) hideAIAnalysisPanel();
        });
    }

    function setupRealtimeWebSocketSync() {
        if (!window.TombolaSync) return;

        // 1. Ricezione estrazione numero in tempo reale dal server / Regia
        window.TombolaSync.on('NUMBER_EXTRACTED', (data) => {
            if (data && data.number) {
                if (!extractedNumbers.includes(data.number)) {
                    processExtractedNumber(data.number, true, data.smorfia);
                }
            }
        });

        // 2. Ricezione avvio timer da Regia
        window.TombolaSync.on('TIMER_STARTED', (data) => {
            if (data && data.interval) {
                currentTimer = data.interval;
                remainingTime = data.interval;
            }
            startTimer(true);
        });

        // 3. Ricezione pausa timer da Regia
        window.TombolaSync.on('TIMER_PAUSED', () => {
            stopTimer(true);
        });

        // 4. Ricezione reset gioco da Regia
        window.TombolaSync.on('GAME_RESET', () => {
            resetGame(true);
        });

        // 5. Ricezione vincita dichiarata (Ambo, Terno, Tombola, ecc.)
        window.TombolaSync.on('WIN_DECLARED', (data) => {
            if (data && data.winType && data.winningCartellaIds) {
                handleGameWinEvent(data.winType, data.winningCartellaIds, data.winningNumbers || [], data.winningRowIndex, true);
            }
        });

        // 6. Ricezione aggiornamento Montepremi Non Vinti
        window.TombolaSync.on('UNCLAIMED_UPDATED', (data) => {
            if (data && typeof data.unclaimedPot === 'number') {
                unclaimedGoldTotal = data.unclaimedPot;
                updateUnclaimedPotDisplay();
            }
        });

        // 7. Ricezione aggiornamento Montepremi e Valuta
        window.TombolaSync.on('PRIZE_POOL_UPDATED', (data) => {
            if (data && typeof data.prizePool === 'number') {
                const poolInput = document.getElementById('prizePool');
                if (poolInput) poolInput.value = data.prizePool;
                if (data.currency) {
                    const currSelect = document.getElementById('currencySelect');
                    if (currSelect) currSelect.value = data.currency;
                }
                updatePrizes();
            }
        });

        // 8. Ricezione aggiornamento grafiche broadcast TV Live
        window.TombolaSync.on('GRAPHICS_UPDATED', (data) => {
            if (data && data.tvGraphics) {
                Object.assign(tvGraphicState, data.tvGraphics);
                applyTvGraphicState();
            }
        });

        // 9. Ricezione stato iniziale completo (se la TV si connette a partita già iniziata)
        window.TombolaSync.on('STATE_INIT', (data) => {
            if (data && data.state) {
                const st = data.state;
                if (st.unclaimedPot !== undefined && st.unclaimedPot > 0 && unclaimedGoldTotal === 0) {
                    unclaimedGoldTotal = st.unclaimedPot;
                    updateUnclaimedPotDisplay();
                }
                if (st.extractedNumbers && st.extractedNumbers.length > 0) {
                    st.extractedNumbers.forEach(n => {
                        if (!extractedNumbers.includes(n)) {
                            processExtractedNumber(n, true);
                        }
                    });
                }
                if (st.tvGraphics) {
                    Object.assign(tvGraphicState, st.tvGraphics);
                    applyTvGraphicState();
                }
            }
        });

        // 10. Aggiorna badge stato WebSocket in console Regia
        window.TombolaSync.onStatusChange((status, clientCount) => {
            const badge = document.getElementById('regiaWsBadge');
            const txt = document.getElementById('regiaWsText');
            if (badge && txt) {
                if (status === 'connected') {
                    badge.className = 'regia-ws-badge active';
                    txt.innerHTML = `<span class="ws-dot active"></span> WS Live (${clientCount} ${clientCount === 1 ? 'schermo' : 'schermi'})`;
                } else if (status === 'connecting') {
                    badge.className = 'regia-ws-badge connecting';
                    txt.innerHTML = `<span class="ws-dot connecting"></span> Connessione WS...`;
                } else {
                    badge.className = 'regia-ws-badge offline';
                    txt.innerHTML = `<span class="ws-dot offline"></span> WS Locale (BroadcastChannel)`;
                }
            }
        });

        // Pulsante in Regia: Apri TV Studio (2° Monitor / Nuova Finestra)
        const openTvExtBtn = document.getElementById('regiaOpenTvExtBtn');
        if (openTvExtBtn) {
            openTvExtBtn.addEventListener('click', () => {
                const tvUrl = `${window.location.origin}${window.location.pathname}?view=tv`;
                window.open(tvUrl, 'Tombola90TvStudio', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no');
                logRegiaEvent('Aperta finestra TV Studio su secondo monitor/finestra.', 'info');
            });
        }

        // Se l'URL contiene ?view=tv, apri direttamente lo Schermo TV Studio senza Regia attiva
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('view') === 'tv' || urlParams.get('mode') === 'tv') {
            closeRegia();
            document.body.classList.add('tv-studio-active');
            logRegiaEvent('Modalità Schermo TV Studio attiva.', 'info');
        }
    }

    // Expose testable handle for automated inspection & verification
    window.__tombolaGame = {
        getSequentialActivePrize,
        getCartelleWins: () => cartelleWins,
        getGeneratedCartelle: () => generatedCartelle,
        getActiveColorSheets: () => activeColorSheets,
        getExtractedNumbers: () => extractedNumbers,
        extractNumber,
        processExtractedNumber,
        resetGame,
        highlightWinningElements,
        getTvGraphicState: () => tvGraphicState,
        applyTvGraphicState,
        setupRealtimeWebSocketSync
    };

    initializeApp();
    setupEventListeners();
    setupRealtimeWebSocketSync();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTombolaApp);
} else {
    startTombolaApp();
}
