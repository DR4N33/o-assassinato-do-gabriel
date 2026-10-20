// Servidor do "O Assassinato do Gabriel" para Docker — Node 22, sem dependências.
//  - Serve o site (dist/)
//  - Guarda a festa em DATA_DIR/party.json (volume Docker). O conteúdo continua cifrado pelo navegador.
//  - Leitura: GET /party.json (convidados) e GET /api/party (organização, com versão "sha")
//  - Escrita: PUT /api/party, só com a palavra-passe da organização (ADMIN_PASSWORD) e a versão lida antes
//    → se outra pessoa gravou entretanto, responde 409 e a app volta a ler e aplica a alteração por cima.
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { join, normalize, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || "/data";
const DIST = process.env.DIST_DIR || join(here, "..", "dist");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PARTY = join(DATA_DIR, "party.json");
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
const security = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

const sha = (text) => createHash("sha256").update(text).digest("hex");
const json = (res, status, body) => {
  res.writeHead(status, { ...security, "Content-Type": types[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

async function readParty() {
  try { return await readFile(PARTY, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

// Uma escrita de cada vez (fila simples) → o controlo de versão é fiável
let queue = Promise.resolve();
const exclusive = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

// Proteção contra tentativas de palavra-passe: 10 erros por IP em 15 min
const failures = new Map();
function blocked(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() - f.since > 15 * 60_000) { failures.delete(ip); return false; }
  return f.count >= 10;
}
function fail(ip) {
  const f = failures.get(ip) ?? { count: 0, since: Date.now() };
  f.count++; failures.set(ip, f);
}
function passwordOk(header) {
  const given = Buffer.from(String(header || "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(ADMIN_PASSWORD);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function validParty(f) {
  return f && f.v === 1 && typeof f.salt === "string" && typeof f.iter === "number" && f.admin && Array.isArray(f.entries);
}

async function api(req, res, path) {
  if (path === "/api/health") return json(res, 200, { ok: true, server: true });

  // Verificar a palavra-passe ao entrar nos bastidores (antes de existir festa)
  if (path === "/api/login" && req.method === "POST") {
    const ip = req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?";
    if (blocked(ip)) return json(res, 429, { error: "Demasiadas tentativas. Espera 15 minutos." });
    if (!passwordOk(req.headers.authorization)) { fail(ip); return json(res, 401, { error: "Palavra-passe incorreta." }); }
    failures.delete(ip);
    return json(res, 200, { ok: true });
  }

  if (path === "/api/party" && req.method === "GET") {
    const text = await readParty();
    if (text === null) return json(res, 404, { error: "Ainda não há festa." });
    return json(res, 200, { sha: sha(text), file: JSON.parse(text) });
  }

  if (path === "/api/party" && req.method === "PUT") {
    const ip = req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?";
    if (blocked(ip)) return json(res, 429, { error: "Demasiadas tentativas. Espera 15 minutos." });
    if (!passwordOk(req.headers.authorization)) { fail(ip); return json(res, 401, { error: "Palavra-passe diferente da configurada no servidor." }); }
    failures.delete(ip);
    let payload;
    try { payload = JSON.parse(await body(req)); } catch { return json(res, 400, { error: "Pedido inválido." }); }
    if (!validParty(payload?.file)) return json(res, 400, { error: "Ficheiro da festa inválido." });
    return exclusive(async () => {
      const current = await readParty();
      const currentSha = current === null ? null : sha(current);
      if ((payload.sha ?? null) !== currentSha) return json(res, 409, { error: "A festa mudou entretanto." });
      const text = JSON.stringify(payload.file);
      await mkdir(DATA_DIR, { recursive: true });
      const tmp = `${PARTY}.${process.pid}.tmp`;
      await writeFile(tmp, text);
      await rename(tmp, PARTY); // escrita atómica
      return json(res, 200, { sha: sha(text) });
    });
  }
  return json(res, 404, { error: "Não encontrado." });
}

async function serveStatic(req, res, path) {
  if (path === "/party.json") {
    const text = await readParty();
    if (text === null) return json(res, 404, {});
    res.writeHead(200, { ...security, "Content-Type": types[".json"], "Cache-Control": "no-store" });
    return res.end(text);
  }
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
