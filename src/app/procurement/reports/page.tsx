'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Download, FileSpreadsheet, Filter } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';

export default function ProcurementReportsPage() {
  const [reportType, setReportType] = useState<string>('PO_REGISTER');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurement/reports?type=${reportType}`);
      const result = await res.json();
      if (res.ok) setData(result.data ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType]);

  const exportToCsv = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).filter((k) => typeof data[0][k] !== 'object');
    const csvRows = [
      headers.join(','),
      ...data.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Procurement_Report_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const reportTabs = [
    { id: 'PO_REGISTER', label: 'Purchase Order Register' },
    { id: 'PR_REGISTER', label: 'Purchase Requisitions Register' },
    { id: 'GRN_HISTORY', label: 'Goods Receipts History' },
    { id: 'SUPPLIER_SPEND', label: 'Supplier Spend Analysis' },
  ];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Procurement Analytics"
        eyebrowIcon={BarChart3}
        title="Procurement Reports Hub"
        description="Generate enterprise procurement reports for spend analysis, order registers, supplier performance, and CSV exports."
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement' },
          { label: 'Reports' },
        ]}
        actions={
          <button
            onClick={exportToCsv}
            disabled={data.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#E65200] transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV Report
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-bold text-slate-500 overflow-x-auto">
        {reportTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setReportType(t.id)}
            className={`pb-2 whitespace-nowrap border-b-2 transition ${reportType === t.id ? 'border-[#FF5B00] text-[#080E29]' : 'border-transparent'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Report Data Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-8"><LoadingSkeleton lines={6} /></div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No report records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {Object.keys(data[0])
                    .filter((k) => typeof data[0][k] !== 'object')
                    .map((key) => (
                      <th key={key} className="p-3.5">{key.replace(/([A-Z])/g, ' $1')}</th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    {Object.keys(row)
                      .filter((k) => typeof row[k] !== 'object')
                      .map((key) => (
                        <td key={key} className="p-3.5 font-medium text-slate-800">
                          {String(row[key])}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
