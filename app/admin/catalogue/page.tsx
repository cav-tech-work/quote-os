import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { CatalogueRateAdmin } from "./catalogue-rate-admin";

export const dynamic = "force-dynamic";

export default async function CatalogueRateAdminPage() {
  const user = await getCurrentUser();
  if (!user?.active || user.role !== "ADMIN") redirect("/");
  return <CatalogueRateAdmin isAccessManager={user.accessManager} />;
}
