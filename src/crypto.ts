// Chiffrement côté navigateur (Web Crypto) — aucun serveur.
// party.json est public sur GitHub Pages : tout ce qu'il contient est chiffré.
//  - bloc "admin"   : toute la festa (personagens, jogadores, códigos), clé = mot de passe de l'organisation
//  - blocs "entries": une fiche par joueur (nom + sa personagem), clé = son code personnel
// Sans le bon code, impossible de lire une fiche ni de savoir à qui elle appartient.

export type Role = "assassino" | "cumplice" | "testemunha" | "suspeito" | "vitima";
// Textos do dossiê, todos opcionais
export type Dossier = { occupation?: string; story?: string; secrets?: string; alibi?: string; information?: string; objective?: string };
// Cada jogador é a sua própria personagem: nome, código, papel e dossiê.
export type Player = Dossier & { id: string; name: string; code: string; role?: Role | null; characterId?: string | null };
// Formato antigo (separador Personagens), mantido só para ler festas antigas
export type Character = Dossier & { id: string; name: string; role: Role };
export type PartyData = { players: Player[]; characters?: Character[]; updatedAt: number };
export type Box = { iv: string; ct: string };
export type PartyFile = { v: 1; iter: number; salt: string; updatedAt: number; admin: Box; entries: Box[] };
export type PlayerView = Dossier & { name: string; role: Role | null; updatedAt: number };

export const ITERATIONS = 310_000;
// Sans I, L, O, 0, 1 : pas de confusion à la lecture.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateCode(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    const bytes = random(CODE_LENGTH * 2);
    let code = "";
    // rejet des octets ≥ 248 (8 × 31) pour une distribution uniforme
    for (const b of bytes) {
      if (b >= 248) continue;
      code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
    if (code.length === CODE_LENGTH && !used.has(code)) return code;
  }
}

// Cache em memória: com o mesmo sal, cada chave só é calculada uma vez (gravações rápidas no telemóvel).
const keyCache = new Map<string, Promise<CryptoKey>>();
function deriveKey(secret: string, salt: Uint8Array, iter: number, purpose: "admin" | "player"): Promise<CryptoKey> {
  const id = `${purpose}|${iter}|${toB64(salt)}|${secret}`;
  let k = keyCache.get(id);
  if (!k) { k = deriveKeyRaw(secret, salt, iter, purpose); keyCache.set(id, k); k.catch(() => keyCache.delete(id)); }
  return k;
}
async function deriveKeyRaw(secret: string, salt: Uint8Array, iter: number, purpose: "admin" | "player"): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  const fullSalt = new Uint8Array([...salt, ...enc.encode(purpose)]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fullSalt, iterations: iter },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

async function seal(key: CryptoKey, value: unknown): Promise<Box> {
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value))));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function open<T>(key: CryptoKey, box: Box): Promise<T | null> {
  try {
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, key, fromB64(box.ct));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    return null; // mauvaise clé → l'étiquette GCM ne correspond pas
  }
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = random(4).reduce((n, b) => n * 256 + b, 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DOSSIER_KEYS = ["occupation", "story", "secrets", "alibi", "information", "objective"] as const;
// Junta os textos do jogador com os de uma personagem antiga, se existir
export function resolvePlayer(p: Player, characters: Character[] = []): Omit<PlayerView, "updatedAt"> {
  const legacy = p.characterId ? characters.find((c) => c.id === p.characterId) : undefined;
  const out: Omit<PlayerView, "updatedAt"> = { name: p.name, role: p.role || legacy?.role || null };
  for (const k of DOSSIER_KEYS) out[k] = (p[k] || legacy?.[k] || "").trim();
  return out;
}

// keepSalt : reutiliza o sal do ficheiro atual para aproveitar as chaves já calculadas
export async function buildPartyFile(data: PartyData, password: string, iter = ITERATIONS, keepSalt?: string): Promise<PartyFile> {
  const salt = keepSalt ? fromB64(keepSalt) : random(16);
  const updatedAt = Date.now();
  const full: PartyData = { ...data, updatedAt };
  const admin = await seal(await deriveKey(password, salt, iter, "admin"), full);
  const entries = await Promise.all(data.players.map(async (p) => {
    const view: PlayerView = { ...resolvePlayer(p, data.characters), updatedAt };
    return seal(await deriveKey(normalizeCode(p.code), salt, iter, "player"), view);
  }));
  return { v: 1, iter, salt: toB64(salt), updatedAt, admin, entries: shuffle(entries) };
}

export async function openAdmin(file: PartyFile, password: string): Promise<PartyData | null> {
  const key = await deriveKey(password, fromB64(file.salt), file.iter, "admin");
  return open<PartyData>(key, file.admin);
}

export async function openPlayer(file: PartyFile, code: string): Promise<PlayerView | null> {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const key = await deriveKey(normalized, fromB64(file.salt), file.iter, "player");
  for (const box of file.entries) {
    const view = await open<PlayerView>(key, box);
    if (view) return view;
  }
  return null;
}

export function isPartyFile(x: unknown): x is PartyFile {
  const f = x as PartyFile;
  return !!f && f.v === 1 && typeof f.salt === "string" && typeof f.iter === "number" && !!f.admin && Array.isArray(f.entries);
}

export function fileToBase64Utf8(text: string): string {
  return toB64(enc.encode(text));
}
export function base64Utf8ToText(b64: string): string {
  return dec.decode(fromB64(b64.replace(/\s/g, "")));
}

// Rascunho local (localStorage) chiffré avec le mot de passe de l'organisation.
export type Draft = { v: 1; iter: number; salt: string; updatedAt: number; box: Box };
export async function draftKey(password: string, salt?: string, iter = ITERATIONS) {
  const s = salt ?? toB64(random(16));
  return { key: await deriveKey(password, fromB64(s), iter, "admin"), salt: s, iter };
}
export async function sealDraft(k: { key: CryptoKey; salt: string; iter: number }, data: PartyData): Promise<Draft> {
  return { v: 1, iter: k.iter, salt: k.salt, updatedAt: data.updatedAt, box: await seal(k.key, data) };
}
export async function openDraft(key: CryptoKey, d: Draft): Promise<PartyData | null> {
  return open<PartyData>(key, d.box);
}
