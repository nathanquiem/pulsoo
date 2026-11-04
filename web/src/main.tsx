import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  MessagesSquare,
  Bot,
  Settings,
  FlaskConical,
  Package,
  FileText,
  CheckCheck,
  Plus,
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
  Sun,
  Moon,
  Menu,
  Clock,
  Send,
  Pause,
  Play,
  ShieldCheck,
  Info,
  Workflow,
  Plug,
  ChevronRight,
  Download,
  Coins,
  AudioLines,
  Users,
} from "lucide-react";
import type {
  Contact,
  Product,
  ProposalTemplate,
  Proposal,
  AgentSettings,
  Operation,
  Conversation,
  ConversationMessage,
  RuntimeJob,
  FollowupExecution,
  IntegrationStatus,
  Usage,
  Audit,
} from "../../shared/model";
import { money } from "../../shared/model";
import "./style.css";
import { RhythmEditor, WorkflowEditor } from "./WorkflowEditor";
type Data = {
  demo: boolean;
  contacts: Contact[];
  products: Product[];
  templates: ProposalTemplate[];
  proposals: Proposal[];
  operation: Operation;
  settings: AgentSettings;
  conversations: Conversation[];
  messages: ConversationMessage[];
  runtimeJobs: RuntimeJob[];
  followups: FollowupExecution[];
  handoffs?: import("../../shared/model").HumanHandoff[];
  integrations: IntegrationStatus[];
  usage: Usage[];
  audit: Audit[];
  centralExtensions?: boolean;
  tools?: { id: string; name: string; trigger: string }[];
  archives?: {
    id: string;
    createdAt: string;
    count: number;
    restoredAt?: string;
  }[];
};
type Tab =
  "overview" | "contacts" | "agents" | "lab" | "settings" | "resources";
function hashTab(): Tab {
  const h = location.hash.slice(1);
  if (["catalog", "proposals", "approvals", "rules"].includes(h))
    return "resources";
  if (h === "agent") return "agents";
  return [
    "overview",
    "contacts",
    "agents",
    "lab",
    "settings",
    "resources",
  ].includes(h)
    ? (h as Tab)
    : "overview";
}
const names: Record<Tab, string> = {
  overview: "Visão geral",
  contacts: "Conversas",
  agents: "Agente",
  lab: "Laboratório",
  settings: "Configurações",
  resources: "Comercial",
};
const icons = {
  overview: Activity,
  contacts: MessagesSquare,
  agents: Bot,
  lab: FlaskConical,
  settings: Settings,
  resources: Package,
};
async function api<T = unknown>(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await r.json();
  if (!r.ok)
    throw new Error(
      value.error?.replaceAll("_", " ") || "Não foi possível concluir.",
    );
  return value;
}
const fmt = (d: string) =>
  new Date(d).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
function Logo() {
  return (
    <span className="logo-mark">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"tag " + tone}>{children}</span>;
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const prior = document.activeElement as HTMLElement | null,
      old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const nodes = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input,textarea,select,a[href]",
        ) ?? [],
      );
    nodes()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const f = nodes();
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
          e.preventDefault();
          f[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", onKey);
      prior?.isConnected && prior.focus();
    };
  }, []);
  return (
    <div
      className="modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        className="modal proposal-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Fechar diálogo"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function App() {
  const [data, setData] = React.useState<Data>(),
    [tab, setTab] = React.useState<Tab>(hashTab),
    [error, setError] = React.useState(""),
    [busy, setBusy] = React.useState(false),
    [login, setLogin] = React.useState(false),
    [mobile, setMobile] = React.useState(false),
    [narrow, setNarrow] = React.useState(
      matchMedia("(max-width:760px)").matches,
    ),
    [theme, setTheme] = React.useState(
      localStorage.getItem("pulsoo-theme") || "dark",
    );
  const load = React.useCallback(async () => {
    try {
      const s = await api<{ authenticated: boolean }>("/session");
      if (!s.authenticated) {
        setLogin(true);
        return;
      }
      setLogin(false);
      setData(await api<Data>("/bootstrap"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  React.useEffect(() => {
    void load();
    const changed = () => setTab(hashTab());
    addEventListener("hashchange", changed);
    return () => removeEventListener("hashchange", changed);
  }, [load]);
  React.useEffect(() => {
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);
  React.useEffect(() => {
    const media = matchMedia("(max-width:760px)"),
      listener = () => setNarrow(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  React.useEffect(() => {
    document.documentElement.dataset.theme =
      theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    localStorage.setItem("pulsoo-theme", theme);
  }, [theme]);
  React.useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 7000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  const go = (t: Tab) => {
    setTab(t);
    setMobile(false);
    location.hash = t;
  };
  async function act(fn: () => Promise<unknown>, message = "Alteração salva.") {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      await load();
      if (message) setError(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const commercial =
    !!data &&
    (data.operation.modules.catalog || data.operation.modules.proposals);
  React.useEffect(() => {
    if (data && !commercial && tab === "resources") setTab("agents");
  }, [commercial, tab, data]);
  if (login)
    return (
      <div className="login-shell">
        <div className="login-brand">
          <Logo />
          <b>Pulsoo</b>
        </div>
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(() =>
              api("/login", {
                email: f.get("email"),
                password: f.get("password"),
              }),
            );
          }}
        >
          <h1>Seu espaço de operação.</h1>
          <label>
            E-mail
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Entrar <ArrowRight size={16} />
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      </div>
    );
  if (!data)
    return (
      <div className="loading">
        <Logo />
        {error || "Preparando seu espaço…"}
      </div>
    );
  const nav: Tab[] = [
    "overview",
    "contacts",
    "agents",
    ...(commercial ? ["resources" as const] : []),
    "lab",
    "settings",
  ];
  const queue = data.runtimeJobs.filter(
      (j) => j.kind === "followup" && j.state === "pending",
    ),
    blocked = data.runtimeJobs.filter((j) =>
      ["blocked", "unknown"].includes(j.state),
    ),
    waitingHuman = data.conversations.filter(
      (c) => c.status === "paused" && c.handoffId,
    ).length,
    active = data.conversations.filter((c) => c.status === "active").length;
  return (
    <div className="app-shell">
      <aside
        className={"sidebar " + (mobile ? "is-open" : "")}
        inert={narrow && !mobile}
        aria-hidden={narrow && !mobile}
      >
        <a href="#overview" className="brand" onClick={() => go("overview")}>
          <Logo />
          <strong>Pulsoo</strong>
        </a>
        <div className="workspace">
          <span className="workspace-icon">P</span>
          <span>
            <b>{data.demo ? "Operação de exemplo" : "Minha operação"}</b>
            <small>
              <i />
              Qualificação e atendimento
            </small>
          </span>
        </div>
        <nav>
          <div className="nav-group">SUA OPERAÇÃO</div>
          {nav.map((t) => {
            const Icon = icons[t];
            return (
              <button
                key={t}
                className={"nav-item " + (tab === t ? "active" : "")}
                onClick={() => go(t)}
              >
                <Icon size={18} />
                <span>{names[t]}</span>
                {t === "contacts" && queue.length > 0 && <b>{queue.length}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-label">
            <ShieldCheck size={14} />
            Seu espaço. Seus dados.
          </div>
          <button className="profile" onClick={() => go("agents")}>
            <span className="avatar">IA</span>
            <span>
              <b>{data.settings.name}</b>
              <small>
                {data.operation.agentEnabled
                  ? "Atendimento ativado"
                  : "Pronto para configurar"}
              </small>
            </span>
            <span className="dot" />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-scrim"
          onClick={() => setMobile(false)}
          aria-label="Fechar navegação"
        />
      )}
      <main className="main">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">Operação</span>
            <ChevronRight size={13} />
            {names[tab]}
          </div>
          <div className="top-actions">
            <Tag>
              {data.operation.agentEnabled
                ? "Agente ativado"
                : "Agente em configuração"}
            </Tag>
            <button
              className="icon-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Alternar tema"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        {data.demo && (
          <div className="demo-banner">
            <Info size={14} />
            Demonstração local · exemplos fictícios · sem mensagens ou tarefas
            externas.
          </div>
        )}
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                PULSOO /{" "}
                {data.operation.modules.proposals
                  ? "ATENDIMENTO E OPERAÇÃO"
                  : "CONVERSAS COM PRÓXIMO PASSO"}
              </div>
              <h1>{names[tab]}</h1>
              <p>
                {
                  {
                    overview:
                      "O essencial para acompanhar o atendimento e as retomadas.",
                    contacts:
                      "Contexto, mensagens e follow-ups no mesmo lugar.",
                    agents:
                      "Um agente principal, especialistas quando necessário.",
                    lab: "Teste atendimento e follow-up antes de ativar.",
                    settings: "Ative somente o que esta operação precisa.",
                    resources:
                      "Catálogo e propostas disponíveis para esta operação.",
                  }[tab]
                }
              </p>
            </div>
            {tab === "overview" && (
              <button onClick={() => go("lab")}>
                <FlaskConical size={16} />
                Testar o agente
              </button>
            )}
          </div>
          {tab === "overview" && (
            <>
              <div className="stat-grid">
                <Stat
                  title="Conversas ativas"
                  value={active}
                  detail={data.contacts.length + " contatos no espaço"}
                  icon={MessagesSquare}
                />
                <Stat
                  title="Próximos follow-ups"
                  value={queue.length}
                  detail="Agendados dentro do Pulsoo"
                  icon={Clock}
                />
                <Stat
                  title="Retomadas realizadas"
                  value={data.followups.length}
                  detail={
                    data.demo
                      ? "Envios simulados"
                      : "Envios confirmados pela Central"
                  }
                  icon={Send}
                />
                <Stat
                  title="Precisam de atenção"
                  value={blocked.length + waitingHuman}
                  detail="Encaminhamentos, bloqueios e conciliações"
                  icon={ShieldCheck}
                />
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Follow-up com contexto</h2>
                      <p>
                        O Pulsoo organiza a cadência. A Central recebe o
                        realizado.
                      </p>
                    </div>
                    <Tag tone="coral">QUALIFICAÇÃO</Tag>
                  </div>
                  <div className="flow-track">
                    {[
                      { name: "Conversa em aberto", icon: MessagesSquare },
                      { name: "Tempo sem resposta", icon: Clock },
                      { name: "Retomada pela IA", icon: Bot },
                      { name: "Registro concluído", icon: CheckCheck },
                    ].map((s, i) => (
                      <React.Fragment key={s.name}>
                        <div className={"flow-step step-" + i}>
                          <span>
                            <s.icon size={20} />
                          </span>
                          <small>{s.name}</small>
                        </div>
                        {i < 3 && (
                          <span className="flow-connector">
                            <ArrowRight size={14} />
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="panel-foot">
                    <ShieldCheck size={15} />
                    Resposta do lead, pausa humana e encerramento interrompem a
                    cadência.
                  </div>
                </section>
                <section className="panel next-panel">
                  <span className="coral-icon">
                    <Bot size={22} />
                  </span>
                  <h2>Configure para a sua operação.</h2>
                  <p>
                    Qualificação já é um fluxo completo. Catálogo, propostas e
                    agenda entram quando fizerem sentido.
                  </p>
                  <button onClick={() => go("agents")}>
                    Ajustar agente e follow-up <ArrowUpRight size={16} />
                  </button>
                </section>
              </div>
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Cadência da operação</h2>
                    <p>Próximos envios e registros recentes.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => go("contacts")}
                  >
                    Ver conversas <ArrowRight size={14} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contato</th>
                        <th>Momento</th>
                        <th>Etapa</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.slice(0, 5).map((j) => (
                        <tr key={j.id}>
                          <td>
                            {data.contacts.find((c) => c.id === j.contactId)
                              ?.name || "Contato"}
                          </td>
                          <td>{fmt(j.dueAt)}</td>
                          <td>Follow-up {j.step + 1}</td>
                          <td>
                            <Tag tone="amber">Aguardando no Pulsoo</Tag>
                          </td>
                        </tr>
                      ))}
                      {data.followups
                        .slice(-4)
                        .reverse()
                        .map((f) => (
                          <tr key={f.id}>
                            <td>
                              {data.contacts.find((c) => c.id === f.contactId)
                                ?.name || "Contato"}
                            </td>
                            <td>{fmt(f.sentAt)}</td>
                            <td>Follow-up {f.step + 1}</td>
                            <td>
                              <Tag
                                tone={
                                  f.taskState === "blocked" ? "amber" : "green"
                                }
                              >
                                {f.simulated
                                  ? "Simulado"
                                  : f.taskState === "done"
                                    ? "Concluído na Central"
                                    : "Registro " +
                                      (f.taskState === "blocked"
                                        ? "bloqueado"
                                        : "pendente")}
                              </Tag>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!queue.length && !data.followups.length && (
                    <Empty
                      title="A próxima retomada aparece aqui."
                      text="Após uma resposta confirmada do agente, a cadência acompanha o silêncio do lead."
                    />
                  )}
                </div>
              </section>
              {blocked.length > 0 && (
                <details className="panel disclosure">
                  <summary>{blocked.length} ações precisam de atenção</summary>
                  <div className="form-body">
                    {blocked.slice(-8).map((j) => (
                      <p key={j.id}>
                        {data.contacts.find((c) => c.id === j.contactId)
                          ?.name || "Contato"}{" "}
                        · {j.lastError?.replaceAll("_", " ")}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
          {tab === "contacts" && (
            <Conversations data={data} act={act} busy={busy} />
          )}
          {tab === "agents" && (
            <AgentEditor data={data} act={act} busy={busy} />
          )}
          {tab === "lab" && <Lab demo={data.demo} refresh={load} />}
          {tab === "resources" && commercial && (
            <Resources data={data} act={act} busy={busy} />
          )}
          {tab === "settings" && (
            <>
              <Modules data={data} act={act} busy={busy} />
              <TestHistory data={data} act={act} busy={busy} />
              <section className="panel disclosure">
                <details>
                  <summary>Aparência</summary>
                  <div className="form-body">
                    <label>
                      Tema
                      <select
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                      >
                        <option value="dark">Escuro</option>
                        <option value="light">Claro</option>
                        <option value="system">Sistema</option>
                      </select>
                    </label>
                  </div>
                </details>
              </section>
              <section className="panel disclosure">
                <details>
                  <summary>Conexões e ferramentas</summary>
                  <div className="form-body integration-settings">
                    {data.integrations
                      .filter(
                        (i) =>
                          !(
                            [
                              "google-docs",
                              "google-drive",
                              "google-sheets",
                            ].includes(i.id) &&
                            !data.operation.modules.proposals
                          ) &&
                          !(
                            ["calendar", "calcom"].includes(i.id) &&
                            !data.operation.modules.calendar
                          ),
                      )
                      .map((i) => (
                        <div className="connection-row" key={i.id}>
                          <span>
                            <b>{i.name}</b>
                            <small>{i.description}</small>
                          </span>
                          <Tag>
                            {i.status === "configured"
                              ? "Credencial configurada"
                              : "A configurar"}
                          </Tag>
                        </div>
                      ))}
                    <p className="muted">
                      Chaves e endereço da Central ficam somente no servidor.
                      Presença de credencial não significa homologação.
                    </p>
                  </div>
                </details>
              </section>
              <section className="panel disclosure">
                <details>
                  <summary>Consumo e atividade</summary>
                  <div className="form-body">
                    <p>
                      {data.usage.length} execuções registradas ·{" "}
                      {data.usage.reduce(
                        (n, u) => n + u.inputTokens + u.outputTokens,
                        0,
                      )}{" "}
                      tokens informados.
                    </p>
                    <p className="muted">
                      Simulação separada de chamadas pagas. Tarifas e
                      conciliação de fatura ainda não configuradas.
                    </p>
                    {data.audit
                      .slice(-8)
                      .reverse()
                      .map((a) => (
                        <p key={a.id}>
                          {a.action.replaceAll("_", " ")} · {fmt(a.createdAt)}
                        </p>
                      ))}
                  </div>
                </details>
              </section>
            </>
          )}
          <footer className="footer">
            <span>Pulsoo / sua operação, em movimento.</span>
            <span>Base em evolução · v0.3</span>
          </footer>
        </div>
      </main>
      {error && (
        <div className="toast" role="status">
          <Info size={16} />
          {error}
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Fechar aviso"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
type Act = (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
function Stat({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <section className="stat-card">
      <div>
        {title}
        <Icon size={17} />
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <small>{detail}</small>
    </section>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span>
        <MessagesSquare size={22} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function operationBody(op: Operation) {
  const { id, createdAt, revision, ...body } = op;
  return body;
}
function Modules({ data, act, busy }: { data: Data; act: Act; busy: boolean }) {
  const [modules, setModules] = React.useState(data.operation.modules);
  const toggle = (key: keyof typeof modules, value: boolean) =>
    setModules((m) => ({
      ...m,
      [key]: value,
      ...(key === "proposals" && value ? { catalog: true } : {}),
      ...(key === "catalog" && !value ? { proposals: false } : {}),
    }));
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Módulos da operação</h2>
          <p>Ative o que o agente realmente vai usar.</p>
        </div>
        <Workflow size={20} />
      </div>
      <div className="form-body module-list">
        {(
          [
            {
              id: "catalog",
              name: "Catálogo",
              text: "Serviços, produtos e valores aprovados.",
            },
            {
              id: "proposals",
              name: "Propostas",
              text: "Modelos, revisão e aprovação. Usa o catálogo.",
            },
            {
              id: "calendar",
              name: "Agenda",
              text: "Preferências de horário. Reservas ainda indisponíveis.",
            },
          ] as const
        ).map((m) => (
          <label className="module-toggle" key={m.id}>
            <span>
              <b>{m.name}</b>
              <small>{m.text}</small>
            </span>
            <input
              aria-label={"Ativar " + m.name}
              type="checkbox"
              checked={modules[m.id]}
              onChange={(e) => toggle(m.id, e.target.checked)}
            />
          </label>
        ))}
      </div>
      <div className="panel-foot split">
        <span>O histórico é preservado ao desativar um módulo.</span>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            void act(() =>
              api(
                "/operation",
                { ...operationBody(data.operation), modules },
                "PUT",
              ),
            )
          }
        >
          Salvar módulos
        </button>
      </div>
    </section>
  );
}
function AgentEditor({
  data,
  act,
  busy,
}: {
  data: Data;
  act: Act;
  busy: boolean;
}) {
  const [section, setSection] = React.useState("main"),
    [op, setOp] = React.useState(data.operation);
  React.useEffect(() => setOp(data.operation), [data.operation.revision]);
  const save = () => act(() => api("/operation", operationBody(op), "PUT"));
  const available = op.specialists.filter(
    (s) =>
      s.id === "qualification" ||
      s.id === "knowledge" ||
      (s.id === "catalog" && op.modules.catalog) ||
      (s.id === "calendar" && op.modules.calendar) ||
      (s.id === "proposals" && op.modules.proposals),
  );
  const labels: Record<string, string> = {
    qualification: "Qualificação",
    knowledge: "Contexto e conhecimento",
    catalog: "Catálogo",
    calendar: "Agenda",
    proposals: "Propostas",
  };
  return (
    <>
      <div className="section-tabs">
        <button
          className={section === "main" ? "selected" : ""}
          onClick={() => setSection("main")}
        >
          Atendimento
        </button>
        <button
          className={section === "specialists" ? "selected" : ""}
          onClick={() => setSection("specialists")}
        >
          Especialistas
        </button>
        <button
          className={section === "workflow" ? "selected" : ""}
          onClick={() => setSection("workflow")}
        >
          Fluxo e ferramentas
        </button>
        <button
          className={section === "followup" ? "selected" : ""}
          onClick={() => setSection("followup")}
        >
          Follow-up
        </button>
      </div>
      {section === "main" && (
        <>
          <section className="panel">
            <div className="form-body">
              <label className="module-toggle">
                <span>
                  <b>Modo de teste restrito</b>
                  <small>
                    Somente os números abaixo podem receber respostas
                    automáticas. Lista vazia bloqueia todos.
                  </small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Restringir atendimento a contatos de teste"
                  checked={!!op.testMode?.enabled}
                  onChange={(e) =>
                    setOp({
                      ...op,
                      testMode: {
                        enabled: e.target.checked,
                        phones: op.testMode?.phones ?? [],
                      },
                    })
                  }
                />
              </label>
              <label>
                Números de teste (DDI e DDD, separados por vírgula)
                <input
                  aria-label="Números de teste"
                  value={(op.testMode?.phones ?? []).join(", ")}
                  onChange={(e) =>
                    setOp({
                      ...op,
                      testMode: {
                        enabled: !!op.testMode?.enabled,
                        phones: e.target.value
                          .split(",")
                          .map((p) => p.replace(/\D/g, ""))
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </label>
              {op.testMode?.enabled && (
                <p className="muted">
                  Teste restrito ativo: os demais contatos ficam sem resposta e
                  sem follow-up automático.
                </p>
              )}
              <label className="module-toggle">
                <span>
                  <b>Encaminhamento humano</b>
                  <small>
                    O principal pode solicitar a equipe. A automação pausa até
                    retomada manual no Pulsoo.
                  </small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Permitir encaminhamento humano"
                  checked={!!op.handoff?.enabled}
                  onChange={(e) =>
                    setOp({
                      ...op,
                      handoff: {
                        enabled: e.target.checked,
                        onImage: op.handoff?.onImage ?? false,
                        recordNote: op.handoff?.recordNote ?? false,
                      },
                    })
                  }
                />
              </label>
              {op.handoff?.enabled && (
                <>
                  {!op.workflow?.enabled && (
                    <label className="module-toggle">
                      <span>
                        <b>Pausar ao receber fotos</b>
                        <small>
                          Fotos ficam para avaliação humana; a IA não analisa
                          imagens nem confirma segurança.
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        aria-label="Encaminhar fotos para humano"
                        checked={op.handoff.onImage}
                        onChange={(e) =>
                          setOp({
                            ...op,
                            handoff: {
                              ...op.handoff!,
                              onImage: e.target.checked,
                            },
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="module-toggle">
                    <span>
                      <b>Registrar resumo na Central</b>
                      <small>
                        Acrescenta nota sem apagar a equipe. Exige o escopo
                        notas:escrever. Não envia aviso para grupo.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      aria-label="Registrar encaminhamento nas notas da Central"
                      checked={op.handoff.recordNote}
                      onChange={(e) =>
                        setOp({
                          ...op,
                          handoff: {
                            ...op.handoff!,
                            recordNote: e.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                </>
              )}
              <label className="module-toggle">
                <span>
                  <b>Atendimento automático</b>
                  <small>
                    Permite respostas e cadência nas conversas autorizadas.
                  </small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Ativar atendimento automático"
                  checked={op.agentEnabled}
                  onChange={(e) =>
                    setOp({ ...op, agentEnabled: e.target.checked })
                  }
                />
              </label>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void save()}
              >
                Salvar ativação
              </button>
            </div>
          </section>
          <form
            className="panel settings-form spaced"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api(
                  "/settings",
                  {
                    ...data.settings,
                    id: undefined,
                    createdAt: undefined,
                    name: f.get("name"),
                    tone: f.get("tone"),
                    instructions: f.get("instructions"),
                  },
                  "PUT",
                ),
              );
            }}
          >
            <div className="panel-header">
              <h2>Agente principal</h2>
              <Bot size={22} />
            </div>
            <div className="form-body">
              <label>
                Nome
                <input name="name" defaultValue={data.settings.name} required />
              </label>
              <label>
                Tom da conversa
                <input name="tone" defaultValue={data.settings.tone} required />
              </label>
              <label>
                Instruções
                <textarea
                  name="instructions"
                  rows={6}
                  defaultValue={data.settings.instructions}
                />
              </label>
              <p className="muted">
                Só o agente principal responde ao lead. Especialistas devolvem
                consultas e achados.
              </p>
            </div>
            <div className="panel-foot">
              <button className="primary" disabled={busy}>
                Salvar comportamento
              </button>
            </div>
          </form>
          <RhythmEditor
            settings={data.settings}
            typingSupported={!!data.centralExtensions}
            save={(value) => {
              const { id, createdAt, ...body } = value;
              return act(() => api("/settings", body, "PUT"));
            }}
          />
        </>
      )}
      {section === "workflow" && (
        <WorkflowEditor
          operation={data.operation}
          tools={data.tools ?? []}
          centralExtensions={!!data.centralExtensions}
          save={(value) =>
            act(() => api("/operation", operationBody(value), "PUT"))
          }
        />
      )}
      {section === "specialists" && (
        <>
          <div className="info-box">
            <Bot size={18} />
            <p>
              Especialistas têm contexto e instruções próprios. São acionados
              por necessidade e não enviam mensagens nem executam alterações por
              conta própria.
            </p>
          </div>
          <div className="specialist-grid">
            {available.map((s) => (
              <section className="panel" key={s.id}>
                <div className="panel-header">
                  <h2>{labels[s.id]}</h2>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      aria-label={"Ativar especialista " + labels[s.id]}
                      checked={s.enabled}
                      onChange={(e) =>
                        setOp({
                          ...op,
                          specialists: op.specialists.map((x) =>
                            x.id === s.id
                              ? { ...x, enabled: e.target.checked }
                              : x,
                          ),
                        })
                      }
                    />
                    Ativo
                  </label>
                </div>
                <div className="form-body">
                  <label>
                    Instruções
                    <textarea
                      rows={4}
                      value={s.instructions}
                      onChange={(e) =>
                        setOp({
                          ...op,
                          specialists: op.specialists.map((x) =>
                            x.id === s.id
                              ? { ...x, instructions: e.target.value }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Modelo OpenAI opcional
                    <input
                      value={s.model}
                      placeholder="Herdar modelo do servidor"
                      onChange={(e) =>
                        setOp({
                          ...op,
                          specialists: op.specialists.map((x) =>
                            x.id === s.id ? { ...x, model: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <small className="muted">
                    Uma delegação real pode gerar consumo adicional.
                  </small>
                </div>
              </section>
            ))}
          </div>
          <button
            className="primary spaced"
            disabled={busy}
            onClick={() => void save()}
          >
            Salvar especialistas
          </button>
        </>
      )}
      {section === "followup" && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Retomar sem perder o contexto</h2>
              <p>
                Mesmo uma operação só de qualificação pode acompanhar o
                silêncio.
              </p>
            </div>
            <Clock size={22} />
          </div>
          <div className="form-body">
            <label className="module-toggle">
              <span>
                <b>Follow-up da operação</b>
                <small>
                  Após um envio confirmado do agente, a cadência começa a
                  contar.
                </small>
              </span>
              <input
                type="checkbox"
                aria-label="Ativar follow-up"
                checked={op.followup.enabled}
                onChange={(e) =>
                  setOp({
                    ...op,
                    followup: { ...op.followup, enabled: e.target.checked },
                  })
                }
              />
            </label>
            {op.followup.steps.map((s, i) => (
              <div className="follow-step-editor" key={i}>
                <span className="step-number">{i + 1}</span>
                <div>
                  <label>
                    Espera após o último envio (minutos)
                    <input
                      type="number"
                      min="1"
                      max="43200"
                      value={s.delayMinutes}
                      onChange={(e) =>
                        setOp({
                          ...op,
                          followup: {
                            ...op.followup,
                            steps: op.followup.steps.map((x, n) =>
                              n === i
                                ? { ...x, delayMinutes: Number(e.target.value) }
                                : x,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Objetivo da retomada
                    <textarea
                      rows={2}
                      value={s.instruction}
                      onChange={(e) =>
                        setOp({
                          ...op,
                          followup: {
                            ...op.followup,
                            steps: op.followup.steps.map((x, n) =>
                              n === i
                                ? { ...x, instruction: e.target.value }
                                : x,
                            ),
                          },
                        })
                      }
                    />
                  </label>
                </div>
                {op.followup.steps.length > 1 && (
                  <button
                    className="icon-button"
                    onClick={() =>
                      setOp({
                        ...op,
                        followup: {
                          ...op.followup,
                          steps: op.followup.steps.filter((_, n) => n !== i),
                        },
                      })
                    }
                    aria-label={"Remover etapa " + (i + 1)}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {op.followup.steps.length < 5 && (
              <button
                onClick={() =>
                  setOp({
                    ...op,
                    followup: {
                      ...op.followup,
                      steps: [
                        ...op.followup.steps,
                        {
                          delayMinutes: 1440,
                          instruction:
                            "Verifique se faz sentido continuar e encerre sem pressão.",
                        },
                      ],
                    },
                  })
                }
              >
                <Plus size={16} />
                Adicionar etapa
              </button>
            )}
            <div className="two-columns">
              <label>
                Início
                <input
                  type="time"
                  value={op.followup.start}
                  onChange={(e) =>
                    setOp({
                      ...op,
                      followup: { ...op.followup, start: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Fim
                <input
                  type="time"
                  value={op.followup.end}
                  onChange={(e) =>
                    setOp({
                      ...op,
                      followup: { ...op.followup, end: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Fuso
                <input
                  value={op.followup.timeZone}
                  onChange={(e) =>
                    setOp({
                      ...op,
                      followup: { ...op.followup, timeZone: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Máximo por conversa/dia
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={op.followup.maxPerDay}
                  onChange={(e) =>
                    setOp({
                      ...op,
                      followup: {
                        ...op.followup,
                        maxPerDay: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="weekday-row">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d, i) => (
                <label className="check-label" key={d}>
                  <input
                    type="checkbox"
                    checked={op.followup.weekdays.includes(i + 1)}
                    onChange={(e) =>
                      setOp({
                        ...op,
                        followup: {
                          ...op.followup,
                          weekdays: e.target.checked
                            ? [...op.followup.weekdays, i + 1]
                            : op.followup.weekdays.filter((n) => n !== i + 1),
                        },
                      })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
            <label>
              Etapas que encerram a cadência
              <input
                value={op.followup.terminalStages.join(", ")}
                onChange={(e) =>
                  setOp({
                    ...op,
                    followup: {
                      ...op.followup,
                      terminalStages: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
            <div className="info-box">
              <CheckCheck size={18} />
              <p>
                A espera fica no Pulsoo. Só depois da confirmação do envio a
                Central recebe uma tarefa concluída, com a data e a hora reais.
                Falha no registro não repete a mensagem.
              </p>
            </div>
            <small className="muted">
              Pausa humana, resposta, encerramento e pedido para parar cancelam
              pendências. No canal oficial, envios fora da janela dependem de
              template homologado.
            </small>
          </div>
          <div className="panel-foot split">
            <span>
              Alterar a configuração cancela a cadência antiga; novos turnos
              usam a versão salva.
            </span>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              Salvar follow-up
            </button>
          </div>
        </section>
      )}
    </>
  );
}
function Conversations({
  data,
  act,
  busy,
}: {
  data: Data;
  act: Act;
  busy: boolean;
}) {
  const [selected, setSelected] = React.useState<Contact>();
  const cv = selected
    ? data.conversations.find((c) => c.id === selected.conversationId) ||
      data.conversations.find((c) => c.contactId === selected.id)
    : undefined;
  return (
    <>
      <div className="contact-grid">
        {data.contacts.map((c) => (
          <button
            className="contact-card panel"
            key={c.id}
            onClick={() => setSelected(c)}
          >
            <span className="avatar">{c.name.slice(0, 2).toUpperCase()}</span>
            <h3>{c.name}</h3>
            <Tag>{c.stage}</Tag>
            {data.conversations.some(
              (cv) =>
                cv.contactId === c.id && cv.handoffId && cv.status === "paused",
            ) && <Tag tone="amber">Aguardando humano</Tag>}
            <p>{c.notes || "Contexto ainda não registrado."}</p>
            <div>
              Abrir conversa <ArrowUpRight size={16} />
            </div>
          </button>
        ))}
      </div>
      {!data.contacts.length && (
        <Empty
          title="As conversas começam aqui."
          text="Os eventos autorizados da Central trazem o contato e o contexto para o Pulsoo."
        />
      )}
      {selected && (
        <Dialog title={selected.name} close={() => setSelected(undefined)}>
          <div className="form-body">
            {cv && (
              <>
                <div className="conversation-state">
                  <Tag>
                    {
                      {
                        active: "Em atendimento",
                        paused: "Pausada",
                        closed: "Encerrada",
                        opted_out: "Solicitou parada",
                      }[cv.status]
                    }
                  </Tag>
                  <span className="muted">
                    {cv.deliveryUnknown ? "Entrega a conciliar" : ""}
                  </span>
                </div>
                {cv.handoffId &&
                  (() => {
                    const h = data.handoffs?.find((h) => h.id === cv.handoffId);
                    return (
                      <div className="panel form-body">
                        <h3>Aguardando atendimento humano</h3>
                        <p>{h?.reason}</p>
                        <p style={{ whiteSpace: "pre-wrap" }}>{h?.summary}</p>
                        <small>
                          {h?.noteState === "done"
                            ? "Resumo registrado na Central."
                            : h?.noteState === "blocked"
                              ? "Nota não confirmada na Central; verifique a chave e o escopo notas:escrever."
                              : h?.noteState === "pending"
                                ? "Registro da nota pendente."
                                : "Encaminhamento registrado neste painel."}{" "}
                          A automação permanece pausada.
                        </small>
                      </div>
                    );
                  })()}
                <div className="conversation-history">
                  {data.messages
                    .filter((m) => m.conversationId === cv.id)
                    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
                    .map((m) => (
                      <div className={"message " + m.role} key={m.id}>
                        <small>
                          {m.role === "user"
                            ? "LEAD"
                            : m.source === "followup"
                              ? "FOLLOW-UP"
                              : "AGENTE"}
                          {m.simulated ? " · SIMULADO" : ""}
                        </small>
                        <p>{m.text}</p>
                        <small>{fmt(m.occurredAt)}</small>
                      </div>
                    ))}
                </div>
                {data.runtimeJobs.some(
                  (j) =>
                    j.conversationId === cv.id &&
                    [
                      "record_stage",
                      "record_handoff",
                      "notify_human",
                      "record_transfer",
                      "record_transfer",
                    ].includes(j.kind),
                ) && (
                  <section className="panel form-body">
                    <h3>Ferramentas e ações</h3>
                    {data.runtimeJobs
                      .filter(
                        (j) =>
                          j.conversationId === cv.id &&
                          [
                            "record_stage",
                            "record_handoff",
                            "notify_human",
                            "record_transfer",
                          ].includes(j.kind),
                      )
                      .slice(-8)
                      .map((j) => (
                        <p key={j.id}>
                          <b>
                            {j.kind === "record_stage"
                              ? "Mover etapa"
                              : j.kind === "record_handoff"
                                ? "Registrar resumo"
                                : j.kind === "record_transfer"
                                  ? "Transferir conversa"
                                  : "Avisar equipe"}
                          </b>{" "}
                          ·{" "}
                          {j.state === "done"
                            ? "Confirmada"
                            : j.state === "pending" || j.state === "running"
                              ? "Pendente"
                              : j.state === "unknown"
                                ? "Resultado incerto; conferir antes de repetir"
                                : "Bloqueada"}
                          {j.lastError
                            ? " · " + j.lastError.replaceAll("_", " ")
                            : ""}
                        </p>
                      ))}
                  </section>
                )}
                <div className="conversation-controls">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        api("/conversations/" + cv.id + "/control", {
                          status: cv.status === "paused" ? "active" : "paused",
                        }),
                      )
                    }
                  >
                    {cv.status === "paused" ? (
                      <Play size={14} />
                    ) : (
                      <Pause size={14} />
                    )}{" "}
                    {cv.status === "paused" ? "Retomar" : "Pausar"}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        api("/conversations/" + cv.id + "/control", {
                          status: "closed",
                        }),
                      )
                    }
                  >
                    <Check size={14} />
                    Encerrar qualificação
                  </button>
                </div>
              </>
            )}
            <details>
              <summary>Contexto e notas</summary>
              <form
                className="context-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(() =>
                    api(
                      "/contacts/" + selected.id,
                      {
                        name: selected.name,
                        company: selected.company,
                        phone: selected.phone,
                        stage: selected.stage,
                        notes: new FormData(e.currentTarget).get("notes"),
                        opportunityId: new FormData(e.currentTarget).get(
                          "opportunityId",
                        ),
                      },
                      "PUT",
                    ),
                  );
                }}
              >
                <label>
                  ID da oportunidade na Central (opcional)
                  <input
                    name="opportunityId"
                    defaultValue={selected.opportunityId ?? ""}
                  />
                </label>
                <label>
                  Notas internas
                  <textarea
                    name="notes"
                    rows={4}
                    defaultValue={selected.notes}
                  />
                </label>
                <button disabled={busy}>Salvar contexto</button>
              </form>
            </details>
            <h3>Follow-ups realizados</h3>
            {data.followups
              .filter((f) => f.contactId === selected.id)
              .map((f) => (
                <div className="completed-followup" key={f.id}>
                  <CheckCheck size={16} />
                  <div>
                    <b>
                      Etapa {f.step + 1} · {fmt(f.sentAt)}
                    </b>
                    <p>{f.text}</p>
                    <small>
                      {f.simulated
                        ? "Simulado; nenhuma tarefa externa."
                        : f.taskState === "done"
                          ? "Tarefa concluída na Central."
                          : "Registro " +
                            f.taskState +
                            (f.lastError
                              ? " · " + f.lastError.replaceAll("_", " ")
                              : "")}
                    </small>
                  </div>
                </div>
              ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
function Lab({
  demo,
  refresh,
}: {
  demo: boolean;
  refresh: () => Promise<void>;
}) {
  const [messages, setMessages] = React.useState<
      { role: "user" | "assistant"; content: string; parts?: string[] }[]
    >([]),
    [text, setText] = React.useState(""),
    [mode, setMode] = React.useState("simulation"),
    [kind, setKind] = React.useState("reply"),
    [photo, setPhoto] = React.useState(false),
    [summaryPreview, setSummaryPreview] = React.useState(""),
    [waiting, setWaiting] = React.useState(false),
    [trace, setTrace] = React.useState<{ name: string; detail: string }[]>([]),
    [error, setError] = React.useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (waiting || !text.trim()) return;
    const next = [...messages, { role: "user" as const, content: text }].slice(
      -18,
    );
    setMessages(next);
    setText("");
    setWaiting(true);
    setError("");
    try {
      const r = await api<{
        text: string | null;
        reason: string;
        parts: string[];
        trace: typeof trace;
        summaryPreview?: string;
      }>("/lab/chat", {
        messages: next.map(({ role, content }) => ({ role, content })),
        mode,
        kind,
        photoCount: photo ? 1 : 0,
      });
      setTrace(r.trace);
      setSummaryPreview(r.summaryPreview ?? "");
      if (r.text)
        setMessages([
          ...next,
          { role: "assistant", content: r.text, parts: r.parts },
        ]);
      else setError("O agente decidiu não enviar: " + r.reason);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWaiting(false);
    }
  }
  return (
    <div className="lab-grid">
      <section className="panel chat-panel">
        <div className="panel-header">
          <div>
            <h2>
              {kind === "reply" ? "Atendimento de teste" : "Retomada de teste"}
            </h2>
            <p>
              {mode === "simulation"
                ? "Simulação sem chamadas externas"
                : "OpenAI real; pode gerar consumo"}
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setMessages([]);
              setTrace([]);
              setSummaryPreview("");
              setPhoto(false);
            }}
          >
            Nova sessão
          </button>
        </div>
        <div className="chat-scroll">
          {!messages.length && (
            <Empty
              title="Converse como um lead."
              text="Teste qualificação e veja quando o agente consulta especialistas. Para follow-up, descreva a última resposta ou dúvida do lead."
            />
          )}
          {messages.flatMap((m, i) =>
            (m.parts?.length ? m.parts : [m.content]).map((part, n) => (
              <div className={"message " + m.role} key={i + ":" + n}>
                <small>
                  {m.role === "assistant" ? "AGENTE PRINCIPAL" : "LEAD"}
                </small>
                <p>{part}</p>
              </div>
            )),
          )}
          {waiting && <p className="muted">Preparando uma resposta…</p>}
        </div>
        {error && <div className="inline-error">{error}</div>}
        <form className="composer" onSubmit={send}>
          <input
            aria-label="Mensagem de teste"
            placeholder="Escreva para testar…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
          />
          <button
            className="primary"
            disabled={waiting || !text.trim()}
            aria-label="Enviar teste"
          >
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="chat-footer">
          <ShieldCheck size={12} />O laboratório não envia mensagens nem cria
          tarefas externas.
        </div>
      </section>
      <aside className="lab-side">
        <section className="panel">
          <div className="panel-header">
            <h2>O que você quer avaliar?</h2>
          </div>
          <div className="form-body">
            <label>
              Cenário
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="reply">Atendimento</option>
                <option value="followup">Follow-up de qualificação</option>
              </select>
            </label>
            <label>
              Execução
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="simulation">Simulação local</option>
                <option value="live" disabled={demo}>
                  OpenAI real
                </option>
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={photo}
                onChange={(e) => setPhoto(e.target.checked)}
              />
              Simular foto recebida (sem analisar imagem)
            </label>
            {mode === "simulation" && (
              <p className="muted">
                Simulação técnica da entrega. Para avaliar o roteiro e a escolha
                de ferramentas, use IA real.
              </p>
            )}
            {demo && (
              <>
                <button
                  disabled={waiting}
                  onClick={async () => {
                    try {
                      setError("");
                      await api("/demo/followup", {});
                      await refresh();
                      setError(
                        "Cenário criado. Confira a fila na Visão geral; ela respeita os horários configurados.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Clock size={16} />
                  Criar cenário na fila local
                </button>
                <small className="muted">
                  Cria um contato fictício. O worker simula o envio e preserva o
                  registro local.
                </small>
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Ferramentas e decisões</h2>
            <Bot size={18} />
          </div>
          <div className="form-body">
            {trace.length ? (
              trace.map((t, i) => (
                <div className="trace" key={i}>
                  <span>{t.name}</span>
                  <p>{t.detail}</p>
                </div>
              ))
            ) : (
              <p className="muted">As ferramentas e consultas aparecem aqui.</p>
            )}
          </div>
        </section>
        {summaryPreview && (
          <section className="panel">
            <div className="panel-header">
              <h2>Prévia do resumo</h2>
            </div>
            <div className="form-body">
              <p style={{ whiteSpace: "pre-wrap" }}>{summaryPreview}</p>
              <small>Nenhuma nota ou aviso externo foi criado.</small>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

function Resources({
  data,
  act,
  busy,
}: {
  data: Data;
  act: Act;
  busy: boolean;
}) {
  const [section, setSection] = React.useState(
      location.hash === "#approvals" || location.hash === "#proposals"
        ? "proposals"
        : "catalog",
    ),
    [product, setProduct] = React.useState<Product | null>(),
    [proposal, setProposal] = React.useState<Proposal>(),
    [create, setCreate] = React.useState(false),
    [template, setTemplate] = React.useState(false);
  const statuses: Record<string, string> = {
    draft: "Rascunho",
    pending: "Aguardando aprovação",
    queued: "Na fila",
    approved: "Aprovada",
    rejected: "Rejeitada",
    simulated: "Envio simulado",
    sent: "Enviada",
    blocked: "Bloqueada",
    delivery_unknown: "Entrega a conciliar",
  };
  return (
    <>
      <div className="section-tabs">
        {data.operation.modules.catalog && (
          <button
            className={section === "catalog" ? "selected" : ""}
            onClick={() => setSection("catalog")}
          >
            Catálogo
          </button>
        )}
        {data.operation.modules.proposals && (
          <button
            className={section === "proposals" ? "selected" : ""}
            onClick={() => setSection("proposals")}
          >
            Propostas{" "}
            <span>
              {data.proposals.filter((p) => p.status === "pending").length} em
              aprovação
            </span>
          </button>
        )}
      </div>
      {section === "catalog" && data.operation.modules.catalog && (
        <>
          <button className="primary" onClick={() => setProduct(null)}>
            <Plus size={15} />
            Novo serviço
          </button>
          <div className="catalog-grid spaced">
            {data.products.map((p) => (
              <section className="panel product-card" key={p.id}>
                <div className="product-top">
                  <span className="product-icon">
                    <Package size={20} />
                  </span>
                  <Tag>{p.category}</Tag>
                </div>
                <h2>{p.name}</h2>
                <p>{p.description}</p>
                <div className="product-price">
                  {money(p.priceCents)}
                  <small>/ {p.unit}</small>
                </div>
                <div className="product-footer">
                  <Tag>{p.active ? "Ativo" : "Arquivado"}</Tag>
                  <button onClick={() => setProduct(p)}>Editar</button>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {section === "proposals" && data.operation.modules.proposals && (
        <>
          <div className="resource-actions">
            <button className="primary" onClick={() => setCreate(true)}>
              <Plus size={15} />
              Nova proposta
            </button>
            <button onClick={() => setTemplate(true)}>Novo modelo</button>
          </div>
          <section className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Contato / proposta</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.proposals.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => setProposal(p)}
                        >
                          {p.contactName}
                          <small>{p.number}</small>
                        </button>
                      </td>
                      <td>{money(p.totalCents)}</td>
                      <td>
                        <Tag
                          tone={p.status === "pending" ? "amber" : "neutral"}
                        >
                          {statuses[p.status]}
                        </Tag>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={"Abrir proposta " + p.number}
                          onClick={() => setProposal(p)}
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <details className="panel disclosure">
            <summary>Gerar proposta ao mudar de etapa</summary>
            <form
              className="form-body"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(() =>
                  api("/rules", {
                    name: f.get("name"),
                    fromStage: f.get("fromStage"),
                    toStage: f.get("toStage"),
                    templateId: f.get("templateId"),
                    productIds: f.getAll("productIds"),
                    active: true,
                  }),
                );
              }}
            >
              <label>
                Nome da regra
                <input name="name" required />
              </label>
              <div className="two-columns">
                <label>
                  ID da etapa de origem
                  <input name="fromStage" required />
                </label>
                <label>
                  ID da etapa de destino
                  <input name="toStage" required />
                </label>
              </div>
              <label>
                Modelo
                <select name="templateId">
                  {data.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {data.products
                .filter((p) => p.active)
                .map((p) => (
                  <label className="check-label" key={p.id}>
                    <input name="productIds" type="checkbox" value={p.id} />
                    {p.name}
                  </label>
                ))}
              <p className="muted">
                A regra prepara o documento; aprovação humana obrigatória antes
                do envio.
              </p>
              <button disabled={busy}>Salvar regra</button>
            </form>
          </details>
        </>
      )}
      {product !== undefined && (
        <Dialog
          title={product ? "Editar serviço" : "Novo serviço"}
          close={() => setProduct(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api(
                  "/products" + (product ? "/" + product.id : ""),
                  {
                    name: f.get("name"),
                    category: f.get("category"),
                    description: f.get("description"),
                    priceCents: Math.round(Number(f.get("price")) * 100),
                    unit: f.get("unit"),
                    active: f.has("active"),
                  },
                  product ? "PUT" : "POST",
                ),
              ).then((ok) => {
                if (ok) setProduct(undefined);
              });
            }}
          >
            <div className="form-body">
              <label>
                Nome
                <input name="name" defaultValue={product?.name} required />
              </label>
              <label>
                Categoria
                <input
                  name="category"
                  defaultValue={product?.category || "Serviços"}
                  required
                />
              </label>
              <label>
                Descrição
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={product?.description}
                />
              </label>
              <div className="two-columns">
                <label>
                  Valor (R$)
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={
                      product ? product.priceCents / 100 : undefined
                    }
                    required
                  />
                </label>
                <label>
                  Unidade
                  <input
                    name="unit"
                    defaultValue={product?.unit || "serviço"}
                    required
                  />
                </label>
              </div>
              <label className="check-label">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={product?.active ?? true}
                />
                Disponível para o agente
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setProduct(undefined)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                Salvar serviço
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {template && (
        <Dialog title="Modelo de proposta" close={() => setTemplate(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api("/templates", {
                  name: f.get("name"),
                  title: f.get("title"),
                  intro: f.get("intro"),
                  terms: f.get("terms"),
                  validDays: Number(f.get("validDays")),
                }),
              ).then((ok) => {
                if (ok) setTemplate(false);
              });
            }}
          >
            <div className="form-body">
              <label>
                Nome interno
                <input name="name" required />
              </label>
              <label>
                Título
                <input name="title" required />
              </label>
              <label>
                Introdução
                <textarea
                  name="intro"
                  rows={4}
                  defaultValue="Olá, {{cliente.nome}}! Preparamos esta proposta para você."
                />
              </label>
              <label>
                Condições
                <textarea name="terms" rows={3} />
              </label>
              <label>
                Validade (dias)
                <input
                  name="validDays"
                  type="number"
                  defaultValue="7"
                  min="1"
                  max="365"
                  required
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="primary" disabled={busy}>
                Salvar modelo
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {create && (
        <Dialog title="Nova proposta" close={() => setCreate(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api("/proposals", {
                  contactId: f.get("contactId"),
                  templateId: f.get("templateId"),
                  items: f.getAll("products").map((id) => ({
                    productId: id,
                    quantity: Number(f.get("qty:" + id) || 1),
                  })),
                }),
              ).then((ok) => {
                if (ok) setCreate(false);
              });
            }}
          >
            <div className="form-body">
              <label>
                Contato
                <select name="contactId" required>
                  {data.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Modelo
                <select name="templateId" required>
                  {data.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {data.products
                .filter((p) => p.active)
                .map((p) => (
                  <div className="line-select" key={p.id}>
                    <label className="check-label">
                      <input type="checkbox" name="products" value={p.id} />
                      {p.name} · {money(p.priceCents)}
                    </label>
                    <input
                      aria-label={"Quantidade de " + p.name}
                      type="number"
                      name={"qty:" + p.id}
                      defaultValue="1"
                      min="1"
                      max="1000"
                    />
                  </div>
                ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreate(false)}>
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                Criar rascunho
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {proposal && (
        <Dialog title="Revisar proposta" close={() => setProposal(undefined)}>
          <div className="form-body">
            <Tag>{statuses[proposal.status]}</Tag>
            <article className="proposal-paper">
              <small>{proposal.number}</small>
              <h2>{proposal.title}</h2>
              <p className="pre-wrap">{proposal.intro}</p>
              {proposal.lines.map((l, i) => (
                <div className="proposal-line" key={i}>
                  <span>
                    {l.name}
                    <small>
                      {l.quantity} × {money(l.unitPriceCents)}
                    </small>
                  </span>
                  <b>{money(l.totalCents)}</b>
                </div>
              ))}
              <div className="proposal-total">
                <span>Total</span>
                <strong>{money(proposal.totalCents)}</strong>
              </div>
              <p>{proposal.terms}</p>
            </article>
          </div>
          <div className="modal-actions">
            <a
              className="button"
              href={"/api/proposals/" + proposal.id + "/pdf"}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={14} />
              Ver PDF
            </a>
            <div>
              {proposal.status === "draft" && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      api("/proposals/" + proposal.id + "/submit", {}),
                    ).then((ok) => {
                      if (ok) setProposal(undefined);
                    })
                  }
                >
                  Solicitar aprovação
                </button>
              )}
              {proposal.status === "pending" && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        api("/proposals/" + proposal.id + "/review", {
                          decision: "reject",
                          hash: proposal.snapshotHash,
                          note: "",
                        }),
                      ).then((ok) => {
                        if (ok) setProposal(undefined);
                      })
                    }
                  >
                    Rejeitar
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        api("/proposals/" + proposal.id + "/review", {
                          decision: "approve",
                          hash: proposal.snapshotHash,
                          note: "",
                        }),
                      ).then((ok) => {
                        if (ok) setProposal(undefined);
                      })
                    }
                  >
                    {data.demo ? "Aprovar e simular" : "Aprovar e enviar"}
                  </button>
                </>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

function TestHistory({
  data,
  act,
  busy,
}: {
  data: Data;
  act: Act;
  busy: boolean;
}) {
  return (
    <section className="panel disclosure">
      <details>
        <summary>Histórico dos testes</summary>
        <div className="form-body">
          <p>
            Limpa somente a memória dos contatos autorizados no modo de teste.
            Configurações, consumo e histórico da Central são preservados. Uma
            cópia restaurável é criada antes da limpeza.
          </p>
          <button
            disabled={
              busy ||
              data.operation.agentEnabled ||
              !data.operation.testMode?.enabled
            }
            onClick={() =>
              void act(
                () => api("/test-history/reset"),
                "Memória do teste limpa; cópia disponível abaixo.",
              )
            }
          >
            Limpar memória do teste com cópia
          </button>
          {data.archives?.map((a) => (
            <div className="connection-row" key={a.id}>
              <span>
                {fmt(a.createdAt)} · {a.count} registros{" "}
                {a.restoredAt ? "· Restaurada" : ""}
              </span>
              <a className="button" href={"/api/test-history/" + a.id}>
                Baixar cópia
              </a>
              <button
                disabled={busy || data.operation.agentEnabled || !!a.restoredAt}
                onClick={() =>
                  void act(() => api("/test-history/" + a.id + "/restore"))
                }
              >
                Restaurar
              </button>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
