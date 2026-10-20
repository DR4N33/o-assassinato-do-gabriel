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
