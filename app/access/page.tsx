import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AccessManager } from "./access-manager";

export default async function AccessPage() {
  const user = await getCurrentUser();
  if (!user?.active || !user.accessManager) redirect("/");
  return <AccessManager />;
}
