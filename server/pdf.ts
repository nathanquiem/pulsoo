import PDFDocument from "pdfkit";
import type { Proposal } from "../shared/model.js";
import { money } from "../shared/model.js";
export function proposalPdf(p: Proposal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 52, bottom: 52, left: 52, right: 52 },
      info: { Title: p.number + " · " + p.title, Author: "Pulsoo" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#df4d50")
      .text("PULSOO  /  PROPOSTA");
    doc.moveDown().fillColor("#17191e").fontSize(25).text(p.title);
    doc
      .moveDown(0.4)
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#62666e")
      .text(
        p.number +
          " · " +
          p.contactName +
          " · Válida até " +
          new Date(p.validUntil).toLocaleDateString("pt-BR"),
      );
    doc
      .moveDown(2)
      .fontSize(11)
      .fillColor("#252830")
      .text(p.intro, { lineGap: 5 });
    doc.moveDown(2);
    for (const line of p.lines) {
      doc.font("Helvetica-Bold").text(line.name);
      doc
        .font("Helvetica")
        .fontSize(10)
        .text(
          line.quantity +
            " × " +
            money(line.unitPriceCents) +
            "  /  " +
            money(line.totalCents),
        );
      doc.moveDown();
    }
    doc
      .moveDown()
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("Total: " + money(p.totalCents));
    doc.moveDown().font("Helvetica").fontSize(10).text(p.terms, { lineGap: 4 });
    doc
      .moveDown(2)
      .fontSize(8)
      .fillColor("#62666e")
      .text(
        "Versão " +
          p.revision +
          " · Documento gerado pelo Pulsoo. " +
          (p.status === "pending" || p.status === "draft"
            ? "RASCUNHO — aguarda aprovação."
            : ""),
      );
    doc.end();
  });
}
