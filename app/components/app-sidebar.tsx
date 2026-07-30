"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "New quote", icon: "+" },
  { href: "/quotes", label: "Quote repository", icon: "□" },
  { href: "/access", label: "User access", icon: "◎" }
];

export function AppSidebar() {
  const pathname = usePathname();
  return <aside className="sidebar"><a className="brand" href="/"><span className="brandMark">C</span><span>quote<span>OS</span></span></a><nav>{links.map((link) => <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}><i>{link.icon}</i>{link.label}</a>)}</nav><div className="sidebarFooter"><span className="statusDot" />Secure workspace<small>Clockwork AV</small></div></aside>;
}
