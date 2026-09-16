import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppSidebar } from "@/app/components/app-sidebar";
import styles from "./packages.module.css";

export const dynamic = "force-dynamic";

export default async function PackageAdminPage() {
  const user = await getCurrentUser();
  if (!user?.active || user.role !== "ADMIN") redirect("/");
  const packages = await prisma.packageTemplate.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }], include: { parentCommercialOffering: { select: { code: true, name: true } }, components: { orderBy: { sortOrder: "asc" }, include: { commercialOffering: { select: { code: true, name: true, billingUnit: true, canonicalItem: { select: { code: true } } } } } } } });
  return <main className="app"><AppSidebar isAdmin isAccessManager={user.accessManager} /><section className={styles.page}>
    <header className={styles.pageHeader}><div><small>COMMERCIAL COMPOSITIONS</small><h1>Package recipes</h1><p>Build draft recipes from catalogue components. Recipe quantity never represents stock.</p></div><Link className={styles.primary} href="/admin/packages/new">Create Package</Link></header>
    {packages.length === 0 ? <section className={styles.empty}><h2>No package recipes yet</h2><p>The CCI workbooks did not create packages. Start the first recipe manually.</p><Link className={styles.primary} href="/admin/packages/new">New Package</Link></section> : packages.map((pkg) => <article key={pkg.id} className={styles.card}>
      <div className={styles.cardHeader}><div><h2>{pkg.name} <small>v{pkg.version}</small></h2><p><code>{pkg.code}</code> · {pkg.pricingMode} · {pkg.active ? "ACTIVE" : "DRAFT"}</p></div><Link href={`/admin/packages/new?from=${pkg.id}`}>Create new version</Link></div>
      <p>Parent offering: {pkg.parentCommercialOffering ? `${pkg.parentCommercialOffering.code} — ${pkg.parentCommercialOffering.name}` : "Not required"}</p>
      <div className={styles.recipeList}>{pkg.components.map((component) => <div key={component.id}><b>{component.commercialOffering.name}</b><span>{component.commercialOffering.code} · Parent {component.commercialOffering.canonicalItem?.code ?? "—"}</span><span>{component.quantityValue.toString()} {component.commercialOffering.billingUnit} · {component.billingMode}</span></div>)}</div>
    </article>)}
  </section></main>;
}
