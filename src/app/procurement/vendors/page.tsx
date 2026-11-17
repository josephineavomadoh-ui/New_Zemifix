'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Plus, Search, Star, Award, Phone, Mail, MapPin } from 'lucide-react';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { LoadingSkeleton } from '@/src/components/ui/LoadingSkeleton';
import { StatusBadge } from '@/src/components/ui/StatusBadge';

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [code, setCode] = useState<string>('');
  const [registeredName, setRegisteredName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [taxId, setTaxId] = useState<string>('');
  const [vendorType, setVendorType] = useState<string>('SUPPLIER');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Selected Vendor Detail Drawer
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null);
  const [vendorTab, setVendorTab] = useState<'overview' | 'orders' | 'receipts' | 'returns' | 'performance'>('overview');

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurement/vendors${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      const data = await res.json();
      if (res.ok) setVendors(data.vendors ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [search]);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/procurement/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          registeredName,
          vendorType,
          email,
          phone,
          address,
          taxId,
        }),
      });

      if (res.ok) {
        setCode('');
        setRegisteredName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setTaxId('');
        setIsFormOpen(false);
        fetchVendors();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to register vendor');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFetchVendorDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/procurement/vendors/${id}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedVendor(data.vendor);
        setVendorTab('overview');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 transition focus:border-[#FF5B00] focus:outline-none focus:ring-2 focus:ring-[#FF5B00]/20';

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Procurement"
        eyebrowIcon={Users}
        title="Vendor Master Catalog & Profiles"
        description="Register and manage approved suppliers, contractors, and service providers. Track complete purchase histories and historical performance metrics."
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement' },
          { label: 'Vendors' },
        ]}
        actions={
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF5B00] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#E65200] transition-colors"
          >
            <Plus className="h-4 w-4" /> Register New Vendor
          </button>
        }
      />

      {isFormOpen && (
        <form onSubmit={handleCreateVendor} className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[#080E29]">Register New Vendor</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Code *</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. SUP-ACC-01"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Business Name *</label>
              <input
                type="text"
                required
                value={registeredName}
                onChange={(e) => setRegisteredName(e.target.value)}
                placeholder="e.g. Ghana Industrial Spares Ltd"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Category</label>
              <select value={vendorType} onChange={(e) => setVendorType(e.target.value)} className={inputClass}>
                <option value="SUPPLIER">Supplier / Vendor</option>
                <option value="CONTRACTOR">Contractor / Field Services</option>
                <option value="SERVICE_PROVIDER">OEM Service Provider</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sales@vendor.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telephone *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0244000000"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">GRA TIN / Tax ID</label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="C0001234567"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Business Address *</label>
            <textarea
              required
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Physical business location address..."
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-xs font-bold text-white bg-[#FF5B00] hover:bg-[#E65200] rounded-lg shadow-xs">
              {submitting ? 'Registering...' : 'Register Vendor'}
            </button>
          </div>
        </form>
      )}

      {/* Vendors Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/60 p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors by code, name, tax ID..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs placeholder-slate-400 focus:border-[#FF5B00] focus:outline-none focus:ring-1 focus:ring-[#FF5B00]"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8"><LoadingSkeleton lines={5} /></div>
        ) : vendors.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No registered vendors found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="p-3.5">Vendor Code</th>
                  <th className="p-3.5">Business Name</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Contact</th>
                  <th className="p-3.5">Tax ID / TIN</th>
                  <th className="p-3.5">Rating</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-[#080E29]">{v.code}</td>
                    <td className="p-3.5 font-semibold text-slate-800">{v.registeredName}</td>
                    <td className="p-3.5 font-medium text-slate-500">{v.vendorType}</td>
                    <td className="p-3.5 text-slate-600">{v.phone} | {v.email}</td>
                    <td className="p-3.5 font-mono text-slate-500">{v.taxId ?? '—'}</td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {Number(v.rating ?? 5.0).toFixed(1)}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleFetchVendorDetail(v.id)}
                        className="rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Profile & History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vendor Profile Drawer / Modal */}
      {selectedVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[#FF5B00]">{selectedVendor.code}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{selectedVendor.vendorType}</span>
                </div>
                <h2 className="text-xl font-extrabold text-[#080E29]">{selectedVendor.registeredName}</h2>
              </div>
              <button onClick={() => setSelectedVendor(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Profile Tabs */}
            <div className="flex border-b border-slate-200 gap-4 text-xs font-bold text-slate-500">
              <button
                onClick={() => setVendorTab('overview')}
                className={`pb-2 border-b-2 ${vendorTab === 'overview' ? 'border-[#FF5B00] text-[#080E29]' : 'border-transparent'}`}
              >
                Overview
              </button>
              <button
                onClick={() => setVendorTab('orders')}
                className={`pb-2 border-b-2 ${vendorTab === 'orders' ? 'border-[#FF5B00] text-[#080E29]' : 'border-transparent'}`}
              >
                Purchase Orders ({selectedVendor.purchaseOrders?.length ?? 0})
              </button>
              <button
                onClick={() => setVendorTab('receipts')}
                className={`pb-2 border-b-2 ${vendorTab === 'receipts' ? 'border-[#FF5B00] text-[#080E29]' : 'border-transparent'}`}
              >
                Goods Receipts ({selectedVendor.goodsReceivedNotes?.length ?? 0})
              </button>
              <button
                onClick={() => setVendorTab('performance')}
                className={`pb-2 border-b-2 ${vendorTab === 'performance' ? 'border-[#FF5B00] text-[#080E29]' : 'border-transparent'}`}
              >
                Historical Performance Metrics
              </button>
            </div>

            {/* Tab Contents */}
            {vendorTab === 'overview' && (
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg">
                <div><strong>Email:</strong> {selectedVendor.email}</div>
                <div><strong>Telephone:</strong> {selectedVendor.phone}</div>
                <div><strong>Business Address:</strong> {selectedVendor.address}</div>
                <div><strong>GRA TIN:</strong> {selectedVendor.taxId ?? 'N/A'}</div>
                <div><strong>Payment Terms:</strong> {selectedVendor.paymentTermsDays ?? 30} Days</div>
                <div><strong>Country:</strong> {selectedVendor.country ?? 'Ghana'}</div>
              </div>
            )}

            {vendorTab === 'orders' && (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {selectedVendor.purchaseOrders?.map((po: any) => (
                  <div key={po.id} className="p-3 text-xs flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-[#FF5B00]">{po.poNumber}</span>
                      <p className="text-[10px] text-slate-400">{new Date(po.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className="font-mono font-bold text-slate-800">GHS {Number(po.totalAmount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {vendorTab === 'performance' && selectedVendor.performanceMetrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <div className="text-xl font-extrabold text-[#080E29]">{selectedVendor.performanceMetrics.onTimeDeliveryRate}%</div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">On-Time Delivery</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <div className="text-xl font-extrabold text-[#080E29]">{selectedVendor.performanceMetrics.qualityAcceptanceRate}%</div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Quality Acceptance</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <div className="text-xl font-extrabold text-[#080E29]">{selectedVendor.performanceMetrics.returnRate}%</div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Supplier Return Rate</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <div className="text-xl font-extrabold text-[#080E29]">GHS {selectedVendor.performanceMetrics.totalPurchaseVolume.toLocaleString()}</div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Purchase Volume</div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3">
              <button onClick={() => setSelectedVendor(null)} className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
