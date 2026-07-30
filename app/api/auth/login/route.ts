import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setSession } from "@/lib/auth";

const input = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: NextRequest) {
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password" }, { status: 400 });
  const { email, password } = parsed.data;
  const admin = email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD;
  const quoteUser = email === process.env.QUOTE_USER_EMAIL && password === process.env.QUOTE_USER_PASSWORD;
  if (!admin && !quoteUser) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const response = NextResponse.json({ email, role: admin ? "ADMIN" : "QUOTE_USER" });
  setSession(response, { email, role: admin ? "ADMIN" : "QUOTE_USER" });
  return response;
}
