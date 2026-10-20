import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Fingerprint, ArrowRight, Plus, Users, VenetianMask, Settings, Search, X, LockKeyhole, LogOut, Eye, Pencil,
  Trash2, Check, Share2, RefreshCw, ShieldCheck, BookOpen, KeyRound, Clock3, FileQuestion, Copy, UploadCloud,
  Download, Upload, Github, Dices, ChevronDown, QrCode, Printer, CloudOff, Cloud,
} from "lucide-react";
import {
  buildPartyFile, draftKey, generateCode, isPartyFile, normalizeCode, openAdmin, openDraft, openPlayer, resolvePlayer, sealDraft,
  CODE_LENGTH, ITERATIONS, type Draft, type PartyData, type PartyFile, type Player, type PlayerView, type Role,
} from "./crypto";
import { ConflictError, detectServer, githubStore, guessTarget, serverLogin, serverStore, type GitHubTarget, type Store } from "./github";
import { Emblem, Logo, LogoText } from "./Logo";

const roles: Record<Role, string> = { assassino: "Assassino", cumplice: "Cúmplice", testemunha: "Testemunha", suspeito: "Suspeito", vitima: "Vítima" };
// Mensagem mostrada ao jogador por baixo do papel
const roleMessages: Record<Role, string> = {
  assassino: "Foste tu. Guarda este segredo e cabe-te escapar às suspeitas até ao fim da noite.",
  cumplice: "Sabes a verdade. Protege o assassino sem te denunciares.",
  testemunha: "Viste algo importante. Decide bem a quem o contas, e quando.",
  suspeito: "Estás inocente, mas toda a gente tem algo a esconder. Descobre quem está a mentir.",
  vitima: "O teu papel é especial. Segue as instruções do teu dossiê.",
};
const darkRoles: Role[] = ["assassino", "cumplice"];
// Secções do dossiê (na primeira pessoa). As vazias não aparecem ao jogador.
const sections = [
  { key: "story", title: "A minha história", label: "A minha história" },
  { key: "secrets", title: "O meu segredo", label: "O meu segredo" },
  { key: "alibi", title: "O meu álibi", label: "O meu álibi" },
  { key: "information", title: "O que sei", label: "O que sei" },
  { key: "objective", title: "O meu objetivo", label: "O meu objetivo (opcional)" },
] as const;
const sectionIcons = { story: BookOpen, secrets: LockKeyhole, alibi: Clock3, information: FileQuestion, objective: KeyRound };
const hasDossier = (p: Partial<Record<string, unknown>>) => sections.some((s) => String(p[s.key] || "").trim());
// Festas criadas com o antigo separador "Personagens": os textos passam para o próprio jogador
function migrate(d: PartyData): PartyData {
  if (!d.characters?.length) return { players: d.players, updatedAt: d.updatedAt };
  return { updatedAt: d.updatedAt, players: d.players.map((p) => { const r = resolvePlayer(p, d.characters); return { id: p.id, code: p.code, ...r }; }) };
}
const KEY_CODE = "mystery_code", KEY_DRAFT = "mystery_draft", KEY_GITHUB = "mystery_github";

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};
const uid = () => globalThis.crypto.randomUUID();
const siteUrl = () => window.location.origin + window.location.pathname;
const formatCode = (c: string) => c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;

async function fetchParty(): Promise<PartyFile | null> {
  const res = await fetch(`./party.json?t=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Não foi possível carregar o jogo. Tenta novamente.");
  const data: unknown = await res.json().catch(() => null);
  return isPartyFile(data) ? data : null;
}
function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function RoleBanner({ role }: { role: Role }) {
  return <div className={`role-banner ${darkRoles.includes(role) ? "red" : ""}`}><span>O TEU PAPEL</span><strong>{roles[role] ?? role}</strong><p>{roleMessages[role] ?? ""}</p></div>;
}
function Brand() { return <a href="./" className="brand brand-logo" aria-label="O Assassinato do Gabriel"><Emblem size={36}/><LogoText/></a>; }

export default function Game() {
  const [mode, setMode] = useState<"player" | "admin">("player"), [tab, setTab] = useState("players");
  const [party, setParty] = useState<PartyFile | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  // joueur
  const [view, setView] = useState<PlayerView | null>(null), [code, setCode] = useState(""), [hidden, setHidden] = useState(false);
  // organisation
  const [data, setData] = useState<PartyData | null>(null), [dirty, setDirty] = useState(false);
  const [password, setPassword] = useState(""), [password2, setPassword2] = useState(""), [hasDraft, setHasDraft] = useState(false);
  const pw = useRef(""), dkey = useRef<Awaited<ReturnType<typeof draftKey>> | null>(null);
  const [gh, setGh] = useState<GitHubTarget>(() => ({ ...guessTarget(), token: "" }));
  const [search, setSearch] = useState(""), [modal, setModal] = useState<"player" | "qr" | null>(null), [showDossier, setShowDossier] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({}), [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [newPw, setNewPw] = useState("");
  // online = token GitHub configurado: cada Guardar grava logo no repositório
  const [online, setOnline] = useState(false), remoteSha = useRef<string | null>(null);
  // server = a app corre no Docker: grava no próprio servidor, sem token GitHub
  const [server, setServer] = useState(false);
  const storeFor = (srv = server, target = gh): Store => srv ? serverStore(() => pw.current) : githubStore(target);

  // linkCode : code reçu via le lien d'invitation (?codigo=…) ; sinon on reprend celui mémorisé sur l'appareil.
  async function loadPlayer(linkCode?: string) {
    setLoading(true); setError("");
    const c = linkCode || store.get(KEY_CODE) || "";
    try {
      const file = await fetchParty(); setParty(file);
      if (c && file) {
        const v = await openPlayer(file, c);
        if (v) { setView(v); setCode(""); store.set(KEY_CODE, normalizeCode(c)); }
        else {
          setView(null); store.del(KEY_CODE);
          if (linkCode) throw new Error("Código desconhecido. Confirma as letras e os números ou fala com a organização.");
        }
      }
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  async function loadAdmin(srv = server) {
    setLoading(true); setError("");
    try {
      if (srv) { setParty((await storeFor(true).fetch())?.file ?? null); return; }
      // Com GitHub ligado neste aparelho, a versão do repositório é a mais recente (o Pages demora 1–2 min)
      let saved: GitHubTarget | null = null;
      try { saved = JSON.parse(store.get(KEY_GITHUB) || "null"); } catch { /* ignorado */ }
      const remote = saved?.token ? await githubStore({ ...guessTarget(), ...saved }).fetch().catch(() => null) : null;
      setParty(remote?.file ?? await fetchParty());
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); setHasDraft(!!store.get(KEY_DRAFT)); }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode") === "admin" ? "admin" : "player";
    setMode(m);
    try { const saved = JSON.parse(store.get(KEY_GITHUB) || "null"); if (saved) setGh((g) => ({ ...g, ...saved })); } catch { /* ignoré */ }
    const fromLink = params.get("codigo");
    if (fromLink) { window.history.replaceState(null, "", window.location.pathname); setCode(fromLink); }
    void (async () => {
      const srv = await detectServer(); setServer(srv);
      if (m === "admin") await loadAdmin(srv); else await loadPlayer(fromLink || undefined);
    })();
  }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(t); }, [notice]);
  // Sauvegarde locale chiffrée de chaque modification
  useEffect(() => {
    if (!data || !dirty || !dkey.current) return;
    const k = dkey.current;
    const t = setTimeout(() => { void sealDraft(k, data).then((d) => store.set(KEY_DRAFT, JSON.stringify(d))); }, 400);
    return () => clearTimeout(t);
  }, [data, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // Sincronização: a cada 20 s e quando a janela volta a estar ativa
  useEffect(() => {
    if (!online || !data || modal || confirm || busy || dirty) return;
    const tick = () => { void refresh(); };
    const t = setInterval(tick, 20000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(t); window.removeEventListener("focus", tick); };
  }, [online, data, modal, confirm, busy, dirty]);
  // Accessibilité des fenêtres modales (focus piégé, Échap)
  useEffect(() => {
    if (!modal && !confirm) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]") || []);
    controls()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { setModal(null); setConfirm(null); }
      if (e.key !== "Tab") return;
      const all = controls(), first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [modal, confirm, busy]);

  function switchMode(m: "player" | "admin") {
    if (mode === "admin" && dirty && !window.confirm("Há alterações por publicar. Ficam guardadas neste aparelho. Continuar?")) return;
    setMode(m); setError(""); setNotice("");
    window.history.replaceState(null, "", m === "admin" ? "?mode=admin" : window.location.pathname);
    if (m === "admin") void loadAdmin(); else void loadPlayer();
  }

  // ---------- Joueur ----------
  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const file = party ?? await fetchParty(); setParty(file);
      const unknown = "Código desconhecido. Confirma as letras e os números ou fala com a organização.";
      // 1) código de convidado
      const v = file ? await openPlayer(file, code) : null;
      if (v) { store.set(KEY_CODE, normalizeCode(code)); setView(v); setCode(""); return; }
      // 2) código da organização (André & Rosa) → bastidores
      const secret = code.trim();
      if (secret.length >= 8) {
        try { await openOrg(secret, null, server); }
        catch { throw new Error(unknown); }
        setCode(""); setTab("players"); setMode("admin");
        window.history.replaceState(null, "", "?mode=admin");
        return;
      }
      throw new Error(file ? unknown : "A festa ainda não foi publicada. Volta a tentar mais tarde.");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  function logout() { store.del(KEY_CODE); setView(null); setHidden(false); }

  // ---------- Organisation ----------
  async function unlock(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await openOrg(password, password2, true); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  // Abre os bastidores com a palavra-passe da organização (usado no ecrã da Organização e no campo de entrada)
  async function openOrg(password: string, password2: string | null, allowCreate: boolean) {
    {
      const creating = allowCreate && !party && !hasDraft;
      if (creating && !server) {
        if (password.length < 8) throw new Error("Escolhe uma palavra-passe com pelo menos 8 caracteres.");
        if (password !== password2) throw new Error("As duas palavras-passe não coincidem.");
      }
      let source = party, connected = false;
      if (server) {
        const remote = await storeFor().fetch();
        if (!remote) await serverLogin(password);
        source = remote?.file ?? null; remoteSha.current = remote?.sha ?? null; connected = true; setParty(source);
      } else if (gh.token) {
        try {
          const remote = await githubStore(gh).fetch();
          source = remote?.file ?? null; remoteSha.current = remote?.sha ?? null; connected = true; setParty(source);
        } catch (err) { setNotice(`Sem ligação ao GitHub: ${(err as Error).message}`); }
      }
      const published = source ? await openAdmin(source, password) : null;
      if (source && !published && connected) throw new Error("Palavra-passe incorreta.");
      let local: PartyData | null = null;
      const rawDraft = store.get(KEY_DRAFT);
      const savedDraft: Draft | null = rawDraft ? JSON.parse(rawDraft) : null;
      if (savedDraft) {
        const k = await draftKey(password, savedDraft.salt, savedDraft.iter);
        local = await openDraft(k.key, savedDraft);
        if (local) dkey.current = k;
      }
      if (!creating && !published && !local) throw new Error("Palavra-passe incorreta.");
      if (!dkey.current) dkey.current = await draftKey(password);
      const newer = local && (!published || local.updatedAt > published.updatedAt);
      const base = newer ? local : published;
      setData(base ? migrate(base) : { players: [], updatedAt: Date.now() });
      setDirty(!!newer || (creating && !connected));
      setOnline(connected);
      pw.current = password; setPassword(""); setPassword2("");
      if (newer && published) setNotice("Recuperámos alterações guardadas neste aparelho que ainda não foram publicadas.");
    }
  }
  // Só possível enquanto nada foi publicado: apaga o rascunho deste aparelho e volta ao ecrã "Criar a festa"
  function resetLocal() {
    if (!window.confirm("Apagar a festa guardada neste aparelho e recomeçar? (Nada foi publicado ainda.)")) return;
    store.del(KEY_DRAFT); setHasDraft(false); setError(""); setPassword(""); setPassword2("");
  }
  function lock() {
    if (dirty && !window.confirm("Há alterações por publicar. Ficam guardadas neste aparelho. Sair mesmo assim?")) return;
    setData(null); pw.current = ""; dkey.current = null; setDirty(false); setOnline(false); setHasDraft(!!store.get(KEY_DRAFT));
  }
  function change(next: Omit<PartyData, "updatedAt">) { setData({ ...next, updatedAt: Date.now() }); setDirty(true); }

  // Aplica uma alteração. Com GitHub ligado: lê a versão mais recente, aplica a alteração por cima
  // (assim não se apagam as alterações da outra pessoa), cifra e grava. Sem GitHub: fica neste aparelho.
  async function commit(op: (d: PartyData) => PartyData, message: string, newPassword?: string): Promise<boolean> {
    if (!data) return false;
    if (!online) { change(op(data)); return true; }
    setBusy(true); setError("");
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const st = storeFor();
        const remote = await st.fetch();
        const base = remote ? await openAdmin(remote.file, pw.current) : { players: [], updatedAt: 0 };
        if (!base) throw new Error("A palavra-passe da festa foi alterada noutro aparelho. Fecha os bastidores e volta a entrar.");
        const next: PartyData = { ...op(migrate(base)), updatedAt: Date.now() };
        const password = newPassword ?? pw.current;
        const file = await buildPartyFile(next, password, remote?.file.iter ?? ITERATIONS, newPassword ? undefined : remote?.file.salt);
        try {
          remoteSha.current = await st.write(file, remote?.sha ?? null, message);
        } catch (err) { if (err instanceof ConflictError) continue; throw err; }
        pw.current = password;
        if (newPassword) dkey.current = await draftKey(newPassword);
        setData(next); setParty(file); setDirty(false);
        if (dkey.current) store.set(KEY_DRAFT, JSON.stringify(await sealDraft(dkey.current, next)));
        return true;
      }
      throw new Error("Muitas alterações ao mesmo tempo. Tenta outra vez.");
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally { setBusy(false); }
  }

  // Vai buscar alterações feitas noutro aparelho (Rosa ↔ André)
  async function refresh(quiet = true) {
    if (!online || !data || dirty) return;
    try {
      const remote = await storeFor().fetch();
      if (!remote || remote.sha === remoteSha.current) return;
      const fresh = await openAdmin(remote.file, pw.current);
      if (!fresh) return;
      remoteSha.current = remote.sha; setParty(remote.file); setData(migrate(fresh));
      if (!quiet) setNotice("Atualizado com as últimas alterações.");
    } catch { /* sem rede: tenta na próxima vez */ }
  }

  function editPlayer(p?: Player) {
    setError("");
    const d: Record<string, string> = p
      ? { id: p.id, name: p.name, code: formatCode(p.code), role: p.role || "", occupation: p.occupation || "" }
      : { id: "", name: "", code: formatCode(generateCode(data?.players.map((x) => x.code))), role: "", occupation: "" };
    for (const s of sections) d[s.key] = p?.[s.key] || "";
    setDraft(d); setShowDossier(!!p && hasDossier(p)); setModal("player");
  }
  const field = (key: string, value: string) => setDraft({ ...draft, [key]: value });

  async function save(e: FormEvent) {
    e.preventDefault(); if (!data) return; setError("");
    const name = draft.name.trim(), c = normalizeCode(draft.code || "");
    if (!name) { setError("Indica o nome do jogador."); return; }
    if (c.length < 4) { setError("O código deve ter pelo menos 4 letras ou números."); return; }
    const p: Player = { id: draft.id || uid(), name, code: c, role: (draft.role || null) as Role | null, occupation: draft.occupation.trim() };
    for (const s of sections) p[s.key] = draft[s.key] || "";
    const ok = await commit((d) => {
      if (d.players.some((x) => x.code === c && x.id !== p.id)) throw new Error("Este código já pertence a outro jogador. Gera outro.");
      return { ...d, players: d.players.some((x) => x.id === p.id) ? d.players.map((x) => x.id === p.id ? p : x) : [...d.players, p] };
    }, `${draft.id ? "Editar" : "Adicionar"} jogador ${name}`);
    if (ok) { setModal(null); setNotice(online ? "Guardado ✓ Os convidados veem a alteração dentro de 1–2 minutos." : "Guardado neste aparelho. Não te esqueças de publicar."); }
  }
  async function remove() {
    if (!data || !confirm) return;
    const { id, name } = confirm;
    if (await commit((d) => ({ ...d, players: d.players.filter((p) => p.id !== id) }), `Eliminar jogador ${name}`)) { setConfirm(null); setNotice("Eliminado."); }
  }

  async function publish() {
    if (!data) return;
    if (online) {
      // Junta os jogadores deste aparelho com os que já estão online (não apaga o trabalho feito noutro aparelho)
      const local = data;
      const merged = (remote: PartyData): PartyData => {
        const byId = new Map(remote.players.map((p) => [p.id, p]));
        for (const p of local.players) byId.set(p.id, p);
        return { ...remote, players: [...byId.values()] };
      };
      if (await commit(merged, "Enviar alterações guardadas neste aparelho")) setNotice("Enviado ✓ Juntámos as alterações deste aparelho com as que já estavam online.");
      return;
    }
    setBusy(true); setError("");
    try {
      const file = await buildPartyFile(data, pw.current);
      download("party.json", JSON.stringify(file));
      setNotice("party.json descarregado. Envia-o para a pasta public/ do repositório no GitHub.");
      setParty(file); setDirty(false);
      if (dkey.current) store.set(KEY_DRAFT, JSON.stringify(await sealDraft(dkey.current, { ...data, updatedAt: file.updatedAt })));
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function saveGitHub(e: FormEvent) {
    e.preventDefault(); setError("");
    store.set(KEY_GITHUB, JSON.stringify(gh));
    if (!gh.token) { setOnline(false); setNotice("Token removido. As alterações ficam neste aparelho até publicar."); return; }
    setBusy(true);
    try {
      const remote = await githubStore(gh).fetch();
      const fresh = remote ? await openAdmin(remote.file, pw.current) : null;
      if (remote && !fresh) throw new Error("A festa no GitHub usa outra palavra-passe.");
      remoteSha.current = remote?.sha ?? null; setOnline(true);
      if (fresh && !dirty) { setData(migrate(fresh)); setParty(remote!.file); }
      setNotice(dirty ? "GitHub ligado ✓ Carrega em Enviar agora para gravar as alterações deste aparelho." : "GitHub ligado ✓ A partir de agora, Guardar grava logo online.");
    } catch (err) { setOnline(false); setError((err as Error).message); } finally { setBusy(false); }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault(); setError("");
    if (newPw.length < 8) { setError("Escolhe uma palavra-passe com pelo menos 8 caracteres."); return; }
    const next = newPw;
    if (online) { if (await commit((d) => d, "Alterar palavra-passe da organização", next)) { setNewPw(""); setNotice("Palavra-passe alterada ✓ Avisa a Rosa."); } return; }
    pw.current = next; dkey.current = await draftKey(next); setNewPw("");
    if (data) change(data);
    setNotice("Palavra-passe alterada. Publica para a aplicar.");
  }
  function exportBackup() {
    if (!data) return;
    download(`festa-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as PartyData;
      if (!Array.isArray(parsed.players)) throw new Error();
      const imported = migrate(parsed);
      if (await commit(() => imported, "Importar cópia de segurança")) setNotice(online ? "Cópia importada e guardada ✓" : "Cópia importada. Revê e publica.");
    } catch { setError("Ficheiro inválido."); }
  }
  async function copy(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text); setNotice(ok); }
    catch { setError("Não foi possível copiar automaticamente."); }
  }
  const invite = (p: Player) => `O Assassinato do Gabriel espera por ti, ${p.name}. Abre ${siteUrl()}?codigo=${p.code} ou entra em ${siteUrl()} com o teu código: ${formatCode(p.code)}. Guarda os teus segredos!`;

  const withRole = data?.players.filter((p) => p.role).length || 0;
  const withDossier = data?.players.filter(hasDossier).length || 0;
  const q = search.toLowerCase();
  const visiblePlayers = data?.players.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(q)) || [];

  return <div className="app">
    <header className="topbar"><Brand/><div className="top-actions"><span className="edition">NINGUÉM ESTÁ A SALVO</span>{mode === "admin" && <button className="quiet" onClick={() => switchMode("player")}><Eye size={16}/> Área do jogador</button>}</div></header>
    {notice && <div role="status" className="toast"><Check size={18}/>{notice}</div>}

    {mode === "admin" ? <div className="dashboard">
      <aside><div className="event-label">A TUA FESTA</div><h3>O Assassinato<br/>do Gabriel.</h3><div className={`tag ${online && !dirty ? "" : "warn"}`}><span/> {busy ? "A guardar…" : dirty ? "Por enviar" : online ? "Sincronizado" : data ? (server ? "Sem ligação" : "Sem ligação GitHub") : "Preparação"}</div><nav>
        <button className={tab === "players" ? "active" : ""} onClick={() => { setTab("players"); setSearch(""); }}><Users size={18}/>Jogadores<span>{data?.players.length || 0}</span></button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings size={18}/>Publicação</button>
      </nav><div className="aside-note"><ShieldCheck size={22}/><p>Os segredos ficam convosco.</p><small>Tudo é cifrado. Cada jogador só consegue abrir o seu papel com o seu código.</small></div><div className="aside-bottom">ORGANIZADO POR<br/><strong>André & Rosa</strong></div></aside>
      <main className="workspace">
        {!data ? <div className="setup-card"><div className="eyebrow">BASTIDORES DA NOITE</div><h1>O mistério começa<br/>convosco.</h1>
          {loading ? <p>A abrir os bastidores…</p> : <form onSubmit={unlock}>
            {!party && !hasDraft ? <><p>{server ? "Primeira vez? Usem a palavra-passe definida no servidor (ADMIN_PASSWORD)." : "Primeira vez? Escolham a palavra-passe da organização. Partilhem-na só entre os dois — sem ela, ninguém consegue abrir nem alterar a festa."}</p>
              <label>Palavra-passe<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}/></label>
              <label>Repetir palavra-passe<input type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)}/></label>
              <button className="primary" disabled={busy}>{busy ? "A preparar…" : "Criar a festa"} <ArrowRight size={17}/></button></>
            : <><p>Introduz a palavra-passe da organização.</p>
              <label>Palavra-passe<input type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)}/></label>
              <button className="primary" disabled={busy}>{busy ? "A abrir…" : "Entrar nos bastidores"} <ArrowRight size={17}/></button>
              {!party && <button type="button" className="text-button" onClick={resetLocal}>Esqueci-me da palavra-passe — recomeçar do zero</button>}</>}
            {error && <p role="alert" className="error">{error}</p>}
          </form>}
        </div> : <>
          <div className="page-heading"><div><div className="eyebrow">ÁREA DE ORGANIZAÇÃO / {tab === "players" ? "CONVIDADOS" : "PUBLICAÇÃO"}</div><h1>{tab === "players" ? "O elenco da noite." : "Dois cúmplices. Um plano."}</h1><p>{tab === "players" ? "Adicionem os amigos e escolham o papel de cada um." : "Liguem o GitHub, guardem uma cópia e publiquem."}</p></div>{tab === "players" && <button className="primary" onClick={() => editPlayer()}><Plus size={17}/>Adicionar jogador</button>}</div>
          {dirty && <div className="publish-bar"><div><UploadCloud size={20}/><span><strong>{online ? "Alterações deste aparelho por enviar." : "Alterações por publicar."}</strong> {online ? "Os outros só as veem depois de enviar." : server ? "Volta a entrar nos bastidores para gravar no servidor." : "Liga o GitHub em Publicação para que Guardar grave logo online."}</span></div><button className="primary" disabled={busy} onClick={publish}>{busy ? "A enviar…" : online ? "Enviar agora" : "Descarregar party.json"} <UploadCloud size={16}/></button></div>}
          {!online && !dirty && !server && <div className="publish-bar soft"><div><CloudOff size={20}/><span><strong>GitHub não ligado.</strong> Liga-o uma vez em Publicação: depois, Guardar grava tudo online e tu e a Rosa veem as mesmas coisas.</span></div><button className="secondary" onClick={() => setTab("settings")}>Ligar o GitHub</button></div>}
          {error && !modal && !confirm && <p role="alert" className="error">{error}</p>}
          <div className="stats"><div><span>CONVIDADOS</span><strong>{String(data.players.length).padStart(2, "0")}</strong><Users/></div><div><span>PAPÉIS ESCOLHIDOS</span><strong>{String(withRole).padStart(2, "0")}<small> / {data.players.length}</small></strong><VenetianMask/></div><div><span>DOSSIÊS ESCRITOS</span><strong>{String(withDossier).padStart(2, "0")}<small> / {data.players.length}</small></strong><BookOpen/></div></div>

          {tab === "settings" ? <section className="panel settings">
            {server ? <><h2><Cloud size={20}/> Servidor</h2><p>A app corre no vosso servidor Docker. Cada Guardar grava logo e as alterações da outra pessoa aparecem sozinhas. Não é preciso token.</p></> : <>
            <h2><Github size={20}/> Ligação ao GitHub</h2>
            <p>{online ? <><Cloud size={14}/> Ligado. Cada Guardar grava logo no GitHub e as alterações da outra pessoa aparecem sozinhas.</> : "Cola o token uma vez neste aparelho (e uma vez no da Rosa). A partir daí, Guardar grava tudo online — sem ficheiros."}</p>
            <form onSubmit={saveGitHub}>
              <div className="form-row"><label>Dono<input value={gh.owner} onChange={(e) => setGh({ ...gh, owner: e.target.value.trim() })}/></label><label>Repositório<input value={gh.repo} onChange={(e) => setGh({ ...gh, repo: e.target.value.trim() })}/></label></div>
              <div className="form-row"><label>Ramo<input value={gh.branch} onChange={(e) => setGh({ ...gh, branch: e.target.value.trim() })}/></label><label>Token (fine-grained, Contents: read & write)<input type="password" autoComplete="off" value={gh.token} onChange={(e) => setGh({ ...gh, token: e.target.value.trim() })} placeholder="github_pat_…"/></label></div>
              <button className="primary" disabled={busy}>{busy ? "A ligar…" : "Ligar e guardar neste aparelho"} <Check size={16}/></button>
            </form>
            <div className="note"><LockKeyhole size={18}/><p>O token fica só neste navegador. Nunca é publicado.</p></div>
            </>}
            <h2><QrCode size={20}/> QR code para a porta</h2>
            <p>Imprimam e ponham à entrada. Os convidados leem o QR, metem o código de 6 caracteres e descobrem o papel.</p>
            <div className="button-line"><button className="secondary" onClick={() => setModal("qr")}><QrCode size={15}/> Abrir QR para imprimir</button></div>
            {server ? <><h2><KeyRound size={20}/> Palavra-passe da organização</h2><p>É a variável <code>ADMIN_PASSWORD</code> do ficheiro <code>.env</code> no servidor.</p></> : <>
            <h2><KeyRound size={20}/> Palavra-passe da organização</h2>
            <form onSubmit={changePassword}><label>Nova palavra-passe (a Rosa terá de usar a nova)<input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)}/></label><button className="secondary" disabled={busy}>Alterar palavra-passe</button></form>
            </>}
            <h2><Download size={20}/> Cópia de segurança</h2>
            <p>Ficheiro <strong>não cifrado</strong> com tudo (segredos e códigos). Guardem-no num sítio privado — nunca no GitHub.</p>
            <div className="button-line"><button className="secondary" onClick={exportBackup}><Download size={15}/> Exportar cópia</button><label className="secondary file-button"><Upload size={15}/> Importar cópia<input type="file" accept="application/json" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ""; }}/></label></div>
            <button className="quiet" onClick={lock}><LogOut size={16}/> Fechar os bastidores</button>
          </section> :
          <section className="panel"><div className="panel-toolbar"><h2>Lista de convidados<span>{data.players.length}</span></h2><div className="search"><Search size={16}/><input aria-label="Pesquisar" placeholder="Procurar jogador…" value={search} onChange={(e) => setSearch(e.target.value)}/></div></div>
            <div className="table-wrap"><table><thead><tr><th>JOGADOR</th><th>PAPEL</th><th>ESTADO</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{visiblePlayers.map((p) => {
              const role = p.role || null, dossier = hasDossier(p);
              return <tr key={p.id}><td><div className="person"><div className="avatar">{p.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</div><div><strong>{p.name}</strong><small className="code-chip">{formatCode(p.code)}</small></div></div></td>
                <td>{role ? <span className={`status ${darkRoles.includes(role) ? "killer" : "ready"}`}>{roles[role]}</span> : <button className="text-button" onClick={() => editPlayer(p)}><Plus size={14}/> Escolher papel</button>}</td>
                <td><span className={`status ${role ? "ready" : "pending"}`}>{!role ? "Por preparar" : dossier ? "Papel + dossiê" : "Papel escolhido"}</span></td>
                <td><div className="row-actions"><button aria-label={`Copiar convite de ${p.name}`} title="Copiar convite com o código" onClick={() => copy(invite(p), `Convite de ${p.name} copiado.`)}><Copy size={16}/></button><button aria-label={`Editar ${p.name}`} onClick={() => editPlayer(p)}><Pencil size={16}/></button><button aria-label={`Eliminar ${p.name}`} onClick={() => setConfirm({ id: p.id, name: p.name })}><Trash2 size={16}/></button></div></td></tr>;
            })}</tbody></table>{!data.players.length ? <div className="empty"><Users size={36}/><h3>A mesa ainda está vazia.</h3><p>Adicionem os convidados e escolham quem é quem.</p><button className="secondary" onClick={() => editPlayer()}>Adicionar o primeiro jogador <Plus size={16}/></button></div> : !visiblePlayers.length ? <div className="empty"><p>Nenhum jogador encontrado.</p></div> : null}</div>
          </section>}
          {tab !== "settings" && <div className="invite-strip"><div className="invite-icon"><KeyRound size={23}/></div><div><h3>A porta de entrada para o mistério.</h3><p>Cada jogador entra com o seu código secreto. Usa o botão <Copy size={13}/> ao lado de cada nome para copiar o convite pessoal.</p></div><button className="secondary" onClick={() => copy(siteUrl(), "Endereço do jogo copiado.")}>Copiar endereço <Share2 size={15}/></button></div>}
          <footer><span><LockKeyhole size={13}/> Só a organização vê o elenco completo.</span><button className="quiet" onClick={lock}><LogOut size={14}/> Fechar</button></footer>
        </>}
      </main>
    </div> :

    <main className={`player-main ${view ? "has-player" : ""}`}>
      {loading ? <div className="loading"><Fingerprint size={40}/><p>A abrir o teu dossiê…</p></div> : view ? <div className="dossier"><div className="dossier-top"><span className="eyebrow">DOSSIÊ CONFIDENCIAL · {view.name}</span><button className="quiet" onClick={logout}><LogOut size={16}/> Sair</button></div>
        {view.role || hasDossier(view) ? <><div className="dossier-title"><div><div className="eyebrow">ESTA NOITE, TU ÉS</div><h1>{hidden ? "••••••••" : view.name}</h1>{(hidden || view.occupation) && <p>{hidden ? "Dossiê oculto" : view.occupation}</p>}</div><VenetianMask size={68}/></div><div className="privacy-bar"><span><LockKeyhole size={15}/> Apenas para os teus olhos.</span><button className="quiet" onClick={() => setHidden(!hidden)}><Eye size={16}/>{hidden ? "Mostrar dossiê" : "Ocultar dossiê"}</button></div>
          {!hidden && <>{view.role && <RoleBanner role={view.role}/>}{hasDossier(view) && <div className="dossier-sections">{sections.filter((s) => (view[s.key] || "").trim()).map((s) => { const Icon = sectionIcons[s.key]; return <section key={s.key}><Icon size={21}/><h2>{s.title}</h2><p className="pre">{view[s.key]}</p></section>; })}</div>}</>}
          <p className="closing">Confia no teu instinto. Desconfia de todos.</p></>
        : <div className="empty waiting"><VenetianMask size={48}/><h1>O teu papel<br/>está a caminho.</h1><p>Olá, {view.name}. A organização ainda está a decidir quem és esta noite.</p></div>}
        <button className="quiet" onClick={() => loadPlayer()}><RefreshCw size={15}/> Verificar atualizações</button>{error && <p className="error" role="alert">{error}</p>}</div> :
      <><section className="intro"><div className="eyebrow"><span className="tiny-line"/> UMA FESTA. UM CRIME. UM DE NÓS.</div><h1 className="sr-only">O Assassinato do Gabriel</h1><Logo/><p className="tagline"><span>Uma noite de Halloween.</span><span>Um crime por resolver.</span><span>O assassino está entre nós.</span></p><div className="intro-foot"><Fingerprint size={27}/><span>A verdade tem muitas versões.<br/><strong>Qual vai ser a tua?</strong></span></div></section>
        <section className="login-card"><div className="file-mark">ARQUIVO PRIVADO <span>01 / ENTRADA</span></div><div className="mask-emblem"><VenetianMask size={52}/></div><h2>Entra no mistério.</h2><p>Introduz o código secreto que a organização te enviou para descobrires o teu papel esta noite.</p>
          <form onSubmit={login}><label>O teu código<input className="code-input login-code" required autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={64} value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7M-2QX"/><small>{CODE_LENGTH} letras e números, por exemplo K7M-2QX.</small></label>{error && <p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "A abrir o dossiê…" : "Descobrir o meu papel"}<ArrowRight size={18}/></button></form>
          <div className="login-note"><LockKeyhole size={14}/><span>Acesso exclusivo a jogadores convidados.<br/>Guarda a tua personagem em segredo.</span></div></section>
        <div className="player-footer">O ASSASSINATO DO GABRIEL <span>O assassino pode estar mesmo ao teu lado.</span></div></>}
    </main>}

    {modal === "player" && data && <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal"><button className="close" aria-label="Fechar" onClick={() => setModal(null)}><X/></button><div className="eyebrow">NOS BASTIDORES</div><h2 id="dialog-title">{draft.id ? "Editar" : "Adicionar"} jogador</h2>
      <form onSubmit={save}><label>Nome do jogador<input autoFocus required maxLength={100} value={draft.name} onChange={(e) => field("name", e.target.value)} placeholder="Ex.: Diogo"/></label>
        <label>Código secreto<div className="code-row"><input className="code-input" required maxLength={20} value={draft.code} onChange={(e) => field("code", e.target.value.toUpperCase())}/><button type="button" className="secondary" title="Gerar outro código" onClick={() => field("code", formatCode(generateCode(data.players.map((p) => p.code))))}><Dices size={16}/></button></div><small>Gerado automaticamente. É com ele que o jogador entra.</small></label>
        <label>Papel<select value={draft.role || ""} onChange={(e) => field("role", e.target.value)}><option value="">Escolher mais tarde</option>{Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><small>É o que o jogador vê em "O teu papel" quando entra com o código.</small></label>
        <button type="button" className={`text-button dossier-toggle ${showDossier ? "open" : ""}`} onClick={() => setShowDossier(!showDossier)}><ChevronDown size={15}/> Dossiê (opcional): história, segredo, álibi…</button>
        {showDossier && <>
          <label>Subtítulo<input maxLength={100} value={draft.occupation} onChange={(e) => field("occupation", e.target.value)} placeholder="Ex.: O amigo traído"/></label>
          {sections.map(({ key: k, label }) => <label key={k}>{label}<textarea maxLength={6000} rows={k === "story" || k === "secrets" ? 5 : 3} value={draft[k]} onChange={(e) => field(k, e.target.value)} placeholder="Só este jogador vê este texto."/></label>)}
        </>}
        {error && <p role="alert" className="error">{error}</p>}<div className="modal-actions"><button type="button" className="quiet" disabled={busy} onClick={() => setModal(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "A guardar…" : "Guardar"}<Check size={16}/></button></div></form></section></div>}
    {modal === "qr" && <div className="overlay qr-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="qr-title" className="modal qr-sheet"><button className="close no-print" aria-label="Fechar" onClick={() => setModal(null)}><X/></button>
      <div className="qr-brand"><Fingerprint size={30}/><span>O ASSASSINATO DO GABRIEL</span></div>
      <h2 id="qr-title">Entra no mistério.</h2>
      <img className="qr-img" alt={`QR code para ${siteUrl()}`} src={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=${encodeURIComponent(siteUrl())}`}/>
      <ol className="qr-steps"><li>Lê o QR code com o telemóvel</li><li>Mete o teu <strong>código secreto</strong> de 6 caracteres</li><li>Descobre o teu papel… e guarda-o para ti</li></ol>
      <p className="qr-url">{siteUrl().replace(/^https?:\/\//, "")}</p>
      <div className="modal-actions no-print"><button className="quiet" onClick={() => setModal(null)}>Fechar</button><button className="primary" onClick={() => window.print()}><Printer size={16}/> Imprimir</button></div>
    </section></div>}
    {confirm && <div className="overlay"><section role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="modal compact"><h2 id="confirm-title">Eliminar {confirm.name}?</h2><p>O jogador deixará de ter acesso ao jogo depois de publicar.</p><div className="modal-actions"><button className="quiet" onClick={() => setConfirm(null)}>Cancelar</button><button className="primary danger" onClick={remove}>Eliminar</button></div></section></div>}
  </div>;
}
