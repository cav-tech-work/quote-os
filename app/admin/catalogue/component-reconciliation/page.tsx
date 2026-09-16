import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppSidebar } from "@/app/components/app-sidebar";
import { ComponentReconciliationWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function ComponentReconciliationPage() {
  const user = await getCurrentUser();
  if (!user?.active || user.role !== "ADMIN") redirect("/");
  return <main className="app"><AppSidebar isAdmin isAccessManager={user.accessManager} /><ComponentReconciliationWorkspace /></main>;
}
