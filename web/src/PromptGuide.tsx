import React from "react";
import { STEP_PROMPT_TEMPLATE } from "../../shared/prompt-template";
export function PromptGuide() {
  const [copied, setCopied] = React.useState(false);
  return (
    <details className="panel form-body">
      <summary>Modelo de roteiro por etapas</summary>
      <p className="muted">
        Separe atendimento, dúvidas, passagem humana e follow-up. Em cada etapa,
        defina objetivo, perguntas, ramificações, ferramenta e condição para
        avançar. Copie o modelo e adapte no campo Instruções; ele não altera o
        roteiro salvo.
      </p>
      <p className="muted">
        Etapas do roteiro orientam a conversa. IDs de etapas do CRM, campos
        obrigatórios e destinos são configurados em Fluxo e ferramentas.
        Hashtags não criam ações ou integrações.
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(STEP_PROMPT_TEMPLATE);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Modelo copiado" : "Copiar modelo"}
      </button>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.6 }}>
        {STEP_PROMPT_TEMPLATE}
      </pre>
    </details>
  );
}
