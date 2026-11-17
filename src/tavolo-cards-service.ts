import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  generateCartellaNumbersForSheet,
  type CartellaData,
  type CartellaNumber,
} from './game/tombola-core';

export const DEFAULT_TAVOLO_GAME_ID = 'TAV-G001';
export const DEFAULT_TAVOLO_SHEETS_COUNT = 30;
export const TAVOLO_SETS_LOCAL_CACHE_KEY = 'tombola_tavolo_sets_cache_v1';
export const TAVOLO_UI_PREFS_LOCAL_KEY = 'tombola_tavolo_ui_prefs_v1';
export const TAVOLO_FIRESTORE_TIMEOUT_MS = 5000;

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number = TAVOLO_FIRESTORE_TIMEOUT_MS, label: string = 'Operazione'): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout dopo ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

const TAVOLO_COLORS = ['blue', 'orange', 'green', 'yellow'] as const;

export interface TavoloCardItem {
  id: string;
  gameId: string;
  sheetNumber: number;
  cartellaNumber: number;
  stripCardIndex: number;
  color: string;
  colorType: string;
  playerNumber: number;
  numbers: CartellaNumber[];
}

export interface TavoloSheetData {
  id: string;
  setId: string;
  gameId: string;
  sheetNumber: number;
  sheetLabel: string;
  cards: TavoloCardItem[];
  updatedAt: string;
}

export interface TavoloSetMeta {
  id: string;
  gameId: string;
  name: string;
  totalSheets: number;
  activeSheets: number[];
  createdAt: string;
  updatedAt: string;
}

export interface TavoloSetRecord extends TavoloSetMeta {
  sheets: TavoloSheetData[];
}

export interface RuntimeTavoloCard extends CartellaData {
  stripCardIndex: number;
  sheetLabel: string;
  winningRow?: number;
  winningType?: string;
}

export interface TavoloUiPrefs {
  mode: 'menu' | 'tavolo' | 'online';
  selectedGameId: string;
  showOnlySelectedSheets: boolean;
}

let tavoloDb: Firestore | null = null;

function getTavoloFirestore(): Firestore | null {
  try {
    if (tavoloDb) return tavoloDb;
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const databaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';
    tavoloDb =
      databaseId && databaseId !== '(default)'
        ? getFirestore(app, databaseId)
        : getFirestore(app);
    return tavoloDb;
  } catch {
    return null;
  }
}

export function sanitizeTavoloGameId(rawId: unknown): string {
  const cleaned = String(rawId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || DEFAULT_TAVOLO_GAME_ID;
}

export function formatSheetLabel(sheetNumber: number): string {
  const safeNum = Math.max(1, Math.min(999, Math.round(Number(sheetNumber) || 1)));
  return String(safeNum).padStart(2, '0');
}

export function formatTavoloSheetSerial(gameId: unknown, sheetNumber: number): string {
  return `${sanitizeTavoloGameId(gameId)}-F${formatSheetLabel(sheetNumber)}`;
}

export function formatItalianDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '--';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '--';
  try {
    return parsed.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

export function buildSheetDocId(sheetNumber: number): string {
  return `sheet_${formatSheetLabel(sheetNumber)}`;
}

export function sanitizeActiveSheetsList(rawSheets: unknown, totalSheets: number = DEFAULT_TAVOLO_SHEETS_COUNT): number[] {
  const maxSheet = Math.max(1, Math.min(100, Math.round(Number(totalSheets) || DEFAULT_TAVOLO_SHEETS_COUNT)));
  if (!Array.isArray(rawSheets)) return [];
  const unique = new Set<number>();
  for (const item of rawSheets) {
    const n = Math.round(Number(item));
    if (Number.isFinite(n) && n >= 1 && n <= maxSheet) {
      unique.add(n);
    }
  }
  return Array.from(unique).sort((a, b) => a - b);
}

export function generatePermanentTavoloSet(
  rawGameId: string = DEFAULT_TAVOLO_GAME_ID,
  rawTotalSheets: number = DEFAULT_TAVOLO_SHEETS_COUNT,
  customName?: string
): TavoloSetRecord {
  const gameId = sanitizeTavoloGameId(rawGameId);
  const totalSheets = Math.max(1, Math.min(100, Math.round(Number(rawTotalSheets) || DEFAULT_TAVOLO_SHEETS_COUNT)));
  const nowIso = new Date().toISOString();
  const sheets: TavoloSheetData[] = [];
  const activeSheets: number[] = [];

  for (let sheetNum = 1; sheetNum <= totalSheets; sheetNum++) {
    const sheetLabel = formatSheetLabel(sheetNum);
    const cards: TavoloCardItem[] = [];
    let cartellaSheetCounter = 1;

    for (let colorIdx = 0; colorIdx < TAVOLO_COLORS.length; colorIdx++) {
      const colorCode = TAVOLO_COLORS[colorIdx];
      const colorName = colorCode.charAt(0).toUpperCase() + colorCode.slice(1);
      const stripCards = generateCartellaNumbersForSheet();

      for (let stripIndex = 0; stripIndex < 6; stripIndex++) {
        const stripCardIndex = stripIndex + 1;
        const cartellaNumber = cartellaSheetCounter++;
        const id = `${gameId}.F${sheetLabel}.C${String(cartellaNumber).padStart(2, '0')}.${colorName}${stripCardIndex}`;

        cards.push({
          id,
          gameId,
          sheetNumber: sheetNum,
          cartellaNumber,
          stripCardIndex,
          color: `${colorName}G${sheetNum}`,
          colorType: colorCode,
          playerNumber: sheetNum,
          numbers: stripCards[stripIndex].map((n) => ({
            number: Number(n.number),
            column: Number(n.column),
            row: Number(n.row),
          })),
        });
      }
    }

    sheets.push({
      id: buildSheetDocId(sheetNum),
      setId: gameId,
      gameId,
      sheetNumber: sheetNum,
      sheetLabel,
      cards,
      updatedAt: nowIso,
    });
  }

  return {
    id: gameId,
    gameId,
    name: (customName || `Sezione Tavolo Gioco ${gameId} (${totalSheets} Fogli)`).trim().slice(0, 80),
    totalSheets,
    activeSheets,
    createdAt: nowIso,
    updatedAt: nowIso,
    sheets,
  };
}

export function sanitizeTavoloSheetData(
  raw: Partial<TavoloSheetData> | null | undefined,
  fallbackSetId: string = DEFAULT_TAVOLO_GAME_ID
): TavoloSheetData | null {
  if (!raw || !Array.isArray(raw.cards) || raw.cards.length !== 24) return null;
  const setId = sanitizeTavoloGameId(raw.setId || raw.gameId || fallbackSetId);
  const sheetNumber = Math.max(1, Math.min(100, Math.round(Number(raw.sheetNumber) || 1)));
  const sheetLabel = typeof raw.sheetLabel === 'string' && raw.sheetLabel.trim()
    ? raw.sheetLabel.trim().slice(0, 10)
    : formatSheetLabel(sheetNumber);
  const nowIso = new Date().toISOString();

  const cards: TavoloCardItem[] = raw.cards.map((c, idx) => {
    const colorType = typeof c.colorType === 'string' && TAVOLO_COLORS.includes(c.colorType as any)
      ? c.colorType
      : TAVOLO_COLORS[Math.floor(idx / 6) % 4];
    const colorName = colorType.charAt(0).toUpperCase() + colorType.slice(1);
    const cartellaNumber = Math.max(1, Math.min(24, Math.round(Number(c.cartellaNumber) || idx + 1)));
    const stripCardIndex = Math.max(1, Math.min(6, Math.round(Number(c.stripCardIndex) || (idx % 6) + 1)));
    return {
      id: typeof c.id === 'string' && c.id
        ? c.id
        : `${setId}.F${sheetLabel}.C${String(cartellaNumber).padStart(2, '0')}.${colorName}${stripCardIndex}`,
      gameId: setId,
      sheetNumber,
      cartellaNumber,
      stripCardIndex,
      color: typeof c.color === 'string' && c.color ? c.color : `${colorName}G${sheetNumber}`,
      colorType,
      playerNumber: Math.max(1, Math.round(Number(c.playerNumber) || sheetNumber)),
      numbers: Array.isArray(c.numbers)
        ? c.numbers.map((n) => ({
            number: Number(n.number),
            column: Number(n.column),
            row: Number(n.row),
          }))
        : [],
    };
  });

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : buildSheetDocId(sheetNumber),
    setId,
    gameId: setId,
    sheetNumber,
    sheetLabel,
    cards,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.length >= 10 && raw.updatedAt.length <= 40
        ? raw.updatedAt
        : nowIso,
  };
}

export function sanitizeTavoloSetRecord(raw: Partial<TavoloSetRecord> | null | undefined): TavoloSetRecord | null {
  if (!raw) return null;
  const gameId = sanitizeTavoloGameId(raw.gameId || raw.id);
  const nowIso = new Date().toISOString();

  const rawSheets = Array.isArray(raw.sheets) ? raw.sheets : [];
  const sheets: TavoloSheetData[] = rawSheets
    .map((s) => sanitizeTavoloSheetData(s, gameId))
    .filter((s): s is TavoloSheetData => s !== null)
    .sort((a, b) => a.sheetNumber - b.sheetNumber);

  const totalSheets = sheets.length > 0
    ? sheets.length
    : Math.max(1, Math.min(100, Math.round(Number(raw.totalSheets) || DEFAULT_TAVOLO_SHEETS_COUNT)));

  return {
    id: gameId,
    gameId,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim().slice(0, 80)
        : `Sezione Tavolo Gioco ${gameId} (${totalSheets} Fogli)`,
    totalSheets,
    activeSheets: sanitizeActiveSheetsList(raw.activeSheets, totalSheets),
    createdAt:
      typeof raw.createdAt === 'string' && raw.createdAt.length >= 10 && raw.createdAt.length <= 40
        ? raw.createdAt
        : nowIso,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.length >= 10 && raw.updatedAt.length <= 40
        ? raw.updatedAt
        : nowIso,
    sheets,
  };
}

export function hydrateRuntimeCartelleFromTavoloSet(set: TavoloSetRecord): RuntimeTavoloCard[] {
  const result: RuntimeTavoloCard[] = [];
  const sortedSheets = [...set.sheets].sort((a, b) => a.sheetNumber - b.sheetNumber);

  for (const sheet of sortedSheets) {
    for (const card of sheet.cards) {
      result.push({
        id: card.id,
        gameId: set.gameId,
        sheetNumber: sheet.sheetNumber,
        sheetLabel: sheet.sheetLabel || formatSheetLabel(sheet.sheetNumber),
        cartellaNumber: card.cartellaNumber,
        stripCardIndex: card.stripCardIndex,
        color: card.color,
        colorType: card.colorType,
        playerNumber: card.playerNumber,
        numbers: card.numbers.map((n) => ({ ...n })),
        extractedNumbers: [],
        wins: { ambo: false, terno: false, quaterna: false, cinquina: false, tombola: false },
        winningNumbers: [],
      });
    }
  }

  return result;
}

export interface CardActiveModeParams {
  card: {
    id?: string;
    gameId?: string;
    sheetNumber?: number;
    playerNumber?: number;
    colorType?: string;
  } | null | undefined;
  mode: 'menu' | 'tavolo' | 'online';
  selectedTavoloGameId: string;
  activeTavoloSheets: number[];
  participatingGiocatori: number;
  isColorActive: (colorType: string) => boolean;
}

export function isCardActiveForMode(params: CardActiveModeParams): boolean {
  const { card, mode, selectedTavoloGameId, activeTavoloSheets, participatingGiocatori, isColorActive } = params;
  if (!card || !card.colorType) return false;

  if (mode === 'tavolo') {
    const cleanSelectedGame = sanitizeTavoloGameId(selectedTavoloGameId);
    const cardGameId = sanitizeTavoloGameId(card.gameId);
    if (cardGameId !== cleanSelectedGame) return false;
    const sheetNum = Number(card.sheetNumber);
    if (!Array.isArray(activeTavoloSheets) || !activeTavoloSheets.includes(sheetNum)) {
      return false;
    }
    return isColorActive(card.colorType);
  }

  const playerNum = Number(card.playerNumber) || 1;
  if (participatingGiocatori > 0 && playerNum > participatingGiocatori) {
    return false;
  }
  return isColorActive(card.colorType);
}

function readLocalTavoloSetsMap(): Record<string, TavoloSetRecord> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(TAVOLO_SETS_LOCAL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<TavoloSetRecord>>;
    const out: Record<string, TavoloSetRecord> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      const clean = sanitizeTavoloSetRecord(v);
      if (clean) out[clean.id || k] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalTavoloSet(set: TavoloSetRecord): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const map = readLocalTavoloSetsMap();
    map[set.id] = set;
    localStorage.setItem(TAVOLO_SETS_LOCAL_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function readTavoloUiPrefs(): TavoloUiPrefs {
  const defaults: TavoloUiPrefs = {
    mode: 'menu',
    selectedGameId: DEFAULT_TAVOLO_GAME_ID,
    showOnlySelectedSheets: false,
  };
  try {
    if (typeof localStorage === 'undefined') return defaults;
    const raw = localStorage.getItem(TAVOLO_UI_PREFS_LOCAL_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<TavoloUiPrefs>;
    const mode = parsed.mode === 'tavolo' || parsed.mode === 'online' ? parsed.mode : 'menu';
    return {
      mode,
      selectedGameId: sanitizeTavoloGameId(parsed.selectedGameId || DEFAULT_TAVOLO_GAME_ID),
      showOnlySelectedSheets: Boolean(parsed.showOnlySelectedSheets),
    };
  } catch {
    return defaults;
  }
}

export function writeTavoloUiPrefs(prefs: Partial<TavoloUiPrefs>): TavoloUiPrefs {
  const current = readTavoloUiPrefs();
  const next: TavoloUiPrefs = {
    mode: prefs.mode === 'tavolo' || prefs.mode === 'online' || prefs.mode === 'menu' ? prefs.mode : current.mode,
    selectedGameId: prefs.selectedGameId ? sanitizeTavoloGameId(prefs.selectedGameId) : current.selectedGameId,
    showOnlySelectedSheets:
      prefs.showOnlySelectedSheets !== undefined ? Boolean(prefs.showOnlySelectedSheets) : current.showOnlySelectedSheets,
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TAVOLO_UI_PREFS_LOCAL_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage error
  }
  return next;
}

async function fetchJsonSafe(url: string, options?: RequestInit): Promise<any | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function buildMetaPayload(set: TavoloSetRecord): TavoloSetMeta {
  return {
    id: set.id,
    gameId: set.gameId,
    name: set.name,
    totalSheets: set.totalSheets,
    activeSheets: sanitizeActiveSheetsList(set.activeSheets, set.totalSheets),
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
  };
}

export async function savePermanentTavoloSet(set: TavoloSetRecord): Promise<{
  success: boolean;
  set: TavoloSetRecord;
  savedToFirestore: boolean;
  savedToServerDb: boolean;
  error?: string;
}> {
  const cleanSet = sanitizeTavoloSetRecord(set);
  if (!cleanSet) {
    throw new Error('Set Tavolo non valido');
  }
  cleanSet.updatedAt = new Date().toISOString();

  // 1. Local cache immediate write
  writeLocalTavoloSet(cleanSet);

  let savedToServerDb = false;
  let savedToFirestore = false;
  let lastError: string | undefined;

  // 2. Built-in Persistent Server DB
  const srvRes = await fetchJsonSafe(`/api/db/tavolo-sets/${encodeURIComponent(cleanSet.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cleanSet),
  });
  if (srvRes?.ok) {
    savedToServerDb = true;
  }

  // 3. Firebase Firestore (Meta first to satisfy Master Gate, then sheet batches)
  const fsDb = getTavoloFirestore();
  if (fsDb) {
    try {
      const metaRef = doc(fsDb, 'tavolo_sets', cleanSet.id);
      await withTimeout(setDoc(metaRef, buildMetaPayload(cleanSet)), TAVOLO_FIRESTORE_TIMEOUT_MS, 'Firestore setDoc tavolo_sets');

      const BATCH_SIZE = 15;
      for (let i = 0; i < cleanSet.sheets.length; i += BATCH_SIZE) {
        const chunk = cleanSet.sheets.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(fsDb);
        for (const sheet of chunk) {
          const sheetRef = doc(fsDb, 'tavolo_sets', cleanSet.id, 'sheets', sheet.id);
          batch.set(sheetRef, {
            id: sheet.id,
            setId: cleanSet.id,
            gameId: cleanSet.gameId,
            sheetNumber: sheet.sheetNumber,
            sheetLabel: sheet.sheetLabel,
            cards: sheet.cards,
            updatedAt: cleanSet.updatedAt,
          });
        }
        await withTimeout(batch.commit(), TAVOLO_FIRESTORE_TIMEOUT_MS, 'Firestore batch.commit sheets');
      }
      savedToFirestore = true;
    } catch (err: any) {
      lastError = err?.message || 'Errore salvataggio Firestore Tavolo';
      console.warn('[TavoloService] Salvataggio Firestore fallito/timeout (mantenuto su Server DB / Cache):', err);
    }
  }

  return {
    success: savedToFirestore || savedToServerDb || true,
    set: cleanSet,
    savedToFirestore,
    savedToServerDb,
    error: lastError,
  };
}

export async function loadPermanentTavoloSet(
  rawSetId: string = DEFAULT_TAVOLO_GAME_ID
): Promise<{
  set: TavoloSetRecord | null;
  source: 'firestore' | 'server' | 'local' | 'none';
  savedToFirestore: boolean;
  savedToServerDb: boolean;
}> {
  const setId = sanitizeTavoloGameId(rawSetId);
  const candidates: Array<{ source: 'firestore' | 'server' | 'local'; set: TavoloSetRecord; updatedMs: number }> = [];
  let savedToFirestore = false;
  let savedToServerDb = false;

  const localMap = readLocalTavoloSetsMap();
  if (localMap[setId] && localMap[setId].sheets.length > 0) {
    candidates.push({
      source: 'local',
      set: localMap[setId],
      updatedMs: Date.parse(localMap[setId].updatedAt || '') || 0,
    });
  }

  // Query Server DB
  const srvRes = await fetchJsonSafe(`/api/db/tavolo-sets/${encodeURIComponent(setId)}`);
  if (srvRes?.ok && srvRes.set) {
    const cleanSrv = sanitizeTavoloSetRecord(srvRes.set);
    if (cleanSrv && cleanSrv.sheets.length > 0) {
      savedToServerDb = true;
      candidates.push({
        source: 'server',
        set: cleanSrv,
        updatedMs: Date.parse(cleanSrv.updatedAt || '') || 0,
      });
    }
  }

  // Query Firebase Firestore
  const fsDb = getTavoloFirestore();
  if (fsDb) {
    try {
      const metaSnap = await withTimeout(getDoc(doc(fsDb, 'tavolo_sets', setId)), TAVOLO_FIRESTORE_TIMEOUT_MS, 'Firestore getDoc tavolo_sets');
      if (metaSnap.exists()) {
        const meta = metaSnap.data() as Partial<TavoloSetMeta>;
        const sheetsSnap = await withTimeout(getDocs(collection(fsDb, 'tavolo_sets', setId, 'sheets')), TAVOLO_FIRESTORE_TIMEOUT_MS, 'Firestore getDocs sheets');
        const sheets: Partial<TavoloSheetData>[] = [];
        sheetsSnap.forEach((d) => sheets.push(d.data() as Partial<TavoloSheetData>));
        const cleanFs = sanitizeTavoloSetRecord({
          ...meta,
          id: setId,
          gameId: meta.gameId || setId,
          sheets: sheets as TavoloSheetData[],
        });
        if (cleanFs && cleanFs.sheets.length > 0) {
          savedToFirestore = true;
          candidates.push({
            source: 'firestore',
            set: cleanFs,
            updatedMs: Date.parse(cleanFs.updatedAt || '') || 0,
          });
        }
      }
    } catch (err) {
      console.warn('[TavoloService] Lettura Firestore non disponibile/timeout, uso Server DB / Cache:', err);
    }
  }

  if (candidates.length === 0) {
    return { set: null, source: 'none', savedToFirestore: false, savedToServerDb: false };
  }

  // Pick newest set with full sheets; break ties preferring firestore > server > local
  const priority: Record<'firestore' | 'server' | 'local', number> = {
    firestore: 3,
    server: 2,
    local: 1,
  };
  candidates.sort((a, b) => {
    if (b.set.sheets.length !== a.set.sheets.length) {
      return b.set.sheets.length - a.set.sheets.length;
    }
    if (b.updatedMs !== a.updatedMs) {
      return b.updatedMs - a.updatedMs;
    }
    return priority[b.source] - priority[a.source];
  });

  const best = candidates[0];
  writeLocalTavoloSet(best.set);
  return {
    set: best.set,
    source: savedToFirestore && savedToServerDb ? 'firestore' : best.source,
    savedToFirestore,
    savedToServerDb,
  };
}

export async function listSavedTavoloSets(): Promise<TavoloSetMeta[]> {
  const byId = new Map<string, TavoloSetMeta>();

  const upsertMeta = (meta: Partial<TavoloSetMeta> | null | undefined) => {
    if (!meta || !meta.id) return;
    const id = sanitizeTavoloGameId(meta.id);
    const totalSheets = Math.max(1, Math.min(100, Math.round(Number(meta.totalSheets) || DEFAULT_TAVOLO_SHEETS_COUNT)));
    const next: TavoloSetMeta = {
      id,
      gameId: sanitizeTavoloGameId(meta.gameId || id),
      name:
        typeof meta.name === 'string' && meta.name.trim()
          ? meta.name.trim().slice(0, 80)
          : `Sezione Tavolo Gioco ${id} (${totalSheets} Fogli)`,
      totalSheets,
      activeSheets: sanitizeActiveSheetsList(meta.activeSheets, totalSheets),
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : new Date().toISOString(),
      updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : new Date().toISOString(),
    };

    const prev = byId.get(id);
    if (!prev || (Date.parse(next.updatedAt) || 0) >= (Date.parse(prev.updatedAt) || 0)) {
      byId.set(id, next);
    }
  };

  // 1. Local cache
  const localMap = readLocalTavoloSetsMap();
  Object.values(localMap).forEach((s) => upsertMeta(buildMetaPayload(s)));

  // 2. Server DB
  const srvRes = await fetchJsonSafe('/api/db/tavolo-sets');
  if (srvRes?.ok && Array.isArray(srvRes.sets)) {
    srvRes.sets.forEach((m: Partial<TavoloSetMeta>) => upsertMeta(m));
  }

  // 3. Firestore
  const fsDb = getTavoloFirestore();
  if (fsDb) {
    try {
      const snap = await withTimeout(getDocs(collection(fsDb, 'tavolo_sets')), TAVOLO_FIRESTORE_TIMEOUT_MS, 'Firestore list tavolo_sets');
      snap.forEach((d) => upsertMeta(d.data() as Partial<TavoloSetMeta>));
    } catch {
      // Ignore network / timeout / offline error
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export async function saveTavoloActiveSheetsSelection(
  rawSetId: string,
  rawActiveSheets: number[]
): Promise<{ success: boolean; activeSheets: number[] }> {
  const setId = sanitizeTavoloGameId(rawSetId);
  const localMap = readLocalTavoloSetsMap();
  const existing = localMap[setId];
  const totalSheets = existing?.totalSheets || DEFAULT_TAVOLO_SHEETS_COUNT;
  const activeSheets = sanitizeActiveSheetsList(rawActiveSheets, totalSheets);
  const updatedAt = new Date().toISOString();

  if (existing) {
    existing.activeSheets = activeSheets;
    existing.updatedAt = updatedAt;
    writeLocalTavoloSet(existing);
  }

  // Persist to Server DB
  await fetchJsonSafe(`/api/db/tavolo-sets/${encodeURIComponent(setId)}/active-sheets`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeSheets, updatedAt }),
  });

  // Persist to Firestore metadata doc (only if doc exists so isValidTavoloSetMeta hasAll passes)
  const fsDb = getTavoloFirestore();
  if (fsDb) {
    try {
      const metaRef = doc(fsDb, 'tavolo_sets', setId);
      const snap = await withTimeout(getDoc(metaRef), TAVOLO_FIRESTORE_TIMEOUT_MS, 'Firestore getDoc activeSheets');
      if (snap.exists()) {
        await withTimeout(setDoc(metaRef, { activeSheets, updatedAt }, { merge: true }), TAVOLO_FIRESTORE_TIMEOUT_MS, 'Firestore setDoc activeSheets');
      }
    } catch (err) {
      console.warn('[TavoloService] Aggiornamento activeSheets Firestore non riuscito:', err);
    }
  }

  return { success: true, activeSheets };
}
