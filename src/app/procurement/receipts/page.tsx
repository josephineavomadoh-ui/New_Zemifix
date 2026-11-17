'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PackageCheck, Plus, Search, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function GoodsReceiptsPage() {
  const [grns, setGrns] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Post GRN Modal
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [storeId, setStoreId] = useState<string>('');
  const [invoiceReference, setInvoiceReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Selected PO Line Items for receipt
  const [receiptItems, setReceiptItems] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Selected GRN Detail / Dual Control Approval Modal
  const [selectedGrn, setSelectedGrn] = useState<any | null>(null);

  const fetchGrns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/grn');
      const data = await res.json();
      if (res.ok) setGrns(data.grns ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrns();
    Promise.all([
      fetch('/api/procurement/purchase-orders').then((r) => r.json()),
      fetch('/api/inventory/stores').then((r) => r.json()),
    ]).then(([poData, sData]) => {
      const activePos = (poData.purchaseOrders ?? []).filter((p: any) => ['ISSUED', 'PARTIALLY_RECEIVED', 'APPROVED'].includes(p.status));
      setPurchaseOrders(activePos);
      setStores(sData.stores ?? []);
      if (activePos[0]) {
        setSelectedPoId(activePos[0].id);
        setReceiptItems(
          activePos[0].items.map((i: any) => ({
            poItemId: i.id,
            partId: i.partId,
            description: i.description,
            quantityOrdered: Number(i.quantityOrdered),
            quantityReceived: Number(i.quantityOrdered) - Number(i.quantityReceived ?? 0),
            quantityAccepted: Number(i.quantityOrdered) - Number(i.quantityReceived ?? 0),
            quantityRejected: 0,
            unitCost: Number(i.unitPrice),
          }))
        );
      }
      if (sData.stores?.[0]) setStoreId(sData.stores[0].id);
    });
  }, []);

  const handlePoChange = (poId: string) => {
    setSelectedPoId(poId);
    const po = purchaseOrders.find((p) => p.id === poId);
    if (po) {
      setReceiptItems(
        po.items.map((i: any) => ({
          poItemId: i.id,
          partId: i.partId,
          description: i.description,
          quantityOrdered: Number(i.quantityOrdered),
          quantityReceived: Number(i.quantityOrdered) - Number(i.quantityReceived ?? 0),
          quantityAccepted: Number(i.quantityOrdered) - Number(i.quantityReceived ?? 0),
          quantityRejected: 0,
          unitCost: Number(i.unitPrice),
        }))
      );
    }
  };

  const handlePostGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/procurement/grn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poId: selectedPoId,
          storeId,
          invoiceReference,
          notes,
          items: receiptItems.map((item) => ({
            poItemId: item.poItemId,
            partId: item.partId || null,
            quantityReceived: Number(item.quantityReceived),
            quantityAccepted: Number(item.quantityAccepted),
            quantityRejected: Number(item.quantityRejected ?? 0),
            unitCost: Number(item.unitCost),
          })),
        }),
      });

      if (res.ok) {
        setIsFormOpen(false);
        await fetchGrns();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit GRN');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveGrn = async (grnId: string) => {
    try {
      const res = await fetch(`/api/procurement/grn/${grnId}`, {
        method: 'PATCH',
      });

      if (res.ok) {
        alert('Goods Received Note approved and store stock automatically updated!');
        setSelectedGrn(null);
        await fetchGrns();
      } else {
        const err = await res.json();
        alert(err.error || 'GRN Approval failed');
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
        eyebrowIcon={PackageCheck}
        title="Goods Received Notes (GRN) Dual Control"
        description="Receive incoming supplier goods into store buffer. Dual-control verification by a non-receiving officer atomically posts inventory stock & updates WAC."
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement' },
          { label: 'Goods Receipts' },
        ]}
        actions={
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#E65200] transition-colors"
          >
            <Plus className="h-4 w-4" /> Receive Goods (Storekeeper)
          </button>
        }
      />

      {isFormOpen && (
        <form onSubmit={handlePostGrn} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[#080E29]">Record Goods Received Note (GRN)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Purchase Order *</label>
              <select value={selectedPoId} onChange={(e) => handlePoChange(e.target.value)} className={inputClass} required>
                {purchaseOrders.map((p) => (
                  <option key={p.id} value={p.id}>{p.poNumber} - {p.vendor?.registeredName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Receiving Store *</label>
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputClass} required>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Delivery Note / Invoice Ref</label>
              <input
                type="text"
                value={invoiceReference}
                onChange={(e) => setInvoiceReference(e.target.value)}
                placeholder="e.g. DN-90821"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold text-slate-700">Line Items Physical Inspection</h3>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
              {receiptItems.map((item, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2 text-xs">
                  <div className="sm:col-span-4 font-semibold text-slate-800">{item.description}</div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-slate-500 block">Received</label>
                    <input
                      type="number"
                      value={item.quantityReceived}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[index].quantityReceived = Number(e.target.value);
                        setReceiptItems(updated);
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-slate-500 block">Accepted</label>
                    <input
                      type="number"
                      value={item.quantityAccepted}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[index].quantityAccepted = Number(e.target.value);
                        setReceiptItems(updated);
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-slate-500 block">Rejected</label>
                    <input
                      type="number"
                      value={item.quantityRejected}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[index].quantityRejected = Number(e.target.value);
                        setReceiptItems(updated);
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2 font-mono font-bold text-right">
                    GHS {Number(item.unitCost).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-xs font-bold text-white bg-[#FF5B00] hover:bg-[#E65200] rounded-lg shadow-xs">
              {submitting ? 'Submitting...' : 'Submit GRN for Verification'}
            </button>
          </div>
        </form>
      )}

      {/* GRN Register */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-8"><LoadingSkeleton lines={5} /></div>
        ) : grns.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No Goods Received Notes recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="p-3.5">GRN Ref</th>
                  <th className="p-3.5">PO Ref</th>
                  <th className="p-3.5">Vendor</th>
                  <th className="p-3.5">Store</th>
                  <th className="p-3.5">Delivery Date</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grns.map((grn) => (
                  <tr key={grn.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[#080E29]">{grn.grnNumber}</td>
                    <td className="p-3.5 font-mono font-bold text-[#FF5B00]">{grn.po?.poNumber}</td>
                    <td className="p-3.5 font-medium text-slate-800">{grn.vendor?.registeredName}</td>
                    <td className="p-3.5 text-slate-500">{grn.store?.name}</td>
                    <td className="p-3.5 text-slate-500">{new Date(grn.createdAt).toLocaleDateString()}</td>
                    <td className="p-3.5"><StatusBadge status={grn.status} /></td>
                    <td className="p-3.5 text-right space-x-2">
                      <button
                        onClick={() => setSelectedGrn(grn)}
                        className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Verification Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dual Control Modal */}
      {selectedGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-sm font-bold text-[#FF5B00]">{selectedGrn.grnNumber}</span>
                <h3 className="text-base font-bold text-[#080E29]">GRN Dual-Control Verification</h3>
              </div>
              <button onClick={() => setSelectedGrn(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded-lg">
              <div><strong>PO Ref:</strong> {selectedGrn.po?.poNumber}</div>
              <div><strong>Vendor:</strong> {selectedGrn.vendor?.registeredName}</div>
              <div><strong>Store:</strong> {selectedGrn.store?.name}</div>
              <div><strong>Received By:</strong> {selectedGrn.receivedByUser?.name}</div>
              <div><strong>Status:</strong> <StatusBadge status={selectedGrn.status} /></div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700">Inspected Items</h4>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {selectedGrn.items?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{item.part?.name ?? 'Procured Material'}</p>
                      <p className="text-[10px] text-slate-400">Accepted: {item.quantityAccepted} | Rejected: {item.quantityRejected}</p>
                    </div>
                    <p className="font-mono font-bold">GHS {Number(item.unitCost).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              {selectedGrn.status === 'RECEIVED' && (
                <button
                  onClick={() => handleApproveGrn(selectedGrn.id)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Approve GRN & Update Inventory
                </button>
              )}
              <button onClick={() => setSelectedGrn(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
