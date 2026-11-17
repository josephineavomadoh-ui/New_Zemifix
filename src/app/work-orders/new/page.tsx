'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, Check, AlertCircle, Wrench, MapPin, User, Calendar, DollarSign } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [type, setType] = useState<string>('CORRECTIVE');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [assetId, setAssetId] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [assignedUserId, setAssignedUserId] = useState<string>('');
  const [plannedStart, setPlannedStart] = useState<string>('');
  const [plannedEnd, setPlannedEnd] = useState<string>('');
  const [estimatedHours, setEstimatedHours] = useState<string>('2');
  const [estimatedCost, setEstimatedCost] = useState<string>('150');

  const [assets, setAssets] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/assets').then((r) => r.json()),
      fetch('/api/organization/branches').then((r) => r.json()),
      fetch('/api/assets/locations').then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ])
      .then(([aData, bData, lData, uData]) => {
        setAssets(aData.assets ?? []);
        setBranches(bData.data ?? bData.branches ?? []);
        setLocations(lData.locations ?? []);
        setUsers(uData.data ?? uData.users ?? []);
      })
      .catch((err) => console.error('Failed to load setup options:', err));
  }, []);

  // Dynamically load branch locations whenever branchId changes
  useEffect(() => {
    if (!branchId) return;
    fetch(`/api/assets/locations?branchId=${encodeURIComponent(branchId)}`)
      .then((r) => r.json())
      .then((lData) => {
        if (lData.locations && lData.locations.length > 0) {
          setLocations(lData.locations);
        }
      })
      .catch((err) => console.error('Failed to load branch locations:', err));
  }, [branchId]);

  // When asset selection changes, auto-populate branch and location
  const handleAssetChange = (selectedAssetId: string) => {
    setAssetId(selectedAssetId);
    if (!selectedAssetId) return;

    const selectedAsset = assets.find((a) => a.id === selectedAssetId);
    if (selectedAsset) {
      if (selectedAsset.branchId) setBranchId(selectedAsset.branchId);
      if (selectedAsset.locationId) setLocationId(selectedAsset.locationId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          assetId: assetId || null,
          branchId: branchId || null,
          locationId: locationId || null,
          assignedUserId: assignedUserId || null,
          plannedStart: plannedStart ? new Date(plannedStart) : null,
          plannedEnd: plannedEnd ? new Date(plannedEnd) : null,
          estimatedHours: parseFloat(estimatedHours) || 0,
          estimatedCost: parseFloat(estimatedCost) || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create work order');

      router.push(`/work-orders/${data.workOrder.id}`);
    } catch (err: any) {
      setError(err.message ?? 'An error occurred during work order creation');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-xs transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1';

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        eyebrow="Work Orders"
        eyebrowIcon={ClipboardList}
        title="Create Work Order"
        description="Log a new corrective, preventive, or emergency maintenance task."
        breadcrumbs={[
          { label: 'Work Orders', href: '/work-orders' },
          { label: 'New Work Order' },
        ]}
        actions={
          <Link
            href="/work-orders"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
        {/* Section 1: Scope & Title */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B1336] border-b border-slate-100 pb-2">
            1. Scope & Task Title
          </h2>
          <div>
            <label className={labelClass}>Work Order Title <span className="text-[#FF5B00]">*</span></label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 500-Hour Preventive Maintenance Servicing on Generator Set #1"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Detailed Work Scope & Instructions <span className="text-[#FF5B00]">*</span></label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide detailed instructions, required PPE, safety lockout procedures, and target deliverables..."
              className={inputClass}
            />
          </div>
        </section>

        {/* Section 2: Asset & Location */}
        <section className="space-y-4 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B1336] border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-[#FF5B00]" /> 2. Asset & Placement Location
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Target Asset / Equipment</label>
              <select
                value={assetId}
                onChange={(e) => handleAssetChange(e.target.value)}
                className={inputClass}
              >
                <option value="">None (Facility-Wide / General Task)</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.assetTag})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Operating Branch</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select Branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Specific Location / Room</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select Location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Section 3: Classification & Priority */}
        <section className="space-y-4 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B1336] border-b border-slate-100 pb-2">
            3. Maintenance Classification & Priority
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Maintenance Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={inputClass}
              >
                <option value="CORRECTIVE">Corrective Maintenance</option>
                <option value="PREVENTIVE">Preventive Maintenance</option>
                <option value="EMERGENCY">Emergency Breakdown</option>
                <option value="INSPECTION">Safety / Compliance Inspection</option>
                <option value="GENERAL">General Maintenance</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
              >
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH">High Priority</option>
                <option value="URGENT">Urgent Priority</option>
                <option value="EMERGENCY">Emergency Priority</option>
              </select>
            </div>
          </div>
        </section>

        {/* Section 4: Assignment & Scheduling */}
        <section className="space-y-4 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B1336] border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-purple-600" /> 4. Assignment & Target Schedule
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Assigned Lead Technician</label>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned (Assign Later)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Planned Start Date</label>
              <input
                type="date"
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Planned Due Date</label>
              <input
                type="date"
                value={plannedEnd}
                onChange={(e) => setPlannedEnd(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Section 5: Resource Estimates */}
        <section className="space-y-4 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0B1336] border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" /> 5. Resource & Cost Estimates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Estimated Labor Hours</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Estimated Cost (GHS)</label>
              <input
                type="number"
                step="10"
                min="0"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <Link
            href="/work-orders"
            className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#F95700] disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {loading ? 'Creating Work Order…' : 'Create Work Order'}
          </button>
        </div>
      </form>
    </div>
  );
}

