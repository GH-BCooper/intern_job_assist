/**
 * Service worker: runs the extractor in the active tab and opens InternTrack's
 * new-application form with the result in the URL hash.
 *
 * The hash is deliberate — it never reaches a server, and the app reads it on
 * load and clears it immediately.
 */

const DEFAULT_ORIGIN = 'https://intern-job-assist.vercel.app';

async function originSetting() {
  const { origin } = await chrome.storage.sync.get('origin');
  return (origin || DEFAULT_ORIGIN).replace(/\/$/, '');
}

function buildUrl(origin, fields) {
  const payload = {
    company_name: fields.company_name || '',
    role_applied_to: fields.role_applied_to || '',
    platform_applied_on: fields.platform_applied_on || '',
    salary_info: fields.salary_info || '',
    company_description: [fields.company_description, fields.source_url].filter(Boolean).join('\n\n'),
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `${origin}/dashboard#interntrack-add=${encoded}`;
}

async function captureTab(tab) {
  if (!tab?.id) return;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['extract.js'],
  });
  const fields = result?.result || {};
  const origin = await originSetting();
  await chrome.tabs.create({ url: buildUrl(origin, fields) });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'add-to-interntrack',
    title: 'Add this posting to InternTrack',
    contexts: ['page', 'selection', 'link'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'add-to-interntrack') void captureTab(tab);
});

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'capture') return false;
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await captureTab(tab);
      respond({ ok: true });
    } catch (error) {
      respond({ ok: false, error: String(error) });
    }
  })();
  return true; // keep the message channel open for the async respond
});
