import type { FastifyInstance } from "fastify";
import type { Store } from "./store.js";
import type { EntityKind } from "../shared/model.js";
import { operation, testContactAllowed } from "./operation.js";
import { base, DomainError } from "./domain.js";
export function testHistoryRoutes(app: FastifyInstance, store: Store) {
  app.post("/api/test-history/reset", async () =>
    store.transaction(async (tx) => {
      const op = await operation(tx);
      if (op.agentEnabled || !op.testMode?.enabled)
        throw new DomainError("pause_o_agente_e_habilite_teste_restrito", 409);
      const contacts = (await tx.list("contact")).filter((c) =>
        testContactAllowed(op, c),
      );
      if (!contacts.length)
        throw new DomainError("nenhum_contato_de_teste_encontrado", 409);
      const ids = new Set(contacts.map((c) => c.id)),
        records: { kind: string; id: string; data: unknown }[] = contacts.map(
          (data) => ({ kind: "contact", id: data.id, data }),
        );
      const cvs = (await tx.list("conversation")).filter((c) =>
        ids.has(c.contactId),
      );
      const cvIds = new Set(cvs.map((c) => c.id));
      for (const kind of [
        "conversation",
        "message",
        "runtimeJob",
        "followup",
        "handoff",
      ] as const) {
        for (const item of await tx.list(kind)) {
          const relevant =
            "contactId" in item
              ? ids.has(item.contactId)
              : "conversationId" in item && cvIds.has(item.conversationId);
          if (relevant) {
            records.push({ kind, id: item.id, data: item });
            await tx.remove(kind, item.id);
          }
        }
      }
      const snapshot = { ...base(), contactIds: [...ids], records };
      await tx.put("testArchive", snapshot);
      for (const contact of contacts)
        await tx.put("contact", { ...contact, notes: "", qualification: {} });
      await tx.put("audit", {
        ...base(),
        action: "memoria_de_teste_limpa_com_copia",
        subjectId: snapshot.id,
        actor: "operador",
        detail:
          "Histórico arquivado e restaurável. Eventos deduplicados, consumo e Central preservados.",
      });
      return { id: snapshot.id, count: records.length };
    }),
  );
  app.get<{ Params: { id: string } }>(
    "/api/test-history/:id",
    async (req, reply) => {
      const saved = await store.transaction((tx) =>
        tx.get("testArchive", req.params.id),
      );
      if (!saved) throw new DomainError("copia_nao_encontrada", 404);
      return reply
        .header(
          "Content-Disposition",
          'attachment; filename="pulsoo-test-' + saved.id + '.json"',
        )
        .send(saved);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/test-history/:id/restore",
    async (req) =>
      store.transaction(async (tx) => {
        const saved = await tx.get("testArchive", req.params.id),
          op = await operation(tx);
        if (!saved) throw new DomainError("copia_nao_encontrada", 404);
        if (op.agentEnabled || saved.restoredAt)
          throw new DomainError("restauracao_nao_permitida", 409);
        if (
          (await tx.list("conversation")).some((cv) =>
            saved.contactIds.includes(cv.contactId),
          )
        )
          throw new DomainError("novo_historico_existe_nao_sobrescrever", 409);
        for (const record of saved.records) {
          let data = record.data as Record<string, unknown>;
          if (record.kind === "conversation")
            data = { ...data, status: "paused", manualState: "paused" };
          if (record.kind === "runtimeJob")
            data = {
              ...data,
              state: "cancelled",
              lastError: "restaurado_sem_reexecutar",
            };
          await tx.put(record.kind as EntityKind, data as never);
        }
        await tx.put("testArchive", {
          ...saved,
          restoredAt: new Date().toISOString(),
        });
        return { ok: true };
      }),
  );
}
