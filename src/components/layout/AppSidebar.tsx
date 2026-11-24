'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  Boxes,
  Building,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileBarChart2,
  FileText,
  Handshake,
  Layers,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquareWarning,
  PackageCheck,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
  Truck,
  Upload,
  Users,
  Users2,
  Wrench,
} from 'lucide-react';
import { ZemifixLogo } from '../ui/ZemifixLogo';
import type { UserSession } from '@/src/lib/auth-context';

/* ------------------------------------------------------------------ */
/* Types                                                                 */
/* ------------------------------------------------------------------ */

export interface AppSidebarUser {
  name: string;
  role:
    | string
    | {
        id?: string;
        name: string;
        permissions?: Array<
          | { permission: { resource: string; action: string } }
          | { resource: string; action: string }
        >;
      };
  email: string;
  permissions?: Array<
    | { permission: { resource: string; action: string } }
    | { resource: string; action: string }
  >;
}

type OperatingMode = 'facility' | 'contractor' | 'combined';

export interface NavItemPermission {
  /** Required permission entries */
  permissions: Array<{ resource: string; action?: string }>;
  /**
   * Matching logic:
   * - 'any' (default): User must hold AT LEAST ONE of the listed permissions (OR logic).
   *   Used when alternative permissions can grant access to a shared destination.
   * - 'all': User must hold EVERY listed permission (AND logic).
   *   Used when a composite set of permissions is strictly required to access a destination
   *   (e.g., Financial Reports requiring both report:read AND invoice:read).
   */
  mode?: 'any' | 'all';
}

export interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  permission?: NavItemPermission;
}

export interface NavGroup {
  group: string;
  key: string;
  items: NavItem[];
}

export interface AppSidebarProps {
  currentPath: string;
  user: UserSession | AppSidebarUser;
  onLogout: () => void;
  mode?: OperatingMode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

/* ------------------------------------------------------------------ */
/* Permission evaluation                                                 */
/* ------------------------------------------------------------------ */

export function canUserAccessNavItem(
  user: UserSession | AppSidebarUser | null | undefined,
  item: NavItem
): boolean {
  // 1. Unauthenticated users cannot access any item
  if (!user) return false;

  // 2. If item has no permission requirement, it's public to authenticated staff (e.g. /dashboard)
  if (!item.permission || !item.permission.permissions || item.permission.permissions.length === 0) {
    return true;
  }

  // 3. Extract raw permissions from user session
  let rawPermissions: unknown = null;
  if (typeof user.role === 'object' && user.role !== null && 'permissions' in user.role) {
    rawPermissions = (user.role as { permissions?: unknown }).permissions;
  } else if ('permissions' in user) {
    rawPermissions = (user as { permissions?: unknown }).permissions;
  }

  // 4. Fail closed: missing, empty, or non-array permission data cannot access protected items
  if (!Array.isArray(rawPermissions) || rawPermissions.length === 0) {
    return false;
  }

  // 5. Normalize user permissions into { resource, action } pairs
  const userPermissions: Array<{ resource: string; action: string }> = [];

  for (const entry of rawPermissions) {
    if (!entry || typeof entry !== 'object') continue;

    // Format A (Prisma RolePermission join): { permission: { resource, action } }
    if ('permission' in entry && entry.permission && typeof entry.permission === 'object') {
      const p = entry.permission as { resource?: unknown; action?: unknown };
      if (typeof p.resource === 'string' && p.resource.trim().length > 0) {
        userPermissions.push({
          resource: p.resource.trim().toLowerCase(),
          action: typeof p.action === 'string' && p.action.trim().length > 0 ? p.action.trim().toLowerCase() : '*',
        });
      }
    }
    // Format B (Flat permission object): { resource, action }
    else if ('resource' in entry) {
      const p = entry as { resource?: unknown; action?: unknown };
      if (typeof p.resource === 'string' && p.resource.trim().length > 0) {
        userPermissions.push({
          resource: p.resource.trim().toLowerCase(),
          action: typeof p.action === 'string' && p.action.trim().length > 0 ? p.action.trim().toLowerCase() : '*',
        });
      }
    }
  }

  // 6. Fail closed if all entries were malformed or empty
  if (userPermissions.length === 0) {
    return false;
  }

  // Helper to match a single required permission against user permissions
  const checkSinglePerm = (reqPerm: { resource: string; action?: string }): boolean => {
    if (!reqPerm || typeof reqPerm.resource !== 'string' || reqPerm.resource.trim().length === 0) {
      return false;
    }
    const reqR = reqPerm.resource.trim().toLowerCase();
    const reqA = (reqPerm.action?.trim() || '*').toLowerCase();

    return userPermissions.some((up) => {
      const resourceMatch = up.resource === '*' || up.resource === reqR;
      const actionMatch = reqA === '*' || up.action === '*' || up.action === reqA;
      return resourceMatch && actionMatch;
    });
  };

  // 7. Evaluate permissions according to configured mode ('any' by default, or 'all')
  const mode = item.permission.mode ?? 'any';

  if (mode === 'all') {
    return item.permission.permissions.every((reqPerm) => checkSinglePerm(reqPerm));
  } else {
    return item.permission.permissions.some((reqPerm) => checkSinglePerm(reqPerm));
  }
}

/* ------------------------------------------------------------------ */
/* Navigation definitions                                                */
/* ------------------------------------------------------------------ */

export const facilityNavigationGroups: NavGroup[] = [
  {
    group: 'Operations',
    key: 'operations',
    items: [
      {
        name: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
      },
      {
        name: 'Work Orders',
        href: '/work-orders',
        icon: ClipboardList,
        permission: {
          permissions: [{ resource: 'work_order', action: 'read' }],
        },
      },
      {
        name: 'Service Requests',
        href: '/requests',
        icon: MessageSquareWarning,
        permission: {
          permissions: [{ resource: 'work_order', action: 'read' }],
        },
      },
      {
        name: 'Preventive Maintenance',
        href: '/preventive',
        icon: CalendarCheck2,
        permission: {
          permissions: [{ resource: 'work_order', action: 'read' }],
        },
      },
      {
        name: 'Calendar',
        href: '/work-orders/calendar',
        icon: CalendarDays,
        permission: {
          permissions: [{ resource: 'work_order', action: 'read' }],
        },
      },
    ],
  },
  {
    group: 'Assets',
    key: 'assets',
    items: [
      {
        name: 'Asset Register',
        href: '/dashboard/assets',
        icon: Wrench,
        permission: {
          permissions: [{ resource: 'asset', action: 'read' }],
        },
      },
      {
        name: 'Locations',
        href: '/dashboard/assets/locations',
        icon: MapPin,
        permission: {
          permissions: [{ resource: 'asset', action: 'read' }],
        },
      },
      {
        name: 'Categories',
        href: '/dashboard/assets/categories',
        icon: Layers,
        permission: {
          permissions: [{ resource: 'asset', action: 'read' }],
        },
      },
    ],
  },
  {
    group: 'Inventory',
    key: 'inventory',
    items: [
      {
        name: 'Parts',
        href: '/inventory',
        icon: Boxes,
        permission: {
          permissions: [
            { resource: 'inventory', action: 'read' },
            { resource: 'stock', action: 'issue' },
          ],
          mode: 'any',
        },
      },
      {
        name: 'Stores',
        href: '/inventory/stores',
        icon: Building,
        permission: {
          permissions: [
            { resource: 'inventory', action: 'read' },
            { resource: 'stock', action: 'issue' },
          ],
          mode: 'any',
        },
      },
      {
        name: 'Stock Transactions',
        href: '/inventory/transactions',
        icon: ArrowRightLeft,
        permission: {
          permissions: [
            { resource: 'inventory', action: 'read' },
            { resource: 'stock', action: 'issue' },
            { resource: 'audit', action: 'read' },
          ],
          mode: 'any',
        },
      },
      {
        name: 'Reorder Queue',
        href: '/inventory/reorder',
        icon: TrendingDown,
        permission: {
          permissions: [
            { resource: 'inventory', action: 'read' },
            { resource: 'stock', action: 'issue' },
          ],
          mode: 'any',
        },
      },
      {
        name: 'Returns',
        href: '/inventory/returns',
        icon: RotateCcw,
        permission: {
          permissions: [
            { resource: 'inventory', action: 'read' },
            { resource: 'stock', action: 'issue' },
          ],
          mode: 'any',
        },
      },
    ],
  },
  {
    group: 'Procurement',
    key: 'procurement',
    items: [
      {
        name: 'Requisitions',
        href: '/procurement/requisitions',
        icon: ClipboardList,
        // Phase 1E: stock:issue removed — procurement requires inventory:read only.
        // stock:issue (physical issuance) does not imply procurement authorisation.
        permission: {
          permissions: [{ resource: 'inventory', action: 'read' }],
        },
      },
      {
        name: 'Purchase Orders',
        href: '/procurement/purchase-orders',
        icon: FileText,
        permission: {
          permissions: [{ resource: 'inventory', action: 'read' }],
        },
      },
      {
        name: 'Receipts',
        href: '/procurement/receipts',
        icon: PackageCheck,
        permission: {
          permissions: [{ resource: 'inventory', action: 'read' }],
        },
      },
      {
        name: 'Suppliers',
        href: '/procurement/vendors',
        icon: Truck,
        permission: {
          permissions: [{ resource: 'inventory', action: 'read' }],
        },
      },
    ],
  },
  {
    group: 'Finance',
    key: 'finance',
    items: [
      {
        name: 'Invoices',
        href: '/finance/invoices',
        icon: Receipt,
        permission: {
          permissions: [
            { resource: 'invoice', action: 'read' },
            { resource: 'invoice', action: 'create' },
            { resource: 'invoice', action: 'approve' },
          ],
          mode: 'any',
        },
      },
      {
        name: 'Financial Reports',
        href: '/reports',
        icon: FileBarChart2,
        permission: {
          permissions: [
            { resource: 'report', action: 'read' },
            { resource: 'invoice', action: 'read' },
          ],
          mode: 'all', // Composite permission: must have BOTH report:read AND invoice:read
        },
      },
    ],
  },
  {
    group: 'Organization',
    key: 'organization',
    items: [
      {
        name: 'Branches & Departments',
        href: '/organization',
        icon: Building2,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
      {
        name: 'Users & Roles',
        href: '/users',
        icon: Users,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
      {
        name: 'Settings',
        href: '/settings',
        icon: Settings,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
    ],
  },
  {
    group: 'Administration',
    key: 'administration',
    items: [
      {
        name: 'Reports',
        href: '/reports',
        icon: BarChart3,
        permission: {
          permissions: [
            { resource: 'report', action: 'read' },
            { resource: 'audit', action: 'read' },
          ],
          mode: 'any',
        },
      },
      {
        name: 'Worker Monitoring',
        href: '/workers',
        icon: Activity,
        permission: {
          permissions: [{ resource: 'audit', action: 'read' }],
        },
      },
      {
        name: 'Data Import',
        href: '/import',
        icon: Upload,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
    ],
  },
  {
    group: 'Commercial',
    key: 'commercial',
    items: [
      {
        name: 'Customers',
        href: '/customers',
        icon: Users2,
        permission: {
          permissions: [{ resource: 'invoice', action: 'read' }],
        },
      },
      {
        name: 'Contracts & SLA',
        href: '/contracts',
        icon: Handshake,
        permission: {
          permissions: [{ resource: 'invoice', action: 'read' }],
        },
      },
      {
        name: 'SLA Policies',
        href: '/sla/policies',
        icon: ShieldCheck,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
    ],
  },
];

export const contractorNavigationGroups: NavGroup[] = [
  {
    group: 'Overview',
    key: 'overview',
    items: [
      {
        name: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    group: 'Commercial',
    key: 'commercial',
    items: [
      {
        name: 'Customers',
        href: '/customers',
        icon: Users2,
        permission: {
          permissions: [{ resource: 'invoice', action: 'read' }],
        },
      },
      {
        name: 'Contracts & SLA',
        href: '/contracts',
        icon: Handshake,
        permission: {
          permissions: [{ resource: 'invoice', action: 'read' }],
        },
      },
      {
        name: 'Invoicing',
        href: '/finance/invoices',
        icon: Receipt,
        permission: {
          permissions: [{ resource: 'invoice', action: 'read' }],
        },
      },
    ],
  },
  {
    group: 'Operations',
    key: 'operations',
    items: [
      {
        name: 'Work Orders',
        href: '/work-orders',
        icon: ClipboardList,
        permission: {
          permissions: [{ resource: 'work_order', action: 'read' }],
        },
      },
      {
        name: 'Assets',
        href: '/dashboard/assets',
        icon: Wrench,
        permission: {
          permissions: [{ resource: 'asset', action: 'read' }],
        },
      },
      {
        name: 'Preventive Maintenance',
        href: '/preventive',
        icon: CalendarCheck2,
        permission: {
          permissions: [{ resource: 'work_order', action: 'read' }],
        },
      },
    ],
  },
  {
    group: 'Management',
    key: 'management',
    items: [
      {
        name: 'Reports',
        href: '/reports',
        icon: BarChart3,
        permission: {
          permissions: [
            { resource: 'report', action: 'read' },
            { resource: 'audit', action: 'read' },
          ],
          mode: 'any',
        },
      },
      {
        name: 'Organization',
        href: '/organization',
        icon: Building2,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
      {
        name: 'Users & Roles',
        href: '/users',
        icon: Users,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
    ],
  },
  {
    group: 'Supply',
    key: 'supply',
    items: [
      {
        name: 'Inventory',
        href: '/inventory',
        icon: Boxes,
        permission: {
          permissions: [
            { resource: 'inventory', action: 'read' },
            { resource: 'stock', action: 'issue' },
          ],
          mode: 'any',
        },
      },
      {
        name: 'Procurement',
        href: '/procurement',
        icon: ShoppingCart,
        // Phase 1E: stock:issue removed — mirrors the main Procurement group correction.
        permission: {
          permissions: [{ resource: 'inventory', action: 'read' }],
        },
      },
    ],
  },
  {
    group: 'System',
    key: 'system',
    items: [
      {
        name: 'Import',
        href: '/import',
        icon: Upload,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
      {
        name: 'Settings',
        href: '/settings',
        icon: Settings,
        permission: {
          permissions: [{ resource: 'settings', action: 'manage' }],
        },
      },
    ],
  },
];

export const combinedNavigationGroups: NavGroup[] = (() => {
  const map = new Map<string, NavGroup>();
  let dashboardSeen = false;

  for (const g of [...facilityNavigationGroups, ...contractorNavigationGroups]) {
    const filteredItems: NavItem[] = [];
    for (const item of g.items) {
      if (item.href === '/dashboard') {
        if (!dashboardSeen) {
          dashboardSeen = true;
          filteredItems.push(item);
        }
      } else {
        filteredItems.push(item);
      }
    }

    if (filteredItems.length === 0) continue;

    if (!map.has(g.key)) {
      map.set(g.key, { ...g, items: filteredItems });
    } else {
      const existing = map.get(g.key)!;
      const existingHrefs = new Set(existing.items.map((i) => i.href));
      for (const item of filteredItems) {
        if (!existingHrefs.has(item.href)) {
          existing.items.push(item);
          existingHrefs.add(item.href);
        }
      }
    }
  }
  return Array.from(map.values());
})();

/* ------------------------------------------------------------------ */
/* Component                                                             */
/* ------------------------------------------------------------------ */

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentPath,
  user,
  onLogout,
  mode = 'facility',
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const baseGroups =
    mode === 'contractor'
      ? contractorNavigationGroups
      : mode === 'combined'
      ? combinedNavigationGroups
      : facilityNavigationGroups;

  // Filter items in each group by the user's role and permissions
  const filteredGroups = useMemo(() => {
    const computed = baseGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canUserAccessNavItem(user, item)),
      }))
      .filter((group) => group.items.length > 0);

    // Fail-safe: ensure user is never left with an empty navigation
    if (computed.length === 0) {
      return [
        {
          group: 'Operations',
          key: 'operations',
          items: [
            {
              name: 'Dashboard',
              href: '/dashboard',
              icon: LayoutDashboard,
            },
          ],
        },
      ];
    }
    return computed;
  }, [baseGroups, user]);

  // Collapsible group state — all visible groups expanded by default
  const initialOpen = useMemo(
    () => Object.fromEntries(filteredGroups.map((g) => [g.key, true])),
    [filteredGroups]
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);

  const roleName = typeof user.role === 'string' ? user.role : user.role?.name ?? 'ZemiFix';
  const userName = user.name || 'Staff account';

  const initials = userName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ZF';

  // Extract all visible hrefs to accurately determine the most specific active route
  const allVisibleHrefs = useMemo(
    () => filteredGroups.flatMap((g) => g.items.map((i) => i.href)),
    [filteredGroups]
  );

  const isActive = (href: string) => {
    if (href === '/dashboard') return currentPath === '/' || currentPath === '/dashboard';
    if (currentPath === href) return true;
    if (currentPath.startsWith(`${href}/`)) {
      // Ensure we don't highlight a parent link if a more specific sibling route is active
      const hasMoreSpecific = allVisibleHrefs.some(
        (other) =>
          other !== href &&
          other.length > href.length &&
          (currentPath === other || currentPath.startsWith(`${other}/`))
      );
      return !hasMoreSpecific;
    }
    return false;
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-[#080E29]/60 lg:hidden"
        />
      )}

      <aside
        style={{ width: collapsed ? 64 : 240 }}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/10 bg-[#080E29] text-white transition-[width,transform] duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* ---- Logo ---- */}
        <div className="flex h-[64px] shrink-0 items-center justify-between border-b border-white/10 px-3">
          <Link
            href="/dashboard"
            onClick={onCloseMobile}
            aria-label="ZemiFix dashboard"
            className={`flex items-center ${collapsed ? 'mx-auto' : 'min-w-0'}`}
          >
            <ZemifixLogo
              variant={collapsed ? 'icon-only' : 'full'}
              size="md"
              theme="light"
            />
          </Link>
          {!collapsed && onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white lg:flex"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ---- Navigation ---- */}
        <nav
          aria-label="Main navigation"
          className="min-h-0 flex-1 overflow-y-auto px-2 py-4"
        >
          {filteredGroups.map((group) => {
            const isOpen = openGroups[group.key] ?? true;
            const isSingleItem = group.items.length === 1;

            return (
              <section key={group.key} aria-label={group.group} className="mb-4">
                {/* Group label / toggle */}
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => !isSingleItem && toggleGroup(group.key)}
                    className={`mb-1 flex w-full items-center justify-between px-2.5 ${
                      isSingleItem ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[#64748B]">
                      {group.group}
                    </span>
                    {!isSingleItem && (
                      <ChevronDown
                        className={`h-3 w-3 text-slate-500 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                      />
                    )}
                  </button>
                )}

                {/* Nav items */}
                {(isSingleItem || isOpen || collapsed) && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onCloseMobile}
                          title={collapsed ? item.name : undefined}
                          aria-current={active ? 'page' : undefined}
                          className={`group relative flex min-h-[36px] items-center gap-3 rounded-md px-2.5 text-[12px] font-medium transition-colors ${
                            active
                              ? 'bg-[#FF5B00] text-white font-semibold shadow-md shadow-[#FF5B00]/25'
                              : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
                          } ${collapsed ? 'justify-center px-0' : ''}`}
                        >
                          <Icon
                            aria-hidden="true"
                            className={`h-4 w-4 shrink-0 ${
                              active ? 'text-white' : 'text-slate-400 group-hover:text-white'
                            }`}
                          />
                          {!collapsed && <span className="truncate">{item.name}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        {/* ---- Bottom: user + logout ---- */}
        <div className="shrink-0 border-t border-white/10 p-3">
          <div className={`flex items-center gap-2.5 ${collapsed ? 'flex-col' : ''}`}>
            {/* Avatar */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
              {initials}
            </div>

            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-white">{userName}</p>
                  <p className="truncate text-[10px] text-slate-400">{roleName}</p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Sign out"
                  title="Sign out"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}

            {collapsed && (
              <button
                type="button"
                onClick={onLogout}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Collapse toggle (bottom) */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md py-1.5 text-[10px] font-medium text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
            >
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
