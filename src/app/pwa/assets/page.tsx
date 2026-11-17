'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Tag, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/src/lib/pwa/useOnlineStatus';
import { getCachedAssets } from '@/src/lib/pwa/db';

interface AssetItem {
  id: string;
  name: string;
  tag?: string;
  category?: string;
  status?: string;
  location?: { id: string; name: string } | null;
  model?: string;
  serialNumber?: string;
}

function AssetStatusPill({ status }: { status?: string }) {
  const s = (status ?? '').toUpperCase();
  const active = s === 'ACTIVE' || s === 'OPERATIONAL';
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (isOnline) {
        try {
          const res = await fetch('/api/work-orders');
          if (res.ok) {
            const data = await res.json();
            const wos: any[] = data.workOrders ?? data ?? [];
            // Collect distinct assets from work orders
            const seen = new Set<string>();
            const collected: AssetItem[] = [];
            for (const wo of wos) {
              if (wo.asset && !seen.has(wo.asset.id)) {
                seen.add(wo.asset.id);
                collected.push(wo.asset as AssetItem);
              }
            }
            setAssets(collected);
            setFromCache(false);
          } else {
            const cached = await getCachedAssets();
            setAssets(cached as AssetItem[]);
            setFromCache(true);
          }
        } catch {
          const cached = await getCachedAssets();
          setAssets(cached as AssetItem[]);
          setFromCache(true);
        }
      } else {
        const cached = await getCachedAssets();
        setAssets(cached as AssetItem[]);
        setFromCache(true);
      }
      setLoading(false);
    };
    load();
  }, [isOnline]);

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    return (
      !q ||
      a.name.toLowerCase().includes(q) ||
      (a.tag ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-[#0B1336]">Assets</h1>
          {fromCache && (
            <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FF5B00] bg-[#F8FAFC]"
          />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading assets…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">No assets found</div>
        ) : (
          filtered.map((asset) => (
            <Link
              key={asset.id}
              href={`/assets/${asset.id}`}
              className="block bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold text-[#0B1336] text-sm truncate">{asset.name}</div>
                  {asset.tag && (
                    <div className="flex items-center gap-1 text-xs text-[#FF5B00] font-mono">
                      <Tag className="w-3 h-3 shrink-0" />
                      {asset.tag}
                    </div>
                  )}
                  {asset.category && (
                    <div className="text-xs text-slate-400">{asset.category}</div>
                  )}
                  {asset.location?.name && (
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {asset.location.name}
                    </div>
                  )}
                </div>
                <AssetStatusPill status={asset.status} />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
