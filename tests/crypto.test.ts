// npm test — vérifie que chaque joueur n'ouvre que sa fiche et que l'organisation retrouve tout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPartyFile, generateCode, normalizeCode, openAdmin, openPlayer, type PartyData } from "../src/crypto.ts";

const ITER = 1000; // rapide pour les tests
const data: PartyData = {
  updatedAt: 0,
  players: [
    { id: "p1", name: "Diogo", code: "K7M2QX", role: "assassino", occupation: "O amigo traído", secrets: "matou o Gabriel" },
    { id: "p2", name: "Rui", code: "ABCDEF", role: "cumplice" },
    { id: "p3", name: "Zé", code: "HJKMNP" },
  ],
};

test("cada código abre só o seu papel e dossiê", async () => {
  const file = await buildPartyFile(data, "palavra-passe-secreta", ITER);
  assert.equal(file.entries.length, 3);
  const diogo = await openPlayer(file, "k7m-2qx");
  assert.equal(diogo?.name, "Diogo");
  assert.equal(diogo?.role, "assassino");
  assert.equal(diogo?.occupation, "O amigo traído");
  assert.equal(diogo?.secrets, "matou o Gabriel");
  const rui = await openPlayer(file, "ABC DEF");
  assert.equal(rui?.role, "cumplice");
  assert.equal(rui?.story, "");
  const ze = await openPlayer(file, "HJKMNP");
  assert.equal(ze?.role, null);
  assert.equal(await openPlayer(file, "ZZZZZZ"), null);
  assert.equal(await openPlayer(file, ""), null);
});

test("festas antigas com personagens continuam a funcionar", async () => {
  const legacy: PartyData = { updatedAt: 0, characters: [{ id: "c1", name: "Helena", role: "testemunha", story: "vi tudo" }],
    players: [{ id: "p1", name: "Ana", code: "QWERTY", characterId: "c1" }] };
  const ana = await openPlayer(await buildPartyFile(legacy, "x".repeat(8), ITER), "QWERTY");
  assert.equal(ana?.role, "testemunha");
  assert.equal(ana?.story, "vi tudo");
});

test("organização com a palavra-passe certa", async () => {
  const file = await buildPartyFile(data, "palavra-passe-secreta", ITER);
  const admin = await openAdmin(file, "palavra-passe-secreta");
  assert.deepEqual(admin?.players, data.players);
  assert.equal(await openAdmin(file, "errada"), null);
  assert.equal(await openAdmin(file, "K7M2QX"), null);
});

test("o token da organização nunca aparece na ficha de um convidado", async () => {
  const withToken: PartyData = { ...data, gh: { owner: "o", repo: "r", branch: "main", token: "github_pat_SEGREDO" } };
  const file = await buildPartyFile(withToken, "palavra-passe-secreta", ITER);
  assert.ok(!JSON.stringify(file).includes("github_pat_SEGREDO"));
  const diogo = await openPlayer(file, "K7M2QX");
  assert.ok(!JSON.stringify(diogo).includes("github_pat"));
  assert.equal((await openAdmin(file, "palavra-passe-secreta"))?.gh?.token, "github_pat_SEGREDO");
});

test("nada legível no ficheiro publicado", async () => {
  const text = JSON.stringify(await buildPartyFile(data, "palavra-passe-secreta", ITER));
  for (const secret of ["Diogo", "Rui", "assassino", "cumplice", "K7M2QX", "matou", "traído"]) assert.ok(!text.includes(secret), secret);
});

test("códigos gerados: 6 caracteres, sem ambiguidades, únicos", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const c = generateCode(seen);
    assert.match(c, /^[A-HJKMNP-Z2-9]{6}$/);
    assert.ok(!seen.has(c));
    seen.add(c);
  }
  assert.equal(normalizeCode(" k7m-2qx "), "K7M2QX");
});
