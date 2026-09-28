/**
 * A bundled rotation of job-search tips — no API, no network, and stable for a
 * given day so the dashboard doesn't reshuffle on every render.
 */

export const TIPS: { tip: string; source: string }[] = [
  { tip: 'Apply within 48 hours of a posting going live. Recruiters review in batches, and the first batch gets the most attention.', source: 'Cadence' },
  { tip: 'Mirror the posting’s own words for the skills you genuinely have. Most first passes are keyword filters, human or otherwise.', source: 'Resume' },
  { tip: 'One tailored application beats five generic ones. Track your interview rate per platform and let it tell you where to spend the effort.', source: 'Strategy' },
  { tip: 'A short, specific follow-up after seven days measurably lifts reply rates. Reference something concrete from the role.', source: 'Follow-up' },
  { tip: 'Always have two questions ready for the interviewer. "No questions" reads as no interest, however interested you are.', source: 'Interview' },
  { tip: 'Write the retro the same day an interview ends. What they asked, what you fumbled, what you’d say next time.', source: 'Learning' },
  { tip: 'A referral moves your application from the pile to a person’s inbox. One warm message beats ten cold applications.', source: 'Network' },
  { tip: 'Keep two or three resume versions, not twelve. Enough to target a family of roles, few enough to keep all of them good.', source: 'Resume' },
  { tip: 'Rejections are data. If you’re getting interviews but no offers, the problem is the interview, not the resume.', source: 'Diagnosis' },
  { tip: 'Quantify everything you can. "Cut build times 40%" lands; "improved build performance" does not.', source: 'Resume' },
  { tip: 'Practice out loud. Answers that read well in your head fall apart at speaking pace.', source: 'Interview' },
  { tip: 'Ask about the team’s actual work, not the company’s mission. Specific questions signal a specific candidate.', source: 'Interview' },
  { tip: 'Send the thank-you note within 24 hours. Two sentences, one concrete detail from the conversation.', source: 'Follow-up' },
  { tip: 'Apply Tuesday through Thursday when you can. Monday postings are buried by Monday volume.', source: 'Cadence' },
  { tip: 'If a posting has been open for months, the role may be frozen. Spend your best effort on fresh listings.', source: 'Strategy' },
  { tip: 'Keep a "story bank" of five STAR stories. Most behavioural questions are one of those five, asked differently.', source: 'Interview' },
  { tip: 'Negotiate even for internships. A polite "is there flexibility on the rate?" costs nothing and sometimes works.', source: 'Offer' },
  { tip: 'Track the recruiter’s name. Following up with a person, not an inbox, changes the odds.', source: 'Network' },
  { tip: 'Batch your applications. Context-switching between five job boards costs more time than the applications do.', source: 'Cadence' },
  { tip: 'Read the company’s engineering blog before the interview. One informed reference is worth an hour of generic prep.', source: 'Interview' },
  { tip: 'If you go quiet on yourself for a week, the pipeline goes quiet a month later. Momentum lags.', source: 'Cadence' },
  { tip: 'Save the job description when you apply. You will want it back before the interview, and postings disappear.', source: 'Tracking' },
];

/** Stable per calendar day, so the tip changes daily rather than on each render. */
export function tipOfTheDay(date = new Date()): { tip: string; source: string } {
  const dayNumber = Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000,
  );
  return TIPS[Math.abs(dayNumber) % TIPS.length];
}
