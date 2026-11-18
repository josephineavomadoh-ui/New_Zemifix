'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Plus, Building, Wrench } from 'lucide-react';
import { NotificationHub } from '@/src/components/notifications/NotificationHub';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';

export default function CustomerPortalRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [sites, setSites] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/requests');
      const data = await res.json();
      if (res.ok) setRequests(data.requests ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProfileAndAssets = async () => {
    try {
      const [profileRes, assetsRes] = await Promise.all([
        fetch('/api/portal/profile'),
        fetch('/api/portal/assets'),
      ]);
      if (profileRes.ok) {
        const pData = await profileRes.json();
        setSites(pData.customer?.sites ?? []);
        if (pData.customer?.sites?.length > 0) {
          setSelectedSite(pData.customer.sites[0].id);
        }
      }
      if (assetsRes.ok) {
        const aData = await assetsRes.json();
        setAssets(aData.assets ?? []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadRequests();
    loadProfileAndAssets();
  }, []);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/portal/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite,
          assetId: selectedAsset || undefined,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');

      setShowModal(false);
      setDescription('');
      setSelectedAsset('');
      loadRequests();
    } catch (err: any) {
      setError(err.message ?? 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const thClass = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500';
  const tdClass = 'px-4 py-3.5 text-sm';

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/portal/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#080E29] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Portal Dashboard
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-[#FF5B00]" />
            <h1 className="text-base font-semibold text-[#080E29]">Maintenance Requests</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 bg-[#FF5B00] hover:bg-orange-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Service Request
          </button>
          <NotificationHub realm="portal" dark={false} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <LoadingSkeleton rows={5} columns={5} />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No maintenance requests"
              description="Submit a service request for any of your authorized customer sites."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className={thClass}>Site / Facility</th>
                    <th className={thClass}>Asset</th>
                    <th className={thClass}>Description</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Submitted At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`${tdClass} font-medium text-slate-800`}>{req.site?.name}</td>
                      <td className={`${tdClass} text-slate-600`}>{req.asset?.name ? `${req.asset.name} (${req.asset.assetTag})` : '—'}</td>
                      <td className={`${tdClass} text-slate-700 max-w-md truncate`}>{req.description}</td>
                      <td className={tdClass}>
                        <StatusBadge status={req.status} />
                      </td>
                      <td className={`${tdClass} text-slate-500 text-xs`}>{new Date(req.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* New Request Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-[#080E29]">Submit Maintenance Request</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Customer Site *</label>
                  <select
                    value={selectedSite}
                    onChange={(e) => setSelectedSite(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#FF5B00]"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.siteCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Equipment Asset (Optional)</label>
                  <select
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#FF5B00]"
                  >
                    <option value="">-- No specific asset / General site issue --</option>
                    {assets
                      .filter((a) => !selectedSite || a.siteId === selectedSite)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.assetTag})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Problem Description *</label>
                  <textarea
                    required
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the maintenance issue or failure..."
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-800 focus:outline-none focus:border-[#FF5B00]"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-[#FF5B00] hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
