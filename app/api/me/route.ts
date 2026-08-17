import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.active) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json({ isAdmin: user.role === "ADMIN", isAccessManager: user.accessManager });
}
