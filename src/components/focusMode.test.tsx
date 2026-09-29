import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FocusMode from './FocusMode';
import { setStoreScope } from '../lib/store';
import { makeApplication } from '../lib/testFixtures';

vi.mock('../lib/fx', () => ({ play: vi.fn(), celebrate: vi.fn(), confetti: vi.fn(), previewSound: vi.fn(), prefersReducedMotion: () => true }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 1, 9, 0, 0));
  setStoreScope('focus-test');
});

afterEach(() => {
  vi.useRealTimers();
});

const app = makeApplication({ id: 'a1', company_name: 'Stripe', role_applied_to: 'Backend Intern' });

describe('FocusMode timer', () => {
  it('counts down while running', () => {
    render(<FocusMode application={app} interviews={[]} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByText('23:55')).toBeInTheDocument();
  });

  it('keeps real time when the browser throttles the tab (few ticks, wall clock moved on)', () => {
    render(<FocusMode application={app} interviews={[]} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    // A hidden tab: ten real minutes pass, but the interval only fires once.
    act(() => {
      vi.setSystemTime(new Date(2026, 5, 1, 9, 10, 0));
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('15:00')).toBeInTheDocument();
  });

  it('resumes from where it was paused', () => {
    render(<FocusMode application={app} interviews={[]} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(screen.getByRole('button', { name: /Pause/ }));
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(screen.getByText('24:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resume/ }));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('23:30')).toBeInTheDocument();
  });
});
