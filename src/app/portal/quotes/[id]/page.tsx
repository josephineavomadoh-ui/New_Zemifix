'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { NotificationHub } from '@/src/components/notifications/NotificationHub';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function CustomerPortalQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const quoteId = resolvedParams.id;
  const router = useRouter();

  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [decisionNotes, setDecisionNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/quotes/${quoteId}`)
      .then((res) => res.json())
      .then((data) => setQuote(data.quote ?? null))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [quoteId]);

  const handleDecision = async (decision: 'ACCEPTED' | 'DECLINED') => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decisionNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record decision');

      router.push('/portal/quotes');
    } catch (err: any) {
      setError(err.message ?? 'Decision submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-xs text-slate-500">Loading quotation…</div>;
  }

  if (!quote) {
    return <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-xs text-slate-500">Quotation not found.</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/portal/quotes"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#080E29] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Quotes
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#FF5B00]" />
            <h1 className="text-base font-semibold text-[#080E29]">Quotation {quote.quoteNumber} (v{quote.version})</h1>
          </div>
        </div>
        <NotificationHub realm="portal" dark={false} />
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">{quote.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Site: {quote.site?.name || 'General Account'}</p>
            </div>
            <StatusBadge status={quote.status} />
          </div>

          {/* Line items table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Itemized Quotation Lines</h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Description</th>
                    <th className="px-4 py-2.5 text-right">Qty</th>
                    <th className="px-4 py-2.5 text-right">Unit Price</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quote.lines?.map((line: any) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3 text-slate-800">{line.description}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{Number(line.quantity)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">GHS {Number(line.unitPrice).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">GHS {Number(line.lineTotal).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals & Tax */}
          <div className="flex justify-end pt-2">
            <div className="w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono">GHS {Number(quote.subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>VAT (15%)</span>
                <span className="font-mono">GHS {Number(quote.vatAmount ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>NHIL (2.5%) & GETFund (2.5%)</span>
                <span className="font-mono">GHS {Number(Number(quote.nhilAmount ?? 0) + Number(quote.getFundAmount ?? 0)).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-sm text-slate-900">
                <span>Total Amount</span>
                <span className="font-mono">GHS {Number(quote.totalAmount).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Decision Section */}
          {quote.status === 'SENT_TO_CUSTOMER' ? (
            <div className="border-t border-slate-200 pt-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Customer Authorization & Decision</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Decision Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="Add comments or approval notes..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 focus:outline-none focus:border-[#FF5B00]"
                />
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDecision('ACCEPTED')}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve / Accept Quotation
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDecision('DECLINED')}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  Decline Quotation
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-slate-200 pt-4 text-xs font-medium text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Quotation decision recorded as: <strong className="text-slate-800">{quote.status}</strong></span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
