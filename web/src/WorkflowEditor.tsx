import React from "react";
import { FlowDesign } from "./FlowDesign";
import type { Operation, AgentSettings } from "../../shared/model";
type Save<T> = (value: T) => Promise<boolean>;
export function RhythmEditor({
  settings,
  save,
  typingSupported = false,
}: {
  typingSupported?: boolean;
  settings: AgentSettings;
  save: Save<AgentSettings>;
}) {
  const normalized = () => ({
    ...settings,
    groupingMs: settings.groupingMs ?? 8000,
    replyDelayMs: settings.replyDelayMs ?? 2500,
    maxCharsPerMessage: settings.maxCharsPerMessage ?? 450,
    naturalParagraphs: settings.naturalParagraphs ?? true,
  });
  const [value, setValue] = React.useState(normalized);
  const rhythmDirty = React.useRef(false);
  const change = (next: typeof value) => {
    rhythmDirty.current = true;
    setValue(next);
  };
  React.useEffect(() => {
    if (!rhythmDirty.current) setValue(normalized());
  }, [settings.createdAt]);
  const number = (
    label: string,
    key:
      | "groupingMs"
      | "replyDelayMs"
      | "delayMs"
      | "maxChunks"
      | "maxCharsPerMessage",
    fallback: number,
    min: number,
    max: number,
    seconds = false,
  ) => (
    <label>
      {label}
      <input
        type="number"
        step={seconds ? 0.1 : 1}
        min={min}
        max={max}
        value={
          seconds ? (value[key] ?? fallback) / 1000 : (value[key] ?? fallback)
        }
        onChange={(e) =>
          change({
            ...value,
            [key]: Number(e.target.value) * (seconds ? 1000 : 1),
          })
        }
      />
    </label>
  );
  return (
    <section className="panel spaced">
      <div className="panel-header">
        <div>
          <h2>Ritmo e mensagens</h2>
          <p>Aplicado à entrega real e ao laboratório.</p>
        </div>
      </div>
      <div className="form-body">
        {number(
          "Esperar novas mensagens do lead (segundos)",
          "groupingMs",
          8000,
          0,
          30,
          true,
        )}
        {number(
          "Espera antes de começar a responder (segundos)",
          "replyDelayMs",
          2500,
          0,
          15,
          true,
        )}
        {number(
          "Intervalo entre balões (segundos)",
          "delayMs",
          1800,
          0,
          15,
          true,
        )}
        <label>
          Dividir respostas
          <select
            value={value.splitMode}
            onChange={(e) =>
              change({
                ...value,
                splitMode: e.target.value as AgentSettings["splitMode"],
              })
            }
          >
            <option value="paragraphs">Vários balões por parágrafo</option>
            <option value="single">Um balão</option>
          </select>
        </label>
        {number(
          "Máximo de caracteres por balão",
          "maxCharsPerMessage",
          450,
          100,
          4000,
        )}
        {number("Máximo de balões por resposta", "maxChunks", 5, 1, 8)}
        <label className="check-label">
          <input
            type="checkbox"
            checked={value.naturalParagraphs ?? true}
            onChange={(e) =>
              change({ ...value, naturalParagraphs: e.target.checked })
            }
          />
          Organizar frases em parágrafos naturais
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            disabled={!typingSupported}
            checked={!!value.typing && typingSupported}
            onChange={(e) => change({ ...value, typing: e.target.checked })}
          />
          Solicitar “digitando” quando o canal suportar
        </label>
        <p className="muted">
          Uma nova mensagem reinicia a espera. Novas respostas do lead ou pausa
          humana interrompem os balões restantes. “Digitando” depende da
          capacidade pública da Central; ainda não está disponível nesta
          conexão.
        </p>
      </div>
      <div className="panel-foot">
        <button
          className="primary"
          onClick={async () => {
            if (await save(value)) rhythmDirty.current = false;
          }}
        >
          Salvar ritmo
        </button>
      </div>
    </section>
  );
}
export function WorkflowEditor({
  operation,
  save,
  tools,
  centralExtensions = false,
  notificationWebhookConfigured = false,
}: {
  centralExtensions?: boolean;
  notificationWebhookConfigured?: boolean;
  operation: Operation;
  save: Save<Operation>;
  tools: {
    id: string;
    name: string;
    trigger: string;
    kind?: string;
    objective?: string;
    inputs?: string;
    output?: string;
    avoid?: string;
  }[];
}) {
  const fallback: NonNullable<Operation["workflow"]> = {
    enabled: false,
    fields: [],
    stageOnStart: "",
    stageOnHandoff: "",
    responsibleId: "",
    farewell:
      "Obrigada pelas informações! Vou deixar seu atendimento com a equipe para dar continuidade por aqui.",
    nextStep: "Continuar o atendimento com a equipe.",
    photoPolicy: "collect",
    requirePhoto: false,
    notification: { kind: "none", targetId: "", numberId: "" },
  };
  const [flow, setFlow] = React.useState(operation.workflow ?? fallback);
  const flowDirty = React.useRef(false);
  React.useEffect(() => {
    if (!flowDirty.current) setFlow(operation.workflow ?? fallback);
  }, [operation.revision]);
  function update<K extends keyof typeof flow>(
    key: K,
    value: (typeof flow)[K],
  ) {
    flowDirty.current = true;
    setFlow({ ...flow, [key]: value });
  }
  const committed = operation.workflow ?? fallback;
  const available = (id: string) =>
    id === "responder_atendimento"
      ? committed.enabled
      : id === "consultar_informacoes"
        ? !!committed.knowledge?.length
        : id === "solicitar_humano"
          ? !!operation.handoff?.enabled
          : id === "mover_etapa"
            ? committed.enabled &&
              !!(
                committed.stageOnStart ||
                committed.stageOnHandoff ||
                committed.steps?.some((step) => step.crmStageId)
              )
            : id === "registrar_resumo"
              ? !!operation.handoff?.recordNote
              : committed.notification.kind !== "none" &&
                (committed.notification.kind !== "group" ||
                  centralExtensions) &&
                (committed.notification.kind !== "webhook" ||
                  notificationWebhookConfigured) &&
                (committed.notification.kind === "webhook" ||
                  !!committed.notification.targetId);
  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <h2>Ferramentas da operação</h2>
        </div>
        <div className="form-body">
          {tools.map((tool) => (
            <details className="panel form-body" key={tool.id}>
              <summary>
                {tool.name} ·{" "}
                {available(tool.id)
                  ? "Configuração preenchida"
                  : "A configurar"}
              </summary>
              <p>
                <b>Tipo:</b>{" "}
                {tool.kind === "action"
                  ? "Ação do backend"
                  : tool.kind === "read"
                    ? "Consulta do agente"
                    : "Decisão do agente"}
              </p>
              <p>
                <b>Objetivo:</b> {tool.objective}
              </p>
              <p>
                <b>Quando usar:</b> {tool.trigger}
              </p>
              <p>
                <b>Entradas e fontes:</b> {tool.inputs}
              </p>
              <p>
                <b>Resultado:</b> {tool.output}
              </p>
              <p>
                <b>Limites:</b> {tool.avoid}
              </p>
            </details>
          ))}
        </div>
      </section>
      <section className="panel spaced">
        <div className="panel-header">
          <div>
            <h2>Fluxo e passagem ao humano</h2>
            <p>
              Configuração desta instalação. O motor é o mesmo para todos os
              nichos.
            </p>
          </div>
        </div>
        <div className="form-body">
          <label className="check-label">
            <input
              type="checkbox"
              checked={flow.enabled}
              onChange={(e) => update("enabled", e.target.checked)}
            />
            Usar qualificação estruturada
          </label>
          <h3>Informações a coletar</h3>
          <p className="muted">
            Cada campo tem uma pergunta aprovada. O agente guarda respostas e
            consulta as pendências antes de perguntar de novo.
          </p>
          {flow.fields.map((field, i) => (
            <div className="panel form-body" key={field.key}>
              <label>
                Informação
                <input
                  aria-label={"Nome do campo " + (i + 1)}
                  value={field.label}
                  onChange={(e) =>
                    update(
                      "fields",
                      flow.fields.map((f, n) =>
                        n === i ? { ...f, label: e.target.value } : f,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Pergunta quando estiver faltando
                <textarea
                  value={field.question}
                  onChange={(e) =>
                    update(
                      "fields",
                      flow.fields.map((f, n) =>
                        n === i ? { ...f, question: e.target.value } : f,
                      ),
                    )
                  }
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) =>
                    update(
                      "fields",
                      flow.fields.map((f, n) =>
                        n === i ? { ...f, required: e.target.checked } : f,
                      ),
                    )
                  }
                />
                Obrigatório para concluir qualificação
              </label>
              <button
                onClick={() =>
                  update(
                    "fields",
                    flow.fields.filter((_, n) => n !== i),
                  )
                }
              >
                Remover campo
              </button>
            </div>
          ))}
          <button
            disabled={flow.fields.length >= 12}
            onClick={() =>
              update("fields", [
                ...flow.fields,
                {
                  key: "campo_" + Date.now().toString(36),
                  label: "Nova informação",
                  question: "Qual informação você pode me passar?",
                  required: false,
                },
              ])
            }
          >
            Adicionar informação
          </button>
          <FlowDesign
            flow={flow}
            change={(next) => {
              flowDirty.current = true;
              setFlow(next);
            }}
          />
          <h3>Etapas e responsável</h3>
          <p className="muted">
            Sem oportunidade vinculada, mover etapa será bloqueado. Vincule em
            Conversas → Contexto e notas ou use a API complementar da Central.
            Copie os IDs da Central. Deixe a etapa vazia para manter o funil
            como está. A oportunidade pode vir no webhook ou ser vinculada no
            contexto da conversa.
          </p>
          <label>
            ID da etapa ao iniciar qualificação
            <input
              value={flow.stageOnStart}
              onChange={(e) => update("stageOnStart", e.target.value.trim())}
            />
          </label>
          <label>
            ID da etapa ao encaminhar para humano
            <input
              value={flow.stageOnHandoff}
              onChange={(e) => update("stageOnHandoff", e.target.value.trim())}
            />
          </label>
          <label>
            ID do responsável da oportunidade (opcional)
            <input
              value={flow.responsibleId}
              onChange={(e) => update("responsibleId", e.target.value.trim())}
            />
          </label>
          <label>
            Ao receber fotos
            <select
              value={flow.photoPolicy}
              onChange={(e) =>
                update("photoPolicy", e.target.value as typeof flow.photoPolicy)
              }
            >
              <option value="collect">
                Agradecer e continuar as perguntas pendentes
              </option>
              <option value="immediate">
                Despedir-se e passar para humano
              </option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={flow.requirePhoto}
              onChange={(e) => update("requirePhoto", e.target.checked)}
            />
            Fotos fazem parte da qualificação
          </label>
          <label>
            Mensagem de passagem ao humano
            <textarea
              rows={3}
              value={flow.farewell}
              onChange={(e) => update("farewell", e.target.value)}
            />
          </label>
          <label>
            Próximo passo da equipe
            <input
              value={flow.nextStep}
              onChange={(e) => update("nextStep", e.target.value)}
            />
          </label>
          <h3>Quem deve ser avisado</h3>
          <label>
            Destino
            <select
              value={flow.notification.kind}
              onChange={(e) =>
                update("notification", {
                  ...flow.notification,
                  kind: e.target.value as typeof flow.notification.kind,
                })
              }
            >
              <option value="none">Somente painel e notas</option>
              <option value="contact">Contato cadastrado na Central</option>
              <option value="conversation">
                Conversa da equipe na Central
              </option>
              <option value="webhook">Webhook de aviso (n8n)</option>
              <option value="group">
                Grupo WhatsApp (aguarda API da Central)
              </option>
            </select>
          </label>
          {flow.notification.kind !== "none" && (
            <>
              <label>
                {flow.notification.kind === "webhook"
                  ? "Identificador do destino no n8n (opcional)"
                  : flow.notification.kind === "group"
                    ? "ID do grupo (@g.us)"
                    : "ID do contato ou conversa de destino"}
                <input
                  value={flow.notification.targetId}
                  onChange={(e) =>
                    update("notification", {
                      ...flow.notification,
                      targetId: e.target.value.trim(),
                    })
                  }
                />
              </label>
              <label>
                ID do número WhatsApp na Central (opcional)
                <input
                  value={flow.notification.numberId}
                  onChange={(e) =>
                    update("notification", {
                      ...flow.notification,
                      numberId: e.target.value.trim(),
                    })
                  }
                />
              </label>
            </>
          )}
          {flow.notification.kind === "webhook" && (
            <p className="muted">
              {notificationWebhookConfigured
                ? "Webhook e segredo configurados no servidor."
                : "Configure HUMAN_NOTIFICATION_WEBHOOK_URL e HUMAN_NOTIFICATION_WEBHOOK_SECRET no servidor."}{" "}
              O n8n recebe dados estruturados e confirma o envio por retorno
              assinado. HTTP 202 fica aguardando confirmação; não representa
              mensagem enviada. O destino pode ser resolvido no próprio n8n.
            </p>
          )}
          <p className="muted">
            O aviso inclui nome, telefone, informações coletadas, pendências e
            próximo passo. Envio de grupo diretamente pela Central exige o
            contrato complementar. O webhook do n8n é independente dele.
          </p>
        </div>
        <div className="panel-foot">
          <button
            className="primary"
            onClick={async () => {
              if (await save({ ...operation, workflow: flow }))
                flowDirty.current = false;
            }}
          >
            Salvar fluxo e ferramentas
          </button>
        </div>
      </section>
    </>
  );
}
