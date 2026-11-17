'use client';

import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Download,
  Trash2,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Image as ImageIcon,
  RotateCcw,
  Radio,
} from 'lucide-react';
import { useOnlineStatus } from '@/src/lib/pwa/useOnlineStatus';
import {
  getQueuedOutboxMutations,
  getConflictRecords,
  deleteConflictRecord,
  getPendingPhotos,
  cacheWorkOrderDetail,
  cacheAssets,
  cacheWorkOrdersLocally,
  QueuedOfflineMutation,
  ConflictRecord,
  PendingPhoto,
} from '@/src/lib/pwa/db';
import { flushOfflineSyncQueue, registerBackgroundSync } from '@/src/lib/pwa/offlineSyncManager';

const LAST_SYNCED_KEY = 'zemifix_last_synced';

function formatActionType(raw: string): string {
  return raw
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function formatTs(ts: string | number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function OutboxStatusBadge({ status }: { status: QueuedOfflineMutation['status'] }) {
  const map: Record<string, string> = {
    QUEUED: 'bg-blue-100 text-blue-700',
    CONFLICT: 'bg-orange-100 text-orange-700',
    FAILED: 'bg-red-100 text-red-700',
    SYNCED: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}

function ConflictTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    WO_CANCELLED: 'bg-red-100 text-red-700',
    STOCK_UNAVAILABLE: 'bg-amber-100 text-amber-700',
    WO_STATUS_MISMATCH: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[type] ?? 'bg-slate-100 text-slate-500'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

function UploadStatusBadge({ status }: { status: PendingPhoto['uploadStatus'] }) {
  const map: Record<string, string> = {
    PENDING: 'bg-blue-100 text-blue-700',
    UPLOADING: 'bg-amber-100 text-amber-700',
    UPLOADED: 'bg-emerald-100 text-emerald-700',
    FAILED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}

export default function PwaSyncPage() {
  const isOnline = useOnlineStatus();

  const [outboxItems, setOutboxItems] = useState<QueuedOfflineMutation[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [bgSyncSupported, setBgSyncSupported] = useState<boolean>(false);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [downloadingOffline, setDownloadingOffline] = useState(false);
  const [downloadResult, setDownloadResult] = useState<string | null>(null);

  const loadAll = async () => {
    const [outbox, cfls, photos] = await Promise.all([
      getQueuedOutboxMutations(),
      getConflictRecords(),
      getPendingPhotos(),
    ]);
    setOutboxItems(outbox);
    setConflicts(cfls);
    setPendingPhotos(photos);
  };

  useEffect(() => {
    loadAll();
    const stored = typeof window !== 'undefined' ? localStorage.getItem(LAST_SYNCED_KEY) : null;
    setLastSyncedAt(stored);

    // Check W3C Background Sync support
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'SyncManager' in window) {
      setBgSyncSupported(true);
    }
  }, []);

  const handleSyncNow = async () => {
    if (!isOnline) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      await registerBackgroundSync();
      const result = await flushOfflineSyncQueue();
      const ts = new Date().toISOString();
      localStorage.setItem(LAST_SYNCED_KEY, ts);
      setLastSyncedAt(ts);
      setSyncResult(
        `Synced: ${result.syncedCount}, Conflicts: ${result.conflictCount}, Failed: ${result.failedCount}`
      );
      await loadAll();
    } catch {
      setSyncResult('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadOffline = async () => {
    if (!isOnline) return;
    setDownloadingOffline(true);
    setDownloadResult(null);
    try {
      const res = await fetch('/api/pwa/sync-package');
      if (!res.ok) {
        setDownloadResult('Failed to download data. Please try again.');
        return;
      }
      const data = await res.json();

      const wos: any[] = data.workOrders ?? [];
      const assets: any[] = data.assets ?? [];

      setDownloadResult('Storing data…');

      for (const wo of wos) {
        await cacheWorkOrderDetail({ ...wo, cachedAt: Date.now() });
      }
      await cacheWorkOrdersLocally(
        wos.map((wo) => ({
          id: wo.id,
          workOrderNumber: wo.workOrderNumber,
          title: wo.title,
          description: wo.description,
          status: wo.status,
          priority: wo.priority,
          type: wo.type ?? '',
          asset: wo.asset,
          location: wo.location,
          cachedAt: Date.now(),
        }))
      );
      await cacheAssets(
        assets.map((a) => ({ ...a, cachedAt: Date.now() }))
      );

      setDownloadResult(
        `Downloaded: ${wos.length} work order${wos.length !== 1 ? 's' : ''}, ${assets.length} asset${assets.length !== 1 ? 's' : ''}`
      );
    } catch {
      setDownloadResult('Download failed. Please try again.');
    } finally {
      setDownloadingOffline(false);
    }
  };

  const handleDiscardConflict = async (key: string) => {
    await deleteConflictRecord(key);
    setConflicts((prev) => prev.filter((c) => c.idempotencyKey !== key));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#0B1336]">Sync Centre</h1>
            <p className="text-xs text-slate-400">Offline queue & background synchronization</p>
          </div>
          {!isOnline && (
            <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Background Sync Support Indicator */}
        <div className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <Radio className={`w-4 h-4 ${bgSyncSupported ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
            W3C Background Sync Engine
          </span>
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${bgSyncSupported ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
            {bgSyncSupported ? 'Active / Supported' : 'Online Hook Fallback'}
          </span>
        </div>

        {/* ── Actions ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <button
            onClick={handleSyncNow}
            disabled={!isOnline || syncing}
            className="w-full py-3 bg-[#0B1336] hover:bg-[#162252] disabled:opacity-50 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          {syncResult && (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              {syncResult}
            </div>
          )}

          <button
            onClick={handleDownloadOffline}
            disabled={!isOnline || downloadingOffline}
            className="w-full py-3 bg-[#FF5B00] hover:bg-orange-600 disabled:opacity-50 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Download className={`w-4 h-4 ${downloadingOffline ? 'animate-bounce' : ''}`} />
            {downloadingOffline ? 'Downloading…' : 'Download Data for Offline'}
          </button>
          {downloadResult && (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              {downloadResult}
            </div>
          )}
        </div>

        {/* ── Outbox ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#FF5B00]" /> Outbox Queue ({outboxItems.length})
            </h2>
            {outboxItems.some((i) => i.status === 'FAILED') && (
              <button
                onClick={handleSyncNow}
                disabled={!isOnline || syncing}
                className="text-xs font-bold text-[#FF5B00] hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Retry Failed
              </button>
            )}
          </div>

          {outboxItems.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Nothing pending
            </div>
          ) : (
            <div className="space-y-2">
              {outboxItems.map((item) => (
                <div
                  key={item.idempotencyKey}
                  className="border border-slate-100 rounded-lg p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      {formatActionType(item.actionType)}
                    </span>
                    <OutboxStatusBadge status={item.status} />
                  </div>
                  <div className="text-xs text-slate-400">{item.entityType}</div>
                  <div className="text-xs text-slate-400">{formatTs(item.timestamp)}</div>
                  {item.errorMessage && (
                    <div className="text-xs text-red-600 font-medium italic pt-1 border-t border-slate-100">
                      {item.errorMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Conflicts ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Conflicts ({conflicts.length})
          </h2>
          {conflicts.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No conflicts</p>
          ) : (
            <div className="space-y-3">
              {conflicts.map((c) => (
                <div
                  key={c.idempotencyKey}
                  className="border border-slate-100 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <ConflictTypeBadge type={c.conflictType} />
                    <span className="text-xs text-slate-400">{formatTs(c.occurredAt)}</span>
                  </div>
                  <div className="text-xs text-slate-700 font-medium">
                    {formatActionType(c.actionType)}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">ID: {c.entityId}</div>
                  {c.reason && (
                    <div className="text-xs text-slate-600 italic bg-amber-50 p-2 rounded border border-amber-100">
                      {c.reason}
                    </div>
                  )}
                  <button
                    onClick={() => handleDiscardConflict(c.idempotencyKey)}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Discard Conflict Record
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pending photos ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-[#FF5B00]" /> Pending Photos ({pendingPhotos.length})
            </h2>
            {pendingPhotos.some((p) => p.uploadStatus === 'FAILED') && (
              <button
                onClick={handleSyncNow}
                disabled={!isOnline || syncing}
                className="text-xs font-bold text-[#FF5B00] hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Retry Failed Uploads
              </button>
            )}
          </div>

          {pendingPhotos.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No pending photos</p>
          ) : (
            <div className="space-y-2">
              {pendingPhotos.map((photo) => (
                <div
                  key={photo.localId}
                  className="border border-slate-100 rounded-lg p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-700 truncate">{photo.fileName}</span>
                    <UploadStatusBadge status={photo.uploadStatus} />
                  </div>
                  {photo.caption && (
                    <div className="text-xs text-slate-500 italic">Caption: {photo.caption}</div>
                  )}
                  {photo.errorMessage && (
                    <div className="text-xs text-red-600 font-medium italic">{photo.errorMessage}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Last synced ── */}
        <div className="text-xs text-slate-400 text-center py-2">
          {lastSyncedAt ? `Last synced: ${formatTs(lastSyncedAt)}` : 'Never synced'}
        </div>
      </div>
    </div>
  );
}
