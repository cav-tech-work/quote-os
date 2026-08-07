import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { QuoteRepository } from "./quote-repository";

export default async function QuotesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (!user.active) redirect("/signin?error=disabled");
  return <QuoteRepository />;
}
