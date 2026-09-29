/**
 * Signed-in regression tests for defects found by driving the real app in Chrome.
 *
 * Same harness as app.integration.test.tsx: the real App over an in-memory
 * Supabase fake. Each test names the bug it pins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createFakeSupabase, seedApplications, seedInterviews } from './test/fakeSupabase';
import type { Application } from './lib/supabase';

// Whole-app renders are slow on a busy machine; the default 5s is too tight for them.
vi.setConfig({ testTimeout: 30_000 });

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

vi.mock('./lib/fx', () => ({
  confetti: vi.fn(),
  celebrate: vi.fn(),
  play: vi.fn(),
  previewSound: vi.fn(),
  prefersReducedMotion: () => true,
}));

const { default: App } = await import('./App');
const { wipeLocalStore, savePreferences, read, setStage, setStoreScope } = await import('./lib/store');
const { clearUndo } = await import('./lib/undo');

function renderAt(route: string) {
  window.history.pushState({}, '', route);
  return render(<App />);
}

async function findCard(company: string): Promise<HTMLElement> {
  const matches = await screen.findAllByText(company, undefined, { timeout: 8000 });
  const card = matches.map(el => el.closest('[role="button"]')).find(Boolean) as HTMLElement | undefined;
  if (!card) throw new Error(`No board card found for ${company}`);
  return card;
}

const waitForPipeline = () => screen.findAllByText('Stripe', undefined, { timeout: 8000 });

const seedRows = () => JSON.parse(JSON.stringify(seedApplications())) as Application[];

beforeEach(() => {
  // The App scopes the store to the signed-in user when it mounts; seeding the
  // preferences first has to land in that same scope.
  setStoreScope('user-1');
  wipeLocalStore();
  localStorage.clear();
  clearUndo();
  savePreferences({ onboarded: true });
  // Tests mutate the shared fake; put the seed back so they stay independent.
  fake.__tables.applications = seedRows();
  fake.__tables.interview_dates = JSON.parse(JSON.stringify(seedInterviews()));
  fake.__calls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('returning users', () => {
  it('are not shown the onboarding wizard again on load', async () => {
    // The wizard used to appear for a returning user: the dashboard read the store
    // before it was scoped to them, saw "not onboarded", and opened it.
    renderAt('/dashboard');
    await waitForPipeline();
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(screen.queryByText('Welcome to InternTrack')).not.toBeInTheDocument();
  });

  it('see "Open your dashboard" on the home page, not sign-up buttons', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /Open your dashboard/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Start tracking free/ })).not.toBeInTheDocument();
  });
});

describe('editing an application', () => {
  async function openEditFor(company: string) {
    fireEvent.click(await findCard(company));
    fireEvent.click(await screen.findByRole('button', { name: /Edit application/ }));
    return screen.findByRole('dialog', { name: /Edit application/ });
  }

  it('keeps its interview dates — same rows, same timestamps', async () => {
    // Saving the form used to replace every interview date with an empty list.
    const before = fake.__tables.interview_dates.find(i => i.id === 'iv-stripe-1')!;
    renderAt('/dashboard');
    const dialog = await openEditFor('Stripe');

    // The existing round is shown, and can be edited.
    const rounds = within(dialog).getAllByLabelText(/date and time/i);
    expect(rounds).toHaveLength(1);

    fireEvent.change(within(dialog).getByPlaceholderText(/Software Engineer/), {
      target: { value: 'Backend Engineering Intern (edited)' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(fake.__tables.applications.find(a => a.id === 'app-stripe')?.role_applied_to).toBe(
        'Backend Engineering Intern (edited)',
      ),
    );
    const after = fake.__tables.interview_dates.filter(i => i.application_id === 'app-stripe');
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe('iv-stripe-1');
    expect(after[0].interview_date).toBe(before.interview_date);
  });

  it('asks before throwing away typing, and closes freely when nothing changed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAt('/dashboard');
    await waitForPipeline();

    fireEvent.click(screen.getAllByRole('button', { name: /Add application/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: /New application/ });

    // Untouched: Escape just closes it.
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /New application/ })).not.toBeInTheDocument());
    expect(confirm).not.toHaveBeenCalled();

    // Typed into: Escape asks first, and declining keeps the form open.
    fireEvent.click(screen.getAllByRole('button', { name: /Add application/ })[0]);
    const again = await screen.findByRole('dialog', { name: /New application/ });
    fireEvent.change(within(again).getByLabelText(/Company Name/), { target: { value: 'Acme' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: /New application/ })).toBeInTheDocument();
    expect(dialog).toBeDefined();
  });

  it('refuses a round with no date instead of failing after the save', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    fireEvent.click(screen.getAllByRole('button', { name: /Add application/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: /New application/ });

    fireEvent.change(within(dialog).getByLabelText(/Company Name/), { target: { value: 'Acme' } });
    fireEvent.click(within(dialog).getByLabelText(/Interview Offered/));
    fireEvent.click(within(dialog).getByRole('button', { name: /Add Date/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Application' }));

    expect(await within(dialog).findByText(/Give every interview a date/)).toBeInTheDocument();
    expect(fake.__tables.applications.some(a => a.company_name === 'Acme')).toBe(false);
  });
});

describe('loading', () => {
  it('fetches the pipeline once, not again on every page change', async () => {
    // `refresh` depended on the router's `navigate`, which changes on every
    // navigation, so each page change refetched everything.
    renderAt('/dashboard');
    await waitForPipeline();
    const selects = () => fake.__calls.filter(c => c.table === 'applications' && c.op === 'select').length;
    expect(selects()).toBe(1);

    fireEvent.click(screen.getAllByRole('link', { name: /Insights/ })[0]);
    await screen.findByText(/Why your momentum is/, undefined, { timeout: 8000 });
    fireEvent.click(screen.getAllByRole('link', { name: /Calendar/ })[0]);
    await waitFor(() => expect(window.location.pathname).toBe('/calendar'));

    expect(selects()).toBe(1);
  });
});

describe('deleting and undoing', () => {
  async function deleteStripe() {
    fireEvent.click(await findCard('Stripe'));
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Yes, delete/ }));
    await waitFor(() => expect(fake.__tables.applications.some(a => a.id === 'app-stripe')).toBe(false));
  }

  it('undo restores the same application with its interview dates', async () => {
    // Undo used to re-create it under a new id with no interviews.
    renderAt('/dashboard');
    await deleteStripe();

    fireEvent.click(await screen.findByRole('button', { name: /^Undo$/ }));
    await waitFor(() => expect(fake.__tables.applications.some(a => a.id === 'app-stripe')).toBe(true));
    await waitFor(() =>
      expect(fake.__tables.interview_dates.some(i => i.application_id === 'app-stripe' && i.id === 'iv-stripe-1')).toBe(true),
    );
  });

  it('Ctrl+Z undoes the delete too', async () => {
    renderAt('/dashboard');
    await deleteStripe();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(fake.__tables.applications.some(a => a.id === 'app-stripe')).toBe(true));
  });
});

describe('the board', () => {
  it('ignores number keys while the application panel is open', async () => {
    // Digits pressed in the panel used to move the card sitting behind it.
    renderAt('/dashboard');
    fireEvent.click(await findCard('Stripe'));
    await screen.findByRole('dialog', { name: /Stripe application/ });
    fireEvent.keyDown(document.body, { key: '1' });
    fireEvent.keyDown(document.body, { key: '5' });
    expect(read().stageOverrides['app-stripe']).toBeUndefined();
  });

  it('does not take the arrow keys until the board itself has focus', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    const preventDefault = vi.fn();
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    event.preventDefault = preventDefault;
    window.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('pages long columns instead of mounting every card', async () => {
    for (let i = 0; i < 40; i += 1) {
      fake.__tables.applications.push({
        ...seedRows()[0],
        id: `bulk-${i}`,
        company_name: `Bulk Co ${i}`,
        date_applied: null,
        response_status: 'Pending',
        interview_offered: false,
        final_status: 'In Progress',
      } as Application);
    }
    renderAt('/dashboard');
    await waitForPipeline();
    // 40 extra wishlist items + Linear = 41; the column shows 30 and offers the rest.
    const cards = () =>
      screen.getByRole('region', { name: /^Wishlist, 41 applications/ }).querySelectorAll('[role="button"]').length;
    expect(await screen.findByRole('button', { name: /Show 11 more/ })).toBeInTheDocument();
    expect(cards()).toBe(30);
    fireEvent.click(screen.getByRole('button', { name: /Show 11 more/ }));
    await waitFor(() => expect(cards()).toBe(41));
    expect(screen.queryByRole('button', { name: /more · / })).not.toBeInTheDocument();
  });

  it('opens a card from the keyboard on the star button without opening it', async () => {
    renderAt('/dashboard');
    const card = await findCard('Stripe');
    fireEvent.keyDown(within(card).getByRole('button', { name: 'Star' }), { key: 'Enter' });
    expect(screen.queryByRole('dialog', { name: /Stripe application/ })).not.toBeInTheDocument();
  });
});

describe('the table', () => {
  it('sorts by stage in pipeline order, not alphabetically', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    fireEvent.click(screen.getByRole('button', { name: /Table/ }));
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Stage' }));

    const companies = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map(row => row.getAttribute('aria-label')?.replace('Open ', ''));
    // Wishlist → Applied → Interviewing → Offer → Closed
    expect(companies).toEqual(['Linear', 'Vercel', 'Stripe', 'Figma', 'Notion']);
  });

  it('rows can be opened with the keyboard', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    fireEvent.click(screen.getByRole('button', { name: /Table/ }));
    const row = await screen.findByRole('row', { name: 'Open Stripe' });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: /Stripe application/ })).toBeInTheDocument();
  });
});

describe('the timeline', () => {
  it('does not call a wishlist item "Applied"', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    fireEvent.click(screen.getByRole('button', { name: /Timeline/ }));
    expect(await screen.findByText('Saved to wishlist · Full-stack Intern')).toBeInTheDocument();
  });
});

describe('insights', () => {
  it('shows the empty message, not fake bars, when no stage moves are recorded', async () => {
    renderAt('/insights');
    expect(await screen.findByText(/Move a few cards between stages/, undefined, { timeout: 8000 })).toBeInTheDocument();
  });

  it('draws the flow with the stage names the user chose', async () => {
    savePreferences({ onboarded: true, stageLabels: { Applied: 'Sent' } });
    setStage('app-vercel', 'In Review', 'Applied');
    renderAt('/insights');
    await screen.findByText('How applications actually moved');
    // The stage-distribution legend uses the renamed stage.
    await waitFor(() => expect(screen.getAllByText('Sent').length).toBeGreaterThan(0));
  });
});

describe('switches', () => {
  it('pin the knob to the track so it cannot hang outside it', async () => {
    renderAt('/automations');
    await screen.findByText('Quiet hours', undefined, { timeout: 10_000 });
    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(1);
    switches.forEach(button => {
      expect(button.firstElementChild?.className).toContain('left-0');
    });
  });
});

describe('exporting', () => {
  it('offers CSV and JSON alongside the PDF and Word bundles', async () => {
    renderAt('/dashboard');
    await waitForPipeline();
    fireEvent.click(screen.getByRole('button', { name: /Export All/ }));
    expect(await screen.findByRole('menuitem', { name: /Export as CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Export as JSON/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

describe('page titles', () => {
  it('name the current screen', async () => {
    renderAt('/settings');
    await screen.findByText('Accent palette', undefined, { timeout: 8000 });
    expect(document.title).toBe('Settings · InternTrack');
  });
});
