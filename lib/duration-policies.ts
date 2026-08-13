import { Prisma, type DurationPolicyMode, type DurationRoundingMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class DurationPolicyInputError extends Error {}

export type CreateDurationPolicyInput = { code: string; name: string; mode: DurationPolicyMode; chargeMultiplierNumerator: number; chargeMultiplierDenominator: number; minimumChargeNumerator: number; minimumChargeDenominator: number; roundingMode: DurationRoundingMode; description?: string | null };
function validate(input: CreateDurationPolicyInput) {
  if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(input.code)) throw new DurationPolicyInputError("Policy code must be uppercase letters, numbers, or underscores.");
  for (const field of ["chargeMultiplierNumerator", "chargeMultiplierDenominator", "minimumChargeNumerator", "minimumChargeDenominator"] as const) if (!Number.isInteger(input[field])) throw new DurationPolicyInputError("Policy ratios must use integers.");
  if (input.chargeMultiplierNumerator < 0 || input.minimumChargeNumerator < 0 || input.chargeMultiplierDenominator <= 0 || input.minimumChargeDenominator <= 0) throw new DurationPolicyInputError("Policy numerators must be non-negative and denominators positive.");
}
export async function createDurationPolicy(input: CreateDurationPolicyInput) { validate(input); return prisma.durationPolicy.create({ data: { ...input, name: input.name.trim(), description: input.description?.trim() || null } }); }
export async function assignDurationPolicy(input: { actorId: string; offeringId: string; policyId: string | null; reason: string }, database = prisma) {
  const reason = input.reason.trim(); if (!reason) throw new DurationPolicyInputError("An assignment reason is required.");
  return database.$transaction(async (tx) => {
    const offering = await tx.commercialOffering.findUnique({ where: { id: input.offeringId }, select: { durationPolicyId: true } }); if (!offering) throw new DurationPolicyInputError("Offering not found.");
    if (input.policyId) { const policy = await tx.durationPolicy.findUnique({ where: { id: input.policyId }, select: { active: true } }); if (!policy) throw new DurationPolicyInputError("Policy not found."); if (!policy.active) throw new DurationPolicyInputError("Inactive policies cannot be newly assigned."); }
    if (offering.durationPolicyId === input.policyId) return { changed: false };
    await tx.commercialOffering.update({ where: { id: input.offeringId }, data: { durationPolicyId: input.policyId } });
    await tx.durationPolicyAssignmentAudit.create({ data: { actorId: input.actorId, commercialOfferingId: input.offeringId, oldPolicyId: offering.durationPolicyId, newPolicyId: input.policyId, reason } });
    return { changed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
