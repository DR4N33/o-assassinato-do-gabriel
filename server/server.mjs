// Servidor do "O Assassinato do Gabriel" para Docker — Node 22, sem dependências.
//  - Serve o site (dist/)
//  - Guarda a festa em DATA_DIR/party.json (volume Docker). O conteúdo continua cifrado pelo navegador.
//  - Organização (ADMIN_PASSWORD): GET/PUT /api/party com controlo de versão (409 se outra pessoa gravou entretanto)
//  - Convidados:
//      1) POST /api/guest/code   {code}       → 1.ª entrada com o código de 6 caracteres (verificado no servidor)
//      2) POST /api/guest/setpin {code, pin}  → cria o PIN de 4 dígitos (único); o código deixa de servir
//      3) POST /api/guest/pin    {pin}        → entradas seguintes só com o PIN
//    Tentativas limitadas por IP. O reset (organização) apaga o PIN e o código de origem volta a funcionar.
import { createServer } from "node:http";
import { createHash, timingSafeEqual, randomBytes, scrypt as scryptCb, createCipheriv, createDecipheriv, webcrypto } from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scrypt = promisify(scryptCb);
const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || "/data";
const DIST = process.env.DIST_DIR || join(here, "..", "dist");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PARTY = join(DATA_DIR, "party.json");
const PINS = join(DATA_DIR, "pins.json");
const SECRET = join(DATA_DIR, "secret.key");
const MAX_BODY = 5 * 1024 * 1024;

if (ADMIN_PASSWORD.length < 8) {
  console.error("ERRO: define ADMIN_PASSWORD (mínimo 8 caracteres) no ficheiro .env.");
  process.exit(1);
}

const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};
const security = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" };

const sha = (text) => createHash("sha256").update(text).digest("hex");
const json = (res, status, body) => {
  res.writeHead(status, { ...security, "Content-Type": types[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};
const ipOf = (req) => String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?");

async function readText(path) {
  try { return await readFile(path, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}
async function writeAtomic(path, text) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, text, { mode: 0o600 });
  await rename(tmp, path);
}
const readParty = () => readText(PARTY);

// Uma escrita de cada vez (fila simples)
let queue = Promise.resolve();
const exclusive = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

// ---------- Limite de tentativas por IP ----------
// Nota: na festa, todos os convidados no mesmo Wi-Fi partilham o mesmo IP → limites razoáveis, janela curta.
const WINDOW = 10 * 60_000;
const buckets = { admin: [10, new Map()], code: [12, new Map()], pin: [10, new Map()] };
function blocked(kind, ip) {
  const [max, map] = buckets[kind]; const f = map.get(ip);
  if (!f) return false;
  if (Date.now() - f.since > WINDOW) { map.delete(ip); return false; }
  return f.count >= max;
}
function fail(kind, ip) {
  const map = buckets[kind][1]; const f = map.get(ip) ?? { count: 0, since: Date.now() };
  f.count++; map.set(ip, f);
}
const clear = (kind, ip) => buckets[kind][1].delete(ip);

function passwordOk(header) {
  const given = Buffer.from(String(header || "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(ADMIN_PASSWORD);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
function adminGuard(req, res) {
  const ip = ipOf(req);
  if (blocked("admin", ip)) { json(res, 429, { error: "too_many" }); return false; }
  if (!passwordOk(req.headers.authorization)) { fail("admin", ip); json(res, 401, { error: "Palavra-passe incorreta." }); return false; }
  clear("admin", ip); return true;
}

function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function jsonBody(req) { try { return JSON.parse(await body(req)); } catch { return null; } }

function validParty(f) {
  return f && f.v === 1 && typeof f.salt === "string" && typeof f.iter === "number" && f.admin && Array.isArray(f.entries);
}

// ---------- Códigos dos convidados (mesma cifra que o navegador: src/crypto.ts) ----------
const normalizeCode = (raw) => String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function codeOpensEntry(file, code) {
  const c = normalizeCode(code);
  if (c.length < 4 || c.length > 32) return false;
  const subtle = webcrypto.subtle, enc = new TextEncoder();
  const base = await subtle.importKey("raw", enc.encode(c), "PBKDF2", false, ["deriveKey"]);
  const salt = new Uint8Array([...Buffer.from(file.salt, "base64"), ...enc.encode("player")]);
  const key = await subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: file.iter }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  for (const box of file.entries) {
    try { await subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(box.iv, "base64") }, key, Buffer.from(box.ct, "base64")); return true; } catch { /* entrada de outro jogador */ }
  }
  return false;
}

// ---------- PINs: DATA_DIR/pins.json ----------
// { [hash do código]: { salt, hash (scrypt do PIN), code (código de origem cifrado com secret.key), at } }
let secretKey = null;
async function getSecret() {
  if (secretKey) return secretKey;
  const existing = await readText(SECRET);
  if (existing) secretKey = Buffer.from(existing.trim(), "base64");
  else { secretKey = randomBytes(32); await writeAtomic(SECRET, secretKey.toString("base64")); }
  return secretKey;
}
async function codeId(code) { return createHash("sha256").update(await getSecret()).update(normalizeCode(code)).digest("hex"); }
async function seal(text) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", await getSecret(), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
async function unseal(b64) {
  const buf = Buffer.from(b64, "base64"), d = createDecipheriv("aes-256-gcm", await getSecret(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}
async function readPins() { const t = await readText(PINS); return t ? JSON.parse(t) : {}; }
const pinHash = async (pin, salt) => (await scrypt(pin, Buffer.from(salt, "base64"), 32)).toString("base64");
async function findPin(pins, pin) {
  for (const [id, rec] of Object.entries(pins)) {
    const h = Buffer.from(await pinHash(pin, rec.salt), "base64");
    if (timingSafeEqual(h, Buffer.from(rec.hash, "base64"))) return [id, rec];
  }
  return null;
}
const validPin = (p) => typeof p === "string" && /^\d{4}$/.test(p);

async function guestApi(req, res, path) {
  const ip = ipOf(req);
  const b = await jsonBody(req);
  if (!b) return json(res, 400, { error: "bad_request" });
  const text = await readParty();
  if (text === null) return json(res, 404, { error: "not_published" });
  const file = JSON.parse(text);

  if (path === "/api/guest/code" || path === "/api/guest/setpin") {
    if (blocked("code", ip)) return json(res, 429, { error: "too_many" });
    if (!(await codeOpensEntry(file, b.code))) { fail("code", ip); return json(res, 401, { error: "code_bad" }); }
    const id = await codeId(b.code);
    const pins = await readPins();
    if (pins[id]) return json(res, 409, { error: "code_replaced" });
    if (path === "/api/guest/code") { clear("code", ip); return json(res, 200, { file }); }
    if (!validPin(b.pin)) return json(res, 400, { error: "pin_format" });
    return exclusive(async () => {
      const all = await readPins();
      if (all[id]) return json(res, 409, { error: "code_replaced" });
      if (await findPin(all, b.pin)) return json(res, 409, { error: "pin_taken" });
      const salt = randomBytes(16).toString("base64");
      all[id] = { salt, hash: await pinHash(b.pin, salt), code: await seal(normalizeCode(b.code)), at: Date.now() };
      await writeAtomic(PINS, JSON.stringify(all));
      clear("code", ip);
      return json(res, 200, { ok: true });
    });
  }

  if (path === "/api/guest/pin") {
    if (blocked("pin", ip)) return json(res, 429, { error: "too_many" });
    if (!validPin(b.pin)) return json(res, 400, { error: "pin_format" });
    const hit = await findPin(await readPins(), b.pin);
    if (!hit) { fail("pin", ip); return json(res, 401, { error: "pin_bad" }); }
    clear("pin", ip);
    return json(res, 200, { code: await unseal(hit[1].code), file });
  }
  return json(res, 404, { error: "not_found" });
}

async function api(req, res, path) {
  if (path === "/api/health") return json(res, 200, { ok: true, server: true, pins: true });
  if (path === "/api/status") return json(res, 200, { exists: (await readParty()) !== null });
  if (path.startsWith("/api/guest/") && req.method === "POST") return guestApi(req, res, path);

  if (path === "/api/login" && req.method === "POST") {
    if (!adminGuard(req, res)) return;
    return json(res, 200, { ok: true });
  }

  if (path === "/api/party" && req.method === "GET") {
    if (!adminGuard(req, res)) return;
    const text = await readParty();
    if (text === null) return json(res, 404, { error: "Ainda não há festa." });
    return json(res, 200, { sha: sha(text), file: JSON.parse(text) });
  }

  if (path === "/api/party" && req.method === "PUT") {
    if (!adminGuard(req, res)) return;
    const payload = await jsonBody(req);
    if (!validParty(payload?.file)) return json(res, 400, { error: "Ficheiro da festa inválido." });
    return exclusive(async () => {
      const current = await readParty();
      const currentSha = current === null ? null : sha(current);
      if ((payload.sha ?? null) !== currentSha) return json(res, 409, { error: "A festa mudou entretanto." });
      const text = JSON.stringify(payload.file);
      await writeAtomic(PARTY, text);
      return json(res, 200, { sha: sha(text) });
    });
  }

  // Organização: que jogadores já criaram PIN / reset do PIN (o código de origem volta a funcionar)
  if (path === "/api/admin/pins" && req.method === "POST") {
    if (!adminGuard(req, res)) return;
    const b = await jsonBody(req);
    const codes = Array.isArray(b?.codes) ? b.codes.slice(0, 500) : [];
    const pins = await readPins();
    const withPin = [];
    for (const c of codes) if (pins[await codeId(c)]) withPin.push(normalizeCode(c));
    return json(res, 200, { withPin });
  }
  if (path === "/api/admin/pins/reset" && req.method === "POST") {
    if (!adminGuard(req, res)) return;
    const b = await jsonBody(req);
    if (!b?.code) return json(res, 400, { error: "bad_request" });
    const id = await codeId(b.code);
    return exclusive(async () => {
      const pins = await readPins();
      const existed = !!pins[id];
      delete pins[id];
      await writeAtomic(PINS, JSON.stringify(pins));
      return json(res, 200, { ok: true, existed });
    });
  }
  return json(res, 404, { error: "Não encontrado." });
}

async function serveStatic(req, res, path) {
  // Em modo servidor, o ficheiro da festa não é público: os convidados entram pela API (código / PIN)
  if (path === "/party.json") return json(res, 404, {});
  let file = normalize(join(DIST, decodeURIComponent(path)));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); }
  catch { file = join(DIST, "index.html"); } // qualquer outro caminho → a app
  const ext = extname(file);
  const data = await readFile(file);
  res.writeHead(200, {
    ...security, "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": file.includes(`${join(DIST, "assets")}`) ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(req.method === "HEAD" ? undefined : data);
}

createServer(async (req, res) => {
  try {
    const path = new URL(req.url || "/", "http://x").pathname;
    if (path.startsWith("/api/")) return await api(req, res, path);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    return await serveStatic(req, res, path);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: "Erro no servidor." });
    else res.end();
  }
}).listen(PORT, () => console.log(`O Assassinato do Gabriel → http://0.0.0.0:${PORT} (dados em ${DATA_DIR})`));
