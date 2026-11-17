'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Tag, WifiOff, Wrench, ChevronRight, Layers } from 'lucide-react';
import { useOnlineStatus } from '@/src/lib/pwa/useOnlineStatus';
import { getCachedAssets, cacheAssets } from '@/src/lib/pwa/db';

interface AssetItem {
  id: string;
  name: string;
  assetTag?: string;
  category?: { name: string } | string | null;
  status?: string;
  location?: { id: string; name: string } | null;
  modelNumber?: string;
  serialNumber?: string;
}

function AssetStatusPill({ status }: { status?: string }) {
  const s = (status ?? '').toUpperCase();
  const active = s === 'ACTIVE' || s === 'OPERATIONAL';
  const down = s === 'DOWN' || s === 'CRITICAL';
  return (
    <span
      className={`inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
        active
          ? 'bg-emerald-100 text-emerald-800'
          : down
          ? 'bg-rose-100 text-rose-800'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      {status ?? 'Unknown'}
    </span>
  );
}

export default function PwaAssetsPage() {
  const isOnline = useOnlineStatus();
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    const loadAssets = async () => {
      setLoading(true);
      if (isOnline) {
        try {
          const res = await fetch('/api/assets');
          if (res.ok) {
            const data = await res.json();
            const fetchedAssets: any[] = data.assets ?? [];
            setAssets(fetchedAssets);
            setFromCache(false);
            // Precache for offline access
            cacheAssets(
              fetchedAssets.map((a) => ({
                id: a.id,
                name: a.name,
                tag: a.assetTag ?? a.tag,
                category: typeof a.category === 'object' ? a.category?.name : a.category,
                status: a.status,
                location: a.location,
                model: a.modelNumber ?? a.model,
                serialNumber: a.serialNumber,
                cachedAt: Date.now(),
              }))
            ).catch(() => {});
          } else {
            const cached = await getCachedAssets();
            setAssets(cached as any[]);
            setFromCache(true);
          }
        } catch {
          const cached = await getCachedAssets();
          setAssets(cached as any[]);
          setFromCache(true);
        }
      } else {
        const cached = await getCachedAssets();
        setAssets(cached as any[]);
        setFromCache(true);
      }
      setLoading(false);
    };
    loadAssets();
  }, [isOnline]);

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    const tag = a.assetTag ?? (a as any).tag ?? '';
    const catName = typeof a.category === 'object' ? a.category?.name : a.category ?? '';
    const locName = a.location?.name ?? '';

    const matchesQuery =
      !q ||
      a.name.toLowerCase().includes(q) ||
      tag.toLowerCase().includes(q) ||
      catName.toLowerCase().includes(q) ||
      locName.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && (a.status === 'ACTIVE' || a.status === 'OPERATIONAL')) ||
      (statusFilter === 'DOWN' && a.status === 'DOWN') ||
      (statusFilter === 'MAINTENANCE' && (a.status === 'UNDER_MAINTENANCE' || a.status === 'IN_MAINTENANCE'));

    return matchesQuery && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#0B1336]">Asset Directory</h1>
            <p className="text-xs text-slate-400">Equipment master catalog & field status</p>
          </div>
          {fromCache && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              <WifiOff className="w-3 h-3 text-slate-400" /> Offline Cache
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, tag, category, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FF5B00] bg-[#F8FAFC]"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex gap-1.5 overflow-x-auto text-[11px] font-bold text-slate-500 pt-1">
          {[
            { id: 'ALL', label: 'All Equipment' },
            { id: 'ACTIVE', label: 'Active / Operational' },
            { id: 'DOWN', label: 'Down / Critical' },
            { id: 'MAINTENANCE', label: 'In Maintenance' },
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => setStatusFilter(chip.id)}
              className={`px-3 py-1 rounded-full whitespace-nowrap border transition ${
                statusFilter === chip.id
                  ? 'bg-[#0B1336] text-white border-[#0B1336]'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Asset List */}
      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-xs text-slate-400 text-center py-12">Loading equipment assets...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs bg-white rounded-xl border border-slate-100 p-8">
            No equipment assets found matching your criteria.
          </div>
        ) : (
          filtered.map((asset) => {
            const tag = asset.assetTag ?? (asset as any).tag;
            const categoryName = typeof asset.category === 'object' ? asset.category?.name : asset.category;

            return (
              <Link
                key={asset.id}
                href={`/pwa/assets/${asset.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-orange-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="font-bold text-[#0B1336] text-sm leading-snug flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-[#FF5B00] shrink-0" />
                      <span className="truncate">{asset.name}</span>
                    </div>

                    {tag && (
                      <div className="flex items-center gap-1 text-xs text-[#FF5B00] font-mono font-bold">
                        <Tag className="w-3 h-3 shrink-0" />
                        {tag}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      {categoryName && (
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 shrink-0" />
                          {categoryName}
                        </span>
                      )}
                      {asset.location?.name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {asset.location.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <AssetStatusPill status={asset.status} />
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
