import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const category = async (name) => (await prisma.catalogueCategory.findFirst({ where: { name, parentId: null } })) ?? prisma.catalogueCategory.create({ data: { name } });
  const audio = await category("Audio");
  const lighting = await category("Lighting");
  const video = await category("Video");
  for (const item of [
    { code: "AUD001", name: "d&b V8 Cabinet", categoryId: audio.id, vendorRatePaise: 400000, clientRatePaise: 560000 },
    { code: "LGT012", name: "Ayrton Diablo Profile", categoryId: lighting.id, vendorRatePaise: 550000, clientRatePaise: 770000 },
    { code: "VID004", name: "2.6mm LED Wall Panel", categoryId: video.id, vendorRatePaise: 125000, clientRatePaise: 175000 }
  ]) await prisma.catalogueItem.upsert({ where: { code: item.code }, update: item, create: item });
  const existingItems = await prisma.catalogueItem.findMany({ select: { id: true, vendorRatePaise: true } });
  await Promise.all(existingItems.map((item) => prisma.catalogueItem.update({ where: { id: item.id }, data: { clientRatePaise: Math.round(item.vendorRatePaise * 1.4) } })));
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
