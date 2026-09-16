"use client";
import { useEffect, useState } from "react";
import styles from "./access.module.css";
import { AdminButton } from "../components/admin-button";
import { AppSidebar } from "../components/app-sidebar";

type User = { id: string; name: string | null; email: string; role: "ADMIN" | "QUOTE_USER"; active: boolean; accessManager: boolean };

export function AccessManager() {
  const [users, setUsers] = useState<User[]>([]); const [message, setMessage] = useState("");
  const load = async () => { const response = await fetch("/api/access/users"); if (response.ok) setUsers(await response.json()); else setMessage("Could not load users."); };
  useEffect(() => { void load(); }, []);
  async function update(user: User, data: Partial<Pick<User, "role" | "active">>) { setMessage(""); const response = await fetch(`/api/access/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) { setMessage(result.error?.formErrors?.[0] ?? result.error ?? "Could not update user."); return; } setMessage("User access updated."); await load(); }
  return <main className="app"><AppSidebar /><section className={styles.page}><header><div><p className="eyebrow">ADMINISTRATION</p><h1>QuoteOS users</h1><p>Clockwork AV Google accounts join automatically on first sign-in. Manage their application role and access here.</p></div></header><section><h2>Authenticated users</h2><p>Only the two system access managers can change user roles or access. System access-manager accounts are permanently protected.</p>{message && <p className={styles.message}>{message}</p>}<div className={styles.userList}><div className={styles.listHead}><span>Name and email</span><span>Role</span><span>Status</span><span>System manager</span><span>Actions</span></div>{users.map((user) => <div key={user.id}><span><b>{user.name ?? user.email}</b><small>{user.email}</small></span><span>{user.role === "ADMIN" ? "Administrator" : "Quote user"}</span><span>{user.active ? "Active" : "Inactive"}</span><span>{user.accessManager ? "Yes" : "No"}</span><span className={styles.actions}>{user.accessManager ? <small>Protected system account</small> : <>{user.role === "ADMIN" ? <AdminButton size="sm" onClick={() => update(user, { role: "QUOTE_USER" })}>Demote</AdminButton> : <AdminButton size="sm" onClick={() => update(user, { role: "ADMIN" })}>Promote</AdminButton>}<AdminButton size="sm" variant={user.active ? "destructive" : "secondary"} onClick={() => update(user, { active: !user.active })}>{user.active ? "Deactivate" : "Reactivate"}</AdminButton></>}</span></div>)}</div></section></section></main>;
}
