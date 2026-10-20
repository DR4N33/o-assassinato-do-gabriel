import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Fingerprint, ArrowRight, Plus, Users, VenetianMask, Settings, Search, X, LockKeyhole, LogOut, Eye, Pencil,
  Trash2, Check, Share2, RefreshCw, ShieldCheck, BookOpen, KeyRound, Clock3, FileQuestion, Copy, UploadCloud,
  Download, Upload, Github, Dices,
} from "lucide-react";
import {
  buildPartyFile, draftKey, generateCode, isPartyFile, normalizeCode, openAdmin, openDraft, openPlayer, sealDraft,
  CODE_LENGTH, type Character, type Draft, type PartyData, type PartyFile, type Player, type PlayerView, type Role,
} from "./crypto";
import { guessTarget, publishToGitHub, type GitHubTarget } from "./github";

const roles: Record<Role, string> = { suspeito: "Suspeito", assassino: "Assassino", vitima: "Vítima" };
const emptyCharacter: Character = { id: "", name: "", occupation: "", role: "suspeito", story: "", secrets: "", alibi: "", information: "" };
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
function Brand() { return <a href="./" className="brand"><Fingerprint size={32}/><span>O ASSASSINATO<small>DO GABRIEL · HALLOWEEN</small></span></a>; }

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
  const [search, setSearch] = useState(""), [modal, setModal] = useState<"player" | "character" | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({}), [confirm, setConfirm] = useState<{ kind: "player" | "character"; id: string; name: string } | null>(null);
  const [newPw, setNewPw] = useState("");

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
  async function loadAdmin() {
    setLoading(true); setError("");
    try { setParty(await fetchParty()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
    setHasDraft(!!store.get(KEY_DRAFT));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode") === "admin" ? "admin" : "player";
    setMode(m);
    try { const saved = JSON.parse(store.get(KEY_GITHUB) || "null"); if (saved) setGh((g) => ({ ...g, ...saved })); } catch { /* ignoré */ }
    const fromLink = params.get("codigo");
    if (fromLink) { window.history.replaceState(null, "", window.location.pathname); setCode(fromLink); }
    if (m === "admin") void loadAdmin(); else void loadPlayer(fromLink || undefined);
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
      if (!file) throw new Error("A festa ainda não foi publicada. Volta a tentar mais tarde.");
      const v = await openPlayer(file, code);
      if (!v) throw new Error("Código desconhecido. Confirma as letras e os números ou fala com a organização.");
      store.set(KEY_CODE, normalizeCode(code)); setView(v); setCode("");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  function logout() { store.del(KEY_CODE); setView(null); setHidden(false); }

  // ---------- Organisation ----------
  async function unlock(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const creating = !party && !hasDraft;
      if (creating) {
        if (password.length < 8) throw new Error("Escolhe uma palavra-passe com pelo menos 8 caracteres.");
        if (password !== password2) throw new Error("As duas palavras-passe não coincidem.");
      }
      const published = party ? await openAdmin(party, password) : null;
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
      setData(newer ? local : published ?? { characters: [], players: [], updatedAt: Date.now() });
      setDirty(!!newer || creating);
      pw.current = password; setPassword(""); setPassword2("");
      if (newer && published) setNotice("Recuperámos alterações guardadas neste aparelho que ainda não foram publicadas.");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  function lock() {
    if (dirty && !window.confirm("Há alterações por publicar. Ficam guardadas neste aparelho. Sair mesmo assim?")) return;
    setData(null); pw.current = ""; dkey.current = null; setDirty(false); setHasDraft(!!store.get(KEY_DRAFT));
  }
  function change(next: Omit<PartyData, "updatedAt">) { setData({ ...next, updatedAt: Date.now() }); setDirty(true); }

  function editPlayer(p?: Player) {
    setError("");
    setDraft(p ? { id: p.id, name: p.name, code: formatCode(p.code), characterId: p.characterId || "" }
      : { id: "", name: "", code: formatCode(generateCode(data?.players.map((x) => x.code))), characterId: "" });
    setModal("player");
  }
  function editCharacter(c?: Character) { setError(""); setDraft(c ? { ...c } : { ...emptyCharacter }); setModal("character"); }
  const field = (key: string, value: string) => setDraft({ ...draft, [key]: value });

  function save(e: FormEvent) {
    e.preventDefault(); if (!data) return; setError("");
    try {
      if (modal === "player") {
        const name = draft.name.trim(), c = normalizeCode(draft.code || "");
        if (!name) throw new Error("Indica o nome do jogador.");
        if (c.length < 4) throw new Error("O código deve ter pelo menos 4 letras ou números.");
        if (data.players.some((p) => p.code === c && p.id !== draft.id)) throw new Error("Este código já pertence a outro jogador.");
        const p: Player = { id: draft.id || uid(), name, code: c, characterId: draft.characterId || null };
        change({ ...data, players: draft.id ? data.players.map((x) => x.id === p.id ? p : x) : [...data.players, p] });
      } else {
        const name = draft.name.trim();
        if (!name) throw new Error("Dá um nome à personagem.");
        const c: Character = {
          id: draft.id || uid(), name, occupation: draft.occupation.trim(), role: draft.role as Role,
          story: draft.story, secrets: draft.secrets, alibi: draft.alibi, information: draft.information,
        };
        change({ ...data, characters: draft.id ? data.characters.map((x) => x.id === c.id ? c : x) : [...data.characters, c] });
      }
      setModal(null); setNotice("Guardado. Não te esqueças de publicar.");
    } catch (err) { setError((err as Error).message); }
  }
  function remove() {
    if (!data || !confirm) return;
    if (confirm.kind === "player") change({ ...data, players: data.players.filter((p) => p.id !== confirm.id) });
    else change({
      characters: data.characters.filter((c) => c.id !== confirm.id),
      players: data.players.map((p) => p.characterId === confirm.id ? { ...p, characterId: null } : p),
    });
    setConfirm(null); setNotice("Eliminado.");
  }

  async function publish() {
    if (!data) return;
    setBusy(true); setError("");
    try {
      const file = await buildPartyFile(data, pw.current);
      if (gh.token) {
        await publishToGitHub(gh, file);
        setNotice("Publicado no GitHub! O site atualiza dentro de 1 a 2 minutos.");
      } else {
        download("party.json", JSON.stringify(file));
        setNotice("party.json descarregado. Envia-o para a pasta public/ do repositório no GitHub.");
      }
      setParty(file); setDirty(false);
      if (dkey.current) store.set(KEY_DRAFT, JSON.stringify(await sealDraft(dkey.current, { ...data, updatedAt: file.updatedAt })));
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  function saveGitHub(e: FormEvent) {
    e.preventDefault();
    store.set(KEY_GITHUB, JSON.stringify(gh)); setNotice("Ligação ao GitHub guardada neste aparelho.");
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault(); setError("");
    if (newPw.length < 8) { setError("Escolhe uma palavra-passe com pelo menos 8 caracteres."); return; }
    pw.current = newPw; dkey.current = await draftKey(newPw); setNewPw("");
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
      if (!Array.isArray(parsed.players) || !Array.isArray(parsed.characters)) throw new Error();
      change(parsed); setNotice("Cópia importada. Revê e publica.");
    } catch { setError("Ficheiro inválido."); }
  }
  async function copy(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text); setNotice(ok); }
    catch { setError("Não foi possível copiar automaticamente."); }
  }
  const invite = (p: Player) => `O Assassinato do Gabriel espera por ti, ${p.name}. Abre ${siteUrl()}?codigo=${p.code} ou entra em ${siteUrl()} com o teu código: ${formatCode(p.code)}. Guarda os teus segredos!`;

  const assigned = data?.players.filter((p) => p.characterId).length || 0;
  const q = search.toLowerCase();
  const visiblePlayers = data?.players.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(q)) || [];
  const visibleCharacters = data?.characters.filter((c) => `${c.name} ${c.occupation}`.toLowerCase().includes(q)) || [];

  return <div className="app">
    <header className="topbar"><Brand/><div className="top-actions"><span className="edition">NINGUÉM ESTÁ A SALVO</span><button className="quiet" onClick={() => switchMode(mode === "admin" ? "player" : "admin")}>{mode === "admin" ? <><Eye size={16}/> Área do jogador</> : <><LockKeyhole size={15}/> Organização</>}</button></div></header>
    {notice && <div role="status" className="toast"><Check size={18}/>{notice}</div>}

    {mode === "admin" ? <div className="dashboard">
      <aside><div className="event-label">A TUA FESTA</div><h3>O Assassinato<br/>do Gabriel.</h3><div className="tag"><span/> {dirty ? "Por publicar" : "Preparação"}</div><nav>
        <button className={tab === "players" ? "active" : ""} onClick={() => { setTab("players"); setSearch(""); }}><Users size={18}/>Jogadores<span>{data?.players.length || 0}</span></button>
        <button className={tab === "characters" ? "active" : ""} onClick={() => { setTab("characters"); setSearch(""); }}><VenetianMask size={18}/>Personagens<span>{data?.characters.length || 0}</span></button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings size={18}/>Publicação</button>
      </nav><div className="aside-note"><ShieldCheck size={22}/><p>Os segredos ficam convosco.</p><small>Tudo é cifrado. Cada jogador só consegue abrir a sua personagem com o seu código.</small></div><div className="aside-bottom">ORGANIZADO POR<br/><strong>André & Rosa</strong></div></aside>
      <main className="workspace">
        {!data ? <div className="setup-card"><div className="eyebrow">BASTIDORES DA NOITE</div><h1>O mistério começa<br/>convosco.</h1>
          {loading ? <p>A abrir os bastidores…</p> : <form onSubmit={unlock}>
            {!party && !hasDraft ? <><p>Primeira vez? Escolham a palavra-passe da organização. Partilhem-na só entre os dois — sem ela, ninguém consegue abrir nem alterar a festa.</p>
              <label>Palavra-passe<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}/></label>
              <label>Repetir palavra-passe<input type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)}/></label>
              <button className="primary" disabled={busy}>{busy ? "A preparar…" : "Criar a festa"} <ArrowRight size={17}/></button></>
            : <><p>Introduz a palavra-passe da organização.</p>
              <label>Palavra-passe<input type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)}/></label>
              <button className="primary" disabled={busy}>{busy ? "A abrir…" : "Entrar nos bastidores"} <ArrowRight size={17}/></button></>}
            {error && <p role="alert" className="error">{error}</p>}
          </form>}
        </div> : <>
          <div className="page-heading"><div><div className="eyebrow">ÁREA DE ORGANIZAÇÃO / {tab === "players" ? "CONVIDADOS" : tab === "characters" ? "DOSSIÊS" : "PUBLICAÇÃO"}</div><h1>{tab === "players" ? "O elenco da noite." : tab === "characters" ? "Todos têm um segredo." : "Dois cúmplices. Um plano."}</h1><p>{tab === "players" ? "Adicionem os amigos. Cada um recebe um código secreto." : tab === "characters" ? "Escrevam cada história e decidam o que fica por contar." : "Liguem o GitHub, guardem uma cópia e publiquem."}</p></div>{tab !== "settings" && <button className="primary" onClick={() => tab === "players" ? editPlayer() : editCharacter()}><Plus size={17}/>{tab === "players" ? "Adicionar jogador" : "Criar personagem"}</button>}</div>
          {dirty && <div className="publish-bar"><div><UploadCloud size={20}/><span><strong>Alterações por publicar.</strong> Os jogadores só as veem depois de publicar.</span></div><button className="primary" disabled={busy} onClick={publish}>{busy ? "A publicar…" : gh.token ? "Publicar no GitHub" : "Descarregar party.json"} <UploadCloud size={16}/></button></div>}
          {error && !modal && !confirm && <p role="alert" className="error">{error}</p>}
          <div className="stats"><div><span>CONVIDADOS</span><strong>{String(data.players.length).padStart(2, "0")}</strong><Users/></div><div><span>PERSONAGENS ATRIBUÍDAS</span><strong>{String(assigned).padStart(2, "0")}<small> / {data.players.length}</small></strong><VenetianMask/></div><div><span>PERSONAGENS CRIADAS</span><strong>{String(data.characters.length).padStart(2, "0")}</strong><Fingerprint/></div></div>

          {tab === "settings" ? <section className="panel settings">
            <h2><Github size={20}/> Ligação ao GitHub</h2>
            <p>Com um token, o botão Publicar envia a festa diretamente para o repositório e o site atualiza sozinho. Sem token, descarregas o ficheiro party.json e envias à mão para a pasta <code>public/</code>.</p>
            <form onSubmit={saveGitHub}>
              <div className="form-row"><label>Dono<input value={gh.owner} onChange={(e) => setGh({ ...gh, owner: e.target.value.trim() })}/></label><label>Repositório<input value={gh.repo} onChange={(e) => setGh({ ...gh, repo: e.target.value.trim() })}/></label></div>
              <div className="form-row"><label>Ramo<input value={gh.branch} onChange={(e) => setGh({ ...gh, branch: e.target.value.trim() })}/></label><label>Token (fine-grained, Contents: read & write)<input type="password" autoComplete="off" value={gh.token} onChange={(e) => setGh({ ...gh, token: e.target.value.trim() })} placeholder="github_pat_…"/></label></div>
              <button className="primary">Guardar neste aparelho <Check size={16}/></button>
            </form>
            <div className="note"><LockKeyhole size={18}/><p>O token fica só neste navegador. Nunca é publicado.</p></div>
            <h2><KeyRound size={20}/> Palavra-passe da organização</h2>
            <form onSubmit={changePassword}><label>Nova palavra-passe<input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)}/></label><button className="secondary">Alterar palavra-passe</button></form>
            <h2><Download size={20}/> Cópia de segurança</h2>
            <p>Ficheiro <strong>não cifrado</strong> com tudo (segredos e códigos). Guardem-no num sítio privado — nunca no GitHub.</p>
            <div className="button-line"><button className="secondary" onClick={exportBackup}><Download size={15}/> Exportar cópia</button><label className="secondary file-button"><Upload size={15}/> Importar cópia<input type="file" accept="application/json" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ""; }}/></label></div>
            <button className="quiet" onClick={lock}><LogOut size={16}/> Fechar os bastidores</button>
          </section> :
          <section className="panel"><div className="panel-toolbar"><h2>{tab === "players" ? "Lista de convidados" : "Dossiês de personagens"}<span>{tab === "players" ? data.players.length : data.characters.length}</span></h2><div className="search"><Search size={16}/><input aria-label="Pesquisar" placeholder={tab === "players" ? "Procurar jogador…" : "Procurar personagem…"} value={search} onChange={(e) => setSearch(e.target.value)}/></div></div>
            {tab === "players" ? <div className="table-wrap"><table><thead><tr><th>JOGADOR</th><th>PERSONAGEM</th><th>ESTADO</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{visiblePlayers.map((p) => {
              const c = data.characters.find((c) => c.id === p.characterId);
              return <tr key={p.id}><td><div className="person"><div className="avatar">{p.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</div><div><strong>{p.name}</strong><small className="code-chip">{formatCode(p.code)}</small></div></div></td>
                <td>{c ? <div><strong>{c.name}</strong><small>{roles[c.role]}</small></div> : <button className="text-button" onClick={() => editPlayer(p)}><Plus size={14}/> Atribuir personagem</button>}</td>
                <td><span className={`status ${c ? "ready" : "pending"}`}>{c ? "Pronto para jogar" : "Por preparar"}</span></td>
                <td><div className="row-actions"><button aria-label={`Copiar convite de ${p.name}`} title="Copiar convite com o código" onClick={() => copy(invite(p), `Convite de ${p.name} copiado.`)}><Copy size={16}/></button><button aria-label={`Editar ${p.name}`} onClick={() => editPlayer(p)}><Pencil size={16}/></button><button aria-label={`Eliminar ${p.name}`} onClick={() => setConfirm({ kind: "player", id: p.id, name: p.name })}><Trash2 size={16}/></button></div></td></tr>;
            })}</tbody></table>{!data.players.length ? <div className="empty"><Users size={36}/><h3>A mesa ainda está vazia.</h3><p>Comecem pelos nomes. Os segredos vêm a seguir.</p><button className="secondary" onClick={() => editPlayer()}>Adicionar o primeiro jogador <Plus size={16}/></button></div> : !visiblePlayers.length ? <div className="empty"><p>Nenhum jogador encontrado.</p></div> : null}</div> :
            <div className="character-grid">{visibleCharacters.map((c, i) => <article className="character-card" key={c.id}><div className="card-top"><span>DOSSIÊ {String(i + 1).padStart(2, "0")}</span><VenetianMask size={22}/></div><h3>{c.name}</h3><p>{c.occupation || "Ocupação por definir"}</p><span className={`status ${c.role === "assassino" ? "killer" : "ready"}`}>{roles[c.role]}</span><div className="card-bottom"><small>{data.players.find((p) => p.characterId === c.id)?.name || "Sem jogador atribuído"}</small><div className="row-actions"><button aria-label={`Editar ${c.name}`} onClick={() => editCharacter(c)}><Pencil size={16}/></button><button aria-label={`Eliminar ${c.name}`} onClick={() => setConfirm({ kind: "character", id: c.id, name: c.name })}><Trash2 size={16}/></button></div></div></article>)}{!data.characters.length ? <div className="empty"><VenetianMask size={38}/><h3>Quem estará entre nós?</h3><p>Criem as personagens, dos álibis aos segredos mais bem guardados.</p><button className="secondary" onClick={() => editCharacter()}>Criar a primeira personagem <Plus size={16}/></button></div> : !visibleCharacters.length ? <div className="empty"><p>Nenhuma personagem encontrada.</p></div> : null}</div>}
          </section>}
          {tab !== "settings" && <div className="invite-strip"><div className="invite-icon"><KeyRound size={23}/></div><div><h3>A porta de entrada para o mistério.</h3><p>Cada jogador entra com o seu código secreto. Usa o botão <Copy size={13}/> ao lado de cada nome para copiar o convite pessoal.</p></div><button className="secondary" onClick={() => copy(siteUrl(), "Endereço do jogo copiado.")}>Copiar endereço <Share2 size={15}/></button></div>}
          <footer><span><LockKeyhole size={13}/> Só a organização vê o elenco completo.</span><button className="quiet" onClick={lock}><LogOut size={14}/> Fechar</button></footer>
        </>}
      </main>
    </div> :

    <main className={`player-main ${view ? "has-player" : ""}`}>
      {loading ? <div className="loading"><Fingerprint size={40}/><p>A abrir o teu dossiê…</p></div> : view ? <div className="dossier"><div className="dossier-top"><span className="eyebrow">DOSSIÊ CONFIDENCIAL · {view.name}</span><button className="quiet" onClick={logout}><LogOut size={16}/> Sair</button></div>
        {view.character ? <><div className="dossier-title"><div><div className="eyebrow">ESTA NOITE, TU ÉS</div><h1>{hidden ? "••••••••" : view.character.name}</h1><p>{hidden ? "Dossiê oculto" : view.character.occupation}</p></div><VenetianMask size={68}/></div><div className="privacy-bar"><span><LockKeyhole size={15}/> Apenas para os teus olhos.</span><button className="quiet" onClick={() => setHidden(!hidden)}><Eye size={16}/>{hidden ? "Mostrar dossiê" : "Ocultar dossiê"}</button></div>
          {!hidden && <><div className={`role-banner ${view.character.role === "assassino" ? "red" : ""}`}><span>O TEU PAPEL</span><strong>{roles[view.character.role]}</strong><p>{view.character.role === "assassino" ? "Guarda este segredo. Cabe-te escapar às suspeitas." : "Toda a gente tem algo a esconder. Descobre quem está a mentir."}</p></div><div className="dossier-sections">{([{ key: "story", title: "A tua história", icon: BookOpen }, { key: "secrets", title: "Os teus segredos", icon: LockKeyhole }, { key: "alibi", title: "O teu álibi", icon: Clock3 }, { key: "information", title: "O que só tu sabes", icon: FileQuestion }] as const).map((s) => <section key={s.key}><s.icon size={21}/><h2>{s.title}</h2><p className="pre">{view.character![s.key] || "A organização ainda não acrescentou esta informação."}</p></section>)}</div></>}
          <p className="closing">Confia no teu instinto. Desconfia de todos.</p></>
        : <div className="empty waiting"><VenetianMask size={48}/><h1>O teu segredo<br/>está a caminho.</h1><p>Olá, {view.name}. A organização ainda está a preparar a tua personagem.</p></div>}
        <button className="quiet" onClick={() => loadPlayer()}><RefreshCw size={15}/> Verificar atualizações</button>{error && <p className="error" role="alert">{error}</p>}</div> :
      <><section className="intro"><div className="eyebrow"><span className="tiny-line"/> UMA FESTA. UM CRIME. UM DE NÓS.</div><h1>O Assassinato<br/>do <em>Gabriel.</em></h1><p>Uma noite de Halloween. Um crime por resolver.<br/>O assassino está entre nós.</p><div className="intro-foot"><Fingerprint size={27}/><span>A verdade tem muitas versões.<br/><strong>Qual vai ser a tua?</strong></span></div></section>
        <section className="login-card"><div className="file-mark">ARQUIVO PRIVADO <span>01 / ENTRADA</span></div><div className="mask-emblem"><VenetianMask size={52}/></div><h2>Entra no mistério.</h2><p>Introduz o código secreto que a organização te enviou para descobrires quem és esta noite.</p>
          <form onSubmit={login}><label>O teu código<input className="code-input" required autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7M-2QX"/><small>{CODE_LENGTH} letras e números, por exemplo K7M-2QX.</small></label>{error && <p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "A abrir o dossiê…" : "Descobrir a minha personagem"}<ArrowRight size={18}/></button></form>
          <div className="login-note"><LockKeyhole size={14}/><span>Acesso exclusivo a jogadores convidados.<br/>Guarda a tua personagem em segredo.</span></div></section>
        <div className="player-footer">O ASSASSINATO DO GABRIEL <span>O assassino pode estar mesmo ao teu lado.</span></div></>}
    </main>}

    {modal && data && <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal"><button className="close" aria-label="Fechar" onClick={() => setModal(null)}><X/></button><div className="eyebrow">NOS BASTIDORES</div><h2 id="dialog-title">{draft.id ? "Editar" : "Adicionar"} {modal === "player" ? "jogador" : "personagem"}</h2>
      <form onSubmit={save}><label>{modal === "player" ? "Nome do jogador" : "Nome da personagem"}<input autoFocus required maxLength={100} value={draft.name} onChange={(e) => field("name", e.target.value)} placeholder={modal === "player" ? "Como se chama o convidado?" : "Ex.: Helena Montenegro"}/></label>
        {modal === "player" ? <>
          <label>Código secreto<div className="code-row"><input className="code-input" required maxLength={20} value={draft.code} onChange={(e) => field("code", e.target.value.toUpperCase())}/><button type="button" className="secondary" title="Gerar outro código" onClick={() => field("code", formatCode(generateCode(data.players.map((p) => p.code))))}><Dices size={16}/></button></div><small>Gerado automaticamente. É com ele que o jogador entra.</small></label>
          <label>Personagem<select value={draft.characterId || ""} onChange={(e) => field("characterId", e.target.value)}><option value="">Atribuir mais tarde</option>{data.characters.filter((c) => c.id === draft.characterId || !data.players.some((p) => p.characterId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} · {roles[c.role]}</option>)}</select><small>Cada personagem só pode ser atribuída a um jogador.</small></label>
        </> : <>
          <div className="form-row"><label>Ocupação<input maxLength={100} value={draft.occupation} onChange={(e) => field("occupation", e.target.value)} placeholder="Ex.: A herdeira"/></label><label>Papel<select value={draft.role} onChange={(e) => field("role", e.target.value)}>{Object.entries(roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
          {[["story", "História"], ["secrets", "Segredos"], ["alibi", "Álibi"], ["information", "Informações privadas"]].map(([k, label]) => <label key={k}>{label}<textarea maxLength={6000} rows={3} value={draft[k]} onChange={(e) => field(k, e.target.value)} placeholder="Só o jogador que receber esta personagem verá esta informação."/></label>)}
        </>}
        {error && <p role="alert" className="error">{error}</p>}<div className="modal-actions"><button type="button" className="quiet" onClick={() => setModal(null)}>Cancelar</button><button className="primary">Guardar<Check size={16}/></button></div></form></section></div>}
    {confirm && <div className="overlay"><section role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="modal compact"><h2 id="confirm-title">Eliminar {confirm.name}?</h2><p>{confirm.kind === "character" ? "O jogador associado ficará sem personagem." : "O jogador deixará de ter acesso ao jogo depois de publicar."}</p><div className="modal-actions"><button className="quiet" onClick={() => setConfirm(null)}>Cancelar</button><button className="primary danger" onClick={remove}>Eliminar</button></div></section></div>}
  </div>;
}
