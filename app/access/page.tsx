import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AccessManager } from "./access-manager";

export default async function AccessPage() {
  const session = await auth();
  if (!session?.user?.active || !session.user.accessManager) redirect("/");
  return <AccessManager />;
}
