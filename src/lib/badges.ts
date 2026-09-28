/**
 * Achievement badges, computed from data the store already has.
 *
 * Nothing new is tracked: every rule reads the same analytics the dashboard
 * does, so badges are correct retroactively for anyone importing history.
 */

import type { Analytics } from './insights';
import type { StoreShape } from './store';

export type Badge = {
  id: string;
  name: string;
  detail: string;
  /** Lucide icon name, resolved by the component. */
  icon: 'rocket' | 'flame' | 'trophy' | 'target' | 'calendar' | 'users' | 'brain' | 'sparkles' | 'medal' | 'zap';
  tier: 'bronze' | 'silver' | 'gold';
  earned: boolean;
  /** 0–1 toward the next unlock, for the not-yet-earned ones. */
  progress: number;
};

type Rule = {
  id: string;
  name: string;
  detail: string;
  icon: Badge['icon'];
  tier: Badge['tier'];
  value: (a: Analytics, s: StoreShape) => number;
  goal: number;
};

const RULES: Rule[] = [
  { id: 'first-application', name: 'Off the mark', detail: 'Logged your first application.', icon: 'rocket', tier: 'bronze', goal: 1, value: a => a.total },
  { id: 'ten-applications', name: 'Double digits', detail: 'Ten applications tracked.', icon: 'target', tier: 'bronze', goal: 10, value: a => a.total },
  { id: 'fifty-applications', name: 'Half a century', detail: 'Fifty applications tracked.', icon: 'medal', tier: 'silver', goal: 50, value: a => a.total },
  { id: 'hundred-applications', name: 'Centurion', detail: 'One hundred applications tracked.', icon: 'trophy', tier: 'gold', goal: 100, value: a => a.total },
  { id: 'first-interview', name: 'In the room', detail: 'Landed your first interview.', icon: 'calendar', tier: 'bronze', goal: 1, value: a => a.interviews },
  { id: 'five-interviews', name: 'Regular', detail: 'Five applications reached an interview.', icon: 'calendar', tier: 'silver', goal: 5, value: a => a.interviews },
  { id: 'first-offer', name: 'Offer in hand', detail: 'Your first offer.', icon: 'trophy', tier: 'gold', goal: 1, value: a => a.offers },
  { id: 'streak-7', name: 'Week on', detail: 'Applied every day for a week.', icon: 'flame', tier: 'silver', goal: 7, value: a => a.bestStreak },
  { id: 'streak-30', name: 'Unstoppable', detail: 'A thirty-day application streak.', icon: 'flame', tier: 'gold', goal: 30, value: a => a.bestStreak },
  { id: 'ten-contacts', name: 'Networker', detail: 'Ten contacts saved.', icon: 'users', tier: 'silver', goal: 10, value: (_a, s) => s.contacts.length },
  { id: 'prep-25', name: 'Well drilled', detail: 'Reviewed twenty-five prep cards.', icon: 'brain', tier: 'silver', goal: 25, value: (_a, s) => s.srsCards.reduce((n, c) => n + c.reps, 0) },
  { id: 'automation-builder', name: 'Set and forget', detail: 'Built three automation rules.', icon: 'zap', tier: 'bronze', goal: 3, value: (_a, s) => s.automationRules.length },
  { id: 'tidy-tracker', name: 'Immaculate', detail: 'Every application carries a tag.', icon: 'sparkles', tier: 'silver', goal: 1, value: (a, s) => {
    if (!a.total) return 0;
    const tagged = new Set(s.applicationTags.map(t => t.application_id));
    return tagged.size >= a.total ? 1 : 0;
  } },
  { id: 'star-stories', name: 'Story ready', detail: 'Five STAR stories written.', icon: 'brain', tier: 'bronze', goal: 5, value: (_a, s) => s.starStories.length },
];

export function computeBadges(analytics: Analytics, store: StoreShape): Badge[] {
  return RULES.map(rule => {
    const value = rule.value(analytics, store);
    const earned = value >= rule.goal;
    return {
      id: rule.id,
      name: rule.name,
      detail: rule.detail,
      icon: rule.icon,
      tier: rule.tier,
      earned,
      progress: rule.goal > 0 ? Math.min(1, value / rule.goal) : 0,
    };
  });
}

export function earnedBadgeIds(analytics: Analytics, store: StoreShape): string[] {
  return computeBadges(analytics, store).filter(b => b.earned).map(b => b.id);
}
