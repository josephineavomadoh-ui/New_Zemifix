'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DollarSign, Building } from 'lucide-react';
import { NotificationHub } from '@/src/components/notifications/NotificationHub';
import { StatusBadge } from '@/src/components/ui/StatusBadge';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';

export default function CustomerPortalInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/portal/invoices')
      .then((res) => res.json())
      .then((data) => setInvoices(data.invoices ?? []))
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
            <DollarSign className="h-5 w-5 text-[#FF5B00]" />
            <h1 className="text-base font-semibold text-[#080E29]">Customer Invoices & Billing</h1>
          </div>
        </div>
        <NotificationHub realm="portal" dark={false} />
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <LoadingSkeleton rows={4} columns={6} />
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No invoices found"
              description="Invoices issued to your customer account will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className={thClass}>Invoice Number</th>
                    <th className={thClass}>Site</th>
                    <th className={thClass}>Total Amount</th>
                    <th className={thClass}>Balance Due</th>
                    <th className={thClass}>Due Date</th>
                    <th className={thClass}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className={`${tdClass} font-mono font-semibold text-[#FF5B00]`}>{inv.invoiceNumber}</td>
                      <td className={`${tdClass} text-slate-600`}>{inv.site?.name || '—'}</td>
                      <td className={`${tdClass} font-mono font-bold text-slate-800`}>GHS {Number(inv.totalAmount).toLocaleString()}</td>
                      <td className={`${tdClass} font-mono font-bold text-rose-600`}>GHS {Number(inv.balanceDue).toLocaleString()}</td>
                      <td className={`${tdClass} text-slate-500 text-xs`}>{new Date(inv.dueDate).toLocaleDateString()}</td>
                      <td className={tdClass}>
                        <StatusBadge status={inv.status} />
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
