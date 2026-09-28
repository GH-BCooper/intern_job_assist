const DEFAULT_ORIGIN = 'https://intern-job-assist.vercel.app';

const originInput = document.getElementById('origin');
const status = document.getElementById('status');
const button = document.getElementById('capture');

chrome.storage.sync.get('origin').then(({ origin }) => {
  originInput.value = origin || DEFAULT_ORIGIN;
});

originInput.addEventListener('change', () => {
  const value = originInput.value.trim();
  void chrome.storage.sync.set({ origin: value || DEFAULT_ORIGIN });
  status.textContent = 'Saved.';
});

button.addEventListener('click', () => {
  button.disabled = true;
  status.textContent = 'Reading the page…';
  chrome.runtime.sendMessage({ type: 'capture' }, response => {
    button.disabled = false;
    if (response?.ok) {
      status.textContent = 'Opened in InternTrack.';
      window.close();
    } else {
      status.textContent = response?.error || 'Could not read this page.';
    }
  });
});
