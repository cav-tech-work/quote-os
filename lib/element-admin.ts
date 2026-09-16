import { Prisma, type CatalogueDomain, type OfferingKind, type PricingFamily, type QuantityBasis, type UnitCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyRateChange, parseRupeesToPaise, RateInputError } from "@/lib/catalogue-rates";
import {
  ELEMENT_KIND_OPTIONS,
  ElementInputError,
  MEASUREMENT_OPTIONS,
  normalizeElementCode,
  ORDINARY_MEASUREMENTS,
  PARENT_CATEGORY_OPTIONS,
  UNIT_OPTIONS,
} from "@/lib/element-options";

/**
 * Manual element administration for operational V1.
 *
 * CanonicalItem is the reusable parent identity; CommercialOffering is the
 * element. A parent identified by Parent Code is always reused, never
 * duplicated. A blank TO_CLIENT price creates no Price row, while an explicit
 * zero creates an audited zero-value GLOBAL price.
 */

export { ElementInputError } from "@/lib/element-options";

export type CreateElementInput = {
  actorId: string;
  name: string;
  code: string;
  kind?: OfferingKind;
  parentCode: string;
  parentName: string;
  parentCategory: CatalogueDomain;
  billingUnit: UnitCode;
  measurement: QuantityBasis;
  /** Blank or null means "no TO_CLIENT price". "0" is an explicit zero price. */
  toClientRupees?: string | null;
};

export type CreateElementResult = {
  offering: { id: string; code: string; name: string };
  parent: { id: string; code: string; name: string };
  parentCreated: boolean;
  toClientAmountPaise: number | null;
};

export async function createCatalogueElement(input: CreateElementInput, database = prisma): Promise<CreateElementResult> {
  const name = input.name.trim();
  if (!name) throw new ElementInputError("Element name is required.");
  if (name.length > 200) throw new ElementInputError("Element name must be 200 characters or fewer.");

  const code = normalizeElementCode(input.code, "Element code");
  const parentCode = normalizeElementCode(input.parentCode, "Parent code");

  const parentName = input.parentName.trim();
  if (!parentName) throw new ElementInputError("Parent category / name is required.");
  if (parentName.length > 200) throw new ElementInputError("Parent category / name must be 200 characters or fewer.");

  const kind = input.kind ?? "ITEM";
  if (!ELEMENT_KIND_OPTIONS.some((option) => option.value === kind)) throw new ElementInputError("Select a supported element type.");
  if (!PARENT_CATEGORY_OPTIONS.includes(input.parentCategory)) throw new ElementInputError("Select a supported parent category.");
  if (!UNIT_OPTIONS.some((option) => option.value === input.billingUnit)) throw new ElementInputError("Select a supported billing unit.");
  if (!MEASUREMENT_OPTIONS.some((option) => option.value === input.measurement)) throw new ElementInputError("Select a supported measurement.");

  const rawRupees = (input.toClientRupees ?? "").trim();
  let amountPaise: number | null = null;
  if (rawRupees !== "") {
    try {
      amountPaise = parseRupeesToPaise(rawRupees);
    } catch (error) {
      if (error instanceof RateInputError) throw new ElementInputError(error.message);
      throw error;
    }
  }

  // Ordinary measurements carry the default ORDINARY family. HEADCOUNT_DUTY is an
  // audited personnel approval and is never granted by manual creation.
  const pricingFamily: PricingFamily | null = ORDINARY_MEASUREMENTS.has(input.measurement) ? "ORDINARY" : null;

  try {
    return await database.$transaction(async (tx) => {
      let parent = await tx.canonicalItem.findUnique({ where: { code: parentCode }, select: { id: true, code: true, name: true } });
      let parentCreated = false;
      if (!parent) {
        try {
          parent = await tx.canonicalItem.create({ data: { code: parentCode, name: parentName, domain: input.parentCategory }, select: { id: true, code: true, name: true } });
          parentCreated = true;
        } catch (error) {
          // A concurrent create for the same Parent Code is reused, never duplicated.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            parent = await tx.canonicalItem.findUniqueOrThrow({ where: { code: parentCode }, select: { id: true, code: true, name: true } });
          } else {
            throw error;
          }
        }
      }

      let offering: { id: string; code: string; name: string };
      try {
        offering = await tx.commercialOffering.create({
          data: { code, name, kind, canonicalItemId: parent.id, billingUnit: input.billingUnit, quantityBasis: input.measurement, pricingFamily },
          select: { id: true, code: true, name: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ElementInputError(`Element code ${code} already exists. Choose a different element code.`);
        }
        throw error;
      }

      if (amountPaise !== null) {
        await applyRateChange(tx, {
          actorId: input.actorId,
          offeringId: offering.id,
          side: "TO_CLIENT",
          scopeType: "GLOBAL",
          marketId: null,
          expectedCurrentPriceId: null,
          amountPaise,
          reason: `Initial TO_CLIENT GLOBAL rate set while creating element ${code}.`,
        });
      }

      return { offering, parent, parentCreated, toClientAmountPaise: amountPaise };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ElementInputError || error instanceof RateInputError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ElementInputError(`Element code ${code} already exists. Choose a different element code.`);
    }
    throw error;
  }
}
