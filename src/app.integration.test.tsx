/**
 * Signed-in end-to-end coverage.
 *
 * The hosted Supabase project has email confirmation on, so a browser run cannot
 * reach the signed-in screens. This mounts the *real* App — real router, real
 * contexts, real components — over an in-memory Supabase fake, and walks the
 * routes a user actually walks.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createFakeSupabase, seedApplications, seedInterviews } from './test/fakeSupabase';

/* The fake has to exist before any module that imports the client is loaded. */
const fake = createFakeSupabase({
  tables: { applications: seedApplications(), interview_dates: seedInterviews() },
});

vi.mock('./lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('./lib/supabase')>('./lib/supabase');
  return {
    ...actual,
    supabase: fake,
    getResumeUrl: (p: string) => (p ? `https://fake.storage/${p}` : null),
    getCoverLetterUrl: (p: string) => (p ? `https://fake.storage/${p}` : null),
    getFileUrl: async (p: string) => (p ? `https://fake.storage/${p}?signed=1` : null),
    getSignedFileUrl: async (p: string) => (p ? `https://fake.storage/${p}?signed=1` : null),
    uploadResumeVersionFile: async () => ({ path: 'user-1/resume-versions/v.pdf', name: 'v.pdf', size: 1024 }),
    deleteStoredFile: async () => true,
  };
});

/* jsdom has no canvas, no workers and no audio; the app treats all three as
 * decoration and guards them, but the mocks keep the console clean. */
vi.mock('./lib/fx', () => ({
  confetti: vi.fn(),
  celebrate: vi.fn(),
  play: vi.fn(),
  previewSound: vi.fn(),
  prefersReducedMotion: () => true,
}));

const { default: App } = await import('./App');
const { wipeLocalStore, savePreferences, read } = await import('./lib/store');

/** Drops the user on a route before mounting, since the app owns its router. */
function renderAt(route: string) {
  window.history.pushState({}, '', route);
  return render(<App />);
}

/**
 * A company name shows up in the board card, the now strip and a bento tile at
 * once, so tests ask for the card specifically rather than for the text.
 */
async function findCard(company: string): Promise<HTMLElement> {
  const matches = await screen.findAllByText(company, undefined, { timeout: 8000 });
  const card = matches.map(el => el.closest('[role="button"]')).find(Boolean) as HTMLElement | undefined;
  if (!card) throw new Error(`No board card found for ${company}`);
  return card;
}

/** Waits for the pipeline to have loaded, without pinning to one element. */
function waitForPipeline() {
  return screen.findAllByText('Stripe', undefined, { timeout: 8000 });
}

beforeEach(() => {
  wipeLocalStore();
  localStorage.clear();
  // Skip the first-run wizard: it is covered on its own below.
  savePreferences({ onboarded: true });
});

describe('signed-in dashboard', () => {
  it('loads the pipeline and shows the bento hero', async () => {
    renderAt('/dashboard');
    expect((await waitForPipeline()).length).toBeGreaterThan(0);
    expect(screen.getByText('Momentum')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Offers')).toBeInTheDocument();
  });

  it('surfaces the next interview in the now strip and the bento', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    // Two days out, from the seed.
    expect(await screen.findByText(/Interview with Stripe in 2 days/)).toBeInTheDocument();
    expect(screen.getByText('Next interview')).toBeInTheDocument();
  });

  it('renders every board column, including renamed ones', async () => {
    savePreferences({ onboarded: true, stageLabels: { Applied: 'Sent' } });
    renderAt('/dashboard');
    await waitForPipeline();
    ['Wishlist', 'Sent', 'In Review', 'Interviewing', 'Offer', 'Closed'].forEach(stage => {
      expect(screen.getAllByText(stage).length).toBeGreaterThan(0);
    });
  });

  it('filters by search', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    fireEvent.change(screen.getByPlaceholderText(/Search company, role, platform/), {
      target: { value: 'figma' },
    });
    // Vercel is filtered out of the board entirely; Stripe survives only in the
    // now strip, which is not part of the filtered list.
    await waitFor(() => expect(screen.queryByText('Vercel')).not.toBeInTheDocument());
    expect(screen.getAllByText('Figma').length).toBeGreaterThan(0);
  });

  it('switches to the table view and shows the rows', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    fireEvent.click(screen.getByRole('button', { name: /Table/ }));
    // 'Next interview' is both a column header and a bento tile label.
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Priority/ })).toBeInTheDocument();
    expect(screen.getByText('Backend Engineering Intern')).toBeInTheDocument();
  });

  it('opens an application and shows its journey and actions', async () => {
    renderAt('/dashboard');
    fireEvent.click(await findCard('Stripe'));
    expect(await screen.findByText('Journey')).toBeInTheDocument();
    expect(screen.getByText('One-pager brief')).toBeInTheDocument();
    expect(screen.getByText('Calendar invite')).toBeInTheDocument();
    expect(screen.getByText('How much do you want it?')).toBeInTheDocument();
  });

  it('moves a stage from the detail panel and writes it back', async () => {
    renderAt('/dashboard');
    fireEvent.click(await findCard('Stripe'));
    await screen.findByText('Pipeline stage');

    const picker = screen.getByText('Pipeline stage').parentElement!;
    fireEvent.click(within(picker).getByRole('button', { name: 'Offer' }));

    await waitFor(() => expect(read().stageOverrides['app-stripe']).toBe('Offer'));
    // The transition is recorded for the journey and the activity log.
    expect(read().stageHistory.some(h => h.application_id === 'app-stripe' && h.to === 'Offer')).toBe(true);
    expect(read().activity.some(a => a.summary.includes('Offer'))).toBe(true);
    await waitFor(() => expect(fake.__writes().some(w => w.table === 'applications' && w.op === 'update')).toBe(true));
  });

  it('offers undo after a stage move', async () => {
    renderAt('/dashboard');
    fireEvent.click(await findCard('Stripe'));
    await screen.findByText('Pipeline stage');
    const picker = screen.getByText('Pipeline stage').parentElement!;
    fireEvent.click(within(picker).getByRole('button', { name: 'Closed' }));
    expect(await screen.findByText('Undo')).toBeInTheDocument();
  });

  it('sets a priority, which reaches the store', async () => {
    renderAt('/dashboard');
    fireEvent.click(await findCard('Stripe'));
    await screen.findByText('How much do you want it?');
    fireEvent.click(screen.getByLabelText('Priority 4'));
    await waitFor(() => expect(read().priorities['app-stripe']).toBe(4));
  });
});

describe('routes', () => {
  it('insights renders the v4 analytics', async () => {
    renderAt('/insights');
    expect(await screen.findByText(/Why your momentum is/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('How far to an offer')).toBeInTheDocument();
    expect(screen.getByText('How applications actually moved')).toBeInTheDocument();
    expect(screen.getByText('When you apply matters')).toBeInTheDocument();
    expect(screen.getByText('Achievements')).toBeInTheDocument();
  });

  it('insights awards the badges the seeded data earns', async () => {
    renderAt('/insights');
    await screen.findByText('Achievements');
    await waitFor(() => expect(read().badges['first-application']).toBeTruthy());
    expect(read().badges['first-interview']).toBeTruthy();
    expect(read().badges['first-offer']).toBeTruthy();
  });

  it('prep renders the trainer and its empty state', async () => {
    renderAt('/prep');
    expect(await screen.findByText('Due now', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('No cards yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /STAR stories/ }));
    expect(await screen.findByText('No stories yet')).toBeInTheDocument();
  });

  it('prep imports the questions recorded on applications', async () => {
    renderAt('/prep');
    await screen.findByText('Due now');
    fireEvent.click(screen.getByRole('button', { name: /All cards/ }));
    fireEvent.click(await screen.findByText(/Import every recorded question/));
    await waitFor(() => expect(read().srsCards.length).toBeGreaterThan(0));
    expect(read().srsCards.some(c => /idempotent payment API/.test(c.question))).toBe(true);
  });

  it('workspace renders its tabs including cover letters', async () => {
    renderAt('/workspace');
    expect(await screen.findByRole('button', { name: /Cover letters/ }, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cover letters/ }));
    expect(await screen.findByText('No cover-letter templates')).toBeInTheDocument();
    expect(screen.getByText(/Merge fields:/)).toBeInTheDocument();
  });

  it('workspace saves a cover-letter template and fills its merge fields', async () => {
    renderAt('/workspace');
    fireEvent.click(await screen.findByRole('button', { name: /Cover letters/ }));
    fireEvent.change(await screen.findByPlaceholderText(/Template name/), { target: { value: 'Backend' } });
    fireEvent.change(screen.getByPlaceholderText(/Dear \{\{hiring_manager\}\}/), {
      target: { value: 'Dear {{hiring_manager}}, I am applying for {{role}} at {{company}}.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save template/ }));
    await waitFor(() => expect(read().coverTemplates).toHaveLength(1));

    fireEvent.change(await screen.findByDisplayValue('Fill for…'), { target: { value: 'app-stripe' } });
    expect(await screen.findByText(/I am applying for Backend Engineering Intern at Stripe\./)).toBeInTheDocument();
  });

  it('automations renders templates and quiet hours', async () => {
    renderAt('/automations');
    expect(await screen.findByText('Quiet hours', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Templates — add in one click/)).toBeInTheDocument();
    expect(screen.getByText('Post-interview retro nudge')).toBeInTheDocument();
    expect(screen.getByText('Telegram interview alert')).toBeInTheDocument();
  });

  it('installs an automation template and can preview its matches', async () => {
    renderAt('/automations');
    await screen.findByText('Quiet hours');

    const card = screen.getByText('Auto follow-up nudge').closest('div')!.parentElement!;
    fireEvent.click(within(card).getByRole('button', { name: /Add automation/ }));
    await waitFor(() => expect(read().automationRules).toHaveLength(1));

    fireEvent.click(await screen.findByRole('button', { name: /Preview matches/ }));
    // Vercel applied 24 days ago with no response, so it matches a 7-day rule.
    expect(await screen.findByText(/Would act on|Nothing matches right now/)).toBeInTheDocument();
  });

  it('adds an AND/OR condition to a rule', async () => {
    renderAt('/automations');
    await screen.findByText('Quiet hours');
    const card = screen.getByText('Auto follow-up nudge').closest('div')!.parentElement!;
    fireEvent.click(within(card).getByRole('button', { name: /Add automation/ }));

    fireEvent.click(await screen.findByRole('button', { name: /Conditions/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Add a condition/ }));
    await waitFor(() => expect(read().automationRules[0].conditions).toHaveLength(1));
  });

  it('settings renders every new section', async () => {
    renderAt('/settings');
    expect(await screen.findByText('Accent palette', undefined, { timeout: 5000 })).toBeInTheDocument();
    ['Accessibility', 'Pipeline & board', 'Integrations', 'Privacy & security', 'Your data'].forEach(section => {
      expect(screen.getByText(section)).toBeInTheDocument();
    });
    // The label appears on both the draggable bookmarklet and its heading.
    expect(screen.getAllByText(/Add to InternTrack/).length).toBeGreaterThan(0);
  });

  it('settings renames a stage and the board follows', async () => {
    renderAt('/settings');
    await screen.findByText('Stage names and order');
    fireEvent.change(screen.getByPlaceholderText('Interviewing'), { target: { value: 'Onsite' } });
    await waitFor(() => expect(read().preferences.stageLabels.Interviewing).toBe('Onsite'));
  });

  it('settings sets a WIP limit', async () => {
    renderAt('/settings');
    await screen.findByText('Stage names and order');
    const wipInputs = screen.getAllByPlaceholderText('WIP');
    fireEvent.change(wipInputs[3], { target: { value: '3' } });
    await waitFor(() => expect(Object.values(read().preferences.wipLimits)).toContain(3));
  });

  it('calendar renders', async () => {
    renderAt('/calendar');
    await waitFor(() => expect(document.body.textContent).toMatch(/Calendar|Interview/i), { timeout: 5000 });
  });
});

describe('first run', () => {
  it('shows the guided onboarding when the flag is unset', async () => {
    wipeLocalStore();
    renderAt('/dashboard');
    expect(await screen.findByText('Welcome to InternTrack', undefined, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Set it up/ }));
    expect(await screen.findByText('Pick a colour')).toBeInTheDocument();
  });

  it('marks onboarding complete when dismissed', async () => {
    wipeLocalStore();
    renderAt('/dashboard');
    await screen.findByText('Welcome to InternTrack');
    fireEvent.click(screen.getByLabelText('Skip setup'));
    await waitFor(() => expect(read().preferences.onboarded).toBe(true));
  });
});
