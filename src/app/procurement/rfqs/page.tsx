'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Plus, Search, CheckCircle2, Award, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function RfqsPage() {
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [requisitionId, setRequisitionId] = useState<string>('');
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);

  // Quote Entry Modal
  const [selectedRfq, setSelectedRfq] = useState<any | null>(null);
  const [quoteVendorId, setQuoteVendorId] = useState<string>('');
  const [quotedUnitPrice, setQuotedUnitPrice] = useState<string>('');
  const [quotedTotalPrice, setQuotedTotalPrice] = useState<string>('');
  const [deliveryDays, setDeliveryDays] = useState<string>('7');
  const [paymentTerms, setPaymentTerms] = useState<string>('Net 30');

  // Evaluation Justification
  const [selectedVendorForPo, setSelectedVendorForPo] = useState<string>('');
  const [justification, setJustification] = useState<string>('');

  const fetchRfqs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/rfqs');
      const data = await res.json();
      if (res.ok) setRfqs(data.rfqs ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRfqs();
    Promise.all([
      fetch('/api/procurement/vendors').then((r) => r.json()),
      fetch('/api/procurement/requisitions').then((r) => r.json()),
    ]).then(([vData, rData]) => {
      setVendors(vData.vendors ?? []);
      setRequisitions((rData.requisitions ?? []).filter((r: any) => r.status === 'APPROVED'));
    });
  }, []);

  const handleCreateRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/procurement/rfqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          requisitionId: requisitionId || null,
          vendorIds: selectedVendorIds,
        }),
      });

      if (res.ok) {
        setIsFormOpen(false);
        setTitle('');
        setSelectedVendorIds([]);
        fetchRfqs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecordQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRfq || !quoteVendorId) return;
    try {
      const res = await fetch(`/api/procurement/rfqs/${selectedRfq.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: quoteVendorId,
          quotedUnitPrice: Number(quotedUnitPrice),
          quotedTotalPrice: Number(quotedTotalPrice),
          deliveryDays: Number(deliveryDays),
          paymentTerms,
        }),
      });

      if (res.ok) {
        setQuotedUnitPrice('');
        setQuotedTotalPrice('');
        fetchRfqs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEvaluateRfq = async () => {
    if (!selectedRfq || !selectedVendorForPo || !justification) return;
    try {
      const res = await fetch(`/api/procurement/rfqs/${selectedRfq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedVendorId: selectedVendorForPo,
          selectionJustification: justification,
        }),
      });

      if (res.ok) {
        setSelectedRfq(null);
        fetchRfqs();
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
        eyebrow="Procurement"
        eyebrowIcon={FileSpreadsheet}
        title="RFQs & Vendor Quotation Matrix"
        description="Issue Requests for Quotations to suppliers, record received quotes, compare side-by-side offers, and document selection justifications."
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement' },
          { label: 'RFQs' },
        ]}
        actions={
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#E65200] transition-colors"
          >
            <Plus className="h-4 w-4" /> New RFQ
          </button>
        }
      />

      {isFormOpen && (
        <form onSubmit={handleCreateRfq} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[#080E29]">Create Request For Quotation (RFQ)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">RFQ Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Supply of Spare Mechanical Seals & Gaskets"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Source Approved Requisition</label>
              <select value={requisitionId} onChange={(e) => setRequisitionId(e.target.value)} className={inputClass}>
                <option value="">-- General RFQ --</option>
                {requisitions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.requisitionNumber} - {r.justification}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Invite Vendors *</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 max-h-36 overflow-y-auto">
              {vendors.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedVendorIds.includes(v.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedVendorIds([...selectedVendorIds, v.id]);
                      else setSelectedVendorIds(selectedVendorIds.filter((id) => id !== v.id));
                    }}
                    className="rounded border-slate-300 text-[#FF5B00] focus:ring-[#FF5B00]"
                  />
                  <span>{v.registeredName} ({v.code})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#FF5B00] hover:bg-[#E65200] rounded-lg">Issue RFQ</button>
          </div>
        </form>
      )}

      {/* RFQ Register */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-8"><LoadingSkeleton lines={4} /></div>
        ) : rfqs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No RFQs issued yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="p-3.5">RFQ Ref</th>
                  <th className="p-3.5">Title</th>
                  <th className="p-3.5">Invited Vendors</th>
                  <th className="p-3.5">Quotations Recorded</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rfqs.map((rfq) => {
                  const quotesCount = rfq.rfqVendors?.filter((rv: any) => rv.quotedTotalPrice !== null).length;
                  return (
                    <tr key={rfq.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-[#080E29]">{rfq.rfqNumber}</td>
                      <td className="p-3.5 font-medium text-slate-800">{rfq.title}</td>
                      <td className="p-3.5 text-slate-500">{rfq.rfqVendors?.length ?? 0} suppliers</td>
                      <td className="p-3.5 font-bold text-slate-700">{quotesCount} quotes</td>
                      <td className="p-3.5"><StatusBadge status={rfq.status} /></td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => {
                            setSelectedRfq(rfq);
                            if (rfq.rfqVendors?.[0]) {
                              setQuoteVendorId(rfq.rfqVendors[0].vendorId);
                              setSelectedVendorForPo(rfq.rfqVendors[0].vendorId);
                            }
                          }}
                          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Compare & Record
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Side-by-Side Comparison & Quotation Modal */}
      {selectedRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-sm font-bold text-[#FF5B00]">{selectedRfq.rfqNumber}</span>
                <h3 className="text-base font-bold text-[#080E29]">{selectedRfq.title}</h3>
              </div>
              <button onClick={() => setSelectedRfq(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Side by side comparison table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Award className="h-4 w-4 text-amber-500" /> Vendor Quotations Matrix
              </h4>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Quoted Unit Price</th>
                      <th className="p-3">Quoted Total</th>
                      <th className="p-3">Lead Time</th>
                      <th className="p-3">Payment Terms</th>
                      <th className="p-3 text-center">Evaluated Lowest</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedRfq.rfqVendors?.map((rv: any) => {
                      const isLowest =
                        rv.quotedTotalPrice &&
                        !selectedRfq.rfqVendors.some(
                          (other: any) => other.quotedTotalPrice && Number(other.quotedTotalPrice) < Number(rv.quotedTotalPrice)
                        );
                      return (
                        <tr key={rv.id} className={rv.isSelected ? 'bg-amber-50/50 font-bold' : ''}>
                          <td className="p-3 font-semibold text-slate-800">{rv.vendor?.registeredName}</td>
                          <td className="p-3 font-mono">{rv.quotedUnitPrice ? `GHS ${Number(rv.quotedUnitPrice).toFixed(2)}` : '—'}</td>
                          <td className="p-3 font-mono text-slate-800 font-bold">
                            {rv.quotedTotalPrice ? `GHS ${Number(rv.quotedTotalPrice).toFixed(2)}` : 'Pending'}
                          </td>
                          <td className="p-3">{rv.deliveryDays ? `${rv.deliveryDays} days` : '—'}</td>
                          <td className="p-3">{rv.paymentTerms ?? '—'}</td>
                          <td className="p-3 text-center">
                            {isLowest ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                                <Award className="h-3 w-3" /> Lowest Offer
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Record Quote Form */}
            <form onSubmit={handleRecordQuote} className="rounded-lg bg-slate-50 p-4 border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-800">Record Vendor Quotation</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Select Vendor</label>
                  <select value={quoteVendorId} onChange={(e) => setQuoteVendorId(e.target.value)} className={inputClass}>
                    {selectedRfq.rfqVendors?.map((rv: any) => (
                      <option key={rv.vendorId} value={rv.vendorId}>
                        {rv.vendor?.registeredName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Unit Price (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={quotedUnitPrice}
                    onChange={(e) => setQuotedUnitPrice(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Total Price (GHS)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={quotedTotalPrice}
                    onChange={(e) => setQuotedTotalPrice(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex items-end">
                  <button type="submit" className="w-full rounded-lg bg-slate-800 py-2 text-xs font-bold text-white hover:bg-slate-900">
                    Save Quote
                  </button>
                </div>
              </div>
            </form>

            {/* Evaluation & Justification Selection */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800">Final Vendor Award & Selection Justification</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Award Preferred Vendor</label>
                  <select value={selectedVendorForPo} onChange={(e) => setSelectedVendorForPo(e.target.value)} className={inputClass}>
                    {selectedRfq.rfqVendors?.map((rv: any) => (
                      <option key={rv.vendorId} value={rv.vendorId}>
                        {rv.vendor?.registeredName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Selection Justification *</label>
                  <input
                    type="text"
                    required
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Document reason for selecting vendor..."
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button onClick={() => setSelectedRfq(null)} className="px-4 py-2 text-xs font-semibold text-slate-600">Close</button>
                <button
                  onClick={handleEvaluateRfq}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#FF5B00] hover:bg-[#E65200] rounded-lg shadow-xs"
                >
                  Confirm Award & Evaluate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
