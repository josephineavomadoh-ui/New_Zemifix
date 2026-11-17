'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { WifiOff, RefreshCw, Download } from 'lucide-react';
import { useOnlineStatus } from '@/src/lib/pwa/useOnlineStatus';
import {
  cacheWorkOrdersLocally,
  getCachedWorkOrdersLocally,
  getQueuedOutboxMutations,
  cacheWorkOrderDetail,
  cacheAssets,
} from '@/src/lib/pwa/db';
import { flushOfflineSyncQueue } from '@/src/lib/pwa/offlineSyncManager';
import { WorkOrderStatusBadge } from '@/src/components/work-orders/WorkOrderStatusBadge';
import { WorkOrderPriorityBadge } from '@/src/components/work-orders/WorkOrderPriorityBadge';

export default function TechnicianPwaPage() {
  const isOnline = useOnlineStatus();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [outboxCount, setOutboxCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<{
    syncedCount: number;
    conflictCount: number;
    failedCount: number;
  } | null>(null);
  const [downloadingOffline, setDownloadingOffline] = useState<boolean>(false);
  const [downloadResult, setDownloadResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const res = await fetch('/api/work-orders');
        const data = await res.json();
        if (res.ok) {
          setWorkOrders(data.workOrders ?? []);
          await cacheWorkOrdersLocally(data.workOrders ?? []);
        }
      } else {
        const cached = await getCachedWorkOrdersLocally();
        setWorkOrders(cached);
      }

      const queued = await getQueuedOutboxMutations();
      setOutboxCount(queued.length);
    } catch (err) {
      console.error('Failed to load PWA data', err);
      const cached = await getCachedWorkOrdersLocally();
      setWorkOrders(cached);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isOnline]);

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await flushOfflineSyncQueue();
      setSyncResult({
        syncedCount: result.syncedCount,
        conflictCount: result.conflictCount,
        failedCount: result.failedCount,
      });
      if (result.success) {
        await loadData();
      }
    } catch (err) {
      console.error('Sync failed', err);
      setSyncResult({ syncedCount: 0, conflictCount: 0, failedCount: 0 });
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadOffline = async () => {
    setDownloadingOffline(true);
    setDownloadResult(null);
    try {
      const res = await fetch('/api/pwa/sync-package');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }
      const data = await res.json();

      const workOrderSummaries = data.workOrders ?? [];
      const workOrderDetails = data.workOrderDetails ?? [];
      const assets = data.assets ?? [];

      if (workOrderSummaries.length > 0) {
        await cacheWorkOrdersLocally(workOrderSummaries);
      }
      for (const detail of workOrderDetails) {
        await cacheWorkOrderDetail(detail);
      }
      if (assets.length > 0) {
        await cacheAssets(assets);
      }

      setDownloadResult({
        success: true,
        message: `Downloaded ${workOrderSummaries.length} work orders and ${assets.length} assets for offline use.`,
      });
    } catch (err: any) {
      console.error('Offline download failed', err);
      setDownloadResult({
        success: false,
        message: err?.message || 'Download failed. Please try again.',
      });
    } finally {
      setDownloadingOffline(false);
    }
  };

  // Derived stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const assignedCount = workOrders.length;
  const inProgressCount = workOrders.filter((wo) => wo.status === 'IN_PROGRESS').length;
  const overdueCount = workOrders.filter((wo) => {
    if (!wo.dueDate) return false;
    if (wo.status === 'COMPLETED' || wo.status === 'CANCELLED') return false;
    return new Date(wo.dueDate) < today;
  }).length;
  const completedTodayCount = workOrders.filter((wo) => {
    if (wo.status !== 'COMPLETED') return false;
    if (!wo.completedAt) return false;
    const completed = new Date(wo.completedAt);
    completed.setHours(0, 0, 0, 0);
    return completed.getTime() === today.getTime();
  }).length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-[#FF5B00] text-white text-xs font-semibold px-4 py-2 flex items-center gap-2">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          You are offline — showing cached data
        </div>
      )}

      {/* Stats grid */}
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-2xl font-bold text-[#0B1336]">{assignedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Assigned</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-2xl font-bold text-[#0B1336]">{inProgressCount}</p>
            <p className="text-xs text-gray-500 mt-1">In Progress</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-2xl font-bold text-[#0B1336]">{overdueCount}</p>
            <p className="text-xs text-gray-500 mt-1">Overdue</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-2xl font-bold text-[#0B1336]">{completedTodayCount}</p>
            <p className="text-xs text-gray-500 mt-1">Completed Today</p>
          </div>
        </div>

        {/* Pending sync badge */}
        {outboxCount > 0 && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 bg-[#FF5B00] text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              {outboxCount} pending sync{outboxCount > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {/* Download for Offline */}
          <button
            onClick={handleDownloadOffline}
            disabled={downloadingOffline}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-[#0B1336] shadow-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {downloadingOffline ? (
              <RefreshCw className="w-4 h-4 animate-spin text-[#FF5B00]" />
            ) : (
              <Download className="w-4 h-4 text-[#FF5B00]" />
            )}
            {downloadingOffline ? 'Downloading…' : 'Download for Offline'}
          </button>

          {/* Sync Now */}
          <button
            onClick={handleManualSync}
            disabled={syncing || !isOnline}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#FF5B00] text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-orange-600 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>

        {/* Download result feedback */}
        {downloadResult && (
          <div
            className={`rounded-xl px-4 py-3 text-xs font-medium ${
              downloadResult.success
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {downloadResult.message}
          </div>
        )}

        {/* Sync result feedback */}
        {syncResult && (
          <div className="rounded-xl px-4 py-3 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            Synced: {syncResult.syncedCount}, Conflicts: {syncResult.conflictCount}, Failed: {syncResult.failedCount}
          </div>
        )}

        {/* Work order list */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            My Work Orders
          </h2>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : workOrders.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
              No work orders assigned
            </div>
          ) : (
            workOrders.map((wo) => (
              <Link
                key={wo.id}
                href={`/pwa/work-orders/${wo.id}`}
                className="block bg-white rounded-xl shadow-sm border border-gray-100 hover:border-gray-200 p-4 space-y-2 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-[#FF5B00]">{wo.workOrderNumber}</span>
                  <WorkOrderStatusBadge status={wo.status} size="sm" />
                </div>
                <div className="font-semibold text-sm text-[#0B1336]">{wo.title}</div>
                <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
                  <span>{wo.asset?.name ?? wo.location?.name ?? '—'}</span>
                  <WorkOrderPriorityBadge priority={wo.priority} size="sm" />
                </div>
                {wo.dueDate && (
                  <div className="text-xs text-gray-400">
                    Due: {new Date(wo.dueDate).toLocaleDateString()}
                  </div>
                )}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
