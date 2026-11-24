import { DomainError } from "./domain.js";
import type { AgentSettings } from "../shared/model.js";
export function deliveryParts(text: string, settings: AgentSettings) {
  const limit = settings.maxCharsPerMessage ?? 4000;
  let value = text.trim().replace(/\r\n/g, "\n");
  if (settings.naturalParagraphs) {
    value = value
      .replace(/^[ \t]*(?:[-–—•]|\*(?!\*))[ \t]+/gm, "")
      .replace(/[ \t]+[–—-][ \t]+/g, ", ")
      .trim();
  }
  if (settings.splitMode === "single") {
    if (value.length > limit)
      throw new DomainError("resposta_excede_limite_configurado", 409);
    return value ? [value] : [];
  }
  const parts: string[] = [];
  for (const paragraph of value.split(/\n\s*\n/).filter(Boolean)) {
    let remaining = paragraph.trim();
    while (remaining.length > limit) {
      const prefix = remaining.slice(0, limit + 1);
      const sentence = [...prefix.matchAll(/[.!?…](?=\s)/gu)].at(-1);
      const sentenceEnd = sentence ? sentence.index + 1 : 0;
      const wordEnd = Math.max(
        prefix.lastIndexOf(" "),
        prefix.lastIndexOf("\n"),
      );
      let cut =
        sentenceEnd >= limit / 2 && sentenceEnd <= limit
          ? sentenceEnd
          : wordEnd > 0
            ? wordEnd
            : limit;
      // Keep a surrogate pair together at a hard boundary.
      if (/[\uD800-\uDBFF]$/.test(remaining.slice(0, cut))) cut--;
      parts.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) parts.push(remaining);
  }
  if (settings.naturalParagraphs) {
    const shortAck =
      /^(entendi|perfeito|claro|certo|ótimo|combinado|pode sim|obrigad[oa]|sim|beleza|ok)[!.…]*(?:\s+\p{Extended_Pictographic}\uFE0F?)?$/iu;
    for (let i = 0; i < parts.length - 1; i++) {
      if (
        shortAck.test(parts[i]) &&
        !/^(?:[-•]|\d+\.)\s/.test(parts[i + 1]) &&
        parts[i].length + 1 + parts[i + 1].length <= limit
      ) {
        parts.splice(i, 2, parts[i] + " " + parts[i + 1]);
      }
    }
  }
  if (settings.naturalParagraphs) {
    for (
      let i = 0;
      parts.length > settings.maxChunks && i < parts.length - 1;
    ) {
      const combined = parts[i] + "\n\n" + parts[i + 1];
      if (combined.length <= limit) parts.splice(i, 2, combined);
      else i++;
    }
  }
  if (parts.length > settings.maxChunks)
    throw new DomainError("resposta_excede_maximo_de_mensagens", 409);
  return parts;
}
export function groupContext<T extends { role: string; content: string }>(
  messages: T[],
) {
  return messages.filter(
    (m, i) =>
      i === 0 ||
      m.role !== messages[i - 1].role ||
      m.content !== messages[i - 1].content,
  );
}
