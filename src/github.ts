// Publication de public/party.json dans le dépôt via l'API GitHub (contents API).
// Le push déclenche le workflow GitHub Pages, qui remet le site à jour en ~1 minute.
import { fileToBase64Utf8, type PartyFile } from "./crypto";

export type GitHubTarget = { owner: string; repo: string; branch: string; token: string };
export const PARTY_PATH = "public/party.json";

// Valeurs par défaut devinées depuis l'adresse GitHub Pages (https://<owner>.github.io/<repo>/)
export function guessTarget(): Omit<GitHubTarget, "token"> {
  const { hostname, pathname } = window.location;
  const owner = hostname.endsWith(".github.io") ? hostname.split(".")[0] : "DR4N33";
  const repo = hostname.endsWith(".github.io") ? (pathname.split("/").filter(Boolean)[0] ?? "") : "o-assassinato-do-gabriel";
  return { owner, repo: repo || "o-assassinato-do-gabriel", branch: "main" };
}

async function gh(t: GitHubTarget, init: RequestInit = {}) {
  const url = `https://api.github.com/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/contents/${PARTY_PATH}`;
  return fetch(init.method === "PUT" ? url : `${url}?ref=${encodeURIComponent(t.branch)}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${t.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

function explain(status: number): string {
  if (status === 401) return "Token GitHub inválido ou expirado.";
  if (status === 403) return "O token não tem permissão de escrita (Contents: Read and write) neste repositório.";
  if (status === 404) return "Repositório ou ramo não encontrado. Verifica o dono, o nome e o ramo.";
  if (status === 409 || status === 422) return "O ficheiro mudou entretanto no GitHub. Tenta publicar outra vez.";
  return `O GitHub respondeu com o erro ${status}.`;
}

export async function publishToGitHub(t: GitHubTarget, file: PartyFile): Promise<void> {
  const current = await gh(t);
  let sha: string | undefined;
  if (current.ok) sha = ((await current.json()) as { sha: string }).sha;
  else if (current.status !== 404) throw new Error(explain(current.status));

  const res = await gh(t, {
    method: "PUT",
    body: JSON.stringify({
      message: `Atualizar a festa (${new Date().toLocaleString("pt-PT")})`,
      content: fileToBase64Utf8(JSON.stringify(file)),
      branch: t.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(explain(res.status));
}
