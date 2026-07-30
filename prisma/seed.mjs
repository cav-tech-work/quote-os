import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const audio = await prisma.catalogueCategory.upsert({ where: { name_parentId: { name: "Audio", parentId: null } }, update: {}, create: { name: "Audio" } });
  const lighting = await prisma.catalogueCategory.upsert({ where: { name_parentId: { name: "Lighting", parentId: null } }, update: {}, create: { name: "Lighting" } });
  const video = await prisma.catalogueCategory.upsert({ where: { name_parentId: { name: "Video", parentId: null } }, update: {}, create: { name: "Video" } });
  for (const item of [
    { code: "AUD001", name: "d&b V8 Cabinet", categoryId: audio.id, vendorRatePaise: 400000, clientRatePaise: 560000 },
    { code: "LGT012", name: "Ayrton Diablo Profile", categoryId: lighting.id, vendorRatePaise: 550000, clientRatePaise: 770000 },
    { code: "VID004", name: "2.6mm LED Wall Panel", categoryId: video.id, vendorRatePaise: 125000, clientRatePaise: 175000 }
  ]) await prisma.catalogueItem.upsert({ where: { code: item.code }, update: item, create: item });
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
