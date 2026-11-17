// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { calculateNextDueDate } from './backgroundJobService';

describe('Calendar-Aware Preventive Maintenance Recurrence Calculations', () => {
  it('handles daily recurrence correctly', () => {
    const due = new Date('2026-01-15T08:00:00.000Z');
    const next = calculateNextDueDate(due, 'Every Day');
    expect(next.toISOString().slice(0, 10)).toBe('2026-01-16');
  });

  it('handles weekly recurrence correctly', () => {
    const due = new Date('2026-01-15T08:00:00.000Z');
    const next = calculateNextDueDate(due, 'Every Week');
    expect(next.toISOString().slice(0, 10)).toBe('2026-01-22');
  });

  it('handles monthly recurrence with month-end clamping (Jan 31 -> Feb 28)', () => {
    const due = new Date('2026-01-31T08:00:00.000Z');
    const next = calculateNextDueDate(due, 'Every Month');
    expect(next.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('handles leap-year February 29 annual recurrence in non-leap year (Feb 28)', () => {
    const due = new Date('2024-02-29T08:00:00.000Z'); // 2024 is leap year
    const next = calculateNextDueDate(due, 'Every Year');
    expect(next.toISOString().slice(0, 10)).toBe('2025-02-28'); // 2025 is non-leap
  });

  it('handles quarterly recurrence correctly', () => {
    const due = new Date('2026-01-15T08:00:00.000Z');
    const next = calculateNextDueDate(due, 'Every 3 Months');
    expect(next.toISOString().slice(0, 10)).toBe('2026-04-15');
  });

  it('handles annual recurrence correctly', () => {
    const due = new Date('2026-05-10T08:00:00.000Z');
    const next = calculateNextDueDate(due, 'Every 12 Months');
    expect(next.toISOString().slice(0, 10)).toBe('2027-05-10');
  });
});
