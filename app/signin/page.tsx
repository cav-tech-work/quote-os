import { signIn } from "@/auth";

export default function SignInPage() {
  return <main className="signin"><section><p className="eyebrow">CLOCKWORK AV</p><h1>Welcome to QuoteOS</h1><p>Sign in with your authorised Clockwork Google account to create and manage quotations.</p><form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}><button className="primary" type="submit">Continue with Google</button></form></section></main>;
}
