import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PackageAdminPage() {
  const user = await getCurrentUser();
  if (!user?.active || user.role !== "ADMIN") redirect("/");
  const packages = await prisma.packageTemplate.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }], include: { parentCommercialOffering: { select: { code: true, name: true } }, components: { orderBy: { sortOrder: "asc" }, include: { commercialOffering: { select: { code: true, name: true, pricingFamily: true } } } } } });
  return <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}><h1>Package recipes</h1><p>Version-safe, internally approved commercial compositions. Used versions are reviewed by creating a new version, not by rewriting quote history.</p>{packages.length === 0 ? <p>No package templates exist. Development fixtures are test-only and never bootstrapped.</p> : packages.map((pkg) => <section key={pkg.id} style={{ border: "1px solid #d8e0e8", borderRadius: 8, padding: 18, marginTop: 16 }}><h2>{pkg.name} <small>v{pkg.version}</small></h2><p><code>{pkg.code}</code> · {pkg.pricingMode} · {pkg.authority} · {pkg.active ? "ACTIVE" : "INACTIVE"}</p><p>Parent: {pkg.parentCommercialOffering ? `${pkg.parentCommercialOffering.code} — ${pkg.parentCommercialOffering.name}` : "None"}</p><table><thead><tr><th>Order</th><th>Component</th><th>Rule</th><th>Value</th><th>Billing</th><th>Duties/person</th></tr></thead><tbody>{pkg.components.map((component) => <tr key={component.id}><td>{component.sortOrder}</td><td>{component.commercialOffering.code} — {component.commercialOffering.name}</td><td>{component.quantityRuleType}</td><td>{component.quantityValue.toString()}</td><td>{component.billingMode}</td><td>{component.dutyUnitsPerPerson?.toString() ?? "—"}</td></tr>)}</tbody></table></section>)}</main>;
}
