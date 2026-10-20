// Ligação ao repositório através da API GitHub (contents API) — é a "base de dados" da organização.
// Ler: vai buscar o party.json mais recente diretamente ao repositório (sem esperar pelo Pages).
// Escrever: grava com o "sha" lido antes; se alguém gravou entretanto, o GitHub recusa (409) e a app tenta outra vez.
// Cada gravação dispara o workflow do Pages, que atualiza o site dos convidados em ~1–2 minutos.
import { base64Utf8ToText, fileToBase64Utf8, isPartyFile, type PartyFile } from "./crypto";

export type GitHubTarget = { owner: string; repo: string; branch: string; token: string };
export type Remote = { file: PartyFile; sha: string };
export const PARTY_PATH = "public/party.json";

export class ConflictError extends Error {
  constructor() { super("O ficheiro mudou entretanto no GitHub."); }
}

// Valores por defeito deduzidos do endereço do Pages (https://<owner>.github.io/<repo>/)
export function guessTarget(): Omit<GitHubTarget, "token"> {
  const { hostname, pathname } = window.location;
  const onPages = hostname.endsWith(".github.io");
  const owner = onPages ? hostname.split(".")[0] : "DR4N33";
  const repo = onPages ? (pathname.split("/").filter(Boolean)[0] ?? "") : "";
  return { owner, repo: repo || "o-assassinato-do-gabriel", branch: "main" };
}

function url(t: GitHubTarget) {
  return `https://api.github.com/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/contents/${PARTY_PATH}`;
}
const headers = (t: GitHubTarget) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${t.token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

function explain(status: number): string {
  if (status === 401) return "Token GitHub inválido ou expirado. Atualiza-o em Publicação.";
  if (status === 403) return "O token não tem permissão de escrita (Contents: Read and write) neste repositório.";
  if (status === 404) return "Repositório ou ramo não encontrado. Verifica o dono, o nome e o ramo em Publicação.";
  return `O GitHub respondeu com o erro ${status}. Tenta outra vez.`;
}

// null = ainda não existe party.json no repositório
export async function fetchRemote(t: GitHubTarget): Promise<Remote | null> {
  const res = await fetch(`${url(t)}?ref=${encodeURIComponent(t.branch)}&t=${Date.now()}`, { headers: headers(t), cache: "no-store" });
  if (res.status === 404) {
    // Distinguir "ficheiro ainda não existe" de "repositório errado"
    const repo = await fetch(`https://api.github.com/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}`, { headers: headers(t), cache: "no-store" });
    if (repo.ok) return null;
    throw new Error(explain(repo.status));
  }
  if (!res.ok) throw new Error(explain(res.status));
  const body = await res.json() as { sha: string; content?: string; encoding?: string; download_url?: string };
  let text = body.content && body.encoding === "base64" ? base64Utf8ToText(body.content) : "";
  if (!text && body.download_url) text = await (await fetch(body.download_url, { cache: "no-store" })).text(); // ficheiros > 1 MB
  const file: unknown = JSON.parse(text);
  if (!isPartyFile(file)) throw new Error("O party.json no GitHub não é válido.");
  return { file, sha: body.sha };
}

// Devolve o novo sha. Lança ConflictError se o ficheiro mudou desde a leitura.
export async function writeRemote(t: GitHubTarget, file: PartyFile, sha: string | null, message: string): Promise<string> {
  const res = await fetch(url(t), {
    method: "PUT",
    headers: { ...headers(t), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: fileToBase64Utf8(JSON.stringify(file)), branch: t.branch, ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409 || res.status === 422) throw new ConflictError();
  if (!res.ok) throw new Error(explain(res.status));
  return ((await res.json()) as { content: { sha: string } }).content.sha;
}

// ---------- Modo servidor (Docker) ----------
// Mesma lógica (ler versão → aplicar → gravar com a versão), mas contra o próprio servidor.
// A escrita é autorizada pela palavra-passe da organização; não é preciso token.
export type Store = {
  fetch(): Promise<Remote | null>;
  write(file: PartyFile, sha: string | null, message: string): Promise<string>;
};

export async function detectServer(): Promise<boolean> {
  try {
    const res = await fetch(`./api/health?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return false;
    return ((await res.json()) as { server?: boolean }).server === true;
  } catch { return false; }
}

export async function serverLogin(password: string): Promise<void> {
  const res = await fetch("./api/login", { method: "POST", headers: { Authorization: `Bearer ${password}` } });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Palavra-passe incorreta.");
}

export function serverStore(password: () => string): Store {
  return {
    async fetch() {
      const res = await fetch(`./api/party?t=${Date.now()}`, { cache: "no-store" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("O servidor não respondeu. Tenta outra vez.");
      const body = await res.json() as { sha: string; file: unknown };
      if (!isPartyFile(body.file)) throw new Error("A festa guardada no servidor não é válida.");
      return { file: body.file, sha: body.sha };
    },
    async write(file, sha) {
      const res = await fetch("./api/party", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${password()}` },
        body: JSON.stringify({ file, sha }),
      });
      if (res.status === 409) throw new ConflictError();
      const body = await res.json().catch(() => ({})) as { sha?: string; error?: string };
      if (!res.ok || !body.sha) throw new Error(body.error || `O servidor respondeu com o erro ${res.status}.`);
      return body.sha;
    },
  };
}

export function githubStore(t: GitHubTarget): Store {
  return { fetch: () => fetchRemote(t), write: (file, sha, message) => writeRemote(t, file, sha, message) };
}
