'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Wrench,
  Tag,
  MapPin,
  Layers,
  Gauge,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  Building,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { WorkOrderStatusBadge } from '@/src/components/work-orders/WorkOrderStatusBadge';
import { WorkOrderPriorityBadge } from '@/src/components/work-orders/WorkOrderPriorityBadge';
import { useOnlineStatus } from '@/src/lib/pwa/useOnlineStatus';
import {
  enqueueOfflineMutation,
  getCachedAssetById,
  getCachedAssets,
  cacheAssets,
} from '@/src/lib/pwa/db';
import { generateUuidV7 } from '@/src/lib/uuid';

export default function PwaAssetWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isOnline = useOnlineStatus();

  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);

  // Meter Reading State
  const [meterValues, setMeterValues] = useState<Record<string, string>>({});
  const [meterNotes, setMeterNotes] = useState<Record<string, string>>({});
  const [meterSubmitting, setMeterSubmitting] = useState<Record<string, boolean>>({});
  const [meterBanners, setMeterBanners] = useState<Record<string, { type: 'success' | 'error' | 'info'; text: string }>>({});

  // Downtime State
  const [downtimeType, setDowntimeType] = useState<'UNPLANNED' | 'PLANNED'>('UNPLANNED');
  const [downtimeReason, setDowntimeReason] = useState('Unplanned equipment failure');
  const [downtimeSubmitting, setDowntimeSubmitting] = useState(false);
  const [downtimeBanner, setDowntimeBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Sections toggle
  const [showHistory, setShowHistory] = useState(false);

  // ── Data Loading ────────────────────────────────────────────────────────────

  const loadAsset = async () => {
    setLoading(true);
    if (isOnline) {
      try {
        const res = await fetch(`/api/assets/${id}`);
        if (res.ok) {
          const data = await res.json();
          const fetched = data.asset ?? data;
          setAsset(fetched);
          setFromCache(false);
          // Cache locally
          cacheAssets([
            {
              id: fetched.id,
              name: fetched.name,
              tag: fetched.assetTag,
              category: fetched.category?.name,
              status: fetched.status,
              location: fetched.location,
              model: fetched.modelNumber,
              serialNumber: fetched.serialNumber,
              meters: fetched.meters,
              cachedAt: Date.now(),
            },
          ]).catch(() => {});
        } else {
          const cached = await getCachedAssetById(id);
          if (cached) { setAsset(cached); setFromCache(true); }
        }
      } catch {
        const cached = await getCachedAssetById(id);
        if (cached) { setAsset(cached); setFromCache(true); }
      }
    } else {
      const cached = await getCachedAssetById(id);
      if (cached) { setAsset(cached); setFromCache(true); }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAsset();
  }, [id, isOnline]);

  // ── Meter Reading Submission ────────────────────────────────────────────────

  const handleMeterSubmit = async (meter: any) => {
    const meterId = meter.id;
    const rawVal = meterValues[meterId];
    if (!rawVal || !asset) return;

    const newVal = parseFloat(rawVal);
    if (isNaN(newVal)) return;

    // Validation for CONTINUOUS_INCREMENTAL meters
    const currentVal = Number(meter.currentReading ?? meter.currentValue ?? 0);
    const meterType = meter.meterType ?? 'CONTINUOUS_INCREMENTAL';

    if (meterType === 'CONTINUOUS_INCREMENTAL' && newVal < currentVal) {
      setMeterBanners((prev) => ({
        ...prev,
        [meterId]: {
          type: 'error',
          text: `INVALID_METER_READING: Incremental reading (${newVal}) cannot be less than current reading (${currentVal}).`,
        },
      }));
      return;
    }

    setMeterSubmitting((prev) => ({ ...prev, [meterId]: true }));
    setMeterBanners((prev) => ({ ...prev, [meterId]: { type: 'info', text: 'Submitting...' } }));

    try {
      if (isOnline) {
        const res = await fetch(`/api/assets/${asset.id}/readings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meterId,
            readingValue: newVal,
            readingTimestamp: new Date().toISOString(),
          }),
        });

        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setMeterBanners((prev) => ({
            ...prev,
            [meterId]: { type: 'error', text: d.error ?? 'Failed to save meter reading.' },
          }));
          return;
        }

        setMeterBanners((prev) => ({
          ...prev,
          [meterId]: { type: 'success', text: 'Meter reading saved & meter updated' },
        }));
        setMeterValues((prev) => ({ ...prev, [meterId]: '' }));
        await loadAsset();
      } else {
        await enqueueOfflineMutation({
          idempotencyKey: generateUuidV7(),
          actionType: 'METER_READING',
          entityType: 'asset_meter',
          entityId: meterId,
          payload: { assetId: asset.id, meterId, readingValue: newVal, readingTimestamp: new Date().toISOString() },
          timestamp: Date.now(),
          status: 'QUEUED',
        });

        setMeterBanners((prev) => ({
          ...prev,
          [meterId]: { type: 'info', text: 'Meter reading saved offline & queued for sync' },
        }));
        setMeterValues((prev) => ({ ...prev, [meterId]: '' }));
      }
    } catch {
      setMeterBanners((prev) => ({
        ...prev,
        [meterId]: { type: 'error', text: 'An unexpected error occurred.' },
      }));
    } finally {
      setMeterSubmitting((prev) => ({ ...prev, [meterId]: false }));
    }
  };

  // ── Downtime Reporting ──────────────────────────────────────────────────────

  const handleStartDowntime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || downtimeSubmitting) return;

    setDowntimeSubmitting(true);
    setDowntimeBanner(null);

    const startedAt = new Date().toISOString();

    try {
      if (isOnline) {
        const res = await fetch(`/api/assets/${asset.id}/downtime/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            downtimeType,
            reason: downtimeReason,
            startedAt,
          }),
        });

        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setDowntimeBanner({ type: 'error', text: d.error ?? 'Failed to report downtime.' });
          return;
        }

        setDowntimeBanner({ type: 'success', text: 'Downtime logged & asset status set to DOWN' });
        await loadAsset();
      } else {
        await enqueueOfflineMutation({
          idempotencyKey: generateUuidV7(),
          actionType: 'DOWNTIME_START',
          entityType: 'asset',
          entityId: asset.id,
          payload: {
            assetId: asset.id,
            downtimeType,
            reason: downtimeReason,
            startedAt,
          },
          timestamp: Date.now(),
          status: 'QUEUED',
        });

        setAsset((prev: any) => ({ ...prev, status: 'DOWN' }));
        setDowntimeBanner({ type: 'info', text: 'Downtime logged offline & queued for sync' });
      }
    } catch {
      setDowntimeBanner({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setDowntimeSubmitting(false);
    }
  };

  const handleEndDowntime = async (downtimeLogId: string) => {
    if (!asset || downtimeSubmitting) return;
    setDowntimeSubmitting(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}/downtime/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downtimeLogId }),
      });

      if (res.ok) {
        setDowntimeBanner({ type: 'success', text: 'Downtime ended & equipment status restored' });
        await loadAsset();
      } else {
        const d = await res.json().catch(() => ({}));
        setDowntimeBanner({ type: 'error', text: d.error ?? 'Failed to end downtime.' });
      }
    } catch {
      setDowntimeBanner({ type: 'error', text: 'Failed to end downtime.' });
    } finally {
      setDowntimeSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <p className="text-xs text-slate-400">Loading asset workspace...</p>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-3 p-8">
        <p className="text-xs text-slate-500">Asset record not found.</p>
        <Link href="/pwa/assets" className="text-xs font-bold text-[#FF5B00] hover:underline">
          Return to Asset Directory
        </Link>
      </div>
    );
  }

  const openDowntimeLog = asset.downtimeLogs?.find((d: any) => d.endedAt === null);

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-lg mx-auto pb-28">
      {/* Offline cached banner */}
      {fromCache && (
        <div className="bg-slate-200 text-slate-600 text-xs text-center py-2 px-4 font-semibold">
          Showing cached offline asset record
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Back Link */}
        <Link href="/pwa/assets" className="text-xs text-slate-500 hover:text-[#0B1336] flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Asset Directory
        </Link>

        {/* Active Downtime Warning Banner */}
        {(asset.status === 'DOWN' || openDowntimeLog) && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <div className="text-xs font-bold text-rose-900 uppercase tracking-wider">EQUIPMENT DOWN</div>
              <p className="text-xs text-rose-700">
                {openDowntimeLog?.reason ?? 'Equipment is currently marked out of service due to downtime.'}
              </p>
              {openDowntimeLog && isOnline && (
                <button
                  onClick={() => handleEndDowntime(openDowntimeLog.id)}
                  disabled={downtimeSubmitting}
                  className="mt-2 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition"
                >
                  End Downtime & Restore Equipment
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Asset Header Card ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              {asset.assetTag && (
                <div className="flex items-center gap-1 font-mono text-xs font-bold text-[#FF5B00]">
                  <Tag className="w-3.5 h-3.5" />
                  {asset.assetTag}
                </div>
              )}
              <h1 className="text-lg font-bold text-[#0B1336] leading-snug">{asset.name}</h1>
            </div>

            <span
              className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                asset.status === 'ACTIVE' || asset.status === 'OPERATIONAL'
                  ? 'bg-emerald-100 text-emerald-800'
                  : asset.status === 'DOWN'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {asset.status ?? 'ACTIVE'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg text-slate-600 border border-slate-100">
            <div><strong>Category:</strong> {asset.category?.name ?? asset.category ?? '—'}</div>
            <div><strong>Location:</strong> {asset.location?.name ?? '—'}</div>
            <div><strong>Branch:</strong> {asset.branch?.name ?? '—'}</div>
            <div><strong>Criticality:</strong> {asset.criticality ?? 'MEDIUM'}</div>
            {asset.manufacturer && <div><strong>Manufacturer:</strong> {asset.manufacturer}</div>}
            {asset.modelNumber && <div><strong>Model:</strong> {asset.modelNumber}</div>}
            {asset.serialNumber && <div><strong>S/N:</strong> {asset.serialNumber}</div>}
          </div>
        </div>

        {/* ── Meters & Gauge Readings Card ── */}
        {asset.meters && asset.meters.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-[#FF5B00]" /> Meter Readings & Gauges
            </h2>

            {asset.meters.map((meter: any) => {
              const meterId = meter.id;
              const banner = meterBanners[meterId];
              const isMonotonic = (meter.meterType ?? 'CONTINUOUS_INCREMENTAL') === 'CONTINUOUS_INCREMENTAL';

              return (
                <div key={meterId} className="border border-slate-100 rounded-lg p-3 bg-slate-50/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#0B1336]">{meter.name}</span>
                    <span className="font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Current: <strong>{Number(meter.currentReading ?? meter.currentValue ?? 0)} {meter.unitOfMeasure ?? meter.unit ?? ''}</strong>
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400">
                    Type: {meter.meterType ?? 'CONTINUOUS_INCREMENTAL'} {isMonotonic ? '(Monotonically Increasing)' : ''}
                  </div>

                  {banner && (
                    <div
                      className={`text-xs rounded px-2.5 py-1.5 ${
                        banner.type === 'error'
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : banner.type === 'info'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {banner.text}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <input
                      type="number"
                      step="any"
                      value={meterValues[meterId] ?? ''}
                      onChange={(e) => setMeterValues((prev) => ({ ...prev, [meterId]: e.target.value }))}
                      placeholder={`New reading value (${meter.unitOfMeasure ?? 'units'})`}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-[#FF5B00]"
                    />
                    <button
                      onClick={() => handleMeterSubmit(meter)}
                      disabled={meterSubmitting[meterId] || !meterValues[meterId]}
                      className="px-3.5 py-1.5 bg-[#0B1336] text-white text-xs font-bold rounded-lg hover:bg-[#162252] disabled:opacity-50 transition"
                    >
                      Record
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Equipment Downtime Form Card ── */}
        <form onSubmit={handleStartDowntime} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-500" /> Report Equipment Downtime
          </h2>

          {downtimeBanner && (
            <div
              className={`text-xs rounded-lg px-3 py-2 ${
                downtimeBanner.type === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : downtimeBanner.type === 'info'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {downtimeBanner.text}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Downtime Category</label>
              <select
                value={downtimeType}
                onChange={(e) => setDowntimeType(e.target.value as any)}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-[#FF5B00]"
              >
                <option value="UNPLANNED">Unplanned Breakdown</option>
                <option value="PLANNED">Planned PM / Inspection</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Reason / Cause</label>
              <input
                type="text"
                required
                value={downtimeReason}
                onChange={(e) => setDowntimeReason(e.target.value)}
                placeholder="e.g. Hydraulic line leak"
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-[#FF5B00]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={downtimeSubmitting}
            className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-xs"
          >
            {downtimeSubmitting ? 'Submitting Log...' : 'Log Equipment Downtime'}
          </button>
        </form>

        {/* ── Maintenance History & Work Orders Card ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#FF5B00]" /> Maintenance Work Orders
            </h2>
            <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
              {asset.workOrders?.length ?? 0} Orders
            </span>
          </div>

          {!asset.workOrders || asset.workOrders.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No work orders recorded for this asset.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {asset.workOrders.map((wo: any) => (
                <Link
                  key={wo.id}
                  href={`/pwa/work-orders/${wo.id}`}
                  className="block p-3 hover:bg-slate-50 transition text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#FF5B00]">{wo.workOrderNumber}</span>
                    <WorkOrderStatusBadge status={wo.status} size="sm" />
                  </div>
                  <div className="font-semibold text-slate-800">{wo.title}</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                    <span>Assigned: {wo.assignedUser?.name ?? 'Unassigned'}</span>
                    <WorkOrderPriorityBadge priority={wo.priority} size="sm" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
