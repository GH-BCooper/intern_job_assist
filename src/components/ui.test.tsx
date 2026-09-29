import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Toaster from './ui/Toaster';
import JourneyStepper from './ui/JourneyStepper';
import BadgeShelf from './ui/BadgeShelf';
import MatchScore from './ui/MatchScore';
import EmptyState from './ui/EmptyArt';
import AccentPicker from './ui/AccentPicker';
import { ThemeProvider } from '../context/ThemeContext';
import { announce, toast } from '../lib/uiBus';
import { pushUndo } from '../lib/undo';
import { computeBadges } from '../lib/badges';
import { computeAnalytics } from '../lib/insights';
import { addResumeVersion, read, savePreferences, wipeLocalStore } from '../lib/store';
import { makeEmptyStore } from '../lib/testFixtures';
import type { StageChange } from '../lib/store';

beforeEach(() => {
  // The store keeps an in-memory cache, so clearing localStorage alone would
  // leak the previous test's preferences into the next one.
  wipeLocalStore();
  localStorage.clear();
  savePreferences({});
});

describe('Toaster', () => {
  it('shows a toast and dismisses it', async () => {
    render(<Toaster />);
    toast('Saved the thing.', 'success');
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Saved the thing.');
    fireEvent.click(screen.getByLabelText('Dismiss'));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('offers Undo only for undoable actions, and runs the restore', async () => {
    render(<Toaster />);
    toast('Just information.', 'info');
    expect(await screen.findByRole('status')).toHaveTextContent('Just information.');
    expect(screen.queryByText('Undo')).not.toBeInTheDocument();

    const restore = vi.fn();
    pushUndo('Archived 2 applications.', restore);

    const undo = await screen.findByText('Undo');
    fireEvent.click(undo);
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
  });

  it('mirrors announcements into a polite live region', async () => {
    render(<Toaster />);
    announce('Moved to Interviewing');
    const region = document.querySelector('[aria-live="polite"]');
    await waitFor(() => expect(region?.textContent).toBe('Moved to Interviewing'));
  });

  it('keeps the live region mounted so the first message is announced', () => {
    render(<Toaster />);
    expect(document.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});

describe('JourneyStepper', () => {
  const history: StageChange[] = [
    { id: 'h1', application_id: 'app-1', from: 'Wishlist', to: 'Applied', actor: 'you', created_at: '2026-09-01T10:00:00Z' },
    { id: 'h2', application_id: 'app-1', from: 'Applied', to: 'Interviewing', actor: 'you', created_at: '2026-09-10T10:00:00Z' },
  ];

  it('renders every stage', () => {
    render(<JourneyStepper current="Interviewing" history={history} />);
    ['Wishlist', 'Applied', 'In Review', 'Interviewing', 'Offer', 'Closed'].forEach(stage => {
      expect(screen.getByText(stage)).toBeInTheDocument();
    });
  });

  it('marks the current stage as now', () => {
    render(<JourneyStepper current="Interviewing" history={history} />);
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('honours renamed stages', () => {
    savePreferences({ stageLabels: { Applied: 'Sent' } });
    render(<JourneyStepper current="Applied" history={history} />);
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.queryByText('Applied')).not.toBeInTheDocument();
  });

  it('calls out a move backwards', () => {
    render(
      <JourneyStepper
        current="Closed"
        history={[
          ...history,
          {
            id: 'h3',
            application_id: 'app-1',
            from: 'Interviewing',
            to: 'In Review',
            actor: 'you',
            created_at: '2026-09-12T10:00:00Z',
          },
        ]}
      />,
    );
    expect(screen.getByText(/Moved back from Interviewing to In Review/)).toBeInTheDocument();
  });
});

describe('BadgeShelf', () => {
  it('reports how many are unlocked', () => {
    const store = makeEmptyStore();
    const badges = computeBadges(computeAnalytics([], {}, store), store);
    render(<BadgeShelf badges={badges} />);
    expect(screen.getByText(/of \d+ unlocked/)).toBeInTheDocument();
  });

  it('shows locked achievements with their descriptions', () => {
    const store = makeEmptyStore();
    const badges = computeBadges(computeAnalytics([], {}, store), store);
    render(<BadgeShelf badges={badges} />);
    expect(screen.getByText('Off the mark')).toBeInTheDocument();
    expect(screen.getByText('Centurion')).toBeInTheDocument();
  });

  it('can hide the locked ones', () => {
    const store = makeEmptyStore();
    const badges = computeBadges(computeAnalytics([], {}, store), store);
    render(<BadgeShelf badges={badges} showLocked={false} />);
    expect(screen.queryByText('Centurion')).not.toBeInTheDocument();
  });
});

describe('MatchScore', () => {
  it('explains what to do when no resume text is stored', () => {
    render(<MatchScore jobDescription="" />);
    expect(screen.getByText(/No resume text stored yet/)).toBeInTheDocument();
  });

  it('scores a pasted job description against a stored resume', async () => {
    addResumeVersion({
      label: 'Backend v3',
      content: 'Backend engineer. Kubernetes, Docker, PostgreSQL and CI/CD pipelines.',
    });
    expect(read().resumes).toHaveLength(1);

    render(<MatchScore jobDescription="Backend engineer needed: Kubernetes, Docker, PostgreSQL, CI/CD." />);
    // The score is debounced, so wait for it rather than asserting immediately.
    expect(await screen.findByText(/Strong match/, undefined, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText('Already covered')).toBeInTheDocument();
  });

  it('names the keywords the resume is missing', async () => {
    addResumeVersion({ label: 'Frontend', content: 'React, CSS, accessibility work.' });
    render(<MatchScore jobDescription="Kubernetes and Terraform are required for this platform role." />);
    expect(await screen.findByText('Missing from your resume', undefined, { timeout: 2000 })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders art, a title and a hint', () => {
    render(<EmptyState art="trophy" title="Nothing here" hint="Add one to begin." />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Add one to begin.')).toBeInTheDocument();
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('AccentPicker', () => {
  it('writes the chosen palette to the document and the store', async () => {
    render(
      <ThemeProvider>
        <AccentPicker />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByTitle(/Cool blue/));
    await waitFor(() => expect(read().preferences.accent).toBe('ocean'));
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--color-primary-500')).toBe('14 165 233'),
    );
  });

  it('marks the active palette as pressed', async () => {
    render(
      <ThemeProvider>
        <AccentPicker />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTitle(/original warm gold/).getAttribute('aria-pressed')).toBe('true'));
  });
});
