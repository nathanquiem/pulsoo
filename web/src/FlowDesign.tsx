import React from "react";
import type { Operation } from "../../shared/model";
type Flow = NonNullable<Operation["workflow"]>;
export function FlowDesign({
  flow,
  change,
}: {
  flow: Flow;
  change: (next: Flow) => void;
}) {
  const updateStep = (i: number, key: string, value: unknown) =>
    change({
      ...flow,
      steps: (flow.steps ?? []).map((s, n) =>
        n === i ? { ...s, [key]: value } : s,
      ),
    });
  const updateKnowledge = (i: number, key: string, value: string) =>
    change({
      ...flow,
      knowledge: (flow.knowledge ?? []).map((s, n) =>
        n === i ? { ...s, [key]: value } : s,
      ),
    });
  return (
    <>
      <h3>Etapas do atendimento</h3>
      <p className="muted">
        A primeira etapa com condição pendente orienta a conversa. Informações
        já fornecidas adiantam a coleta. Dúvidas não apagam a pendência. As
        condições são verificadas pelo código; ramificações de linguagem ficam
        nas regras de cada etapa.
      </p>
      {(flow.steps ?? []).map((step, i) => (
        <section className="panel form-body" key={step.id}>
          <label>
            Nome da etapa {i + 1}
            <input
              value={step.title}
              onChange={(e) => updateStep(i, "title", e.target.value)}
            />
          </label>
          <label>
            Objetivo da etapa {i + 1}
            <textarea
              value={step.objective}
              onChange={(e) => updateStep(i, "objective", e.target.value)}
            />
          </label>
          <label>
            Pergunta da etapa {i + 1}
            <textarea
              value={step.question}
              onChange={(e) => updateStep(i, "question", e.target.value)}
            />
          </label>
          <label>
            Regras e ramificações da etapa {i + 1}
            <textarea
              value={step.instructions}
              onChange={(e) => updateStep(i, "instructions", e.target.value)}
            />
          </label>
          <p>Avançar quando estas informações estiverem preenchidas:</p>
          {flow.fields.map((f) => (
            <label className="check-label" key={f.key}>
              <input
                type="checkbox"
                aria-label={"Etapa " + (i + 1) + ": exigir " + f.label}
                checked={step.fieldKeys.includes(f.key)}
                onChange={(e) =>
                  updateStep(
                    i,
                    "fieldKeys",
                    e.target.checked
                      ? [...step.fieldKeys, f.key]
                      : step.fieldKeys.filter((k) => k !== f.key),
                  )
                }
              />
              {f.label}
            </label>
          ))}
          <label className="check-label">
            <input
              type="checkbox"
              aria-label={"Etapa " + (i + 1) + ": exigir foto"}
              checked={step.requirePhoto}
              onChange={(e) => updateStep(i, "requirePhoto", e.target.checked)}
            />
            Foto confirmada recebida
          </label>
          <label>
            ID da etapa do CRM ao entrar neste passo {i + 1} (opcional)
            <input
              value={step.crmStageId}
              onChange={(e) =>
                updateStep(i, "crmStageId", e.target.value.trim())
              }
            />
          </label>
          <button
            onClick={() =>
              change({ ...flow, steps: flow.steps?.filter((_, n) => n !== i) })
            }
          >
            Remover etapa {i + 1}
          </button>
        </section>
      ))}
      <button
        disabled={(flow.steps?.length ?? 0) >= 12}
        onClick={() =>
          change({
            ...flow,
            steps: [
              ...(flow.steps ?? []),
              {
                id: crypto.randomUUID(),
                title: "Nova etapa",
                objective: "Defina o objetivo deste passo.",
                question: "Qual informação ainda falta?",
                instructions:
                  "Reconhecer a resposta e fazer uma pergunta por vez.",
                fieldKeys: [],
                requirePhoto: false,
                crmStageId: "",
              },
            ],
          })
        }
      >
        Adicionar etapa do atendimento
      </button>
      <label className="check-label">
        <input
          type="checkbox"
          checked={!!flow.autoHandoff}
          onChange={(e) => change({ ...flow, autoHandoff: e.target.checked })}
        />
        Encaminhar ao humano quando todas as condições forem cumpridas
      </label>
      <h3>Informações aprovadas para dúvidas</h3>
      <p className="muted">
        A ferramenta consultar_informacoes procura somente nesta base. Cadastre
        respostas confirmadas da operação; não coloque senhas, tokens ou
        instruções de integração aqui. Não há busca automática na internet.
      </p>
      {(flow.knowledge ?? []).map((entry, i) => (
        <section className="panel form-body" key={entry.id}>
          <label>
            Assunto aprovado {i + 1}
            <input
              value={entry.question}
              onChange={(e) => updateKnowledge(i, "question", e.target.value)}
            />
          </label>
          <label>
            Resposta aprovada {i + 1}
            <textarea
              rows={3}
              value={entry.answer}
              onChange={(e) => updateKnowledge(i, "answer", e.target.value)}
            />
          </label>
          <button
            onClick={() =>
              change({
                ...flow,
                knowledge: flow.knowledge?.filter((_, n) => n !== i),
              })
            }
          >
            Remover informação aprovada {i + 1}
          </button>
        </section>
      ))}
      <button
        disabled={(flow.knowledge?.length ?? 0) >= 30}
        onClick={() =>
          change({
            ...flow,
            knowledge: [
              ...(flow.knowledge ?? []),
              {
                id: crypto.randomUUID(),
                question: "Novo assunto",
                answer: "Preencha uma resposta aprovada.",
              },
            ],
          })
        }
      >
        Adicionar informação aprovada
      </button>
      <details>
        <summary>Orientações específicas das ferramentas</summary>
        {(
          [
            "responder_atendimento",
            "consultar_informacoes",
            "solicitar_humano",
          ] as const
        ).map((id) => (
          <label key={id}>
            Orientação para {id}
            <textarea
              value={flow.toolGuidance?.[id] ?? ""}
              onChange={(e) =>
                change({
                  ...flow,
                  toolGuidance: { ...flow.toolGuidance, [id]: e.target.value },
                })
              }
            />
          </label>
        ))}
        <p className="muted">
          Complementa a descrição; não altera as permissões, as fontes dos IDs
          ou as validações do backend.
        </p>
      </details>
    </>
  );
}
