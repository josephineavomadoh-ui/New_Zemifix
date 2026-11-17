'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Boxes, Plus, Download, Search, SlidersHorizontal,
  TrendingDown, PackageX, AlertTriangle, ArrowUpDown, RefreshCw, Layers, X, ArrowRightLeft, Sliders, RotateCcw
} from 'lucide-react';
import { Drawer } from '@/src/components/ui/Drawer';
import { formatGhs } from '@/src/lib/demo/common';

const STATUS_STYLE: Record<string, string> = {
  'In Stock': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Low Stock': 'bg-amber-50 text-amber-700 border-amber-100',
  'Out of Stock': 'bg-rose-50 text-rose-700 border-rose-100',
  Overstock: 'bg-blue-50 text-blue-700 border-blue-100',
};

const MODULE_TABS = [
  { id: 'catalogue', label: 'Item Catalogue' },
  { id: 'movements', label: 'Stock Ledger' },
  { id: 'transfers', label: 'Stock Transfers' },
  { id: 'adjustments', label: 'Stock Adjustments' },
  { id: 'returns', label: 'Stock Returns' },
  { id: 'alerts', label: 'Replenishment Alerts' },
  { id: 'warehouses', label: 'Warehouses' },
];

export const InventoryView: React.FC = () => {
  const [parts, setParts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tab, setTab] = useState('catalogue');
  const [selectedPart, setSelectedPart] = useState<any | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Modals Open State
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  // Stock Receipt Form State
  const [receiptPartId, setReceiptPartId] = useState('');
  const [receiptStoreId, setReceiptStoreId] = useState('');
  const [receiptQty, setReceiptQty] = useState('10');
  const [receiptCost, setReceiptCost] = useState('100.00');
  const [receiptRef, setReceiptRef] = useState('PO-RECEIPT-01');
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  // Transfer Form State
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestId, setTransferDestId] = useState('');
  const [transferPartId, setTransferPartId] = useState('');
  const [transferQty, setTransferQty] = useState('5');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Adjustment Form State
  const [adjStoreId, setAdjStoreId] = useState('');
  const [adjPartId, setAdjPartId] = useState('');
  const [adjCountedQty, setAdjCountedQty] = useState('0');
  const [adjReason, setAdjReason] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);

  // Return Form State
  const [returnWoId, setReturnWoId] = useState('');
  const [returnStoreId, setReturnStoreId] = useState('');
  const [returnPartId, setReturnPartId] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [returnReason, setReturnReason] = useState('');
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  const fetchInventoryData = useCallback(async () => {
    setLoading(true);
    try {
      const [partsRes, storesRes, txnRes] = await Promise.all([
        fetch('/api/inventory/parts'),
        fetch('/api/inventory/stores'),
        fetch('/api/inventory/transactions'),
      ]);

      const partsData = await partsRes.json();
      const storesData = await storesRes.json();
      const txnData = await txnRes.json();

      if (partsRes.ok) setParts(partsData.parts ?? []);
      if (storesRes.ok) setStores(storesData.stores ?? []);
      if (txnRes.ok) setTransactions(txnData.transactions ?? []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load inventory data:', err);
      setError(err.message ?? 'Unable to load inventory data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInventoryData();
  }, [fetchInventoryData]);

  // Mapped items for catalogue view from live PostgreSQL parts table
  const mappedItems = useMemo(() => {
    return parts.map((p) => {
      const totalOnHand = p.stocks?.reduce((acc: number, s: any) => acc + Number(s.quantityOnHand), 0) ?? 0;
      const totalAvailable = p.stocks?.reduce((acc: number, s: any) => acc + Number(s.quantityAvailable), 0) ?? 0;
      const totalValue = p.stocks?.reduce((acc: number, s: any) => acc + Number(s.totalValue), 0) ?? 0;
      const avgCost = Number(p.averageCost ?? p.standardCost ?? 0);
      const reorderLvl = Number(p.reorderLevel ?? 0);

      let status = 'In Stock';
      if (totalOnHand <= 0) status = 'Out of Stock';
      else if (totalOnHand <= reorderLvl) status = 'Low Stock';

      return {
        id: p.id,
        sku: p.partNumber,
        name: p.name,
        category: p.category,
        warehouse: p.stocks?.[0]?.store?.name ?? 'Main Warehouse',
        bin: p.stocks?.[0]?.binLocation ?? 'A1-01',
        onHand: totalOnHand,
        available: totalAvailable,
        minimum: Number(p.minStockLevel ?? 0),
        reorderPoint: reorderLvl,
        maximum: Number(p.maxStockLevel ?? 100),
        averageCost: avgCost,
        totalValue: totalValue,
        stockStatus: status,
      };
    });
  }, [parts]);

  const kpis = useMemo(() => {
    const totalValue = mappedItems.reduce((s, i) => s + i.totalValue, 0);
    const lowStock = mappedItems.filter((i) => i.stockStatus === 'Low Stock').length;
    const outOfStock = mappedItems.filter((i) => i.stockStatus === 'Out of Stock').length;
    return { total: mappedItems.length, totalValue, lowStock, outOfStock };
  }, [mappedItems]);

  const filteredItems = useMemo(() => mappedItems.filter((i) => {
    const q = search.toLowerCase();
    return (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)) &&
      (catFilter === 'all' || i.category === catFilter) &&
      (statusFilter === 'all' || i.stockStatus === statusFilter);
  }), [mappedItems, search, catFilter, statusFilter]);

  const handleStockReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptPartId || !receiptStoreId || !receiptQty || !receiptCost) {
      setReceiptError('Please fill in all required receipt fields.');
      return;
    }

    setReceiptLoading(true);
    setReceiptError(null);
    try {
      const res = await fetch('/api/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionType: 'RECEIPT',
          storeId: receiptStoreId,
          partId: receiptPartId,
          quantity: parseFloat(receiptQty),
          unitCost: parseFloat(receiptCost),
          referenceDoc: receiptRef.trim() || 'PO-RECEIPT',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post stock receipt.');

      setReceiptOpen(false);
      await fetchInventoryData();
    } catch (err: any) {
      setReceiptError(err.message ?? 'Failed to post stock receipt.');
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleStockTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferSourceId === transferDestId) {
      setTransferError('Source and destination warehouses must be different.');
      return;
    }
    if (!transferSourceId || !transferDestId || !transferPartId || !transferQty) {
      setTransferError('Please fill in all required transfer fields.');
      return;
    }

    setTransferLoading(true);
    setTransferError(null);
    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceStoreId: transferSourceId,
          destinationStoreId: transferDestId,
          partId: transferPartId,
          quantity: parseFloat(transferQty),
          notes: transferNotes.trim() || 'Store-to-store transfer',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to execute store transfer.');

      setTransferOpen(false);
      setTransferNotes('');
      await fetchInventoryData();
    } catch (err: any) {
      setTransferError(err.message ?? 'Failed to execute store transfer.');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjStoreId || !adjPartId || !adjCountedQty || !adjReason.trim()) {
      setAdjError('Please fill in all required adjustment fields including reason.');
      return;
    }

    setAdjLoading(true);
    setAdjError(null);
    try {
      const res = await fetch('/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: adjStoreId,
          partId: adjPartId,
          countedQuantity: parseFloat(adjCountedQty),
          reason: adjReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post stock adjustment.');

      setAdjustmentOpen(false);
      setAdjReason('');
      await fetchInventoryData();
    } catch (err: any) {
      setAdjError(err.message ?? 'Failed to post stock adjustment.');
    } finally {
      setAdjLoading(false);
    }
  };

  const handleStockReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnWoId.trim() || !returnStoreId || !returnPartId || !returnQty) {
      setReturnError('Please fill in all required return fields.');
      return;
    }

    setReturnLoading(true);
    setReturnError(null);
    try {
      const res = await fetch('/api/inventory/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: returnWoId.trim(),
          storeId: returnStoreId,
          partId: returnPartId,
          quantity: parseFloat(returnQty),
          reason: returnReason.trim() || 'Unused material return from work order',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post material return.');

      setReturnOpen(false);
      setReturnReason('');
      await fetchInventoryData();
    } catch (err: any) {
      setReturnError(err.message ?? 'Failed to post material return.');
    } finally {
      setReturnLoading(false);
    }
  };

  const exportCsv = () => {
    const rows = filteredItems.map((i) => [i.sku, `"${i.name}"`, i.category, i.onHand, i.available, i.averageCost, i.totalValue, i.stockStatus]);
    const csv = ['SKU,Name,Category,On Hand,Available,Unit Cost,Value,Status', ...rows.map((r) => r.join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  return (
    <div className="space-y-0 pb-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Inventory & Stock</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#0B1336]">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">Item catalogue, multi-warehouse stock levels, traceable transaction ledger and replenishment alerts.</p>
        </div>
        <div className="flex flex-wrap shrink-0 gap-2">
          <button onClick={() => void fetchInventoryData()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </button>
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={() => { setTransferError(null); setTransferOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <ArrowRightLeft className="h-3.5 w-3.5 text-blue-600" />Transfer
          </button>
          <button onClick={() => { setAdjError(null); setAdjustmentOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <Sliders className="h-3.5 w-3.5 text-amber-600" />Adjust
          </button>
          <button onClick={() => { setReturnError(null); setReturnOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5 text-purple-600" />Return
          </button>
          <button onClick={() => { setReceiptError(null); setReceiptOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E65200]">
            <Plus className="h-4 w-4" />Stock Receipt
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-5 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <span className="text-sm font-bold tabular-nums text-[#0B1336]">{kpis.total}</span>
          <span className="text-[11px] font-medium text-slate-500">Catalogue items</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <span className="text-sm font-bold tabular-nums text-emerald-700">{formatGhs(kpis.totalValue)}</span>
          <span className="text-[11px] font-medium text-slate-500">WAC value</span>
        </div>
        {kpis.lowStock > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-bold tabular-nums text-amber-700">{kpis.lowStock}</span>
            <span className="text-[11px] font-medium text-amber-600">Low stock</span>
          </div>
        )}
        {kpis.outOfStock > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <PackageX className="h-3.5 w-3.5 text-rose-500" />
            <span className="text-sm font-bold tabular-nums text-rose-700">{kpis.outOfStock}</span>
            <span className="text-[11px] font-medium text-rose-600">Out of stock</span>
          </div>
        )}
      </div>

      {/* Main card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU or item name…" className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder-slate-400 focus:border-[#FF5B00] focus:outline-none focus:ring-1 focus:ring-[#FF5B00]" />
            </div>
            {showFilters && (
              <div className="flex flex-wrap gap-2">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-[#FF5B00] focus:outline-none">
                  <option value="all">All statuses</option>
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-2 sm:ml-auto">
              <button onClick={() => setShowFilters((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${showFilters ? 'border-[#FF5B00] bg-orange-50 text-[#FF5B00]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                <SlidersHorizontal className="h-3.5 w-3.5" />Filters
              </button>
            </div>
          </div>
        </div>

        {/* Module tabs */}
        <div className="border-b border-slate-100 px-4">
          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {MODULE_TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold transition-colors ${tab === t.id ? 'border-[#FF5B00] text-[#0B1336]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t.label}
                {t.id === 'alerts' && kpis.lowStock + kpis.outOfStock > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">{kpis.lowStock + kpis.outOfStock}</span>}
              </button>
            ))}
          </nav>
        </div>

        {/* Catalogue */}
        {tab === 'catalogue' && (
          loading ? (
            <div className="py-16 text-center text-xs text-slate-500">
              <RefreshCw className="mx-auto h-5 w-5 animate-spin text-[#FF5B00] mb-2" />
              Loading inventory parts from PostgreSQL...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              <Boxes className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              No inventory items found. Post a stock receipt or create a new part.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead><tr className="border-b border-slate-100 bg-slate-50/80">
                  {['Item', 'Category', 'Warehouse / Bin', 'On Hand', 'Min / ROP / Max', 'Unit Cost', 'Value', 'Status'].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${i >= 3 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredItems.map((item, i) => (
                    <tr key={item.id} onClick={() => setSelectedPart(item)} className={`group cursor-pointer border-b border-slate-50 hover:bg-orange-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      <td className="px-4 py-3">
                        <p className="font-mono text-[11px] font-bold text-[#0B1336]">{item.sku}</p>
                        <p className="mt-0.5 max-w-[180px] truncate text-xs text-slate-600">{item.name}</p>
                      </td>
                      <td className="px-4 py-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{item.category}</span></td>
                      <td className="px-4 py-3"><p className="text-xs text-slate-600">{item.warehouse}</p><p className="font-mono text-[10px] text-slate-400">{item.bin}</p></td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-mono font-bold text-slate-800">{item.onHand}</p>
                        <p className="text-[10px] text-slate-400">{item.available} avail</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[11px] text-slate-500">{item.minimum} / {item.reorderPoint} / {item.maximum}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{formatGhs(item.averageCost)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{formatGhs(item.totalValue)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[item.stockStatus]}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />{item.stockStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-2.5 text-[11px] text-slate-400">
                {filteredItems.length} of {mappedItems.length} items · total WAC value: {formatGhs(mappedItems.reduce((s, i) => s + i.totalValue, 0))} · PostgreSQL database
              </div>
            </div>
          )
        )}

        {/* Stock Ledger */}
        {tab === 'movements' && (
          <div className="overflow-x-auto">
            <div className="border-b border-slate-100 bg-slate-50/40 px-4 py-2 text-[11px] font-semibold text-slate-400">Authoritative Append-Only Stock Transaction Ledger</div>
            <table className="w-full border-collapse text-left">
              <thead><tr className="border-b border-slate-100 bg-slate-50/80">
                {['Ref #', 'Type', 'Store', 'Part', 'Qty', 'Unit Cost', 'Total Cost', 'Balance After', 'WAC After', 'Actor', 'Date'].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {transactions.map((txn: any) => (
                  <tr key={txn.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono font-bold text-[#FF5B00]">{txn.transactionRef}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{txn.transactionType}</td>
                    <td className="px-3 py-2.5 text-slate-600">{txn.store?.name}</td>
                    <td className="px-3 py-2.5 text-slate-800 font-medium">{txn.part?.name}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{txn.quantity}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">{formatGhs(txn.unitCost)}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">{formatGhs(txn.totalCost)}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-800">{txn.balanceAfter}</td>
                    <td className="px-3 py-2.5 font-mono text-emerald-700">{formatGhs(txn.wacAfter)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{txn.actingUser?.name}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{new Date(txn.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan={11} className="py-12 text-center text-xs text-slate-400">No stock transactions recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Transfers Tab view */}
        {tab === 'transfers' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Transfers Management</h3>
                <p className="text-xs text-slate-500 mt-0.5">Execute and monitor warehouse-to-warehouse inventory movements.</p>
              </div>
              <button onClick={() => { setTransferError(null); setTransferOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700]">
                <ArrowRightLeft className="h-3.5 w-3.5" />New Transfer
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
              Stock transfers execute atomically via paired <code className="font-mono text-[#FF5B00]">TRANSFER_OUT</code> and <code className="font-mono text-[#FF5B00]">TRANSFER_IN</code> ledger entries. Click &ldquo;New Transfer&rdquo; above to initiate a movement.
            </div>
          </div>
        )}

        {/* Adjustments Tab view */}
        {tab === 'adjustments' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock Adjustments & Physical Counts</h3>
                <p className="text-xs text-slate-500 mt-0.5">Record physical counts and reconcile inventory variances.</p>
              </div>
              <button onClick={() => { setAdjError(null); setAdjustmentOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700]">
                <Sliders className="h-3.5 w-3.5" />New Adjustment
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
              Stock adjustments post <code className="font-mono text-[#FF5B00]">ADJUSTMENT_IN</code> or <code className="font-mono text-[#FF5B00]">ADJUSTMENT_OUT</code> transactions with mandatory audit reasons. Click &ldquo;New Adjustment&rdquo; to reconcile count variances.
            </div>
          </div>
        )}

        {/* Returns Tab view */}
        {tab === 'returns' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Material Returns from Work Orders</h3>
                <p className="text-xs text-slate-500 mt-0.5">Return unused materials from completed or active work orders back to stores.</p>
              </div>
              <button onClick={() => { setReturnError(null); setReturnOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700]">
                <RotateCcw className="h-3.5 w-3.5" />New Material Return
              </button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-500">
              Material returns post <code className="font-mono text-[#FF5B00]">RETURN_IN</code> ledger entries, restore store stock, and credit the work order cost. Click &ldquo;New Material Return&rdquo; above.
            </div>
          </div>
        )}

        {/* Replenishment Alerts */}
        {tab === 'alerts' && (
          <div className="p-6 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Items at or below reorder level</h3>
            {mappedItems.filter((i) => i.stockStatus === 'Low Stock' || i.stockStatus === 'Out of Stock').length === 0 ? (
              <p className="text-xs text-slate-500 italic py-8 text-center">All inventory stock levels are healthy.</p>
            ) : (
              <div className="space-y-2">
                {mappedItems.filter((i) => i.stockStatus === 'Low Stock' || i.stockStatus === 'Out of Stock').map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50/50 text-xs">
                    <div>
                      <span className="font-mono font-bold text-[#FF5B00]">{item.sku}</span> — <span className="font-semibold text-slate-800">{item.name}</span>
                      <div className="text-[11px] text-slate-500 mt-0.5">On Hand: <strong className="font-mono">{item.onHand}</strong> (Reorder Level: {item.reorderPoint})</div>
                    </div>
                    <span className="rounded bg-rose-100 px-2 py-1 font-bold text-rose-700">{item.stockStatus}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Warehouses */}
        {tab === 'warehouses' && (
          <div className="p-6 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Warehouses & Stores</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stores.map((store: any) => (
                <div key={store.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#FF5B00] text-xs">{store.code}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{store.type}</span>
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">{store.name}</h4>
                  <div className="text-xs text-slate-500">Branch: <strong className="text-slate-700">{store.branch?.name}</strong></div>
                  <div className="text-xs text-slate-500">Manager: <strong className="text-slate-700">{store.managerUser?.name ?? 'Unassigned'}</strong></div>
                </div>
              ))}
              {stores.length === 0 && (
                <p className="text-xs text-slate-400 italic col-span-full py-8 text-center">No warehouses configured in PostgreSQL.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* STOCK RECEIPT MODAL */}
      {receiptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h3 className="text-sm font-bold text-[#0B1336]">Post Stock Receipt</h3>
              <button onClick={() => setReceiptOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleStockReceipt} className="p-6 space-y-4">
              {receiptError && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <span className="font-bold">Error:</span> {receiptError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Select Item / Part *</label>
                <select required value={receiptPartId} onChange={(e) => setReceiptPartId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Catalogue Part --</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>{p.partNumber} — {p.name} ({p.uom})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Target Warehouse / Store *</label>
                <select required value={receiptStoreId} onChange={(e) => setReceiptStoreId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Warehouse --</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Quantity Received *</label>
                  <input type="number" step="0.01" min="0.01" required value={receiptQty} onChange={(e) => setReceiptQty(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono focus:border-[#FF5B00] focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Unit Cost (GHS) *</label>
                  <input type="number" step="0.01" min="0" required value={receiptCost} onChange={(e) => setReceiptCost(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono focus:border-[#FF5B00] focus:outline-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Reference Doc / PO #</label>
                <input type="text" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs focus:border-[#FF5B00] focus:outline-none" />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setReceiptOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={receiptLoading} className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] disabled:opacity-50">
                  {receiptLoading ? 'Posting Receipt…' : 'Post Stock Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK TRANSFER MODAL */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h3 className="text-sm font-bold text-[#0B1336]">Execute Stock Transfer</h3>
              <button onClick={() => setTransferOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleStockTransfer} className="p-6 space-y-4">
              {transferError && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <span className="font-bold">Error:</span> {transferError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Source Warehouse *</label>
                <select required value={transferSourceId} onChange={(e) => setTransferSourceId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Source Store --</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Destination Warehouse *</label>
                <select required value={transferDestId} onChange={(e) => setTransferDestId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Destination Store --</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Item / Part *</label>
                <select required value={transferPartId} onChange={(e) => setTransferPartId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Catalogue Part --</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>{p.partNumber} — {p.name} ({p.uom})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Transfer Quantity *</label>
                <input type="number" step="0.01" min="0.01" required value={transferQty} onChange={(e) => setTransferQty(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono focus:border-[#FF5B00] focus:outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Transfer Notes / Reference</label>
                <input type="text" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} placeholder="e.g. Inter-branch stock balancing" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs focus:border-[#FF5B00] focus:outline-none" />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setTransferOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={transferLoading} className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] disabled:opacity-50">
                  {transferLoading ? 'Executing Transfer…' : 'Execute Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {adjustmentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h3 className="text-sm font-bold text-[#0B1336]">Post Stock Adjustment</h3>
              <button onClick={() => setAdjustmentOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleStockAdjustment} className="p-6 space-y-4">
              {adjError && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <span className="font-bold">Error:</span> {adjError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Warehouse / Store *</label>
                <select required value={adjStoreId} onChange={(e) => setAdjStoreId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Warehouse --</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Item / Part *</label>
                <select required value={adjPartId} onChange={(e) => setAdjPartId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Catalogue Part --</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>{p.partNumber} — {p.name} ({p.uom})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Physical Counted Quantity *</label>
                <input type="number" step="0.01" min="0" required value={adjCountedQty} onChange={(e) => setAdjCountedQty(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono focus:border-[#FF5B00] focus:outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Adjustment Reason / Audit Note *</label>
                <textarea rows={3} required value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="e.g., Annual physical stock count discrepancy" className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none" />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setAdjustmentOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={adjLoading} className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] disabled:opacity-50">
                  {adjLoading ? 'Posting Adjustment…' : 'Post Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK RETURN MODAL */}
      {returnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h3 className="text-sm font-bold text-[#0B1336]">Post Material Return from Work Order</h3>
              <button onClick={() => setReturnOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleStockReturn} className="p-6 space-y-4">
              {returnError && (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <span className="font-bold">Error:</span> {returnError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Work Order ID *</label>
                <input type="text" required value={returnWoId} onChange={(e) => setReturnWoId(e.target.value)} placeholder="e.g. uuid of work order" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono focus:border-[#FF5B00] focus:outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Receiving Warehouse / Store *</label>
                <select required value={returnStoreId} onChange={(e) => setReturnStoreId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Warehouse --</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Item / Part *</label>
                <select required value={returnPartId} onChange={(e) => setReturnPartId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-[#FF5B00] focus:outline-none">
                  <option value="">-- Choose Catalogue Part --</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>{p.partNumber} — {p.name} ({p.uom})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Return Quantity *</label>
                <input type="number" step="0.01" min="0.01" required value={returnQty} onChange={(e) => setReturnQty(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono focus:border-[#FF5B00] focus:outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Return Reason / Note</label>
                <input type="text" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="e.g., Unused material returned to stock" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs focus:border-[#FF5B00] focus:outline-none" />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setReturnOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={returnLoading} className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#F95700] disabled:opacity-50">
                  {returnLoading ? 'Posting Return…' : 'Post Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
