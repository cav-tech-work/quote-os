"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "../components/app-sidebar";

type Revision = { id: string; revisionNumber: number; status: "DRAFT" | "ISSUED" | "SUPERSEDED"; grandTotalPaise: number; eventDays?: number | null; createdAt: string; issuedAt: string | null; createdBy: { name: string | null; email: string } | null; issuedBy: { name: string | null; email: string } | null; documents: { id: string }[] };
type Quote = { id: string; number: string; type: string; status: string; company: string; project: string | null; revisions: Revision[] };
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function QuoteRepository() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [error, setError] = useState("");
  async function load() { const response = await fetch("/api/quotes"); if (response.ok) setQuotes(await response.json()); else setError("Could not load quotations."); }
  useEffect(() => { void load(); }, []);
  async function issue(quoteId: string, revisionId: string) { const response = await fetch(`/api/quotes/${quoteId}/revisions/${revisionId}/issue`, { method: "POST" }); if (!response.ok) setError((await response.json()).error ?? "Could not issue revision."); else await load(); }
  async function revise(quoteId: string, revisionId: string) { const response = await fetch(`/api/quotes/${quoteId}/revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceRevisionId: revisionId }) }); if (!response.ok) setError((await response.json()).error ?? "Could not create revision."); else await load(); }
  return <main className="app"><AppSidebar /><section className="content repository"><header><div><small>QUOTATIONS</small><h1>Quote repository</h1><p>Draft previews and retained issued documents are clearly separated.</p></div><a className="primary" href="/">New quote</a></header><section><h2>Revision history</h2>{error && <p>{error}</p>}<div className="user-list">{quotes.length === 0 ? <p>No quotes saved yet.</p> : quotes.flatMap((quote) => quote.revisions.map((revision) => <div key={revision.id}><span><b>{quote.number} · Revision {revision.revisionNumber}</b><small>{quote.company}{quote.project ? ` - ${quote.project}` : ""} · created {new Date(revision.createdAt).toLocaleString()}{revision.issuedAt ? ` · issued ${new Date(revision.issuedAt).toLocaleString()}` : ""}</small></span><span>{revision.status}</span><span>{money.format(revision.grandTotalPaise / 100)}</span><span>{revision.status === "DRAFT" ? <><a className="pdfLink" href={`/api/quotes/${quote.id}/revisions/${revision.id}/pdf`}>Preview PDF</a><button onClick={() => void issue(quote.id, revision.id)}>Issue Revision</button></> : <><a className="pdfLink" href={`/api/quotes/${quote.id}/revisions/${revision.id}/pdf`}>{revision.documents.length ? "Open Issued PDF" : "Legacy PDF"}</a>{!quote.revisions.some((item) => item.status === "DRAFT") && <button onClick={() => void revise(quote.id, revision.id)}>Create Revision</button>}</>}</span></div>))}</div></section></section></main>;
}
