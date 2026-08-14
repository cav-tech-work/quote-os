export type ReadinessSide = "TO_CLIENT" | "TO_VENDOR";
export type ReadinessOffering = {
  quantityBasis: string | null;
  billingUnit: string | null;
  kind: string | null;
  durationPolicy: { active: boolean; authority: string; mode: string } | null;
  rates: Record<ReadinessSide, unknown | null>;
};

const ORDINARY_QUANTITY_BASES = new Set(["COUNT", "FIXED", "AREA_LW", "AREA_LH", "LINEAR", "VOLUME"]);

export function ordinaryReadinessBlockers(offering: ReadinessOffering, side: ReadinessSide) {
  const blockers: string[] = [];
  if (!offering.quantityBasis || !ORDINARY_QUANTITY_BASES.has(offering.quantityBasis)) blockers.push(offering.quantityBasis === "HEADCOUNT_DUTY" ? "HEADCOUNT_DUTY" : "QUANTITY_OR_SPECIALIZED");
  if (!offering.billingUnit) blockers.push("BILLING_UNIT");
  if (!offering.durationPolicy?.active || offering.durationPolicy.authority !== "INTERNAL_APPROVED") blockers.push("DURATION_POLICY");
  if (offering.durationPolicy?.mode === "MANUAL" || offering.kind === "PACKAGE") blockers.push("MANUAL_OR_PACKAGE");
  if (!offering.rates[side]) blockers.push("RATE");
  return blockers;
}

export function isOrdinaryQuoteReady(offering: ReadinessOffering, side: ReadinessSide) {
  return ordinaryReadinessBlockers(offering, side).length === 0;
}
