import { getDb } from "../../../db";
import { settings, players, characters, sessions } from "../../../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200, cookie?: string) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) },
});
async function context() {
  const db = getDb(), user = await getChatGPTUser();
  const config = await db.select().from(settings).where(eq(settings.id, "party")).get();
  const admin = !!(config && user && (user.userId === config.owner || (config.rosa && user.email.toLowerCase() === config.rosa)));
  return { db, user, config, admin };
}
const cookieToken = (r: Request) => r.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("mystery_session="))?.slice(16);
async function hash(s: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2,"0")).join("");
}
const text = (v: unknown, max = 6000) => typeof v === "string" ? v.trim().slice(0, max) : "";
function phone(v: unknown) {
  let n = text(v, 40).replace(/[^\d]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.length < 8 || n.length > 15) throw new Error("Introduz um número válido, com indicativo do país.");
  return "+" + n;
}
export async function GET(request: Request) {
  try {
    const { db, user, config, admin } = await context();
    if (new URL(request.url).searchParams.get("mode") === "admin") {
      if (!config && user) return json({ setup: true });
      if (!admin) return json({ error: user ? "Esta conta não pertence à organização." : "Inicia sessão para entrar na organização.", signIn: !user }, 403);
      return json({ players: await db.select().from(players), characters: await db.select().from(characters), rosa: config!.rosa, isOwner: user!.userId === config!.owner });
    }
    const raw = cookieToken(request);
    if (!raw) return json({ player: null });
    const session = await db.select().from(sessions).where(and(eq(sessions.token, await hash(raw)), gt(sessions.expires, Date.now()))).get();
    if (!session) return json({ player: null });
    const player = await db.select().from(players).where(eq(players.id, session.playerId)).get();
    if (!player) return json({ player: null });
    const character = player.characterId ? await db.select().from(characters).where(eq(characters.id, player.characterId)).get() : null;
    return json({ player: { name: player.name }, character });
  } catch { return json({ error: "Não foi possível carregar os dados. Tenta novamente." }, 500); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Pedido não autorizado." }, 403);
  try {
    const b = await request.json() as Record<string, unknown>;
    const { db, user, config, admin } = await context();
    if (b.action === "login") {
      const player = await db.select().from(players).where(eq(players.phone, phone(b.phone))).get();
      if (!player) return json({ error: "Este número não está na lista. Confirma o indicativo ou fala com a organização." }, 404);
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db.insert(sessions).values({ token: await hash(token), playerId: player.id, expires: Date.now() + 86400000 });
      await db.update(players).set({ lastSeen: Date.now() }).where(eq(players.id, player.id));
      return json({ ok: true }, 200, `mystery_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
    }
    if (b.action === "logout") {
      const token = cookieToken(request);
      if (token) await db.delete(sessions).where(eq(sessions.token, await hash(token)));
      return json({ ok: true }, 200, "mystery_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    }
    if (b.action === "setup") {
      if (!user || config) return json({ error: "Configuração indisponível." }, 403);
      await db.insert(settings).values({ id: "party", owner: user.userId, rosa: "" });
      return json({ ok: true });
    }
    if (!admin) return json({ error: "Só a organização pode fazer esta alteração." }, 403);
    if (b.action === "savePlayer") {
      const name = text(b.name, 100);
      if (!name) throw new Error("Indica o nome do jogador.");
      const characterId = text(b.characterId, 100) || null;
      if (characterId && !await db.select().from(characters).where(eq(characters.id, characterId)).get()) throw new Error("Escolhe uma personagem existente.");
      const id = text(b.id, 100), values = { name, phone: phone(b.phone), characterId };
      if (id) {
        const old = await db.select().from(players).where(eq(players.id, id)).get();
        if (!old) return json({ error: "Jogador não encontrado." }, 404);
        if (old.phone !== values.phone) await db.delete(sessions).where(eq(sessions.playerId, id));
        await db.update(players).set(values).where(eq(players.id, id));
      } else await db.insert(players).values({ id: crypto.randomUUID(), ...values });
    } else if (b.action === "saveCharacter") {
      const name = text(b.name, 100), role = text(b.role, 30);
      if (!name) throw new Error("Dá um nome à personagem.");
      if (!["suspeito", "assassino", "vitima"].includes(role)) throw new Error("Escolhe um papel válido.");
      const values = { name, role, occupation: text(b.occupation, 100), story: text(b.story), secrets: text(b.secrets), alibi: text(b.alibi), information: text(b.information) };
      const id = text(b.id, 100);
      if (id) await db.update(characters).set(values).where(eq(characters.id, id));
      else await db.insert(characters).values({ id: crypto.randomUUID(), ...values });
    } else if (b.action === "deletePlayer") await db.delete(players).where(eq(players.id, text(b.id, 100)));
    else if (b.action === "deleteCharacter") await db.delete(characters).where(eq(characters.id, text(b.id, 100)));
    else if (b.action === "settings") {
      if (user!.userId !== config!.owner) return json({ error: "Só o criador pode alterar o acesso da organização." }, 403);
      const rosa = text(b.rosa, 254).toLowerCase();
      if (rosa && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rosa)) throw new Error("Introduz um email válido para a Rosa.");
      await db.update(settings).set({ rosa }).where(eq(settings.id, "party"));
    } else return json({ error: "Ação desconhecida." }, 400);
    return json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/unique|constraint/i.test(message + String((e as Error)?.cause))) return json({ error: "Esse número ou personagem já está atribuído a outro jogador." }, 409);
    if (/^(Introduz|Indica|Escolhe|Dá um)/.test(message)) return json({ error: message }, 400);
    return json({ error: "Não foi possível guardar. Tenta novamente." }, 500);
  }
}
