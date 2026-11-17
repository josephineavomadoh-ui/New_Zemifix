'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Layers, AlertTriangle, Activity, Camera, Trash2, Upload } from 'lucide-react';
import { AssetStatusBadge } from '@/src/components/assets/AssetStatusBadge';
import { AssetThumbnail } from '@/src/components/assets/AssetThumbnail';
import { MeterReadingModal } from '@/src/components/assets/MeterReadingModal';
import { DowntimeLogModal } from '@/src/components/assets/DowntimeLogModal';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'telemetry' | 'downtime' | 'maintenance' | 'history'>('overview');

  const [selectedMeter, setSelectedMeter] = useState<any>(null);
  const [isReadingModalOpen, setIsReadingModalOpen] = useState<boolean>(false);
  const [isDowntimeModalOpen, setIsDowntimeModalOpen] = useState<boolean>(false);
  const [imageActionLoading, setImageActionLoading] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const fetchAssetDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${id}`);
      const data = await res.json();
      if (res.ok) setAsset(data.asset);
    } catch (err) {
      console.error('Failed to fetch asset detail', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssetDetail();
  }, [id]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageActionLoading(true);
    setImageError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`/api/assets/${id}/image`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload asset image.');
      }
      await fetchAssetDetail();
    } catch (err: any) {
      setImageError(err.message ?? 'Failed to upload image.');
    } finally {
      setImageActionLoading(false);
    }
  };

  const handleImageDelete = async () => {
    if (!confirm('Are you sure you want to remove this asset photograph?')) return;

    setImageActionLoading(true);
    setImageError(null);
    try {
      const res = await fetch(`/api/assets/${id}/image`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove asset image.');
      }
      await fetchAssetDetail();
    } catch (err: any) {
      setImageError(err.message ?? 'Failed to remove image.');
    } finally {
      setImageActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16">
        <EmptyState
          icon={Layers}
          title="Asset not found"
          description="This asset may have been removed or you may not have access."
          action={
            <Link
              href="/dashboard/assets"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#F95700]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Return to Asset Register
            </Link>
          }
        />
      </div>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview & Specifications' },
    { key: 'telemetry', label: `Telemetry Meters (${asset.meters?.length ?? 0})` },
    { key: 'downtime', label: `Downtime Events (${asset.downtimeLogs?.length ?? 0})` },
    { key: 'maintenance', label: `Maintenance History (${asset.workOrders?.length ?? 0})` },
    { key: 'history', label: 'Audit & History Log' },
  ] as const;

  const thClass = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500';
  const tdClass = 'px-4 py-3.5 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assets"
        eyebrowIcon={Layers}
        title={asset.name}
        breadcrumbs={[
          { label: 'Asset Register', href: '/dashboard/assets' },
          { label: asset.assetTag },
        ]}
        actions={
          <button
            onClick={() => setIsDowntimeModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-600 hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            Log Downtime
          </button>
        }
      />

      {/* Asset Summary Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Status</p>
          <div className="mt-1.5"><AssetStatusBadge status={asset.status} /></div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ownership Mode</p>
          <p className="mt-1.5 text-sm font-semibold text-slate-700">{asset.ownershipType}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Category</p>
          <p className="mt-1.5 text-sm font-semibold text-slate-700">{asset.category?.name}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Location</p>
          <p className="mt-1.5 text-sm font-semibold text-slate-700 truncate">
            {asset.location ? asset.location.name : asset.site ? asset.site.name : 'Unplaced'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Asset tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-[#FF5B00] text-[#FF5B00]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Asset Photograph Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 flex flex-col items-center text-center">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 w-full text-left">Asset Photograph</h3>

            <div className="relative group">
              <div className="h-40 w-40 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center shadow-inner">
                <AssetThumbnail assetId={asset.id} imageUrl={asset.imageUrl} assetName={asset.name} size="lg" />
              </div>
            </div>

            {imageError && (
              <p className="text-xs text-rose-600 font-medium">{imageError}</p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 w-full pt-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5B00] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#F95700] cursor-pointer transition-colors shadow-2xs">
                <Upload className="h-3.5 w-3.5" />
                {asset.imageUrl ? 'Replace Photo' : 'Upload Photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} disabled={imageActionLoading} className="hidden" />
              </label>

              {asset.imageUrl && (
                <button
                  onClick={handleImageDelete}
                  disabled={imageActionLoading}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
                  title="Remove Photograph"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">JPEG, PNG or WebP. Max 5MB.</p>
          </div>

          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Technical Specifications</h3>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Manufacturer', value: asset.manufacturer ?? 'N/A' },
                  { label: 'Model Number', value: asset.modelNumber ?? 'N/A' },
                  { label: 'Serial Number', value: asset.serialNumber ?? 'N/A' },
                  { label: 'Criticality Rating', value: `Level ${asset.criticality}` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-[11px] text-slate-400 font-medium">{label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-700">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Custody & Responsibilities</h3>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Custodian', value: asset.custodianUser?.name ?? 'Unassigned' },
                  { label: 'Responsible User', value: asset.responsibleUser?.name ?? 'Unassigned' },
                  { label: 'Department', value: asset.responsibleDepartment?.name ?? 'Unassigned' },
                  { label: 'Branch', value: asset.branch?.name ?? 'N/A' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-[11px] text-slate-400 font-medium">{label}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-700">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* Telemetry Meters */}
      {activeTab === 'telemetry' && (
        <div className="space-y-4">
          {!asset.meters?.length ? (
            <div className="rounded-xl border border-slate-200 bg-white py-12">
              <EmptyState icon={Activity} title="No telemetry meters configured" description="Add meters to this equipment to track operating readings." />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {asset.meters.map((m: any) => (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{m.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{m.meterType.replace(/_/g, ' ')}</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedMeter(m);
                        setIsReadingModalOpen(true);
                      }}
                      className="inline-flex items-center rounded-lg border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-[#FF5B00] hover:bg-orange-100 transition-colors"
                    >
                      Record Reading
                    </button>
                  </div>
                  <div className="text-2xl font-mono font-bold text-slate-800">
                    {m.currentReading}{' '}
                    <span className="text-sm text-slate-400 font-sans">{m.unitOfMeasure}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Downtime Modal */}
      <DowntimeLogModal
        assetId={asset.id}
        assetName={asset.name}
        isOpen={isDowntimeModalOpen}
        onClose={() => setIsDowntimeModalOpen(false)}
        onSubmitSuccess={() => {
          setIsDowntimeModalOpen(false);
          fetchAssetDetail();
        }}
      />

      {/* Meter Reading Modal */}
      {selectedMeter && (
        <MeterReadingModal
          meter={selectedMeter}
          isOpen={isReadingModalOpen}
          onClose={() => {
            setSelectedMeter(null);
            setIsReadingModalOpen(false);
          }}
          onSubmitSuccess={() => {
            setSelectedMeter(null);
            setIsReadingModalOpen(false);
            fetchAssetDetail();
          }}
        />
      )}
    </div>
  );
}
