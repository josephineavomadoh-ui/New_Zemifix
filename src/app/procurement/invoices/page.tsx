'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Receipt, CheckCircle2, AlertTriangle, XCircle, Search, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function InvoiceMatchingPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Match Action Form
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceAmount, setInvoiceAmount] = useState<string>('');
  const [selectedMatchResult, setSelectedMatchResult] = useState<any | null>(null);

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/invoices');
      const data = await res.json();
      if (res.ok) setMatches(data.matches ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    fetch('/api/procurement/purchase-orders')
      .then((r) => r.json())
      .then((data) => {
        const activePos = (data.purchaseOrders ?? []).filter((p: any) => ['ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(p.status));
        setPurchaseOrders(activePos);
        if (activePos[0]) {
          setSelectedPoId(activePos[0].id);
          setInvoiceAmount(activePos[0].totalAmount);
        }
      });
  }, []);

  const handlePerformMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/procurement/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poId: selectedPoId,
          invoiceNumber,
          invoiceAmount: Number(invoiceAmount),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedMatchResult(data.matchResult);
        fetchMatches();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Procurement & Finance Integration"
        eyebrowIcon={Receipt}
        title="3-Way Invoice Matching Hub"
        description="Verify 3-way matching between Approved Purchase Orders, Goods Received Notes, and Supplier Invoices. Detects price, quantity, and tax variances."
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement' },
          { label: '3-Way Invoice Matching' },
        ]}
      />

      {/* Perform Match Form */}
      <form onSubmit={handlePerformMatch} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-[#080E29]">Perform 3-Way Invoice Validation</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Purchase Order *</label>
            <select
              value={selectedPoId}
              onChange={(e) => {
                setSelectedPoId(e.target.value);
                const po = purchaseOrders.find((p) => p.id === e.target.value);
                if (po) setInvoiceAmount(po.totalAmount);
              }}
              className={inputClass}
              required
            >
              {purchaseOrders.map((p) => (
                <option key={p.id} value={p.id}>{p.poNumber} - {p.vendor?.registeredName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Invoice Number</label>
            <input
              type="text"
              required
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2026-991"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Invoiced Amount (GHS)</label>
            <input
              type="number"
              step="0.01"
              required
              value={invoiceAmount}
              onChange={(e) => setInvoiceAmount(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-[#FF5B00] hover:bg-[#E65200] rounded-lg shadow-xs">
            Validate 3-Way Match
          </button>
        </div>
      </form>

      {/* Match Result Output */}
      {selectedMatchResult && (
        <div className={`rounded-xl border p-5 space-y-3 ${selectedMatchResult.matchStatus === 'MATCHED' ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
          <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
            <h3 className="text-sm font-bold text-[#080E29]">3-Way Match Audit Result</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${selectedMatchResult.matchStatus === 'MATCHED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {selectedMatchResult.matchStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div><strong>PO Number:</strong> {selectedMatchResult.poNumber}</div>
            <div><strong>Vendor:</strong> {selectedMatchResult.vendorName}</div>
            <div><strong>PO Total:</strong> GHS {Number(selectedMatchResult.poTotal).toFixed(2)}</div>
            <div><strong>Invoiced Total:</strong> GHS {Number(selectedMatchResult.invoicedTotal).toFixed(2)}</div>
          </div>

          {selectedMatchResult.discrepancies.length > 0 && (
            <div className="bg-amber-100/70 p-3 rounded-lg text-xs text-amber-900 font-medium space-y-1">
              <strong>Detected Variances / Exceptions:</strong>
              <ul className="list-disc pl-5 space-y-1">
                {selectedMatchResult.discrepancies.map((d: string, idx: number) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Matches Overview Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-8"><LoadingSkeleton lines={5} /></div>
        ) : matches.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No 3-way invoice match audits recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="p-3.5">PO Ref</th>
                  <th className="p-3.5">Vendor</th>
                  <th className="p-3.5">GRN Ref</th>
                  <th className="p-3.5">PO Value</th>
                  <th className="p-3.5">Invoiced Value</th>
                  <th className="p-3.5">Match Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matches.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[#FF5B00]">{m.poNumber}</td>
                    <td className="p-3.5 font-medium text-slate-800">{m.vendorName}</td>
                    <td className="p-3.5 font-mono text-slate-600">{m.grnNumber}</td>
                    <td className="p-3.5 font-mono">GHS {Number(m.poTotal).toFixed(2)}</td>
                    <td className="p-3.5 font-mono font-bold">GHS {Number(m.invoicedTotal).toFixed(2)}</td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${m.matchStatus === 'MATCHED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {m.matchStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
