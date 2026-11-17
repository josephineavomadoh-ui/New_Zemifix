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
  Boxes,
  PackagePlus,
  RefreshCw,
  Image as ImageIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import { WorkOrderStatusBadge } from '@/src/components/work-orders/WorkOrderStatusBadge';
import { WorkOrderPriorityBadge } from '@/src/components/work-orders/WorkOrderPriorityBadge';
import { useOnlineStatus } from '@/src/lib/pwa/useOnlineStatus';
import {
  enqueueOfflineMutation,
  getCachedWorkOrderDetail,
  cacheWorkOrderDetail,
  addPendingPhoto,
  getPendingPhotos,
  getQueuedOutboxMutations,
  PendingPhoto,
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
  const [photoCaption, setPhotoCaption] = useState('');
  const [evidenceType, setEvidenceType] = useState<'BEFORE' | 'AFTER' | 'GENERAL'>('GENERAL');
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const [photoBanner, setPhotoBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [queuedPhotos, setQueuedPhotos] = useState<PendingPhoto[]>([]);

  // Material Requests
  const [partsList, setPartsList] = useState<any[]>([]);
  const [storesList, setStoresList] = useState<any[]>([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [partQuantity, setPartQuantity] = useState('1');
  const [materialReason, setMaterialReason] = useState('');
  const [materialSubmitting, setMaterialSubmitting] = useState(false);
  const [materialBanner, setMaterialBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [queuedMaterialRequests, setQueuedMaterialRequests] = useState<any[]>([]);

  // History toggle
  const [showHistory, setShowHistory] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadInventoryMetadata = async () => {
    try {
      if (isOnline) {
        const [pRes, sRes] = await Promise.all([
          fetch('/api/inventory/parts'),
          fetch('/api/inventory/stores'),
        ]);
        if (pRes.ok) {
          const pData = await pRes.json();
          const parts = pData.parts ?? [];
          setPartsList(parts);
          if (parts[0]) setSelectedPartId(parts[0].id);
        }
        if (sRes.ok) {
          const sData = await sRes.json();
          const stores = sData.stores ?? [];
          setStoresList(stores);
          if (stores[0]) setSelectedStoreId(stores[0].id);
        }
      }
    } catch {
      // Graceful offline fallback
    }
  };

  const loadQueuedMaterialRequests = async () => {
    try {
      const queued = await getQueuedOutboxMutations();
      const materialMutations = queued.filter(
        (m) => m.actionType === 'MATERIAL_ISSUE_REQUEST' && (m.payload.workOrderId === id || m.entityId === id)
      );
      setQueuedMaterialRequests(materialMutations);
    } catch {
      // Ignore offline store errors
    }
  };

  const loadQueuedPhotosList = async () => {
    try {
      const allPhotos = await getPendingPhotos();
      const woPhotos = allPhotos.filter((p) => p.workOrderId === id);
      setQueuedPhotos(woPhotos);
    } catch {
      // Ignore offline store errors
    }
  };

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
    await Promise.all([loadQueuedMaterialRequests(), loadQueuedPhotosList()]);
    setLoading(false);
  };

  useEffect(() => {
    loadWorkOrder();
    loadInventoryMetadata();
  }, [id, isOnline]);

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

  // ── Material Request ────────────────────────────────────────────────────────

  const handleMaterialRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartId || !selectedStoreId || !partQuantity) return;
    setMaterialSubmitting(true);
    setMaterialBanner(null);

    const idempotencyKey = generateUuidV7();
    const qtyNum = parseFloat(partQuantity);
    const selectedPart = partsList.find((p) => p.id === selectedPartId);
    const selectedStore = storesList.find((s) => s.id === selectedStoreId);

    try {
      if (isOnline) {
        const res = await fetch('/api/sync/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mutations: [
              {
                idempotencyKey,
                actionType: 'MATERIAL_ISSUE_REQUEST',
                entityType: 'part',
                entityId: selectedPartId,
                payload: {
                  workOrderId: id,
                  storeId: selectedStoreId,
                  partId: selectedPartId,
                  quantity: qtyNum,
                  reason: materialReason,
                },
              },
            ],
          }),
        });

        if (res.status === 401) { setSessionExpired(true); return; }
        const data = await res.json();
        if (!res.ok || data.failedCount > 0 || data.conflictCount > 0) {
          const errMsg = data.results?.[0]?.reason ?? data.error ?? 'Material issue request failed on server.';
          setMaterialBanner({ type: 'error', text: errMsg });
          return;
        }

        setMaterialReason('');
        setMaterialBanner({ type: 'success', text: 'Material issue request processed & posted' });
        await loadWorkOrder();
      } else {
        await enqueueOfflineMutation({
          idempotencyKey,
          actionType: 'MATERIAL_ISSUE_REQUEST',
          entityType: 'part',
          entityId: selectedPartId,
          payload: {
            workOrderId: id,
            storeId: selectedStoreId,
            partId: selectedPartId,
            quantity: qtyNum,
            reason: materialReason,
            partName: selectedPart?.name ?? 'Inventory Part',
            storeName: selectedStore?.name ?? 'Store',
          },
          timestamp: Date.now(),
          status: 'QUEUED',
        });

        setMaterialReason('');
        setMaterialBanner({ type: 'info', text: 'Material request saved offline & queued for sync' });
        await loadQueuedMaterialRequests();
      }
    } catch (err: any) {
      setMaterialBanner({ type: 'error', text: err.message ?? 'An unexpected error occurred.' });
    } finally {
      setMaterialSubmitting(false);
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

  // ── Photo Selection & Upload ──────────────────────────────────────────────

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
    setPhotoBanner(null);
  };

  const handleRemoveSelectedPhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoCaption('');
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
        if (photoCaption) formData.append('caption', photoCaption);
        formData.append('evidenceType', evidenceType);

        const res = await fetch(`/api/work-orders/${id}/attachments`, {
          method: 'POST',
          body: formData,
        });

        if (res.status === 401) { setSessionExpired(true); return; }
        if (!res.ok) { setPhotoBanner({ type: 'error', text: 'Failed to upload photo.' }); return; }

        setPhotoFile(null);
        setPhotoPreview(null);
        setPhotoCaption('');
        setPhotoBanner({ type: 'success', text: 'Photo uploaded & attached' });
        await loadWorkOrder();
      } else {
        await addPendingPhoto({
          localId: generateUuidV7(),
          workOrderId: id,
          blob: photoFile,
          mimeType: photoFile.type,
          fileName: photoFile.name,
          capturedAt: Date.now(),
          uploadStatus: 'PENDING',
          caption: photoCaption,
          evidenceType,
        });

        setPhotoFile(null);
        setPhotoPreview(null);
        setPhotoCaption('');
        setPhotoBanner({ type: 'info', text: 'Photo saved offline & queued for upload' });
        await loadQueuedPhotosList();
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
        <div className="bg-slate-200 text-slate-600 text-xs text-center py-2 px-4 font-semibold">
          Using cached data
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Back link */}
        <Link href="/pwa/jobs" className="text-xs text-slate-500 hover:text-[#0B1336] flex items-center gap-1">
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

        {/* ── Status transitions ── */}
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

        {/* ── Photo Capture & Attachments Card ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-[#FF5B00]" /> Photo Evidence & Attachments
            </h2>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {(wo.attachments?.length ?? 0) + queuedPhotos.length} File(s)
            </span>
          </div>

          {/* Uploaded server attachments */}
          {wo.attachments && wo.attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Uploaded Attachments</h3>
              <div className="grid grid-cols-2 gap-2">
                {wo.attachments.map((att: any) => (
                  <div key={att.id} className="border border-slate-100 rounded-lg p-2 bg-slate-50 text-xs space-y-1">
                    <p className="font-semibold text-slate-800 truncate">{att.fileName}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{(att.fileSize / 1024).toFixed(1)} KB</span>
                      <span className="text-emerald-600 font-bold">Uploaded</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Queued offline pending photos */}
          {queuedPhotos.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Pending Offline Uploads
              </h3>
              <div className="space-y-2">
                {queuedPhotos.map((p) => (
                  <div key={p.localId} className="border border-amber-200 bg-amber-50/60 rounded-lg p-2.5 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-amber-900 truncate">{p.fileName}</p>
                      <p className="text-[10px] text-amber-700">
                        {p.caption ? `Caption: ${p.caption}` : `Type: ${p.evidenceType ?? 'GENERAL'}`}
                      </p>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${p.uploadStatus === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                      {p.uploadStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photo Capture Form */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            {photoBanner && (
              <div
                className={`text-xs rounded-lg px-3 py-2 ${
                  photoBanner.type === 'error'
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : photoBanner.type === 'info'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {photoBanner.text}
              </div>
            )}

            {/* Dual selection options: Camera vs Gallery */}
            {!photoFile ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 rounded-xl py-5 text-xs text-slate-600 cursor-pointer hover:border-[#FF5B00] transition-colors bg-slate-50/50">
                  <Camera className="w-5 h-5 text-[#FF5B00]" />
                  <span className="font-semibold">Take Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </label>

                <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 rounded-xl py-5 text-xs text-slate-600 cursor-pointer hover:border-[#FF5B00] transition-colors bg-slate-50/50">
                  <ImageIcon className="w-5 h-5 text-indigo-500" />
                  <span className="font-semibold">Select Gallery</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="relative">
                  {photoPreview && (
                    <img
                      src={photoPreview}
                      alt="Selected preview"
                      className="w-full rounded-lg border border-slate-200 max-h-52 object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveSelectedPhoto}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-rose-600 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Evidence Stage</label>
                    <select
                      value={evidenceType}
                      onChange={(e) => setEvidenceType(e.target.value as any)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-[#FF5B00]"
                    >
                      <option value="BEFORE">Before Repair</option>
                      <option value="AFTER">After Repair</option>
                      <option value="GENERAL">General Condition</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">Photo Description / Caption</label>
                    <input
                      type="text"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      placeholder="e.g. Cracked pump housing seal"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#FF5B00] bg-white"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleRemoveSelectedPhoto}
                    className="px-3 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handlePhotoUpload}
                    disabled={photoSubmitting}
                    className="flex-1 py-2 bg-[#FF5B00] hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {photoSubmitting ? 'Uploading...' : 'Save & Attach Photo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Materials & Inventory Issue Requests ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-[#FF5B00]" /> Materials & Part Requests
            </h2>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {(wo.parts?.length ?? 0) + queuedMaterialRequests.length} Item(s)
            </span>
          </div>

          {/* Issued parts on work order */}
          {wo.parts && wo.parts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Issued Parts</h3>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-slate-50/50">
                {wo.parts.map((p: any) => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{p.part?.name ?? p.description ?? 'Spare Part'}</p>
                      <p className="text-[10px] text-slate-400">Code: {p.part?.partNumber ?? 'N/A'}</p>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-bold text-[#0B1336]">{p.quantity ?? p.quantityIssued ?? 1} PCS</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Queued offline material requests */}
          {queuedMaterialRequests.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Pending Offline Requests
              </h3>
              <div className="divide-y divide-amber-100 rounded-lg border border-amber-200 bg-amber-50/50">
                {queuedMaterialRequests.map((q: any) => (
                  <div key={q.idempotencyKey} className="p-2.5 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-amber-900">{q.payload.partName ?? 'Requested Part'}</p>
                      <p className="text-[10px] text-amber-700">{q.payload.reason ? `Note: ${q.payload.reason}` : 'Pending Sync'}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-amber-800">{q.payload.quantity} PCS</span>
                      <span className="block text-[9px] font-extrabold uppercase text-amber-600">Queued</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form to submit material request */}
          <form onSubmit={handleMaterialRequest} className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <PackagePlus className="w-3.5 h-3.5 text-[#FF5B00]" /> Request Spare Part
            </h3>

            {materialBanner && (
              <div
                className={`text-xs rounded-lg px-3 py-2 ${
                  materialBanner.type === 'error'
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : materialBanner.type === 'info'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {materialBanner.text}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Select Store / Warehouse</label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#FF5B00] bg-white"
              >
                {storesList.length === 0 ? (
                  <option value="">Main Store Warehouse</option>
                ) : (
                  storesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Select Inventory Part *</label>
              <select
                required
                value={selectedPartId}
                onChange={(e) => setSelectedPartId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#FF5B00] bg-white"
              >
                {partsList.length === 0 ? (
                  <option value="">No catalog parts loaded</option>
                ) : (
                  partsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.partNumber} - {p.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Qty *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={partQuantity}
                  onChange={(e) => setPartQuantity(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#FF5B00]"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason / Work Note</label>
                <input
                  type="text"
                  value={materialReason}
                  onChange={(e) => setMaterialReason(e.target.value)}
                  placeholder="e.g. Replacement for worn bearing"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#FF5B00]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={materialSubmitting || !selectedPartId}
              className="w-full py-2.5 bg-[#FF5B00] hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <PackagePlus className="w-4 h-4" />
              {materialSubmitting ? 'Submitting Request...' : 'Submit Material Request'}
            </button>
          </form>
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
