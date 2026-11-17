'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Plus, Search, Printer, ShieldCheck, CheckCircle2, FileText } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [vendorId, setVendorId] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('Main Warehouse, Industrial Area, Accra');
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(30);
  const [lineItems, setLineItems] = useState<Array<{ partId: string; description: string; quantityOrdered: number; unitPrice: number }>>([
    { partId: '', description: '', quantityOrdered: 10, unitPrice: 50 },
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Document View Modal
  const [selectedPo, setSelectedPo] = useState<any | null>(null);

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/purchase-orders');
      const data = await res.json();
      if (res.ok) setPurchaseOrders(data.purchaseOrders ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOs();
    Promise.all([
      fetch('/api/procurement/vendors').then((r) => r.json()),
      fetch('/api/inventory/parts').then((r) => r.json()),
    ]).then(([vData, pData]) => {
      setVendors(vData.vendors ?? []);
      setParts(pData.parts ?? []);
      if (vData.vendors?.[0]) setVendorId(vData.vendors[0].id);
    });
  }, []);

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/procurement/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          deliveryAddress,
          paymentTermsDays,
          items: lineItems.map((item) => ({
            partId: item.partId || null,
            description: item.description || 'Procured Material',
            quantityOrdered: Number(item.quantityOrdered),
            unitPrice: Number(item.unitPrice),
          })),
        }),
      });

      if (res.ok) {
        setIsFormOpen(false);
        fetchPOs();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create PO');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/procurement/purchase-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setSelectedPo(null);
        fetchPOs();
      } else {
        const err = await res.json();
        alert(err.error || 'Action failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredPOs = purchaseOrders.filter(
    (po) =>
      !search ||
      po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      po.vendor?.registeredName?.toLowerCase().includes(search.toLowerCase())
  );

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Procurement"
        eyebrowIcon={ShoppingCart}
        title="Purchase Orders Master Register"
        description="Issue, approve, and manage purchase orders to suppliers with statutory Ghana tax calculations (15% VAT, 2.5% NHIL, 2.5% GETFund)."
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement' },
          { label: 'Purchase Orders' },
        ]}
        actions={
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#E65200] transition-colors"
          >
            <Plus className="h-4 w-4" /> New Purchase Order
          </button>
        }
      />

      {isFormOpen && (
        <form onSubmit={handleCreatePO} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[#080E29]">Create Purchase Order</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Supplier *</label>
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputClass} required>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registeredName} ({v.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Address</label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Terms (Days)</label>
              <input
                type="number"
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold text-slate-700">Order Line Items</h3>
            {lineItems.map((item, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="sm:col-span-4">
                  <select
                    value={item.partId}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      const selectedPart = parts.find((p) => p.id === e.target.value);
                      updated[index].partId = e.target.value;
                      if (selectedPart) {
                        updated[index].description = selectedPart.name;
                        updated[index].unitPrice = Number(selectedPart.standardCost ?? 50);
                      }
                      setLineItems(updated);
                    }}
                    className={inputClass}
                  >
                    <option value="">-- Custom Item --</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>{p.partNumber} - {p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    required
                    value={item.description}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      updated[index].description = e.target.value;
                      setLineItems(updated);
                    }}
                    placeholder="Description"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    required
                    min="1"
                    value={item.quantityOrdered}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      updated[index].quantityOrdered = Number(e.target.value);
                      setLineItems(updated);
                    }}
                    placeholder="Qty"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={item.unitPrice}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      updated[index].unitPrice = Number(e.target.value);
                      setLineItems(updated);
                    }}
                    placeholder="Unit Cost"
                    className={inputClass}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-xs font-bold text-white bg-[#FF5B00] hover:bg-[#E65200] rounded-lg shadow-xs">
              {submitting ? 'Creating...' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
      )}

      {/* PO Register Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/60 p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search purchase orders..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder-slate-400 focus:border-[#FF5B00] focus:outline-none focus:ring-1 focus:ring-[#FF5B00]"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8"><LoadingSkeleton lines={5} /></div>
        ) : filteredPOs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No purchase orders found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="p-3.5">PO Number</th>
                  <th className="p-3.5">Vendor</th>
                  <th className="p-3.5">Subtotal</th>
                  <th className="p-3.5">Statutory Tax (20%)</th>
                  <th className="p-3.5">Total Amount</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPOs.map((po) => {
                  const taxTotal = Number(po.vatAmount ?? 0) + Number(po.nhilAmount ?? 0) + Number(po.getFundAmount ?? 0);
                  return (
                    <tr key={po.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-[#FF5B00]">
                        <button onClick={() => setSelectedPo(po)} className="hover:underline">{po.poNumber}</button>
                      </td>
                      <td className="p-3.5 font-medium text-slate-800">{po.vendor?.registeredName}</td>
                      <td className="p-3.5 font-mono">GHS {Number(po.subtotal).toFixed(2)}</td>
                      <td className="p-3.5 font-mono text-slate-500">GHS {taxTotal.toFixed(2)}</td>
                      <td className="p-3.5 font-mono font-bold text-slate-800">GHS {Number(po.totalAmount).toFixed(2)}</td>
                      <td className="p-3.5"><StatusBadge status={po.status} /></td>
                      <td className="p-3.5 text-right space-x-2">
                        <button
                          onClick={() => setSelectedPo(po)}
                          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View PO Document
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

      {/* Printable PO Document Modal */}
      {selectedPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* PO Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-6">
              <div>
                <h1 className="text-xl font-extrabold text-[#080E29]">ZEMIFIX CMMS</h1>
                <p className="text-xs text-slate-500">Enterprise Asset Management & Procurement</p>
                <p className="text-xs text-slate-500">Accra, Ghana</p>
              </div>
              <div className="text-right">
                <span className="font-mono text-lg font-extrabold text-[#FF5B00]">{selectedPo.poNumber}</span>
                <p className="text-xs text-slate-500">Date: {new Date(selectedPo.createdAt).toLocaleDateString()}</p>
                <div className="mt-1"><StatusBadge status={selectedPo.status} /></div>
              </div>
            </div>

            {/* Vendor & Delivery Info */}
            <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-lg text-xs">
              <div>
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">SUPPLIER</h3>
                <p className="font-bold text-slate-800">{selectedPo.vendor?.registeredName}</p>
                <p className="text-slate-500">{selectedPo.vendor?.address}</p>
                <p className="text-slate-500">TIN: {selectedPo.vendor?.taxId ?? 'GRA Tax Registered'}</p>
                <p className="text-slate-500">{selectedPo.vendor?.phone} | {selectedPo.vendor?.email}</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">DELIVER TO</h3>
                <p className="font-semibold text-slate-800">{selectedPo.deliveryAddress}</p>
                <p className="text-slate-500">Payment Terms: {selectedPo.paymentTermsDays ?? 30} Days</p>
                <p className="text-slate-500">Currency: {selectedPo.currency ?? 'GHS'}</p>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                    <th className="p-3">Item Description</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedPo.items?.map((item: any) => (
                    <tr key={item.id}>
                      <td className="p-3 font-medium text-slate-800">{item.description}</td>
                      <td className="p-3 text-right font-mono">{item.quantityOrdered}</td>
                      <td className="p-3 text-right font-mono">GHS {Number(item.unitPrice).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold">GHS {Number(item.lineTotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tax Breakdown */}
            <div className="flex justify-end pt-2">
              <div className="w-64 space-y-1.5 text-xs font-medium text-slate-700 bg-slate-50 p-4 rounded-lg">
                <div className="flex justify-between"><span>Subtotal:</span><span className="font-mono">GHS {Number(selectedPo.subtotal).toFixed(2)}</span></div>
                <div className="flex justify-between text-slate-500"><span>VAT (15%):</span><span className="font-mono">GHS {Number(selectedPo.vatAmount).toFixed(2)}</span></div>
                <div className="flex justify-between text-slate-500"><span>NHIL (2.5%):</span><span className="font-mono">GHS {Number(selectedPo.nhilAmount).toFixed(2)}</span></div>
                <div className="flex justify-between text-slate-500"><span>GETFund (2.5%):</span><span className="font-mono">GHS {Number(selectedPo.getFundAmount).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-sm text-[#080E29] pt-2 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span className="font-mono text-[#FF5B00]">GHS {Number(selectedPo.totalAmount).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Footer & Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Printer className="h-4 w-4" /> Print PO Document
              </button>

              <div className="flex items-center gap-2">
                {selectedPo.status === 'SUBMITTED' && (
                  <button
                    onClick={() => handleStatusAction(selectedPo.id, 'APPROVE')}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Approve PO (Dual Control)
                  </button>
                )}
                {selectedPo.status === 'APPROVED' && (
                  <button
                    onClick={() => handleStatusAction(selectedPo.id, 'ISSUE')}
                    className="rounded-lg bg-[#FF5B00] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#E65200]"
                  >
                    Issue PO to Supplier
                  </button>
                )}
                <button onClick={() => setSelectedPo(null)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
