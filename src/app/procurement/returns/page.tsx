'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { RotateCcw, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function SupplierReturnsPage() {
  const [returns, setReturns] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [grnId, setGrnId] = useState<string>('');
  const [reason, setReason] = useState<string>('Damaged Goods');
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Selected Detail
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/returns');
      const data = await res.json();
      if (res.ok) setReturns(data.returns ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
    fetch('/api/procurement/grn')
      .then((r) => r.json())
      .then((data) => {
        const acceptedGrns = (data.grns ?? []).filter((g: any) => g.status === 'ACCEPTED');
        setGrns(acceptedGrns);
        if (acceptedGrns[0]) {
          setGrnId(acceptedGrns[0].id);
          setReturnItems(
            acceptedGrns[0].items.map((i: any) => ({
              partId: i.partId,
              description: i.part?.name ?? 'Returned Item',
              quantityReturned: 1,
              unitCost: Number(i.unitCost),
            }))
          );
        }
      });
  }, []);

  const handleGrnChange = (selectedGrnId: string) => {
    setGrnId(selectedGrnId);
    const grn = grns.find((g) => g.id === selectedGrnId);
    if (grn) {
      setReturnItems(
        grn.items.map((i: any) => ({
          partId: i.partId,
          description: i.part?.name ?? 'Returned Item',
          quantityReturned: 1,
          unitCost: Number(i.unitCost),
        }))
      );
    }
  };

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/procurement/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grnId,
          reason,
          items: returnItems.map((i) => ({
            partId: i.partId,
            quantityReturned: Number(i.quantityReturned),
            unitCost: Number(i.unitCost),
          })),
        }),
      });

      if (res.ok) {
        setIsFormOpen(false);
        fetchReturns();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create return');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Procurement"
        eyebrowIcon={RotateCcw}
        title="Supplier Returns Management"
        description="Initiate and track vendor returns for damaged, incorrect, or poor quality goods. Inventory stock is automatically adjusted upon return confirmation."
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement' },
          { label: 'Supplier Returns' },
        ]}
        actions={
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#E65200] transition-colors"
          >
            <Plus className="h-4 w-4" /> Create Supplier Return
          </button>
        }
      />

      {isFormOpen && (
        <form onSubmit={handleCreateReturn} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[#080E29]">Create Supplier Return Note</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Source GRN *</label>
              <select value={grnId} onChange={(e) => handleGrnChange(e.target.value)} className={inputClass} required>
                {grns.map((g) => (
                  <option key={g.id} value={g.id}>{g.grnNumber} - {g.vendor?.registeredName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Return Reason *</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}>
                <option value="Damaged Goods">Damaged Goods / Packaging Failure</option>
                <option value="Incorrect Items Delivered">Incorrect Items / Specification Mismatch</option>
                <option value="Poor Quality Acceptance">Poor Quality Acceptance Inspection</option>
                <option value="Expired Product">Expired / Short Shelf Life</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold text-slate-700">Returned Line Items</h3>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
              {returnItems.map((item, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2 text-xs">
                  <div className="sm:col-span-6 font-semibold text-slate-800">{item.description}</div>
                  <div className="sm:col-span-3">
                    <label className="text-[10px] text-slate-500 block">Quantity Returned</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantityReturned}
                      onChange={(e) => {
                        const updated = [...returnItems];
                        updated[index].quantityReturned = Number(e.target.value);
                        setReturnItems(updated);
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-3 font-mono font-bold text-right">
                    GHS {Number(item.unitCost).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-xs font-bold text-white bg-[#FF5B00] hover:bg-[#E65200] rounded-lg shadow-xs">
              {submitting ? 'Creating...' : 'Submit Supplier Return'}
            </button>
          </div>
        </form>
      )}

      {/* Returns Register */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-8"><LoadingSkeleton lines={4} /></div>
        ) : returns.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No supplier returns recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="p-3.5">Return Ref</th>
                  <th className="p-3.5">GRN Ref</th>
                  <th className="p-3.5">Vendor</th>
                  <th className="p-3.5">Store</th>
                  <th className="p-3.5">Reason</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {returns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[#080E29]">{ret.returnNumber}</td>
                    <td className="p-3.5 font-mono text-slate-600">{ret.grn?.grnNumber}</td>
                    <td className="p-3.5 font-medium text-slate-800">{ret.vendor?.registeredName}</td>
                    <td className="p-3.5 text-slate-500">{ret.store?.name}</td>
                    <td className="p-3.5 text-slate-700">{ret.reason}</td>
                    <td className="p-3.5"><StatusBadge status={ret.status} /></td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedReturn(ret)}
                        className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-sm font-bold text-[#FF5B00]">{selectedReturn.returnNumber}</span>
                <h3 className="text-base font-bold text-[#080E29]">Supplier Return Details</h3>
              </div>
              <button onClick={() => setSelectedReturn(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-2 text-xs bg-slate-50 p-3 rounded-lg">
              <p><strong>Vendor:</strong> {selectedReturn.vendor?.registeredName}</p>
              <p><strong>GRN Ref:</strong> {selectedReturn.grn?.grnNumber}</p>
              <p><strong>Reason:</strong> {selectedReturn.reason}</p>
              <p><strong>Store:</strong> {selectedReturn.store?.name}</p>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setSelectedReturn(null)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
