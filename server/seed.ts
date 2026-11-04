import type { Store } from "./store.js";
import { base, createProposal } from "./domain.js";
export async function seedDemo(store: Store) {
  await store.transaction(async (tx) => {
    if ((await tx.list("product")).length) return;
    const products = [
      {
        ...base("consulta"),
        name: "Consulta inicial",
        category: "Consultas",
        description:
          "Primeiro encontro para entender a necessidade e orientar o próximo passo.",
        priceCents: 35000,
        unit: "consulta",
        active: true,
      },
      {
        ...base("retorno"),
        name: "Consulta de retorno",
        category: "Consultas",
        description: "Acompanhamento previamente combinado com a equipe.",
        priceCents: 18000,
        unit: "consulta",
        active: true,
      },
      {
        ...base("avaliacao"),
        name: "Avaliação especializada",
        category: "Avaliações",
        description:
          "Avaliação com profissional responsável. Disponibilidade sob consulta.",
        priceCents: 49000,
        unit: "avaliação",
        active: true,
      },
    ];
    for (const p of products) await tx.put("product", p);
    const template = {
      ...base("padrao"),
      name: "Proposta de serviços",
      title: "Sua proposta de atendimento",
      intro:
        "Olá, {{cliente.nome}}!\n\nPreparamos esta proposta com os serviços selecionados para você.",
      terms:
        "Valores válidos durante a vigência desta proposta. Horários sujeitos à confirmação pela equipe.",
      validDays: 7,
    };
    await tx.put("template", template);
    const contacts = [
      {
        ...base("marina"),
        name: "Marina Costa",
        company: "",
        phone: "5511999990001",
        stage: "Proposta",
        notes: "Busca uma consulta inicial. Prefere atendimento pela manhã.",
        automationAllowed: true,
        demo: true,
      },
      {
        ...base("rafael"),
        name: "Rafael Mendes",
        company: "",
        phone: "5511999990002",
        stage: "Qualificação",
        notes:
          "Pediu informações sobre avaliação especializada e formas de pagamento.",
        automationAllowed: true,
        demo: true,
      },
      {
        ...base("camila"),
        name: "Camila Rocha",
        company: "",
        phone: "5511999990003",
        stage: "Novo contato",
        notes: "Solicitou disponibilidade para a próxima semana.",
        automationAllowed: true,
        demo: true,
      },
    ];
    for (const c of contacts) await tx.put("contact", c);
    const proposal = createProposal({
      contact: contacts[0],
      template,
      products,
      items: [{ productId: "consulta", quantity: 1 }],
    });
    await tx.put("proposal", { ...proposal, status: "pending" });
    await tx.put("settings", {
      ...base("agent"),
      name: "Assistente principal",
      tone: "Próximo, claro e objetivo",
      instructions:
        "Atenda com educação, faça uma pergunta por vez e consulte o catálogo antes de informar valores. Não invente disponibilidade, desconto ou confirmação.",
      splitMode: "paragraphs",
      maxChunks: 3,
      delayMs: 800,
      voiceMode: "text",
    });
  });
}
