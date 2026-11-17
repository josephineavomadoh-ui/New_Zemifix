'use client';

import React, { useEffect, useState } from 'react';
import { User, LogOut, Database, Trash2, HardDrive, Info } from 'lucide-react';
import { clearOfflineCache } from '@/src/lib/pwa/db';

interface UserInfo {
  name?: string;
  email?: string;
  role?: string;
  branch?: string | { name: string };
  department?: string | { name: string };
}

function fieldText(value: string | { name: string } | undefined): string {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  return value.name ?? '—';
}

export default function PwaProfilePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const [clearBanner, setClearBanner] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState<string | null>(null);

  // ── Load user info ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user ?? data);
        }
      } catch {
        // offline or error — show nothing
      } finally {
        setLoadingUser(false);
      }
    };
    load();
  }, []);

  // ── Storage estimate ────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      navigator.storage.estimate().then(({ usage }) => {
        if (usage != null) {
          const mb = (usage / 1024 / 1024).toFixed(1);
          setStorageUsage(mb);
        }
      }).catch(() => {});
    }
  }, []);

  // ── Sign out ────────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        window.location.href = '/login';
      } else {
        setSignOutError('Sign out failed. Please try again.');
        setSigningOut(false);
      }
    } catch {
      setSignOutError('Sign out failed. Please try again.');
      setSigningOut(false);
    }
  };

  // ── Clear offline data ──────────────────────────────────────────────────────
  const handleClearOffline = async () => {
    setClearBanner(null);
    try {
      await clearOfflineCache();
      setClearBanner('Offline data cleared');
    } catch {
      setClearBanner('Failed to clear offline data.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <h1 className="text-lg font-bold text-[#0B1336]">Profile</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* ── User info ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0B1336] rounded-full flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-[#0B1336] text-sm">
                {loadingUser ? '…' : (user?.name ?? 'Technician')}
              </div>
              <div className="text-xs text-slate-400">{user?.email ?? ''}</div>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <InfoRow label="Role" value={fieldText(user?.role)} loading={loadingUser} />
            <InfoRow label="Branch" value={fieldText(user?.branch)} loading={loadingUser} />
            <InfoRow label="Department" value={fieldText(user?.department)} loading={loadingUser} />
          </div>
        </div>

        {/* ── Sign out ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full py-3 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 font-semibold text-sm rounded-xl flex items-center justify-center gap-2 border border-red-200 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </button>
          {signOutError && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {signOutError}
            </div>
          )}
        </div>

        {/* ── Offline storage ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B1336] flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-[#FF5B00]" /> Offline Storage
          </h2>

          {storageUsage != null && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Using ~{storageUsage} MB of storage
            </div>
          )}

          <button
            onClick={handleClearOffline}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear offline data
          </button>

          {clearBanner && (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              {clearBanner}
            </div>
          )}
        </div>

        {/* ── App info ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-3.5 h-3.5 shrink-0" />
            ZemiFix Technician PWA v2.0.0
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-[#0B1336] font-medium text-xs">{loading ? '…' : value}</span>
    </div>
  );
}
