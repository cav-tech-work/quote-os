import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { CatalogueReviewWorkspace } from "./workspace";
export const dynamic = "force-dynamic";
export default async function Page() { const user = await getCurrentUser(); if (!user?.active || user.role !== "ADMIN") redirect("/"); return <CatalogueReviewWorkspace />; }
