"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "../components/app-sidebar";

type Quote = { id: string; number: string; type: string; status: string; company: string; project: string | null; revisions: { grandTotalPaise: number }[] };
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function QuoteRepository() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/quotes").then(async (response) => response.ok ? setQuotes(await response.json()) : setError("Could not load quotations.")); }, []);
  return <main className="app"><AppSidebar /><section className="content repository"><header><div><small>QUOTATIONS</small><h1>Quote repository</h1><p>Every commercial revision retained in one place.</p></div><a className="primary" href="/">New quote</a></header><section><h2>Saved drafts</h2>{error && <p>{error}</p>}<div className="user-list">{quotes.length === 0 ? <p>No quotes saved yet.</p> : quotes.map((quote) => <div key={quote.id}><span><b>{quote.number}</b><small>{quote.company}{quote.project ? ` - ${quote.project}` : ""}</small></span><span>{quote.type.toLowerCase()} - {quote.status.toLowerCase()}</span><span>{money.format((quote.revisions[0]?.grandTotalPaise ?? 0) / 100)}</span><a className="pdfLink" href={`/api/quotes/${quote.id}/pdf`}>Export PDF</a></div>)}</div></section></section></main>;
}
