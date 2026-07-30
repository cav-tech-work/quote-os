import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { QuoteRepository } from "./quote-repository";

export default async function QuotesPage() {
  const session = await auth();
  if (!session?.user?.active) redirect("/signin");
  return <QuoteRepository />;
}
