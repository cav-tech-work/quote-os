import { signIn } from "@/auth";
import { isDevAuthBypassEnabled } from "@/lib/dev-auth";
import { redirect } from "next/navigation";

const messages: Record<string, string> = {
  domain: "QuoteOS is available only to verified Clockwork AV Google accounts.",
  disabled: "Your QuoteOS access has been disabled. Please contact a system access manager."
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (isDevAuthBypassEnabled()) redirect("/");
  const { error } = await searchParams;
  return <main className="signin"><section><p className="eyebrow">CLOCKWORK AV</p><h1>Welcome to QuoteOS</h1><p>Sign in with your Clockwork AV Google account to create and manage quotations.</p>{error && <p className="notice">{messages[error] ?? "We could not complete your sign-in. Please try again."}</p>}<form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}><button className="primary" type="submit">Continue with Google</button></form></section></main>;
}
