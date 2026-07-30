import { QuoteWorkspace } from "./quote-workspace";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!process.env.DATABASE_URL || !process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return <QuoteWorkspace />;
  const session = await auth();
  if (!session?.user?.active) redirect("/signin");
  return <QuoteWorkspace />;
}
