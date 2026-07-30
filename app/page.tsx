import { QuoteWorkspace } from "./quote-workspace";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.active) redirect("/signin");
  return <QuoteWorkspace />;
}
