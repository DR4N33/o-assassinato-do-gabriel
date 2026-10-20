// npm test — vérifie que chaque joueur n'ouvre que sa fiche et que l'organisation retrouve tout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPartyFile, generateCode, normalizeCode, openAdmin, openPlayer, type PartyData } from "../src/crypto.ts";

const ITER = 1000; // rapide pour les tests
const data: PartyData = {
  updatedAt: 0,
  characters: [
    { id: "c1", name: "Helena", occupation: "Herdeira", role: "assassino", story: "s1", secrets: "matou o Gabriel", alibi: "a1", information: "i1" },
    { id: "c2", name: "Tomás", occupation: "Mordomo", role: "suspeito", story: "s2", secrets: "x", alibi: "a2", information: "i2" },
  ],
  players: [
    { id: "p1", name: "Ana", code: "K7M2QX", characterId: "c1" },
    { id: "p2", name: "Rui", code: "ABCDEF", characterId: "c2" },
    { id: "p3", name: "Zé", code: "HJKMNP", characterId: null },
  ],
};

test("cada código abre só a sua ficha", async () => {
  const file = await buildPartyFile(data, "palavra-passe-secreta", ITER);
  assert.equal(file.entries.length, 3);
  const ana = await openPlayer(file, "k7m-2qx");
  assert.equal(ana?.name, "Ana");
  assert.equal(ana?.character?.name, "Helena");
  assert.equal(ana?.character?.role, "assassino");
  const rui = await openPlayer(file, "ABC DEF");
  assert.equal(rui?.character?.name, "Tomás");
  const ze = await openPlayer(file, "HJKMNP");
  assert.equal(ze?.name, "Zé");
  assert.equal(ze?.character, null);
  assert.equal(await openPlayer(file, "ZZZZZZ"), null);
  assert.equal(await openPlayer(file, ""), null);
});

test("organização com a palavra-passe certa", async () => {
  const file = await buildPartyFile(data, "palavra-passe-secreta", ITER);
  const admin = await openAdmin(file, "palavra-passe-secreta");
  assert.deepEqual(admin?.players, data.players);
  assert.equal(await openAdmin(file, "errada"), null);
  assert.equal(await openAdmin(file, "K7M2QX"), null);
});

test("nada legível no ficheiro publicado", async () => {
  const text = JSON.stringify(await buildPartyFile(data, "palavra-passe-secreta", ITER));
  for (const secret of ["Helena", "Ana", "assassino", "K7M2QX", "matou"]) assert.ok(!text.includes(secret), secret);
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
