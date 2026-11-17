'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, Search, Check, ShieldCheck, XCircle, ArrowLeft, Trash2 } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function RequisitionsPage() {
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Form Modal
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [justification, setJustification] = useState<string>('');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [requiredDate, setRequiredDate] = useState<string>('');

  // Line items
  const [lineItems, setLineItems] = useState<Array<{ partId: string; description: string; quantity: number; estimatedUnitPrice: number }>>([
    { partId: '', description: '', quantity: 1, estimatedUnitPrice: 0 },
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Detail Modal
  const [selectedReq, setSelectedReq] = useState<any | null>(null);

  const fetchRequisitions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/requisitions');
      const data = await res.json();
      if (res.ok) setRequisitions(data.requisitions ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequisitions();
    fetch('/api/inventory/parts')
      .then((res) => res.json())
      .then((data) => setParts(data.parts ?? []))
      .catch((err) => console.error(err));
  }, []);

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { partId: '', description: '', quantity: 1, estimatedUnitPrice: 0 }]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    if (field === 'partId') {
      const selectedPart = parts.find((p) => p.id === value);
      updated[index].partId = value;
      if (selectedPart) {
        updated[index].description = selectedPart.name;
        updated[index].estimatedUnitPrice = Number(selectedPart.standardCost ?? 0);
      }
    } else {
      (updated[index] as any)[field] = value;
    }
    setLineItems(updated);
  };

  const handleCreateRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/procurement/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          justification,
          priority,
          requiredDate: requiredDate ? new Date(requiredDate) : undefined,
          items: lineItems.map((item) => ({
            partId: item.partId || null,
            description: item.description || 'Requested Item',
            quantity: Number(item.quantity),
            estimatedUnitPrice: Number(item.estimatedUnitPrice),
          })),
        }),
      });

      if (res.ok) {
        setJustification('');
        setLineItems([{ partId: '', description: '', quantity: 1, estimatedUnitPrice: 0 }]);
        setIsFormOpen(false);
        await fetchRequisitions();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create requisition');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/procurement/requisitions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setSelectedReq(null);
        await fetchRequisitions();
      } else {
        const err = await res.json();
        alert(err.error || 'Action failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredRequisitions = requisitions.filter(
    (r) =>
      !search ||
      r.requisitionNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.justification.toLowerCase().includes(search.toLowerCase()) ||
      r.requesterUser?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';
  const labelClass = 'block text-xs font-semibold text-slate-700 mb-1';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Procurement"
        eyebrowIcon={FileText}
        title="Purchase Requisitions"
        description="Submit and manage internal purchase requests before converting to RFQs or Purchase Orders."
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement' },
          { label: 'Requisitions' },
        ]}
        actions={
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#E65200] transition-colors"
          >
            <Plus className="h-4 w-4" />
            {isFormOpen ? 'Close Form' : 'New Requisition'}
          </button>
        }
      />

      {/* Creation Modal / Form Card */}
      {isFormOpen && (
        <form onSubmit={handleCreateRequisition} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-[#080E29]">Create Purchase Requisition</h2>
            <span className="text-xs text-slate-400">Maker-Checker Dual Control Appended</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className={labelClass}>Business Justification *</label>
              <textarea
                required
                rows={2}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain the business need for requested materials..."
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700">Requested Items</h3>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="text-xs font-semibold text-[#FF5B00] hover:underline flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item Line
              </button>
            </div>

            <div className="space-y-2">
              {lineItems.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="md:col-span-4">
                    <select
                      value={item.partId}
                      onChange={(e) => handleLineItemChange(index, 'partId', e.target.value)}
                      className={inputClass}
                    >
                      <option value="">-- Custom / Non-Catalog Item --</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.partNumber} - {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <input
                      type="text"
                      required
                      value={item.description}
                      onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                      placeholder="Item description..."
                      className={inputClass}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <input
                      type="number"
                      required
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                      placeholder="Qty"
                      className={inputClass}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={item.estimatedUnitPrice}
                      onChange={(e) => handleLineItemChange(index, 'estimatedUnitPrice', e.target.value)}
                      placeholder="Est Cost"
                      className={inputClass}
                    />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveLineItem(index)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#FF5B00] hover:bg-[#E65200] rounded-lg transition shadow-xs"
            >
              {submitting ? 'Submitting...' : 'Submit Requisition'}
            </button>
          </div>
        </form>
      )}

      {/* Requisition Register */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/60 p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requisitions by number, justification..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder-slate-400 focus:border-[#FF5B00] focus:outline-none focus:ring-1 focus:ring-[#FF5B00]"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8">
            <LoadingSkeleton lines={5} />
          </div>
        ) : filteredRequisitions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No requisitions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="p-3.5">Requisition No.</th>
                  <th className="p-3.5">Requester</th>
                  <th className="p-3.5">Branch / Dept</th>
                  <th className="p-3.5">Priority</th>
                  <th className="p-3.5">Est. Total</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequisitions.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[#080E29]">
                      <button onClick={() => setSelectedReq(req)} className="text-[#FF5B00] hover:underline">
                        {req.requisitionNumber}
                      </button>
                    </td>
                    <td className="p-3.5 font-medium text-slate-800">{req.requesterUser?.name}</td>
                    <td className="p-3.5 text-slate-500">{req.branch?.name}</td>
                    <td className="p-3.5">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {req.priority}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-slate-800">
                      GHS {Number(req.estimatedTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3.5">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      <button
                        onClick={() => setSelectedReq(req)}
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

      {/* Detail Drawer / Modal */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-sm font-bold text-[#FF5B00]">{selectedReq.requisitionNumber}</span>
                <h3 className="text-base font-bold text-[#080E29]">{selectedReq.justification}</h3>
              </div>
              <button onClick={() => setSelectedReq(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
              <div><strong>Requester:</strong> {selectedReq.requesterUser?.name}</div>
              <div><strong>Branch:</strong> {selectedReq.branch?.name}</div>
              <div><strong>Request Date:</strong> {new Date(selectedReq.createdAt).toLocaleDateString()}</div>
              <div><strong>Priority:</strong> {selectedReq.priority}</div>
              <div><strong>Status:</strong> <StatusBadge status={selectedReq.status} /></div>
              <div><strong>Est. Total:</strong> GHS {Number(selectedReq.estimatedTotal).toFixed(2)}</div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700">Line Items</h4>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {selectedReq.items?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{item.description}</p>
                      <p className="text-[10px] text-slate-400">{item.part?.partNumber ?? 'Custom Item'}</p>
                    </div>
                    <div className="text-right font-mono">
                      <p>{item.quantity} x GHS {Number(item.estimatedUnitPrice).toFixed(2)}</p>
                      <p className="font-bold text-slate-800">GHS {Number(item.estimatedTotal).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              {selectedReq.status === 'SUBMITTED' && (
                <>
                  <button
                    onClick={() => handleStatusAction(selectedReq.id, 'REJECT')}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleStatusAction(selectedReq.id, 'APPROVE')}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Approve (Dual Control)
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedReq(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
