'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, User, Building, ShieldCheck, Save } from 'lucide-react';
import { NotificationHub } from '@/src/components/notifications/NotificationHub';

export default function CustomerPortalProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/portal/profile')
      .then((res) => res.json())
      .then((data) => {
        setProfile(data);
        if (data.contact) {
          setName(data.contact.name || '');
          setPhone(data.contact.phone || '');
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/portal/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setMessage('Profile updated successfully.');
    } catch (err: any) {
      setMessage(err.message ?? 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-xs text-slate-500">Loading profile…</div>;
  }

  const customer = profile?.customer;
  const contact = profile?.contact;

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
            <User className="h-5 w-5 text-[#FF5B00]" />
            <h1 className="text-base font-semibold text-[#080E29]">Account Profile & Organization</h1>
          </div>
        </div>
        <NotificationHub realm="portal" dark={false} />
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {message && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Contact Details Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800 border-b border-slate-100 pb-3">
              <User className="w-4 h-4 text-[#FF5B00]" />
              <span>Contact Information</span>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-slate-500 mb-1">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={contact?.email || ''}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-500 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:border-[#FF5B00]"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-500 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:border-[#FF5B00]"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {contact?.isPrimaryContact ? 'Primary Account Contact' : 'Authorized Contact'}
                </span>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#FF5B00] hover:bg-orange-600 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>

          {/* Customer Organization Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800 border-b border-slate-100 pb-3">
              <Building className="w-4 h-4 text-[#FF5B00]" />
              <span>Customer Organization</span>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400">Company Name</span>
                <span className="font-semibold text-sm text-slate-900">{customer?.name}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400">Customer Number</span>
                <span className="font-mono">{customer?.customerNumber}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400">Billing Address</span>
                <span>{customer?.billingAddress}</span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400">Authorized Sites</span>
                <span className="font-semibold">{customer?.sites?.length ?? 0} sites registered</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
