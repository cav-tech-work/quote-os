import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateNormalizedLine, normalizedLineSnapshot, sideForQuoteType, type NormalizedQuoteDraft } from "@/lib/normalized-quotes";
import { QuotePdf, type PdfQuote } from "@/lib/quote-pdf";

export type LifecycleCode = "QUOTE_NOT_FOUND" | "REVISION_NOT_FOUND" | "REVISION_IMMUTABLE" | "REVISION_NOT_ISSUABLE" | "REVISION_CHANGED" | "DOCUMENT_INTEGRITY_FAILURE";
export class QuoteLifecycleError extends Error { constructor(public code: LifecycleCode, message: string) { super(message); this.name = "QuoteLifecycleError"; } }
type Database = PrismaClient;
const OFFICIAL_TYPE = "ISSUED_QUOTE_PDF";

function pdfQuote(quote: any, revision: any): PdfQuote {
  return {
    ...quote,
    type: revision.quoteTypeSnapshot ?? quote.type,
    company: revision.companySnapshot ?? quote.company,
    project: revision.projectSnapshot ?? quote.project,
    venue: revision.venueSnapshot ?? quote.venue,
    city: revision.citySnapshot ?? quote.city,
    salesperson: revision.salespersonSnapshot ?? quote.salesperson,
    revision,
  };
}

export async function renderRevisionPdf(quote: any, revision: any) {
  return Buffer.from(await renderToBuffer(createElement(QuotePdf, { quote: pdfQuote(quote, revision), documentState: revision.status === "DRAFT" ? "DRAFT_PREVIEW" : "ISSUED" }) as never));
}

function verifyTotals(revision: any) {
  if (!revision.lines.length) throw new QuoteLifecycleError("REVISION_NOT_ISSUABLE", "A revision must contain at least one line.");
  const subtotal = revision.lines.reduce((sum: number, line: any) => sum + (line.finalAmountPaiseSnapshot ?? line.lineTotalPaise + line.discountPaise), 0);
  const discount = revision.lines.reduce((sum: number, line: any) => sum + line.discountPaise, 0);
  const tax = Math.round((subtotal - discount) * Number(revision.taxPercentage) / 100);
  if (subtotal !== revision.subtotalPaise || discount !== revision.discountTotalPaise || tax !== revision.taxTotalPaise || subtotal - discount + tax !== revision.grandTotalPaise) throw new QuoteLifecycleError("REVISION_NOT_ISSUABLE", "Persisted revision totals do not match persisted line snapshots.");
}

async function lock(tx: Prisma.TransactionClient, key: string) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`; }

export async function issueRevision(quoteId: string, revisionId: string, actorId: string, database: Database = prisma, renderer = renderRevisionPdf) {
  const initial = await database.quoteRevision.findFirst({ where: { id: revisionId, quoteId }, include: { quote: true, lines: true, documents: { where: { documentType: OFFICIAL_TYPE, documentVersion: 1 } } } });
  if (!initial) throw new QuoteLifecycleError("REVISION_NOT_FOUND", "Revision was not found for this quote.");
  if (initial.status !== "DRAFT") { const document = initial.documents[0]; if (document?.content) return { revision: initial, document, idempotent: true }; throw new QuoteLifecycleError("REVISION_IMMUTABLE", "Issued revisions are immutable."); }
  verifyTotals(initial);
  const bytes = await renderer(initial.quote, initial);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return database.$transaction(async (tx) => {
    await lock(tx, `issue:${revisionId}`);
    const current = await tx.quoteRevision.findFirst({ where: { id: revisionId, quoteId }, include: { quote: true, lines: true, documents: { where: { documentType: OFFICIAL_TYPE, documentVersion: 1 } } } });
    if (!current) throw new QuoteLifecycleError("REVISION_NOT_FOUND", "Revision was not found for this quote.");
    if (current.status !== "DRAFT") { const document = current.documents[0]; if (document?.content) return { revision: current, document, idempotent: true }; throw new QuoteLifecycleError("REVISION_IMMUTABLE", "Issued revision has no retained artifact."); }
    if (current.updatedAt.getTime() !== initial.updatedAt.getTime()) throw new QuoteLifecycleError("REVISION_CHANGED", "Draft changed while its document was being generated; retry issue.");
    verifyTotals(current);
    const issuedAt = new Date();
    const prior = await tx.quoteRevision.findMany({ where: { quoteId, status: "ISSUED", id: { not: revisionId } }, select: { id: true } });
    if (prior.length) {
      await tx.quoteRevision.updateMany({ where: { id: { in: prior.map((item) => item.id) } }, data: { status: "SUPERSEDED" } });
      for (const item of prior) await tx.quoteEvent.create({ data: { quoteId, actorId, action: "REVISION_SUPERSEDED", metadata: { revisionId: item.id, supersededByRevisionId: revisionId } } });
    }
    const revision = await tx.quoteRevision.update({ where: { id: revisionId }, data: { status: "ISSUED", lockedAt: issuedAt, issuedAt, issuedById: actorId } });
    const document = await tx.generatedDocument.create({ data: { revisionId, documentType: OFFICIAL_TYPE, documentVersion: 1, templateVersion: "quote-pdf-v1", storageKey: `database://${revisionId}/issued-quote-v1.pdf`, checksum, content: bytes, byteSize: bytes.byteLength, mimeType: "application/pdf", filename: `${current.quote.number}-R${current.revisionNumber}.pdf`, generatedById: actorId } });
    await tx.quote.update({ where: { id: quoteId }, data: { status: "GENERATED" } });
    await tx.quoteEvent.create({ data: { quoteId, actorId, action: "REVISION_ISSUED", metadata: { revisionId, revisionNumber: current.revisionNumber, documentId: document.id } } });
    await tx.quoteEvent.create({ data: { quoteId, actorId, action: "DOCUMENT_RETAINED", metadata: { revisionId, documentId: document.id, checksum, byteSize: bytes.byteLength } } });
    return { revision, document, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function createRevisionFromIssued(quoteId: string, sourceRevisionId: string, actorId: string, database: Database = prisma) {
  return database.$transaction(async (tx) => {
    await lock(tx, `revision:${quoteId}`);
    const existing = await tx.quoteRevision.findFirst({ where: { quoteId, status: "DRAFT" }, include: { lines: true } });
    if (existing) return { revision: existing, idempotent: true };
    const source = await tx.quoteRevision.findFirst({ where: { id: sourceRevisionId, quoteId, status: { in: ["ISSUED", "SUPERSEDED"] } }, include: { lines: true } });
    if (!source) throw new QuoteLifecycleError("REVISION_NOT_FOUND", "An issued source revision is required.");
    const latest = await tx.quoteRevision.aggregate({ where: { quoteId }, _max: { revisionNumber: true } });
    const revisionNumber = (latest._max.revisionNumber ?? 0) + 1;
    const clonedLines = source.lines.map(({ id: _id, revisionId: _revisionId, ...line }) => ({ ...line, configurationSnapshot: line.configurationSnapshot === null ? Prisma.JsonNull : line.configurationSnapshot as Prisma.InputJsonValue, normalizedConfigurationSnapshot: line.normalizedConfigurationSnapshot === null ? Prisma.JsonNull : line.normalizedConfigurationSnapshot as Prisma.InputJsonValue, durationPolicyDefinitionSnapshot: line.durationPolicyDefinitionSnapshot === null ? Prisma.JsonNull : line.durationPolicyDefinitionSnapshot as Prisma.InputJsonValue }));
    const revision = await tx.quoteRevision.create({ data: { quoteId, revisionNumber, status: "DRAFT", createdById: actorId, preparedDate: new Date(), validUntil: source.validUntil, taxPercentage: source.taxPercentage, notes: source.notes, termsSnapshot: source.termsSnapshot, settingsSnapshot: source.settingsSnapshot as Prisma.InputJsonValue, subtotalPaise: source.subtotalPaise, discountTotalPaise: source.discountTotalPaise, taxTotalPaise: source.taxTotalPaise, grandTotalPaise: source.grandTotalPaise, eventDays: source.eventDays, quoteTypeSnapshot: source.quoteTypeSnapshot, companySnapshot: source.companySnapshot, projectSnapshot: source.projectSnapshot, venueSnapshot: source.venueSnapshot, citySnapshot: source.citySnapshot, salespersonSnapshot: source.salespersonSnapshot, currencySnapshot: source.currencySnapshot, lines: { create: clonedLines } }, include: { lines: true } });
    await tx.quote.update({ where: { id: quoteId }, data: { status: "DRAFT" } });
    await tx.quoteEvent.create({ data: { quoteId, actorId, action: "REVISION_CREATED", metadata: { revisionId: revision.id, revisionNumber, clonedFromRevisionId: source.id, clonePreservedSnapshots: true } } });
    return { revision, idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function replaceNormalizedDraft(quoteId: string, revisionId: string, input: NormalizedQuoteDraft, actorId: string, database: Database = prisma) {
  return database.$transaction(async (tx) => {
    await lock(tx, `revision:${revisionId}`);
    const existing = await tx.quoteRevision.findFirst({ where: { id: revisionId, quoteId }, include: { quote: true } });
    if (!existing) throw new QuoteLifecycleError("REVISION_NOT_FOUND", "Revision was not found for this quote.");
    if (existing.status !== "DRAFT") throw new QuoteLifecycleError("REVISION_IMMUTABLE", "Issued revisions cannot be edited.");
    const side = sideForQuoteType(input.type); const snapshots = [];
    for (const line of input.lines) { const normalizedInput = { ...line, usageDays: line.usageDays ?? String(input.eventDays) }; const resolved = await calculateNormalizedLine(normalizedInput, side, tx); snapshots.push(normalizedLineSnapshot(resolved, normalizedInput, line.discountPercent, line.remarks)); }
    const subtotalPaise = snapshots.reduce((sum, line) => sum + line.finalAmountPaiseSnapshot, 0); const discountTotalPaise = snapshots.reduce((sum, line) => sum + line.discountPaise, 0); const taxTotalPaise = Math.round((subtotalPaise - discountTotalPaise) * input.taxPercentage / 100); const grandTotalPaise = subtotalPaise - discountTotalPaise + taxTotalPaise;
    await tx.quoteLine.deleteMany({ where: { revisionId } });
    const revision = await tx.quoteRevision.update({ where: { id: revisionId }, data: { preparedDate: new Date(), eventDays: input.eventDays, taxPercentage: input.taxPercentage, quoteTypeSnapshot: input.type, companySnapshot: input.company, projectSnapshot: input.project || null, venueSnapshot: input.venue || null, citySnapshot: input.city || null, salespersonSnapshot: input.salesperson || null, subtotalPaise, discountTotalPaise, taxTotalPaise, grandTotalPaise, lines: { create: snapshots } }, include: { lines: true } });
    await tx.quote.update({ where: { id: quoteId }, data: { type: input.type, company: input.company, project: input.project || null, venue: input.venue || null, city: input.city || null, salesperson: input.salesperson || null } });
    await tx.quoteEvent.create({ data: { quoteId, actorId, action: "UPDATED", metadata: { revisionId, serverRecalculated: true } } });
    return revision;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recalculateNormalizedDraftLine(quoteId: string, revisionId: string, lineId: string, input: NormalizedQuoteDraft["lines"][number], actorId: string, database: Database = prisma) {
  return database.$transaction(async (tx) => {
    await lock(tx, `revision:${revisionId}`);
    const revision = await tx.quoteRevision.findFirst({ where: { id: revisionId, quoteId }, include: { quote: true } });
    if (!revision) throw new QuoteLifecycleError("REVISION_NOT_FOUND", "Revision was not found for this quote.");
    if (revision.status !== "DRAFT") throw new QuoteLifecycleError("REVISION_IMMUTABLE", "Issued revisions cannot be edited.");
    const existing = await tx.quoteLine.findFirst({ where: { id: lineId, revisionId } }); if (!existing) throw new QuoteLifecycleError("REVISION_NOT_FOUND", "Draft line was not found.");
    const usageDays = input.usageDays ?? String(revision.eventDays ?? 1); const normalizedInput = { ...input, usageDays };
    const resolved = await calculateNormalizedLine(normalizedInput, sideForQuoteType(revision.quoteTypeSnapshot ?? revision.quote.type), tx); const snapshot = normalizedLineSnapshot(resolved, normalizedInput, input.discountPercent, input.remarks);
    const line = await tx.quoteLine.update({ where: { id: lineId }, data: snapshot });
    const lines = await tx.quoteLine.findMany({ where: { revisionId } }); const subtotalPaise = lines.reduce((sum, item) => sum + (item.finalAmountPaiseSnapshot ?? item.lineTotalPaise + item.discountPaise), 0); const discountTotalPaise = lines.reduce((sum, item) => sum + item.discountPaise, 0); const taxTotalPaise = Math.round((subtotalPaise - discountTotalPaise) * Number(revision.taxPercentage) / 100); const grandTotalPaise = subtotalPaise - discountTotalPaise + taxTotalPaise;
    await tx.quoteRevision.update({ where: { id: revisionId }, data: { subtotalPaise, discountTotalPaise, taxTotalPaise, grandTotalPaise } });
    await tx.quoteEvent.create({ data: { quoteId, actorId, action: "UPDATED", metadata: { revisionId, lineId, serverRecalculated: true, untouchedClonedLinesPreserved: true } } });
    return line;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getRetainedDocument(quoteId: string, revisionId: string, database: Database = prisma) {
  const document = await database.generatedDocument.findFirst({ where: { revisionId, revision: { quoteId }, documentType: OFFICIAL_TYPE, documentVersion: 1 }, include: { revision: { include: { quote: true } } } });
  if (!document?.content) throw new QuoteLifecycleError("REVISION_NOT_FOUND", "No retained issued document exists.");
  const bytes = Buffer.from(document.content); const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== document.checksum || bytes.byteLength !== document.byteSize) throw new QuoteLifecycleError("DOCUMENT_INTEGRITY_FAILURE", "Retained issued document failed integrity verification.");
  return { document, bytes };
}

export async function getRevisionForPreview(quoteId: string, revisionId: string, database: Database = prisma) {
  const revision = await database.quoteRevision.findFirst({ where: { id: revisionId, quoteId }, include: { quote: true, lines: true } });
  if (!revision) throw new QuoteLifecycleError("REVISION_NOT_FOUND", "Revision was not found for this quote.");
  return revision;
}
