import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import React from "react";

export type PdfQuote = {
  number: string;
  type: "CLIENT" | "VENDOR";
  company: string;
  project: string | null;
  venue: string | null;
  city: string | null;
  salesperson: string | null;
  createdAt: Date;
  revision: {
    revisionNumber: number;
    preparedDate: Date;
    validUntil: Date | null;
    taxPercentage: { toString(): string } | number;
    subtotalPaise: number;
    discountTotalPaise: number;
    taxTotalPaise: number;
    grandTotalPaise: number;
    notes: string | null;
    termsSnapshot: string | null;
    lines: Array<{
      itemCodeSnapshot: string;
      itemNameSnapshot: string;
      descriptionSnapshot: string | null;
      unitSnapshot: string;
      quantity: { toString(): string } | number;
      days: { toString(): string } | number;
      rateUsedPaise: number;
      discountPercent: { toString(): string } | number;
      lineTotalPaise: number;
      billableQuantitySnapshot?: string | null;
      usageDaysSnapshot?: string | null;
      chargeUnitsSnapshot?: string | null;
      durationPolicyCodeSnapshot?: string | null;
      finalAmountPaiseSnapshot?: number | null;
      pricingFamilySnapshot?: "ORDINARY" | "HEADCOUNT_DUTY" | null;
      headcountSnapshot?: number | null;
      dutyUnitsPerPersonSnapshot?: string | null;
      packageCodeSnapshot?: string | null;
      packageVersionSnapshot?: number | null;
      packageQuantitySnapshot?: string | null;
      packagePricingModeSnapshot?: "COMPONENT_SUM" | "FIXED_PACKAGE" | "HYBRID" | null;
    }>;
  };
};

const styles = StyleSheet.create({
  page: { paddingTop: 152, paddingBottom: 58, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 9, color: "#162331" },
  header: { position: "absolute", top: 34, left: 42, right: 42, borderBottomWidth: 1.5, borderBottomColor: "#147dcc", paddingBottom: 12 },
  company: { fontSize: 19, fontFamily: "Helvetica-Bold", color: "#102c47", letterSpacing: 0.4 },
  strap: { fontSize: 7.5, color: "#177fc9", marginTop: 3, fontFamily: "Helvetica-Bold", letterSpacing: 1.1 },
  companyDetails: { position: "absolute", right: 0, top: 0, textAlign: "right", color: "#5d6d7c", fontSize: 7.5, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 23, left: 42, right: 42, borderTopWidth: 0.5, borderTopColor: "#d1dbe4", paddingTop: 7, color: "#718090", fontSize: 7.5, flexDirection: "row", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 23 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#102c47" },
  kicker: { fontSize: 8, color: "#147dcc", fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 5 },
  quoteMeta: { textAlign: "right", color: "#516475", lineHeight: 1.55 },
  metaLabel: { color: "#8a9aaa" },
  info: { flexDirection: "row", marginBottom: 23, backgroundColor: "#f3f7fa", borderLeftWidth: 3, borderLeftColor: "#1d92df", padding: 12 },
  infoColumn: { width: "50%" },
  infoLabel: { color: "#718090", fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  infoValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#203243", marginBottom: 9 },
  section: { marginTop: 16 },
  sectionTitle: { fontFamily: "Helvetica-Bold", color: "#193752", fontSize: 10, borderBottomWidth: 1, borderBottomColor: "#9dbed7", paddingBottom: 6, marginBottom: 8 },
  tableHead: { flexDirection: "row", backgroundColor: "#102c47", color: "#ffffff", paddingVertical: 7, paddingHorizontal: 7, fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.45 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d9e2e9", paddingVertical: 8, paddingHorizontal: 7, minHeight: 28 },
  colItem: { width: "42%" }, colQty: { width: "9%", textAlign: "right" }, colDays: { width: "9%", textAlign: "right" }, colRate: { width: "16%", textAlign: "right" }, colDiscount: { width: "10%", textAlign: "right" }, colAmount: { width: "14%", textAlign: "right" },
  itemName: { fontFamily: "Helvetica-Bold", color: "#203243" }, itemSub: { fontSize: 7.5, color: "#718090", marginTop: 2 },
  totals: { width: 225, marginLeft: "auto", marginTop: 20 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, color: "#405466" },
  grandTotal: { flexDirection: "row", justifyContent: "space-between", marginTop: 3, borderTopWidth: 1.5, borderTopColor: "#102c47", paddingTop: 9, fontFamily: "Helvetica-Bold", fontSize: 12, color: "#102c47" },
  note: { color: "#506475", lineHeight: 1.5, fontSize: 8.5 },
  terms: { color: "#506475", lineHeight: 1.5, fontSize: 8 },
  preview: { position: "absolute", top: 112, left: 42, color: "#b42318", fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1.2 },
});

const inr = (paise: number) => `INR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(paise / 100)}`;
const date = (value: Date) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(value);
const value = (input: { toString(): string } | number) => input.toString();

export function QuotePdf({ quote, documentState = "ISSUED" }: { quote: PdfQuote; documentState?: "DRAFT_PREVIEW" | "ISSUED" }) {
  const revision = quote.revision;
  return <Document title={`${quote.number} - ${quote.company}`} author="Clockwork AV" subject="Commercial quotation">
    <Page size="A4" style={styles.page}>
      <View fixed style={styles.header}>
        <Text style={styles.company}>CLOCKWORK AV</Text>
        <Text style={styles.strap}>PRODUCTION - DESIGN - TECHNOLOGY</Text>
        <Text style={styles.companyDetails}>Clockwork Design LLP{`\n`}18B, Prince Anwar Shah Lane, Kolkata, WB 700033{`\n`}GSTIN: 19AATFC2886K1ZL</Text>
      </View>
      <View fixed style={styles.footer}><Text>Clockwork AV - Confidential commercial quotation</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>
      {documentState === "DRAFT_PREVIEW" && <Text fixed style={styles.preview}>DRAFT PDF PREVIEW — NOT ISSUED</Text>}
      <View style={styles.titleRow}>
        <View><Text style={styles.kicker}>{quote.type === "CLIENT" ? "CLIENT OFFER" : "VENDOR OFFER"}</Text><Text style={styles.title}>Quotation</Text></View>
        <View style={styles.quoteMeta}><Text><Text style={styles.metaLabel}>Quote no. </Text>{quote.number}</Text><Text><Text style={styles.metaLabel}>Revision </Text>{revision.revisionNumber}</Text><Text><Text style={styles.metaLabel}>Prepared </Text>{date(revision.preparedDate)}</Text><Text><Text style={styles.metaLabel}>Valid until </Text>{revision.validUntil ? date(revision.validUntil) : "On request"}</Text></View>
      </View>
      <View style={styles.info}>
        <View style={styles.infoColumn}><Text style={styles.infoLabel}>Prepared for</Text><Text style={styles.infoValue}>{quote.company}</Text><Text style={styles.infoLabel}>Project</Text><Text style={styles.infoValue}>{quote.project || "-"}</Text></View>
        <View style={styles.infoColumn}><Text style={styles.infoLabel}>Venue</Text><Text style={styles.infoValue}>{quote.venue || "-"}</Text><Text style={styles.infoLabel}>City</Text><Text style={styles.infoValue}>{quote.city || "-"}</Text></View>
      </View>
      <View style={styles.section}><Text style={styles.sectionTitle}>Equipment and services</Text>
        <View style={styles.tableHead}><Text style={styles.colItem}>ITEM</Text><Text style={styles.colQty}>QTY</Text><Text style={styles.colDays}>DAYS</Text><Text style={styles.colRate}>RATE</Text><Text style={styles.colDiscount}>DISC.</Text><Text style={styles.colAmount}>AMOUNT</Text></View>
        {revision.lines.map((line, index) => { const personnel = line.pricingFamilySnapshot === "HEADCOUNT_DUTY"; const pkg = Boolean(line.packageCodeSnapshot); return <View style={styles.row} key={`${line.itemCodeSnapshot}-${index}`} wrap={false}><View style={styles.colItem}><Text style={styles.itemName}>{line.itemNameSnapshot}</Text><Text style={styles.itemSub}>{pkg ? `${line.packageCodeSnapshot} - package v${line.packageVersionSnapshot} - ${line.packagePricingModeSnapshot}` : personnel ? `${line.itemCodeSnapshot} - ${line.headcountSnapshot} people; ${line.dutyUnitsPerPersonSnapshot} duties/person` : `${line.itemCodeSnapshot}${line.descriptionSnapshot ? ` - ${line.descriptionSnapshot}` : ""} - ${line.unitSnapshot}${line.durationPolicyCodeSnapshot ? ` - ${line.durationPolicyCodeSnapshot} × ${line.chargeUnitsSnapshot}` : ""}`}</Text></View><Text style={styles.colQty}>{pkg ? line.packageQuantitySnapshot : line.billableQuantitySnapshot ?? value(line.quantity)}</Text><Text style={styles.colDays}>{personnel || pkg ? "-" : line.usageDaysSnapshot ?? value(line.days)}</Text><Text style={styles.colRate}>{inr(line.rateUsedPaise)}</Text><Text style={styles.colDiscount}>{value(line.discountPercent)}%</Text><Text style={styles.colAmount}>{inr(line.lineTotalPaise)}</Text></View>; })}
      </View>
      <View style={styles.totals}><View style={styles.totalRow}><Text>Subtotal</Text><Text>{inr(revision.subtotalPaise)}</Text></View><View style={styles.totalRow}><Text>Discount</Text><Text>-{inr(revision.discountTotalPaise)}</Text></View><View style={styles.totalRow}><Text>GST ({value(revision.taxPercentage)}%)</Text><Text>{inr(revision.taxTotalPaise)}</Text></View><View style={styles.grandTotal}><Text>Total</Text><Text>{inr(revision.grandTotalPaise)}</Text></View></View>
      {revision.notes && <View style={styles.section}><Text style={styles.sectionTitle}>Notes</Text><Text style={styles.note}>{revision.notes}</Text></View>}
      <View style={styles.section} wrap={false}><Text style={styles.sectionTitle}>Terms</Text><Text style={styles.terms}>{revision.termsSnapshot || "This quotation is subject to availability, final technical confirmation, and applicable taxes. Payment terms and project-specific conditions will be confirmed in writing."}</Text></View>
    </Page>
  </Document>;
}
