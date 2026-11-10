const fs = require('fs');
let code = fs.readFileSync('src/tombola-controller.js', 'utf8');

// Define smorfiaItaliana
const smorfiaItalianaDef = `
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
`;

if (!code.includes('smorfiaItaliana =')) {
    code = code.replace('const smorfiaNapolitana =', smorfiaItalianaDef + '\n    const smorfiaNapolitana =');
}

// Replace speakNumber
const oldSpeakRegex = /function speakNumber\(num\) \{[\s\S]*?setTimeout\(\(\) => \{ window\.speechSynthesis\.speak\(utter\); \}, 50\);\s*\}/;
const newSpeakNumber = `function speakNumber(num) {
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
    }`;

code = code.replace(oldSpeakRegex, newSpeakNumber);

// Replace updateSmorfiaDisplay
const oldSmorfiaDisplayRegex = /function updateSmorfiaDisplay\(num\) \{[\s\S]*?textEl\.textContent = currentLanguage === 'it'[\s\S]*?\}/;
const newSmorfiaDisplay = `function updateSmorfiaDisplay(num) {
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
    }`;

code = code.replace(oldSmorfiaDisplayRegex, newSmorfiaDisplay);

// Update APP_VERSION
code = code.replace('document.getElementById(\'versionInfo\').textContent = "v.12.3.3 - GOLD EDITION ⭐";', 'document.getElementById(\'versionInfo\').textContent = "v.15.2.0";');

fs.writeFileSync('src/tombola-controller.js', code);
console.log('Successfully updated src/tombola-controller.js');
