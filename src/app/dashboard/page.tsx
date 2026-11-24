'use client';

/**
 * /dashboard — Permission & Role-aware router.
 * Routes users to their authorized workspace (Finance, Storekeeper, Planner, Manager,
 * Technician, or Company Administrator) based on actual permissions and role profiles.
 */

import React, { Suspense, useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/src/lib/auth-context';
import { Shell } from '@/src/components/layout/Shell';
import { DashboardView } from '@/src/components/dashboard/DashboardView';
import { ManagerDashboardView } from '@/src/components/dashboard/ManagerDashboardView';
import { WorkspaceSelector } from '@/src/components/dashboard/WorkspaceSelector';
import { TechnicianDashboardView } from '@/src/components/dashboard/TechnicianDashboardView';

// Lazy‑load specific workspace views – imported on demand.
const PlannerDashboardView = React.lazy(() => import('@/src/components/dashboard/PlannerDashboardView').then(m => ({ default: m.PlannerDashboardView })));
const StorekeeperDashboardView = React.lazy(() => import('@/src/components/dashboard/StorekeeperDashboardView').then(m => ({ default: m.StorekeeperDashboardView })));
const FinanceDashboardView = React.lazy(() => import('@/src/components/dashboard/FinanceDashboardView').then(m => ({ default: m.FinanceDashboardView })));

function getPermissionsArray(user: any): Array<{ resource: string; action: string }> {
  if (!user?.role?.permissions || !Array.isArray(user.role.permissions)) return [];
  const result: Array<{ resource: string; action: string }> = [];
  for (const item of user.role.permissions) {
    if (!item) continue;
    if (item.permission && typeof item.permission === 'object') {
      result.push({
        resource: item.permission.resource ?? '',
        action: item.permission.action ?? '',
      });
    } else if (item.resource) {
      result.push({
        resource: item.resource ?? '',
        action: item.action ?? '',
      });
    }
  }
  return result;
}

function hasPermission(user: any, resource: string, action: string) {
  const perms = getPermissionsArray(user);
  return perms.some(
    p => (p.resource === resource && p.action === action) ||
         (p.resource === '*' && p.action === '*')
  );
}

function hasExactPermission(user: any, resource: string, action: string) {
  const perms = getPermissionsArray(user);
  return perms.some(p => p.resource === resource && p.action === action);
}

function matchesRole(user: any, pattern: RegExp) {
  const roleName = user?.role?.name;
  return typeof roleName === 'string' && pattern.test(roleName);
}

function DashboardRouter() {
  const { user, loading } = useAuth();
  const [selected, setSelected] = useState<string>('');

  const isFinanceUser = matchesRole(user, /finance|cashier|billing/i);
  const isStorekeeperUser = matchesRole(user, /storekeeper|inventory/i);
  const isPlannerUser = matchesRole(user, /planner|dispatcher/i);
  const isTechnicianUser = matchesRole(user, /technician/i);
  const isManagerUser = matchesRole(user, /manager|supervisor/i);
  const isAdminUser = matchesRole(user, /admin|administrator/i) ||
    hasPermission(user, '*', '*') ||
    (hasPermission(user, 'settings', 'manage') && user?.accessScope === 'Company');

  const canAccessAdmin = isAdminUser;
  const canAccessFinance = isFinanceUser || (!isAdminUser && (hasPermission(user, 'invoice', 'read') || hasPermission(user, 'invoice', 'create') || hasPermission(user, 'invoice', 'approve')));
  const canAccessStorekeeper = isStorekeeperUser || (!isAdminUser && (hasPermission(user, 'inventory', 'read') || hasPermission(user, 'stock', 'issue')));
  const canAccessPlanner = isPlannerUser || (!isAdminUser && (hasPermission(user, 'work_order', 'schedule') || hasPermission(user, 'work_order', 'assign')));
  const canAccessManager = !isAdminUser && (hasPermission(user, 'work_order', 'read') || hasPermission(user, 'work_order', 'approve'));
  const canAccessTechnician = isTechnicianUser || (!isAdminUser && (hasPermission(user, 'work_order', 'start') || hasPermission(user, 'work_order', 'execute') || hasPermission(user, 'work_order', 'update')));

  const workspaces = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (canAccessAdmin) {
      list.push({ key: 'admin', label: 'Company Overview' });
    } else {
      if (canAccessFinance) {
        list.push({ key: 'finance', label: 'Finance / Cashier' });
      }
      if (canAccessManager) {
        list.push({ key: 'manager', label: 'Manager / Supervisor' });
      }
      if (canAccessPlanner) {
        list.push({ key: 'planner', label: 'Planner / Dispatcher' });
      }
      if (canAccessStorekeeper) {
        list.push({ key: 'storekeeper', label: 'Storekeeper' });
      }
      if (canAccessTechnician) {
        list.push({ key: 'technician', label: 'Technician Desktop' });
      }
    }
    return list;
  }, [canAccessAdmin, canAccessFinance, canAccessManager, canAccessPlanner, canAccessStorekeeper, canAccessTechnician]);

  useEffect(() => {
    if (user && workspaces.length > 0) {
      let defaultKey = workspaces[0].key;
      if (isAdminUser) defaultKey = 'admin';
      else if (isFinanceUser && canAccessFinance) defaultKey = 'finance';
      else if (isStorekeeperUser && canAccessStorekeeper) defaultKey = 'storekeeper';
      else if (isPlannerUser && canAccessPlanner) defaultKey = 'planner';
      else if (isTechnicianUser && canAccessTechnician) defaultKey = 'technician';
      else if (isManagerUser && canAccessManager && (hasPermission(user, 'work_order', 'read') || hasPermission(user, 'work_order', 'approve'))) defaultKey = 'manager';

      if (!selected || !workspaces.some(w => w.key === selected)) {
        setSelected(defaultKey);
      }
    }
  }, [user, workspaces, isFinanceUser, canAccessFinance, isStorekeeperUser, canAccessStorekeeper, isPlannerUser, canAccessPlanner, isTechnicianUser, canAccessTechnician, isManagerUser, canAccessManager, isAdminUser, selected]);

  if (loading) {
    return (
      <div className="space-y-5 pb-8 animate-pulse">
        <div className="h-32 rounded-lg bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return <DashboardView />;

  const renderWorkspace = () => {
    switch (selected) {
      case 'admin':
        return <DashboardView />;
      case 'finance':
        return (
          <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-40 bg-slate-200 rounded"/></div>}>
            <FinanceDashboardView />
          </Suspense>
        );
      case 'storekeeper':
        return (
          <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-40 bg-slate-200 rounded"/></div>}>
            <StorekeeperDashboardView />
          </Suspense>
        );
      case 'planner':
        return (
          <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-40 bg-slate-200 rounded"/></div>}>
            <PlannerDashboardView />
          </Suspense>
        );
      case 'manager':
        return <ManagerDashboardView />;
      case 'technician':
        return (
          <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-40 bg-slate-200 rounded"/></div>}>
            <TechnicianDashboardView />
          </Suspense>
        );
      default:
        return <DashboardView />;
    }
  };

  return (
    <>
      {workspaces.length > 1 && (
        <WorkspaceSelector workspaces={workspaces} selected={selected} onSelect={setSelected} />
      )}
      {renderWorkspace()}
    </>
  );
}

export default function DashboardPage() {
  return (
    <Shell>
      <DashboardRouter />
    </Shell>
  );
}
