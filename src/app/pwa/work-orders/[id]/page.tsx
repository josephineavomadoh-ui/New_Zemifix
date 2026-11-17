'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Clock,
  Check,
  Camera,
  ChevronDown,
  ChevronUp,
  Gauge,
  StickyNote,
  MapPin,
  Tag,
  Wrench,
} from 'lucide-react';
import { WorkOrderStatusBadge } from '@/src/components/work-orders/WorkOrderStatusBadge';
import { WorkOrderPriorityBadge } from '@/src/components/work-orders/WorkOrderPriorityBadge';
import { useOnlineStatus } from '@/src/lib/pwa/useOnlineStatus';
import {
  enqueueOfflineMutation,
  getCachedWorkOrderDetail,
  cacheWorkOrderDetail,
  addPendingPhoto,
} from '@/src/lib/pwa/db';
import { generateUuidV7 } from '@/src/lib/uuid';

export default function PwaWorkOrderWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isOnline = useOnlineStatus();

  const [wo, setWo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Status transition feedback
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  // Checklist
  const [checklistBanner, setChecklistBanner] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  // Notes
  const [noteBody, setNoteBody] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteBanner, setNoteBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Labor
  const [laborHours, setLaborHours] = useState('2');
  const [laborDesc, setLaborDesc] = useState('');
  const [laborSubmitting, setLaborSubmitting] = useState(false);
  const [laborBanner, setLaborBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Meter readings — keyed by meterId
  const [meterValues, setMeterValues] = useState<Record<string, string>>({});
  const [meterBanners, setMeterBanners] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const [photoBanner, setPhotoBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // History toggle
  const [showHistory, setShowHistory] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadWorkOrder = async () => {
    setLoading(true);
    if (isOnline) {
      try {
        const res = await fetch(`/api/work-orders/${id}`);
        if (res.status === 401) {
          setSessionExpired(true);
          setLoading(false);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          const fetched = data.workOrder ?? data;
          setWo(fetched);
          setFromCache(false);
          cacheWorkOrderDetail({ ...fetched, cachedAt: Date.now() }).catch(() => {});
        } else {
          // fall back to cache on other errors
          const cached = await getCachedWorkOrderDetail(id);
          if (cached) { setWo(cached); setFromCache(true); }
        }
      } catch {
        const cached = await getCachedWorkOrderDetail(id);
        if (cached) { setWo(cached); setFromCache(true); }
      }
    } else {
      const cached = await getCachedWorkOrderDetail(id);
      if (cached) { setWo(cached); setFromCache(true); }
    }
    setLoading(false);
  };

  useEffect(() => { loadWorkOrder(); }, [id, isOnline]);

  // ── Status transition ───────────────────────────────────────────────────────

  const handleStatusTransition = async (newStatus: string) => {
    setStatusSubmitting(true);
    setStatusBanner(null);
    try {
      if (isOnline) {
        const res = await fetch(`/api/work-orders/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus }),
        });
        if (res.status === 401) { setSessionExpired(true); return; }
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setStatusBanner({ type: 'error', text: d.error ?? 'Failed to update status.' });
          return;
        }
        await loadWorkOrder();
      } else {
        await enqueueOfflineMutation({
          idempotencyKey: generateUuidV7(),
          actionType: 'WORK_ORDER_STATUS_SHIFT',
          entityType: 'work_order',
          entityId: id,
          payload: { workOrderId: id, newStatus },
          timestamp: Date.now(),
          status: 'QUEUED',
        });
        setWo((prev: any) => ({ ...prev, status: newStatus }));
        setStatusBanner({ type: 'info', text: 'Status change queued for sync' });
      }
    } catch {
      setStatusBanner({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setStatusSubmitting(false);
    }
  };

  // ── Checklist toggle ────────────────────────────────────────────────────────

  const handleChecklistToggle = async (checklistItemId: string, currentVal: boolean | null) => {
    if (wo?.status !== 'IN_PROGRESS') return;
    const newVal = currentVal === true ? false : true;
    setChecklistBanner(null);
    try {
      if (isOnline) {
        const res = await fetch(`/api/work-orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checklistItemId, passFail: newVal }),
        });
        if (res.status === 401) { setSessionExpired(true); return; }
        if (!res.ok) {
          setChecklistBanner({ type: 'error', text: 'Failed to update checklist item.' });
          return;
        }
        await loadWorkOrder();
      } else {
        await enqueueOfflineMutation({
          idempotencyKey: generateUuidV7(),
          actionType: 'CHECKLIST_UPDATE',
          entityType: 'checklist_item',
          entityId: checklistItemId,
          payload: { checklistItemId, passFail: newVal },
          timestamp: Date.now(),
          status: 'QUEUED',
        });
        setWo((prev: any) => ({
          ...prev,
          checklists: prev.checklists?.map((c: any) =>
            c.id === checklistItemId ? { ...c, passFail: newVal } : c
          ),
        }));
        setChecklistBanner({ type: 'info', text: 'Status change queued for sync' });
      }
    } catch {
      setChecklistBanner({ type: 'error', text: 'An unexpected error occurred.' });
    }
  };

  // ── Notes ───────────────────────────────────────────────────────────────────

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setNoteSubmitting(true);
    setNoteBanner(null);
    try {
      if (isOnline) {
        const res = await fetch(`/api/work-orders/${id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: noteBody, isCustomerVisible: false }),
        });
        if (res.status === 401) { setSessionExpired(true); return; }
        if (!res.ok) { setNoteBanner({ type: 'error', text: 'Failed to save note.' }); return; }
        setNoteBody('');
        setNoteBanner({ type: 'success', text: 'Note saved' });
      } else {
        await enqueueOfflineMutation({
          idempotencyKey: generateUuidV7(),
          actionType: 'WORK_ORDER_NOTE',
          entityType: 'work_order_comment',
          entityId: id,
          payload: { workOrderId: id, body: noteBody },
          timestamp: Date.now(),
          status: 'QUEUED',
        });
        setNoteBody('');
        setNoteBanner({ type: 'success', text: 'Note queued for sync' });
      }
    } catch {
      setNoteBanner({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setNoteSubmitting(false);
    }
  };

  // ── Labor ───────────────────────────────────────────────────────────────────

  const handleRecordLabor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLaborSubmitting(true);
    setLaborBanner(null);
    try {
      if (isOnline) {
        const res = await fetch(`/api/work-orders/${id}/labor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hoursWorked: laborHours, description: laborDesc }),
        });
        if (res.status === 401) { setSessionExpired(true); return; }
        if (!res.ok) { setLaborBanner({ type: 'error', text: 'Failed to log labor.' }); return; }
        setLaborDesc('');
        setLaborBanner({ type: 'success', text: 'Labor logged' });
        await loadWorkOrder();
      } else {
        await enqueueOfflineMutation({
          idempotencyKey: generateUuidV7(),
          actionType: 'LABOR_LOG',
          entityType: 'work_order',
          entityId: id,
          payload: { workOrderId: id, hoursWorked: laborHours, description: laborDesc },
          timestamp: Date.now(),
          status: 'QUEUED',
        });
        setLaborDesc('');
        setLaborBanner({ type: 'success', text: 'Labor log queued for sync' });
      }
    } catch {
      setLaborBanner({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setLaborSubmitting(false);
    }
  };

  // ── Meter readings ──────────────────────────────────────────────────────────

  const handleMeterSubmit = async (meterId: string) => {
    const val = meterValues[meterId];
    if (!val || !wo?.asset?.id) return;
    setMeterBanners((prev) => ({ ...prev, [meterId]: { type: 'success', text: '' } }));
    try {
      if (isOnline) {
        const res = await fetch(`/api/assets/${wo.asset.id}/readings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meterId, readingValue: parseFloat(val) }),
        });
        if (res.status === 401) { setSessionExpired(true); return; }
        if (!res.ok) {
          setMeterBanners((prev) => ({ ...prev, [meterId]: { type: 'error', text: 'Failed to save reading.' } }));
          return;
        }
        setMeterBanners((prev) => ({ ...prev, [meterId]: { type: 'success', text: 'Reading saved' } }));
        setMeterValues((prev) => ({ ...prev, [meterId]: '' }));
      } else {
        await enqueueOfflineMutation({
          idempotencyKey: generateUuidV7(),
          actionType: 'METER_READING',
          entityType: 'asset_meter',
          entityId: meterId,
          payload: { assetId: wo.asset.id, meterId, readingValue: parseFloat(val) },
          timestamp: Date.now(),
          status: 'QUEUED',
        });
        setMeterBanners((prev) => ({ ...prev, [meterId]: { type: 'success', text: 'Reading queued for sync' } }));
        setMeterValues((prev) => ({ ...prev, [meterId]: '' }));
      }
    } catch {
      setMeterBanners((prev) => ({ ...prev, [meterId]: { type: 'error', text: 'An unexpected error occurred.' } }));
    }
  };

  // ── Photo ───────────────────────────────────────────────────────────────────

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setPhotoBanner(null);
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;
    setPhotoSubmitting(true);
    setPhotoBanner(null);
    try {
      if (isOnline) {
        const formData = new FormData();
        formData.append('file', photoFile);
        const res = await fetch(`/api/work-orders/${id}/attachments`, {
          method: 'POST',
          body: formData,
        });
        if (res.status === 401) { setSessionExpired(true); return; }
        if (!res.ok) { setPhotoBanner({ type: 'error', text: 'Failed to upload photo.' }); return; }
        setPhotoFile(null);
        setPhotoPreview(null);
        setPhotoBanner({ type: 'success', text: 'Photo uploaded' });
      } else {
        await addPendingPhoto({
          localId: generateUuidV7(),
          workOrderId: id,
          blob: photoFile,
          mimeType: photoFile.type,
          fileName: photoFile.name,
          capturedAt: Date.now(),
          uploadStatus: 'PENDING',
        });
        setPhotoFile(null);
        setPhotoPreview(null);
        setPhotoBanner({ type: 'success', text: 'Photo queued for upload' });
      }
    } catch {
      setPhotoBanner({ type: 'error', text: 'An unexpected error occurred.' });
    } finally {
      setPhotoSubmitting(false);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const formatTs = (ts: string | number | null | undefined) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  // ── Session expired overlay ─────────────────────────────────────────────────

  if (sessionExpired) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-bold text-[#0B1336]">Session Expired</h1>
        <p className="text-sm text-slate-600 text-center max-w-xs">
          Your session has expired. Please sign in again to continue.
        </p>
        <Link
          href="/login"
          className="px-6 py-3 bg-[#0B1336] text-white text-sm font-semibold rounded-xl"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-slate-500">Work order not found.</p>
        <Link href="/pwa" className="text-xs text-[#FF5B00] hover:underline">
          Return to PWA Home
        </Link>
      </div>
    );
  }

  const meters: any[] = wo.asset?.meters ?? [];

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-lg mx-auto pb-28">
      {/* Cached banner */}
      {fromCache && (
        <div className="bg-slate-200 text-slate-600 text-xs text-center py-2 px-4">
          Using cached data
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Back link */}
        <Link href="/pwa/work-orders" className="text-xs text-slate-500 hover:text-[#0B1336] flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> My Jobs
        </Link>

        {/* ── Header card ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-mono font-bold text-[#FF5B00] text-sm">{wo.workOrderNumber}</span>
            <div className="flex items-center gap-2">
              <WorkOrderPriorityBadge priority={wo.priority} />
              <WorkOrderStatusBadge status={wo.status} size="sm" />
            </div>
          </div>
          <h1 className="text-lg font-bold text-[#0B1336] leading-snug">{wo.title}</h1>
          {wo.description && (
            <p className="text-xs text-slate-500 leading-relaxed">{wo.description}</p>
          )}
        </div>

        {/* ── Asset panel ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336]">Asset / Location</h2>
          {wo.asset ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <Wrench className="w-3.5 h-3.5 text-[#FF5B00] shrink-0" />
                <span className="font-medium">{wo.asset.name}</span>
              </div>
              {wo.asset.tag && (
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Tag className="w-3 h-3 shrink-0" />
                  <span>{wo.asset.tag}</span>
                </div>
              )}
              {wo.asset.location?.name && (
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{wo.asset.location.name}</span>
                </div>
              )}
              {wo.asset.model && (
                <div className="text-xs text-slate-400">Model: {wo.asset.model}</div>
              )}
              {wo.asset.serialNumber && (
                <div className="text-xs text-slate-400">S/N: {wo.asset.serialNumber}</div>
              )}
            </div>
          ) : wo.location ? (
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-[#FF5B00] shrink-0" />
              <span>{wo.location.name}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No asset or location attached.</p>
          )}
        </div>

        {/* ── Action buttons ── */}
        <div className="space-y-2">
          {statusBanner && (
            <div
              className={`text-xs rounded-lg px-3 py-2 ${
                statusBanner.type === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {statusBanner.text}
            </div>
          )}

          <div className="flex items-center gap-2">
            {(wo.status === 'OPEN' || wo.status === 'ASSIGNED') && (
              <button
                onClick={() => handleStatusTransition('IN_PROGRESS')}
                disabled={statusSubmitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm"
              >
                <PlayCircle className="w-4 h-4" /> Start Work
              </button>
            )}

            {wo.status === 'IN_PROGRESS' && (
              <>
                <button
                  onClick={() => handleStatusTransition('ON_HOLD')}
                  disabled={statusSubmitting}
                  className="flex-1 py-3 bg-amber-50 text-amber-700 border border-amber-300 font-semibold text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <PauseCircle className="w-4 h-4" /> Pause
                </button>
                <button
                  onClick={() => handleStatusTransition('COMPLETED')}
                  disabled={statusSubmitting}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" /> Complete
                </button>
              </>
            )}

            {wo.status === 'ON_HOLD' && (
              <button
                onClick={() => handleStatusTransition('IN_PROGRESS')}
                disabled={statusSubmitting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm"
              >
                <PlayCircle className="w-4 h-4" /> Resume
              </button>
            )}

            {!['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'].includes(wo.status) && (
              <div className="w-full py-3 bg-slate-100 text-slate-400 text-sm font-semibold rounded-xl flex items-center justify-center cursor-not-allowed">
                {wo.status}
              </div>
            )}
          </div>
        </div>

        {/* ── Checklists ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336]">Checklists</h2>
          {checklistBanner && (
            <div
              className={`text-xs rounded-lg px-3 py-2 ${
                checklistBanner.type === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {checklistBanner.text}
            </div>
          )}
          {!wo.checklists?.length ? (
            <p className="text-xs text-slate-400">No checklist items.</p>
          ) : (
            <div className="space-y-2">
              {wo.checklists.map((item: any) => {
                const locked = wo.status !== 'IN_PROGRESS';
                return (
                  <button
                    key={item.id}
                    onClick={() => handleChecklistToggle(item.id, item.passFail)}
                    disabled={locked}
                    className={`w-full text-left p-3 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                      locked
                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                        : item.passFail === true
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {item.isMandatory && (
                        <span className="text-[#FF5B00] font-bold">*</span>
                      )}
                      {item.description}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-xs ${
                        item.passFail === true
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {item.passFail === true ? 'PASS' : 'PENDING'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5 text-[#FF5B00]" /> Notes
          </h2>
          <form onSubmit={handleAddNote} className="space-y-2">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              placeholder="Add an observation or work note…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FF5B00] resize-none"
            />
            <button
              type="submit"
              disabled={noteSubmitting || !noteBody.trim()}
              className="w-full py-2.5 bg-[#0B1336] hover:bg-[#162252] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {noteSubmitting ? 'Saving…' : 'Add Note'}
            </button>
          </form>
          {noteBanner && (
            <div
              className={`text-xs rounded-lg px-3 py-2 ${
                noteBanner.type === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {noteBanner.text}
            </div>
          )}
        </div>

        {/* ── Labor log ── */}
        <form onSubmit={handleRecordLabor} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#FF5B00]" /> Log Labor Hours
          </h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Hours Worked</label>
            <input
              type="number"
              step="0.5"
              min="0"
              required
              value={laborHours}
              onChange={(e) => setLaborHours(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#FF5B00]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Work Performed</label>
            <input
              type="text"
              required
              value={laborDesc}
              onChange={(e) => setLaborDesc(e.target.value)}
              placeholder="e.g. Replaced worn belt & calibrated tension"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FF5B00]"
            />
          </div>
          <button
            type="submit"
            disabled={laborSubmitting}
            className="w-full py-2.5 bg-[#FF5B00] hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          >
            <Check className="w-4 h-4" />
            {laborSubmitting ? 'Logging…' : 'Log Hours'}
          </button>
          {laborBanner && (
            <div
              className={`text-xs rounded-lg px-3 py-2 ${
                laborBanner.type === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {laborBanner.text}
            </div>
          )}
        </form>

        {/* ── Meter readings ── */}
        {meters.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-[#FF5B00]" /> Meter Readings
            </h2>
            {meters.map((meter: any) => (
              <div key={meter.id} className="space-y-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{meter.name}</span>
                  {meter.currentValue != null && (
                    <span className="text-xs text-slate-400">
                      Current: {meter.currentValue} {meter.unit ?? ''}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    value={meterValues[meter.id] ?? ''}
                    onChange={(e) =>
                      setMeterValues((prev) => ({ ...prev, [meter.id]: e.target.value }))
                    }
                    placeholder={`New ${meter.unit ?? 'value'}`}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#FF5B00]"
                  />
                  <button
                    onClick={() => handleMeterSubmit(meter.id)}
                    disabled={!meterValues[meter.id]}
                    className="px-4 py-2 bg-[#0B1336] hover:bg-[#162252] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Save
                  </button>
                </div>
                {meterBanners[meter.id] && (
                  <div
                    className={`text-xs rounded-lg px-3 py-1.5 ${
                      meterBanners[meter.id].type === 'error'
                        ? 'bg-red-50 text-red-600 border border-red-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {meterBanners[meter.id].text}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Photo capture ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-[#FF5B00]" /> Capture Photo
          </h2>
          <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-slate-200 rounded-xl py-6 text-sm text-slate-500 cursor-pointer hover:border-[#FF5B00] transition-colors">
            <Camera className="w-5 h-5 text-slate-400" />
            <span>Capture Photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </label>
          {photoPreview && (
            <img
              src={photoPreview}
              alt="Preview"
              className="w-full rounded-lg border border-slate-200 max-h-48 object-cover"
            />
          )}
          {photoFile && (
            <button
              onClick={handlePhotoUpload}
              disabled={photoSubmitting}
              className="w-full py-2.5 bg-[#FF5B00] hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {photoSubmitting ? 'Uploading…' : 'Upload'}
            </button>
          )}
          {photoBanner && (
            <div
              className={`text-xs rounded-lg px-3 py-2 ${
                photoBanner.type === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {photoBanner.text}
            </div>
          )}
        </div>

        {/* ── Work history ── */}
        {wo.statusHistory?.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#0B1336]"
            >
              <span>Work History</span>
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showHistory && (
              <div className="space-y-3 pt-1">
                {wo.statusHistory.map((entry: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#FF5B00] mt-1.5 shrink-0" />
                    <div className="space-y-0.5">
                      <WorkOrderStatusBadge status={entry.status} size="sm" />
                      <div className="text-xs text-slate-400">{formatTs(entry.createdAt ?? entry.timestamp)}</div>
                      {entry.reason && (
                        <div className="text-xs text-slate-500 italic">{entry.reason}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
