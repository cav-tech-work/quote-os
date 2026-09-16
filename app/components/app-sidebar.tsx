"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const baseLinks = [
  { href: "/", label: "New quote", icon: "+" },
  { href: "/quotes", label: "Quote repository", icon: "□" }
];

export function AppSidebar({ isAdmin = false, isAccessManager = false }: { isAdmin?: boolean; isAccessManager?: boolean }) {
  const pathname = usePathname();
  const [access, setAccess] = useState({ isAdmin, isAccessManager });
  useEffect(() => { fetch("/api/me").then((response) => response.ok ? response.json() : null).then((value) => value && setAccess(value)).catch(() => undefined); }, []);
  const links = [...baseLinks,
    ...(access.isAdmin ? [{ href: "/admin/catalogue", label: "Catalogue & Rates", icon: "▦" }, { href: "/admin/catalogue/component-reconciliation", label: "Component reconciliation", icon: "≋" }, { href: "/admin/packages", label: "Package recipes", icon: "◫" }, { href: "/admin/catalogue/review", label: "Catalogue Review / Release", icon: "✓" }, { href: "/catalogue", label: "Legacy inventory", icon: "◇" }] : []),
    ...(access.isAccessManager ? [{ href: "/access", label: "User access", icon: "◎" }] : []),
  ];
  return <aside className="sidebar"><a className="brand" href="/"><span className="brandMark">C</span><span>quote<span>OS</span></span></a><nav>{links.map((link) => <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}><i>{link.icon}</i>{link.label}</a>)}</nav><div className="sidebarFooter"><span className="statusDot" />Secure workspace<small>Clockwork AV</small></div></aside>;
}
