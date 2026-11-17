'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Truck,
  Users,
  FileText,
  ShoppingCart,
  PackageCheck,
  Plus,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function ProcurementDashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [recentPos, setRecentPos] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [mRes, poRes] = await Promise.all([
        fetch('/api/procurement/dashboard'),
        fetch('/api/procurement/purchase-orders'),
      ]);

      if (!mRes.ok || !poRes.ok) {
        throw new Error('Failed to load dashboard metrics');
      }

      const mData = await mRes.json();
      const poData = await poRes.json();

      setMetrics(mData);
      setRecentPos((poData.purchaseOrders ?? []).slice(0, 6));
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const pipelineStages = [
    { label: 'Requisition', count: metrics?.requisitionsCount ?? 0, href: '/procurement/requisitions', color: 'bg-blue-500' },
    { label: 'PR Approval', count: metrics?.pendingReqCount ?? 0, href: '/procurement/requisitions', color: 'bg-amber-500' },
    { label: 'RFQs & Quotes', count: metrics?.openRfqsCount ?? 0, href: '/procurement/rfqs', color: 'bg-indigo-500' },
    { label: 'Purchase Orders', count: metrics?.activePoCount ?? 0, href: '/procurement/purchase-orders', color: 'bg-orange-500' },
    { label: 'PO Approval', count: metrics?.pendingPoCount ?? 0, href: '/procurement/purchase-orders', color: 'bg-amber-500' },
    { label: 'Goods Receipt', count: metrics?.pendingGrnCount ?? 0, href: '/procurement/receipts', color: 'bg-emerald-500' },
    { label: '3-Way Match', count: 0, href: '/procurement/invoices', color: 'bg-teal-500' },
    { label: 'Complete', count: metrics?.activePoCount ?? 0, href: '/procurement/purchase-orders', color: 'bg-slate-700' },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Enterprise CMMS"
        eyebrowIcon={Truck}
        title="Procurement & Vendor Management"
        description="Executive dashboard for tracking requisitions, dual-control approvals, RFQs, purchase orders, goods receipts, supplier returns, and 3-way invoice matching."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/procurement/requisitions"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <FileText className="h-4 w-4 text-slate-500" /> Requisitions
            </Link>
            <Link
              href="/procurement/rfqs"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <FileSpreadsheet className="h-4 w-4 text-slate-500" /> RFQs
            </Link>
            <Link
              href="/procurement/purchase-orders"
              className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#E65200] shadow-xs transition"
            >
              <ShoppingCart className="h-4 w-4" /> New PO
            </Link>
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800">
          {error}
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Requisitions</span>
            <FileText className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-[#080E29]">{loading ? '—' : metrics?.requisitionsCount}</div>
          <div className="text-[11px] text-amber-600 font-medium">
            {metrics?.pendingReqCount ?? 0} pending review
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Open RFQs & Quotes</span>
            <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-[#080E29]">{loading ? '—' : metrics?.openRfqsCount}</div>
          <div className="text-[11px] text-slate-500 font-medium">Active vendor tenders</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Active Purchase Orders</span>
            <ShoppingCart className="h-4 w-4 text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-[#080E29]">{loading ? '—' : metrics?.activePoCount}</div>
          <div className="text-[11px] text-amber-600 font-medium">
            {metrics?.pendingPoCount ?? 0} awaiting approval
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Procurement Spend</span>
            <Truck className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-[#080E29]">
            {loading ? '—' : `GHS ${(metrics?.totalSpend ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">{metrics?.vendorsCount ?? 0} registered suppliers</div>
        </div>
      </div>

      {/* Visual Purchasing Pipeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Procurement Lifecycle Pipeline</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {pipelineStages.map((stage, idx) => (
            <Link
              key={stage.label}
              href={stage.href}
              className="group flex flex-col justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3 hover:border-orange-300 hover:bg-orange-50/30 transition"
            >
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Step {idx + 1}</span>
                <span className={`h-2 w-2 rounded-full ${stage.color}`} />
              </div>
              <div className="my-2">
                <div className="text-xs font-bold text-[#080E29] group-hover:text-[#FF5B00] transition-colors">{stage.label}</div>
                <div className="text-lg font-extrabold text-slate-700">{loading ? '—' : stage.count}</div>
              </div>
              <div className="text-[10px] font-semibold text-slate-400 group-hover:text-orange-600 flex items-center gap-1">
                View <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Grid: Recent Activity & Inventory Reorder Suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent POs */}
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-[#080E29]">Recent Purchase Orders</h2>
            <Link href="/procurement/purchase-orders" className="flex items-center gap-1 text-xs font-semibold text-[#FF5B00] hover:underline">
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="p-8">
              <LoadingSkeleton lines={4} />
            </div>
          ) : recentPos.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No purchase orders created yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="p-3.5">PO Number</th>
                    <th className="p-3.5">Vendor</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5 text-right">Total Amount</th>
                    <th className="p-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentPos.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono font-semibold text-[#FF5B00]">
                        <Link href={`/procurement/purchase-orders`} className="hover:underline">{po.poNumber}</Link>
                      </td>
                      <td className="p-3.5 font-medium text-slate-800">{po.vendor?.registeredName ?? '—'}</td>
                      <td className="p-3.5 text-slate-500">{new Date(po.createdAt).toLocaleDateString()}</td>
                      <td className="p-3.5 font-mono font-semibold text-right text-slate-800">
                        GHS {Number(po.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5">
                        <StatusBadge status={po.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Inventory Reorder Recommendations */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-[#080E29] flex items-center gap-2">
              <Boxes className="h-4 w-4 text-amber-500" />
              Reorder Suggestions
            </h2>
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
              {metrics?.reorderSuggestions?.length ?? 0} Low Stock
            </span>
          </div>

          {loading ? (
            <LoadingSkeleton lines={3} />
          ) : !metrics?.reorderSuggestions || metrics.reorderSuggestions.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              All inventory stock levels are currently optimal.
            </div>
          ) : (
            <div className="space-y-3">
              {metrics.reorderSuggestions.map((item: any) => (
                <div key={item.partId} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-[11px] font-bold text-[#080E29]">{item.partNumber}</p>
                      <p className="text-xs font-semibold text-slate-800">{item.partName}</p>
                    </div>
                    <Link
                      href="/procurement/requisitions"
                      className="rounded bg-[#FF5B00] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#E65200] transition"
                    >
                      Requisition
                    </Link>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
                    <span>Stock: <strong className="text-rose-600">{item.currentStock} {item.uom}</strong></span>
                    <span>Reorder at: <strong>{item.reorderLevel}</strong></span>
                    <span>Suggest: <strong>{item.suggestedQuantity}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
