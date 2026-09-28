import { useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useStore } from './useStore';
import { evaluateAutomations, type AutomationBridge } from '../lib/automation';

/** Runs the automation engine on an interval and whenever the underlying data changes. */
export function useAutomationEngine() {
  const { applications, interviewsMap, updateApplication } = useData();
  const store = useStore();
  const enabled = store.preferences.automationsEnabled;
  const rulesCount = store.automationRules.length;

  const bridgeRef = useRef<AutomationBridge>({ applications, interviewsMap, updateApplication });
  bridgeRef.current = { applications, interviewsMap, updateApplication };

  useEffect(() => {
    if (!enabled || !rulesCount) return;
    const run = () => void evaluateAutomations(bridgeRef.current);
    run();
    const id = window.setInterval(run, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, rulesCount, applications, interviewsMap]);
}
