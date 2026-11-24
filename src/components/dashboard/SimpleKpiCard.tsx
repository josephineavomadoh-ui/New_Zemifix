'use client';
import React from 'react';
import { KpiCard } from '@/src/components/dashboard/KpiCard';
import { ArrowRight } from 'lucide-react';

/**
 * Minimal wrapper around KpiCard for places where only title/value are needed.
 * Provides required props with safe defaults.
 */
export const SimpleKpiCard: React.FC<{ title: string; value: string | number }> = ({ title, value }) => (
  <KpiCard
    title={title}
    value={value}
    href="#"
    icon={ArrowRight}
    tone="navy"
    footerText=""
  />
);
