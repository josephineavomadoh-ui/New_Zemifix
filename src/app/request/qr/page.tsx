'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  Send,
  Upload,
  Camera,
  Wrench,
  MapPin,
  Building,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';

function PublicQrRequestContent() {
  const searchParams = useSearchParams();

  const querySite = searchParams.get('siteCode') || searchParams.get('site') || '';
  const queryAsset = searchParams.get('assetTag') || searchParams.get('asset') || searchParams.get('tag') || '';
  const queryLoc = searchParams.get('locationCode') || searchParams.get('location') || '';

  const [siteCode, setSiteCode] = useState<string>(querySite);
  const [assetTag, setAssetTag] = useState<string>(queryAsset);

  // Metadata resolution
  const [resolvedSite, setResolvedSite] = useState<any>(null);
  const [resolvedAsset, setResolvedAsset] = useState<any>(null);
  const [resolving, setResolving] = useState<boolean>(true);

  // Form fields
  const [requesterName, setRequesterName] = useState<string>('');
  const [requesterEmail, setRequesterEmail] = useState<string>('');
  const [requesterPhone, setRequesterPhone] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  // Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve QR parameters on mount or when params change
  useEffect(() => {
    const resolveQr = async () => {
      setResolving(true);
      try {
        const params = new URLSearchParams();
        if (siteCode) params.set('siteCode', siteCode);
        if (assetTag) params.set('assetTag', assetTag);
        if (queryLoc) params.set('locationCode', queryLoc);

        const res = await fetch(`/api/public/qr/resolve?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setResolvedSite(data.site ?? null);
          setResolvedAsset(data.asset ?? null);
          if (data.site?.siteCode && !siteCode) {
            setSiteCode(data.site.siteCode);
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        setResolving(false);
      }
    };

    resolveQr();
  }, [siteCode, assetTag, queryLoc]);

  // Handle Photo File Selection
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image file size cannot exceed 10 MB.');
      return;
    }

    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
    setError(null);

    // Upload photo immediately
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/public/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Photo upload failed');
      setPhotoUrl(data.fileUrl);
    } catch (err: any) {
      setError(err.message ?? 'Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || uploadingPhoto) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/public/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteCode: siteCode || resolvedSite?.siteCode || undefined,
          assetTag: assetTag || undefined,
          requesterName,
          requesterEmail,
          requesterPhone,
          description,
          photoUrl: photoUrl || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');

      setSuccess(true);
    } catch (err: any) {
      setError(err.message ?? 'An error occurred during submission.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-xs transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1';

  return (
    <div className="min-h-screen bg-[#0B1336] flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full space-y-5">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF5B00] text-white shadow-lg shadow-[#FF5B00]/30">
            <QrCode className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">ZemiFix CMMS</h1>
          <p className="text-xs text-slate-300">
            Public Maintenance & Fault Reporting System
          </p>
        </div>

        {/* Resolved Target Context Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 text-white space-y-2">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF5B00]">
            Target Location / Asset
          </div>
          {resolving ? (
            <div className="text-xs text-slate-400">Resolving scanned location parameters...</div>
          ) : (
            <div className="space-y-1 text-xs">
              {resolvedAsset && (
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Wrench className="w-4 h-4 text-[#FF5B00] shrink-0" />
                  <span>{resolvedAsset.name}</span>
                  <span className="font-mono text-slate-300">({resolvedAsset.assetTag})</span>
                </div>
              )}
              {resolvedSite && (
                <div className="flex items-center gap-2 text-slate-300">
                  <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{resolvedSite.name} ({resolvedSite.siteCode})</span>
                </div>
              )}
              {resolvedSite?.address && (
                <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{resolvedSite.address}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
          {success ? (
            <div className="text-center space-y-3 py-6">
              <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
              <div className="text-lg font-bold text-slate-800">Fault Report Received</div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Thank you. Your report has been submitted to the maintenance triage queue and will be reviewed by the maintenance planner.
              </p>
              <button
                onClick={() => {
                  setSuccess(false);
                  setDescription('');
                  handleRemovePhoto();
                }}
                className="mt-4 px-4 py-2 bg-[#0B1336] text-white text-xs font-bold rounded-xl"
              >
                Submit Another Report
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  {error}
                </div>
              )}

              {/* Site Code input (if not pre-resolved) */}
              {!resolvedSite && (
                <div>
                  <label className={labelClass}>Site / Facility Code *</label>
                  <input
                    type="text"
                    required
                    value={siteCode}
                    onChange={(e) => setSiteCode(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}

              {/* Equipment Asset Tag input (if not pre-resolved) */}
              {!resolvedAsset && (
                <div>
                  <label className={labelClass}>Equipment Asset Tag (Optional)</label>
                  <input
                    type="text"
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value)}
                    placeholder="e.g. AST-CUST-1001"
                    className={inputClass}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Your Full Name *</label>
                  <input
                    type="text"
                    required
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    placeholder="e.g. Ama Osei"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={requesterPhone}
                    onChange={(e) => setRequesterPhone(e.target.value)}
                    placeholder="e.g. 0244123456"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Email Address *</label>
                <input
                  type="email"
                  required
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  placeholder="e.g. ama.osei@example.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Problem Description *</label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the defect, unusual noise, or maintenance issue observed…"
                  className={inputClass}
                />
              </div>

              {/* Photo Evidence Upload */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <label className={labelClass}>Attach Photo Evidence (Optional)</label>
                {!photoPreview ? (
                  <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-slate-200 rounded-xl py-4 text-xs text-slate-500 cursor-pointer hover:border-[#FF5B00] transition-colors bg-slate-50/50">
                    <Camera className="w-5 h-5 text-[#FF5B00]" />
                    <span className="font-semibold text-slate-700">Take Photo or Select File</span>
                    <span className="text-[10px] text-slate-400">JPEG, PNG, WebP up to 10 MB</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                  </label>
                ) : (
                  <div className="relative bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <img
                      src={photoPreview}
                      alt="Selected Evidence"
                      className="w-full rounded-lg max-h-40 object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute top-3 right-3 bg-black/60 text-white rounded-full p-1.5 hover:bg-rose-600 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {uploadingPhoto && (
                      <p className="text-[10px] font-bold text-amber-600 mt-1">Uploading image...</p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || uploadingPhoto}
                className="w-full py-3 bg-[#FF5B00] hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md shadow-[#FF5B00]/20"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Submitting Report…' : 'Submit Fault Report'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PublicQrRequestPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0B1336] flex items-center justify-center text-white text-xs">
        Loading Maintenance Request Form...
      </div>
    }>
      <PublicQrRequestContent />
    </Suspense>
  );
}
