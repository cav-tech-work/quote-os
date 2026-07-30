"use client";
import { FormEvent, useEffect, useState } from "react";
import styles from "./access.module.css";
import { AppSidebar } from "../components/app-sidebar";
type User = { id: string; name: string | null; email: string; role: "ADMIN" | "QUOTE_USER"; active: boolean; accessManager: boolean };
export function AccessManager() {
  const [users, setUsers] = useState<User[]>([]); const [message, setMessage] = useState("");
  const load = async () => { const response = await fetch("/api/access/users"); if (response.ok) setUsers(await response.json()); };
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/access/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), role: form.get("role"), active: true }) }); if (!response.ok) { setMessage("Could not update access. Check the email and try again."); return; } event.currentTarget.reset(); setMessage("Access saved. The user can now sign in with Google."); await load(); }
  return <main className="app"><AppSidebar /><section className={styles.page}><header><div><p className="eyebrow">ADMINISTRATION</p><h1>QuoteOS access</h1><p>Control who can prepare and administer quotations.</p></div></header><section><h2>Grant access</h2><p>Invite a user as a quote user or administrator. Access-manager authority cannot be delegated.</p><form onSubmit={submit}><input name="email" type="email" placeholder="name@clockwork-av.com" required /><select name="role" defaultValue="QUOTE_USER"><option value="QUOTE_USER">Quote user</option><option value="ADMIN">Administrator</option></select><button className="primary">Save access</button></form>{message && <p className={styles.message}>{message}</p>}</section><section><h2>Authorised users</h2><div className={styles.userList}>{users.map((user) => <div key={user.id}><span><b>{user.name ?? user.email}</b><small>{user.email}</small></span><span>{user.accessManager ? "Access manager" : user.role === "ADMIN" ? "Administrator" : "Quote user"}</span><span>{user.active ? "Active" : "Inactive"}</span></div>)}</div></section></section></main>;
}
