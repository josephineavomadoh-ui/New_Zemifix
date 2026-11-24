import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NotificationHub } from '../components/notifications/NotificationHub';

describe('NotificationHub Component Verification (Phase 1C)', () => {
  const mockNotifications = [
    {
      id: 'notif-1',
      title: 'Work Order Approved',
      body: 'WO-2026-001 has been approved by Supervisor.',
      link: '/work-orders/WO-2026-001',
      createdAt: '2026-11-19T10:00:00.000Z',
      readAt: null,
    },
    {
      id: 'notif-2',
      title: 'Low Stock Alert',
      body: 'Part P-1002 (Air Filter) is below minimum stock level.',
      link: '/inventory/parts/P-1002',
      createdAt: '2026-11-19T09:30:00.000Z',
      readAt: '2026-11-19T09:45:00.000Z',
    },
  ];

  const mockPreferences = [
    {
      eventType: 'WORK_ORDER_ASSIGNED',
      label: 'Work Order Assignments',
      inAppEnabled: true,
      emailEnabled: false,
    },
    {
      eventType: 'STOCK_THRESHOLD',
      label: 'Low Stock Alerts',
      inAppEnabled: true,
      emailEnabled: true,
    },
  ];

  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : (url as Request).url;
      const method = init?.method || 'GET';

      if (u === '/api/notifications' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            notifications: mockNotifications,
            unreadCount: 1,
          }),
        });
      }

      if (u.match(/\/api\/notifications\/[^/]+\/read$/) && method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (u === '/api/notifications/read-all' && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      if (u === '/api/notifications/preferences' && method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            preferences: mockPreferences,
          }),
        });
      }

      if (u === '/api/notifications/preferences' && method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });
    });

    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Component mounts and fetches notification list on initial render and on open', async () => {
    render(<NotificationHub realm="staff" />);

    // Initial mount fetches notifications
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications');
    });

    const triggerButton = screen.getByRole('button', { name: /Notifications/i });
    expect(triggerButton).toBeInTheDocument();

    // Popover is initially closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Clicking trigger opens popover and re-fetches
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    });

    expect(screen.getByText('Work Order Approved')).toBeInTheDocument();
    expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
  });

  it('2. Unread notification badge renders correct count', async () => {
    render(<NotificationHub realm="staff" />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    const triggerButton = screen.getByRole('button', { name: 'Notifications, 1 unread' });
    expect(triggerButton).toBeInTheDocument();

    // Open popover to see header unread badge
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByText('1 unread')).toBeInTheDocument();
    });
  });

  it('3. Marking a notification as read calls PATCH /api/notifications/[id]/read', async () => {
    render(<NotificationHub realm="staff" />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications');
    });

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));

    await waitFor(() => {
      expect(screen.getByText('Work Order Approved')).toBeInTheDocument();
    });

    // The unread item has a "Mark as read" button
    const markReadBtn = screen.getByRole('button', { name: /Mark Work Order Approved as read/i });
    fireEvent.click(markReadBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/notifications/notif-1/read',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ read: true }),
        })
      );
    });
  });

  it('4. Marking all notifications as read calls POST /api/notifications/read-all', async () => {
    render(<NotificationHub realm="staff" />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications');
    });

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument();
    });

    const markAllReadBtn = screen.getByRole('button', { name: 'Mark all read' });
    expect(markAllReadBtn).not.toBeDisabled();

    fireEvent.click(markAllReadBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/notifications/read-all',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  it('5. Preferences tab loads and toggles preference via PUT /api/notifications/preferences', async () => {
    render(<NotificationHub realm="staff" />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications');
    });

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));

    await waitFor(() => {
      expect(screen.getByTitle('Notification preferences')).toBeInTheDocument();
    });

    // Click settings button to switch to preferences view
    fireEvent.click(screen.getByTitle('Notification preferences'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications/preferences');
      expect(screen.getByText('Notification preferences')).toBeInTheDocument();
      expect(screen.getByText('Work Order Assignments')).toBeInTheDocument();
      expect(screen.getByText('Low Stock Alerts')).toBeInTheDocument();
    });

    // Toggle email preference for Work Order Assignments
    const emailCheckboxes = screen.getAllByRole('checkbox', { name: 'Email' });
    const woEmailCheckbox = emailCheckboxes[0];
    expect(woEmailCheckbox).not.toBeChecked();

    fireEvent.click(woEmailCheckbox);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/notifications/preferences',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'WORK_ORDER_ASSIGNED',
            label: 'Work Order Assignments',
            inAppEnabled: true,
            emailEnabled: true,
          }),
        })
      );
    });
  });

  it('6. Empty notification state renders "You are all caught up."', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === '/api/notifications') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            notifications: [],
            unreadCount: 0,
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<NotificationHub realm="staff" />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications');
    });

    fireEvent.click(screen.getByRole('button', { name: /Notifications/i }));

    await waitFor(() => {
      expect(screen.getByText('You are all caught up.')).toBeInTheDocument();
    });
  });

  it('7. Error state renders when API fails', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === '/api/notifications') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal Server Error' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<NotificationHub realm="staff" />);

    // Click trigger button to open popover
    const triggerButton = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Unable to load notifications.')).toBeInTheDocument();
    });
  });

  it('8. Click outside dismisses popover', async () => {
    render(
      <div>
        <div data-testid="outside-element">Outside content</div>
        <NotificationHub realm="staff" />
      </div>
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications');
    });

    const triggerButton = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click outside on the outside element
    fireEvent.mouseDown(screen.getByTestId('outside-element'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('9. Escape key dismisses popover', async () => {
    render(<NotificationHub realm="staff" />);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/notifications');
    });

    const triggerButton = screen.getByRole('button', { name: /Notifications/i });
    fireEvent.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('10. Polling interval executes without leaking or duplicating intervals', async () => {
    vi.useFakeTimers();

    const { unmount } = render(<NotificationHub realm="staff" />);

    // Initial mount call
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Fast-forward 60 seconds
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Fast-forward another 60 seconds
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Unmount and verify interval is cleared (no additional calls)
    unmount();

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
