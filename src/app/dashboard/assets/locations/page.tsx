'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Plus, AlertCircle } from 'lucide-react';
import { LocationHierarchyTree, LocationNode } from '@/src/components/assets/LocationHierarchyTree';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [building, setBuilding] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/assets/locations');
      const data = await res.json();
      if (res.ok) setLocations(data.locations ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();

    fetch('/api/organization/branches')
      .then((r) => r.json())
      .then((data) => {
        const bList = data.data ?? data.branches ?? [];
        setBranches(bList);
        if (bList[0]) setBranchId(bList[0].id);
      })
      .catch((err) => console.error('Failed to load branches:', err));
  }, []);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/assets/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), code: code.trim(), building: building.trim(), branchId }),
      });

      const data = await res.json();

      if (res.ok) {
        setName('');
        setCode('');
        setBuilding('');
        await fetchLocations();
      } else {
        throw new Error(data.error || data.message || 'Failed to create location');
      }
    } catch (err: any) {
      setError(err.message ?? 'An error occurred while creating location');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-xs transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';
  const labelClass = 'block text-xs font-medium text-slate-500 mb-1';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assets"
        eyebrowIcon={MapPin}
        title="Spatial Locations"
        description="Define the physical location hierarchy for asset placement and work order routing."
        breadcrumbs={[
          { label: 'Asset Register', href: '/dashboard/assets' },
          { label: 'Locations' },
        ]}
      />

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 md:col-span-1">
          <h2 className="text-sm font-semibold text-slate-800">New Location</h2>
          <form onSubmit={handleCreateLocation} className="space-y-4">
            <div>
              <label className={labelClass}>Operating Branch</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className={inputClass}
                disabled={branches.length === 0}
              >
                {branches.length === 0 ? (
                  <option value="">No Active Branches Available</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))
                )}
              </select>
              {branches.length === 0 && (
                <p className="mt-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  No active branches available. Create an active branch in{' '}
                  <Link href="/organization" className="font-bold underline text-[#FF5B00]">
                    Organization
                  </Link>{' '}
                  before adding locations.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Location Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. LOC-PUMP-ROOM-1"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Location Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Water Pump Station"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Building / Facility (Optional)</label>
              <input
                type="text"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                placeholder="e.g. Block C"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || branches.length === 0 || !branchId}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF5B00] py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#F95700] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              {submitting ? 'Creating…' : 'Create Location'}
            </button>
          </form>
        </div>

        {/* Location Tree */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Spatial Location Tree</h2>
          {loading ? (
            <LoadingSkeleton rows={5} columns={2} />
          ) : locations.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No locations defined yet"
              description="Create your first location to map where assets are physically placed."
            />
          ) : (
            <LocationHierarchyTree locations={locations} />
          )}
        </div>
      </div>
    </div>
  );
}
