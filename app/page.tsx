import { QuoteWorkspace } from "./quote-workspace";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!user.active) redirect("/signin?error=disabled");
  return <QuoteWorkspace />;
}
