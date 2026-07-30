import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "QuoteOS | Clockwork AV", description: "Clockwork AV's quotation engine" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
