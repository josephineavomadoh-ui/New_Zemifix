'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, FileText, Calendar } from 'lucide-react';
import { NotificationHub } from '@/src/components/notifications/NotificationHub';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';

export default function CustomerPortalContractsPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/portal/contracts')
      .then((res) => res.json())
      .then((data) => setContracts(data.contracts ?? []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

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
            <ShieldCheck className="h-5 w-5 text-[#FF5B00]" />
            <h1 className="text-base font-semibold text-[#080E29]">Service Contracts & SLA</h1>
          </div>
        </div>
        <NotificationHub realm="portal" dark={false} />
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <LoadingSkeleton rows={4} columns={5} />
          ) : contracts.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No active service contracts"
              description="There are no active service level agreements or maintenance contracts assigned to your account."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className={thClass}>Contract Number</th>
                    <th className={thClass}>Title</th>
                    <th className={thClass}>SLA Policy</th>
                    <th className={thClass}>Validity Period</th>
                    <th className={thClass}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contracts.map((cnt) => (
                    <tr key={cnt.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`${tdClass} font-mono font-semibold text-[#FF5B00]`}>{cnt.contractNumber}</td>
                      <td className={`${tdClass} font-semibold text-slate-800`}>{cnt.title}</td>
                      <td className={`${tdClass} text-slate-600`}>{cnt.slaPolicy?.name || 'Standard SLA'}</td>
                      <td className={`${tdClass} text-slate-500 text-xs`}>
                        {new Date(cnt.startDate).toLocaleDateString()} — {new Date(cnt.endDate).toLocaleDateString()}
                      </td>
                      <td className={tdClass}>
                        <StatusBadge status={cnt.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
