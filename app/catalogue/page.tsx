import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { InventoryManager } from "./inventory-manager";

export default async function CataloguePage() {
  const user = await getCurrentUser();
  if (!user?.active || user.role !== "ADMIN") redirect("/");
  return <InventoryManager />;
}
