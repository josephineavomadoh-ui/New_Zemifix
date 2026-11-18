'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MessageSquareWarning,
  Plus,
  Check,
  AlertCircle,
  QrCode,
  Building,
  Wrench,
  User,
  Phone,
  Mail,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';

export default function MaintenanceRequestsPage() {
  const [activeTab, setActiveTab] = useState<'PUBLIC_QR' | 'INTERNAL'>('PUBLIC_QR');
  const [requests, setRequests] = useState<any[]>([]);
  const [publicIntakes, setPublicIntakes] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [assetId, setAssetId] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchAllRequests = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const [reqRes, pubRes] = await Promise.all([
        fetch('/api/requests'),
        fetch('/api/requests/public'),
      ]);
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setRequests(reqData.requests ?? []);
      }
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        setPublicIntakes(pubData.intakes ?? []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllRequests(false);

    fetch('/api/assets')
      .then((res) => res.json())
      .then((data) => setAssets(data.assets ?? []))
      .catch((err) => console.error(err));

    fetch('/api/assets/locations')
      .then((res) => res.json())
      .then((data) => setLocations(data.locations ?? []))
      .catch((err) => console.error(err));
  }, []);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          assetId: assetId || null,
          locationId: locationId || null,
          priority,
        }),
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setAssetId('');
        setLocationId('');
        setIsFormOpen(false);
        await fetchAllRequests(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewInternal = async (requestId: string, action: 'CONVERT' | 'REJECT') => {
    if (reviewingId) return;
    setReviewingId(requestId);
    try {
      const res = await fetch(`/api/requests/${requestId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        await fetchAllRequests(true);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to review request');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReviewingId(null);
    }
  };

  const handleReviewPublicIntake = async (
    intakeId: string,
    action: 'CONVERT' | 'REJECT' | 'MARK_SPAM',
    reqPriority = 'HIGH'
  ) => {
    if (reviewingId) return;
    setReviewingId(intakeId);
    try {
      const res = await fetch(`/api/requests/public/${intakeId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, priority: reqPriority }),
      });

      if (res.ok) {
        await fetchAllRequests(true);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to review public intake item');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReviewingId(null);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-xs transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';
  const labelClass = 'block text-xs font-medium text-slate-500 mb-1';
  const thClass = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500';
  const tdClass = 'px-4 py-3.5 text-sm';

  const pendingPublicCount = publicIntakes.filter((i) => i.status === 'RECEIVED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Maintenance Triage"
        eyebrowIcon={MessageSquareWarning}
        title="Maintenance Requests & Public Intake"
        description="Review public QR fault reports and internal maintenance requests. Convert verified issues into active Work Orders."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/request/qr"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
            >
              <QrCode className="h-4 w-4 text-[#FF5B00]" />
              Public QR Form
            </Link>
            <button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#F95700] transition-colors"
            >
              <Plus className="h-4 w-4" />
              {isFormOpen ? 'Close Form' : 'Submit Request'}
            </button>
          </div>
        }
      />

      {/* Triage Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('PUBLIC_QR')}
          className={`pb-3 relative flex items-center gap-2 transition-colors ${
            activeTab === 'PUBLIC_QR' ? 'text-[#0B1336] font-bold border-b-2 border-[#FF5B00]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <QrCode className="w-4 h-4 text-[#FF5B00]" />
          <span>Public QR Intake Queue</span>
          {pendingPublicCount > 0 && (
            <span className="bg-[#FF5B00] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {pendingPublicCount} New
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('INTERNAL')}
          className={`pb-3 relative flex items-center gap-2 transition-colors ${
            activeTab === 'INTERNAL' ? 'text-[#0B1336] font-bold border-b-2 border-[#FF5B00]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span>Internal Work Requests</span>
          <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {requests.length}
          </span>
        </button>
      </div>

      {/* New Internal Request Form */}
      {isFormOpen && (
        <form onSubmit={handleCreateRequest} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">New Internal Maintenance Request</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. AC unit leaking water in Conference Room B"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide complete details about the issue..."
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Asset (Optional)</label>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className={inputClass}
              >
                <option value="">None (Location / Facility)</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.assetTag})</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Location (Optional)</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={inputClass}
              >
                <option value="">None (Branch / Facility Wide)</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#F95700] transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      )}

      {/* Tab 1: Public QR Intake Queue */}
      {activeTab === 'PUBLIC_QR' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <LoadingSkeleton rows={6} columns={6} />
          ) : publicIntakes.length === 0 ? (
            <EmptyState
              icon={QrCode}
              title="No public QR intake reports"
              description="Scan an equipment or facility QR code to test public fault reporting."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className={thClass}>Reporter</th>
                    <th className={thClass}>Target Site / Asset</th>
                    <th className={thClass}>Reported Problem</th>
                    <th className={thClass}>Evidence Photo</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} text-right`}>Planner Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {publicIntakes.map((intake) => (
                    <tr key={intake.id} className="hover:bg-slate-50 transition-colors">
                      <td className={tdClass}>
                        <div className="font-semibold text-slate-800">{intake.requesterName}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {intake.requesterPhone}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {intake.requesterEmail}
                        </div>
                      </td>

                      <td className={tdClass}>
                        {intake.asset ? (
                          <div>
                            <div className="font-medium text-slate-800 flex items-center gap-1">
                              <Wrench className="w-3.5 h-3.5 text-[#FF5B00]" /> {intake.asset.name}
                            </div>
                            <div className="font-mono text-xs text-[#FF5B00]">{intake.asset.assetTag}</div>
                          </div>
                        ) : intake.site ? (
                          <div>
                            <div className="font-medium text-slate-800 flex items-center gap-1">
                              <Building className="w-3.5 h-3.5 text-slate-500" /> {intake.site.name}
                            </div>
                            <div className="font-mono text-xs text-slate-400">{intake.site.siteCode}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Facility Wide</span>
                        )}
                      </td>

                      <td className={tdClass}>
                        <p className="text-xs text-slate-700 leading-snug line-clamp-2 max-w-xs">
                          {intake.description}
                        </p>
                        <span className="text-[10px] text-slate-400 block mt-1">
                          {new Date(intake.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </td>

                      <td className={tdClass}>
                        {intake.photoUrl ? (
                          <a
                            href={intake.photoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold"
                          >
                            <img
                              src={intake.photoUrl}
                              alt="Public Photo"
                              className="w-10 h-10 object-cover rounded border border-slate-200"
                            />
                            View
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">No Photo</span>
                        )}
                      </td>

                      <td className={tdClass}>
                        <StatusBadge status={intake.status} />
                      </td>

                      <td className={`${tdClass} text-right`}>
                        {intake.status === 'RECEIVED' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleReviewPublicIntake(intake.id, 'CONVERT')}
                              disabled={reviewingId === intake.id}
                              className="rounded px-3 py-1.5 text-xs font-bold bg-[#FF5B00] hover:bg-orange-600 text-white transition-colors shadow-xs disabled:opacity-50"
                            >
                              {reviewingId === intake.id ? 'Converting…' : 'Convert to Work Order'}
                            </button>
                            <button
                              onClick={() => handleReviewPublicIntake(intake.id, 'MARK_SPAM')}
                              disabled={reviewingId === intake.id}
                              className="rounded px-2.5 py-1.5 text-xs font-semibold border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50"
                            >
                              Spam / Reject
                            </button>
                          </div>
                        ) : intake.processedRequestId ? (
                          <Link
                            href={`/work-orders/${intake.processedRequestId}`}
                            className="font-mono text-xs font-bold text-[#FF5B00] hover:underline flex items-center justify-end gap-1"
                          >
                            View Work Order <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Internal Work Requests */}
      {activeTab === 'INTERNAL' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <LoadingSkeleton rows={6} columns={6} />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={MessageSquareWarning}
              title="No internal maintenance requests found"
              description="Submit a new request to log a facility or equipment issue."
              action={{ label: 'Submit Request', onClick: () => setIsFormOpen(true) }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className={thClass}>Request #</th>
                    <th className={thClass}>Title</th>
                    <th className={thClass}>Asset / Location</th>
                    <th className={thClass}>Requester</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`${tdClass} font-mono font-medium text-[#FF5B00]`}>{req.requestNumber}</td>
                      <td className={tdClass}>
                        <div className="font-medium text-slate-800">{req.title}</div>
                        <div className="text-xs text-slate-400 line-clamp-1">{req.description}</div>
                      </td>
                      <td className={`${tdClass} text-slate-600`}>
                        {req.asset ? req.asset.name : req.location ? req.location.name : 'Facility Wide'}
                      </td>
                      <td className={`${tdClass} text-slate-600`}>{req.requesterUser?.name}</td>
                      <td className={tdClass}>
                        <StatusBadge status={req.status} />
                      </td>
                      <td className={`${tdClass} text-right`}>
                        {req.status === 'SUBMITTED' || req.status === 'UNDER_REVIEW' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleReviewInternal(req.id, 'CONVERT')}
                              disabled={reviewingId === req.id}
                              className="rounded px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              {reviewingId === req.id ? 'Converting…' : 'Convert to WO'}
                            </button>
                            <button
                              onClick={() => handleReviewInternal(req.id, 'REJECT')}
                              disabled={reviewingId === req.id}
                              className="rounded px-2.5 py-1 text-xs font-medium border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-50"
                            >
                              {reviewingId === req.id ? 'Rejecting…' : 'Reject'}
                            </button>
                          </div>
                        ) : req.convertedWorkOrder ? (
                          <Link
                            href={`/work-orders/${req.convertedWorkOrder.id}`}
                            className="font-mono text-xs font-medium text-[#FF5B00] hover:underline"
                          >
                            {req.convertedWorkOrder.workOrderNumber}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
