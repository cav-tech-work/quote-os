import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { InventoryManager } from "./inventory-manager";

export default async function CataloguePage() {
  const session = await auth();
  if (!session?.user?.active || session.user.role !== "ADMIN") redirect("/");
  return <InventoryManager />;
}
