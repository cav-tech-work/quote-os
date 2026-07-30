import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const inventoryInput = z.object({ category: z.string().trim().min(1, "Category is required").max(80), item: z.string().trim().min(1, "Item is required").max(160), brand: z.string().trim().max(120).optional(), model: z.string().trim().max(120).optional(), unitPricePaise: z.number().int().nonnegative("Unit price must be zero or more"), unit: z.string().trim().min(1).default("Per Day") });

export async function findOrCreateCategory(name: string) {
  const existing = await prisma.catalogueCategory.findFirst({ where: { name, parentId: null } });
  return existing ?? prisma.catalogueCategory.create({ data: { name } });
}
