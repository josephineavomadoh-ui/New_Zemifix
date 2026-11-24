// @vitest-environment node
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const componentPath = path.resolve('src/components/dashboard/TechnicianDashboardView.tsx');
const modalPath = path.resolve('src/components/dashboard/WorkOrderDetailModal.tsx');

describe('Technician client components security', () => {
  it('TechnicianDashboardView does not import Prisma directly', () => {
    const content = readFileSync(componentPath, 'utf8');
    expect(content).not.toContain("import { prisma }");
    expect(content).not.toMatch(/prisma\./);
  });

  it('WorkOrderDetailModal does not import Prisma directly', () => {
    const content = readFileSync(modalPath, 'utf8');
    expect(content).not.toContain("import { prisma }");
    expect(content).not.toMatch(/prisma\./);
  });
});
