'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Briefcase, Database, RefreshCw, User } from 'lucide-react';

const NAV_TABS = [
  { label: 'Home', href: '/pwa', icon: Home },
  { label: 'My Jobs', href: '/pwa/jobs', icon: Briefcase },
  { label: 'Assets', href: '/pwa/assets', icon: Database },
  { label: 'Sync Centre', href: '/pwa/sync', icon: RefreshCw },
  { label: 'Profile', href: '/pwa/profile', icon: User },
];

export default function PwaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Service worker registration failed:', err);
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-md mx-auto relative min-h-screen">
        {/* Page content */}
        <main className="pb-24">{children}</main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200">
          <div
            className="max-w-md mx-auto flex items-stretch"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {NAV_TABS.map(({ label, href, icon: Icon }) => {
              const isActive =
                href === '/pwa'
                  ? pathname === '/pwa'
                  : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center justify-center flex-1 py-3 gap-1 text-xs font-medium transition-colors"
                  style={{ color: isActive ? '#FF5B00' : '#64748B' }}
                >
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ color: isActive ? '#FF5B00' : '#94A3B8' }}
                  />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
