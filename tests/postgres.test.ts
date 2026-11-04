import test from "node:test";
import assert from "node:assert/strict";
import { PostgresStore } from "../server/store.js";
import { base } from "../server/domain.js";
test(
  "PostgreSQL preserva registros e reverte transação",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const store = await new PostgresStore(
      process.env.TEST_DATABASE_URL!,
    ).init();
    const id = "test-" + Date.now();
    try {
      await store.transaction((tx) =>
        tx.put("audit", {
          ...base(id),
          action: "test",
          subjectId: id,
          actor: "test",
          detail: "test",
        }),
      );
      await assert.rejects(
        store.transaction(async (tx) => {
          await tx.remove("audit", id);
          throw new Error("rollback");
        }),
      );
      assert.ok(await store.transaction((tx) => tx.get("audit", id)));
    } finally {
      await store.transaction((tx) => tx.remove("audit", id));
      await store.close();
    }
  },
);
