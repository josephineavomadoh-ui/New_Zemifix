'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { SimpleKpiCard } from '@/src/components/dashboard/SimpleKpiCard';
import { useAuth } from '@/src/lib/auth-context';
import { PackageSearch, Plus, Boxes } from 'lucide-react';

/**
 * Storekeeper workspace.
 * Shows inventory health metrics – total parts, low stock, out-of-stock and valuation,
 * along with quick action shortcuts and professional empty states.
 */
export const StorekeeperDashboardView: React.FC = () => {
  const { user, loading } = useAuth();
  const [kpis, setKpis] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);

  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      try {
        const resp = await fetch('/api/dashboard/storekeeper/kpis');
        if (!resp.ok) throw new Error('Failed to load inventory data');
        const data = await resp.json();
        setKpis(data);
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? 'Failed to load inventory data');
      } finally {
        setLoadingKpis(false);
      }
    })();
  }, [loading, user]);

  if (loading || loadingKpis) {
    return <div className="animate-pulse space-y-4"><div className="h-40 bg-slate-200 rounded"/></div>;
  }
  if (error) {
    return <div className="p-4 text-red-600 bg-red-50 rounded">{error}</div>;
  }
  if (!kpis) return null;

  return (
    <div className="space-y-6">
      {/* Quick Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-[#0B1336]">Inventory & Warehouse Stores</h2>
          <p className="text-xs text-slate-500">Manage parts catalog, stock balances, receipts, and material issues.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inventory" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            <Boxes className="h-3.5 w-3.5 text-[#FF5B00]" /> View Inventory
          </Link>
          <Link href="/inventory/new" className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E65200]">
            <Plus className="h-4 w-4" /> Add Part
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SimpleKpiCard title="Total Parts" value={kpis.totalParts} />
        <SimpleKpiCard title="Low Stock Items" value={kpis.lowStock} />
        <SimpleKpiCard title="Out of Stock" value={kpis.outOfStock} />
        <SimpleKpiCard title="Stock Valuation" value={`$${Number(kpis.valuation).toFixed(2)}`} />
      </div>

      {/* Professional Empty State / Inventory Feed */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-[#FF5B00] mb-3">
            <PackageSearch className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-bold text-[#0B1336]">Inventory Stock Status</h4>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">All store locations and reorder thresholds are operating normally with no active stock exceptions.</p>
          <Link href="/inventory" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E65200]">
            Open Inventory Catalog &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};
