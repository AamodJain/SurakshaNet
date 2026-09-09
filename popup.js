import {
  isAccountSetup,
  isParentSessionActive,
  loginParent,
  lockSession,
  logoutParent,
} from './auth_manager.js';
import { listIncidents, clearIncidents, exportJSON } from './store.js';
import { exportIncidentsPDF } from './pdf_exporter.js';

// Views & Header
const heroEyebrow = document.getElementById('hero-eyebrow');
const viewUnconfigured = document.getElementById('view-unconfigured');
const viewLocked = document.getElementById('view-locked');
const viewUnlocked = document.getElementById('view-unlocked');

// Unconfigured View
const btnLaunchSetup = document.getElementById('btn-launch-setup');

// Locked View
const formUnlock = document.getElementById('form-unlock');
const unlockPassword = document.getElementById('unlock-password');
const unlockError = document.getElementById('unlock-error');
const btnUnlock = document.getElementById('btn-unlock');

// Unlocked View Controls
const btnLock = document.getElementById('btn-lock');
const listEl = document.getElementById('list');
const countEl = document.getElementById('incident-count');
const highCountEl = document.getElementById('high-count');
const btnExport = document.getElementById('export');
const btnExportPdf = document.getElementById('export-pdf');
const btnClear = document.getElementById('clear');

// Screenshot Modal
const modalOverlay = document.getElementById('modal-overlay');
const modalImg = document.getElementById('modal-img');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.getElementById('modal-subtitle');
const modalClose = document.getElementById('modal-close');
const modalDismiss = document.getElementById('modal-dismiss');
const modalDownload = document.getElementById('modal-download');

// Reset Modal
const btnLogoutModal = document.getElementById('btn-logout-modal');
const resetModalOverlay = document.getElementById('reset-modal-overlay');
const resetModalClose = document.getElementById('reset-modal-close');
const btnResetCancel = document.getElementById('btn-reset-cancel');
const formResetConfirm = document.getElementById('form-reset-confirm');
const resetConfirmPassword = document.getElementById('reset-confirm-password');
const resetError = document.getElementById('reset-error');
const btnResetSubmit = document.getElementById('btn-reset-submit');

function formatTimestamp(value) {
  try {
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return 'Unknown time';
  }
}

// ---------------- Screenshot Modal Handlers ----------------
function openScreenshotModal(item) {
  if (!item.screenshot) return;
  modalImg.src = item.screenshot;
  modalTitle.textContent = 'Evidence Screenshot';
  modalSubtitle.textContent = `${item.contact || 'Unknown chat'} · ${formatTimestamp(item.ts)}`;
  modalDownload.href = item.screenshot;
  modalDownload.download = `surakshanet-${String(item.id || Date.now()).slice(0, 12)}.jpg`;
  modalOverlay.classList.remove('hidden');
  modalOverlay.setAttribute('aria-hidden', 'false');
}

function closeScreenshotModal() {
  modalOverlay.classList.add('hidden');
  modalOverlay.setAttribute('aria-hidden', 'true');
  modalImg.src = '';
}

modalClose.addEventListener('click', closeScreenshotModal);
modalDismiss.addEventListener('click', closeScreenshotModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeScreenshotModal();
});

// ---------------- Reset Modal Handlers ----------------
function openResetModal() {
  resetConfirmPassword.value = '';
  resetError.classList.add('hidden');
  resetError.textContent = '';
  resetModalOverlay.classList.remove('hidden');
  resetModalOverlay.setAttribute('aria-hidden', 'false');
  resetConfirmPassword.focus();
}

function closeResetModal() {
  resetModalOverlay.classList.add('hidden');
  resetModalOverlay.setAttribute('aria-hidden', 'true');
}

btnLogoutModal.addEventListener('click', openResetModal);
resetModalClose.addEventListener('click', closeResetModal);
btnResetCancel.addEventListener('click', closeResetModal);
resetModalOverlay.addEventListener('click', (e) => {
  if (e.target === resetModalOverlay) closeResetModal();
});

formResetConfirm.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetError.classList.add('hidden');
  btnResetSubmit.disabled = true;

  const password = resetConfirmPassword.value;
  try {
    await logoutParent(password);
    closeResetModal();
    await updateView();
  } catch (err) {
    resetError.textContent = err?.message || 'Incorrect master password.';
    resetError.classList.remove('hidden');
  } finally {
    btnResetSubmit.disabled = false;
  }
});

// Global Keyboard Handler
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modalOverlay.classList.contains('hidden')) closeScreenshotModal();
    if (!resetModalOverlay.classList.contains('hidden')) closeResetModal();
  }
});

function cameraIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '13');
  circle.setAttribute('r', '4');
  svg.append(path, circle);
  return svg;
}

function row(item) {
  const article = document.createElement('article');
  article.className = 'row';

  const top = document.createElement('div');
  top.className = 'row-top';

  const contact = document.createElement('h2');
  contact.className = 'contact';
  contact.textContent = item.contact || 'Unknown chat';

  const severity = document.createElement('span');
  severity.className = `severity ${item.severity || 'medium'}`;
  severity.textContent = item.severity || 'medium';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const score = Math.round((Number(item.score) || 0) * 100);
  meta.textContent = `${formatTimestamp(item.ts)} · ${score}% confidence`;

  const message = document.createElement('p');
  message.className = 'message';
  message.textContent = item.text || '';

  top.append(contact, severity);
  article.append(top, meta, message);

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  if (item.screenshot) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-view-ss';
    btn.appendChild(cameraIcon());
    const span = document.createElement('span');
    span.textContent = 'View Screenshot';
    btn.appendChild(span);
    btn.onclick = () => openScreenshotModal(item);
    actions.appendChild(btn);
  } else {
    const badge = document.createElement('span');
    badge.className = 'no-ss-badge';
    badge.textContent = 'No screenshot';
    actions.appendChild(badge);
  }

  article.appendChild(actions);
  return article;
}

async function renderIncidents() {
  const items = await listIncidents();
  countEl.textContent = items.length;
  highCountEl.textContent = items.filter((item) => item.severity === 'high').length;
  listEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<span class="empty-mark" aria-hidden="true">✓</span><strong>No incidents yet</strong><span>SurakshaNet is watching incoming WhatsApp messages on this device.</span>';
    listEl.appendChild(empty);
    return;
  }
  items.forEach((i) => listEl.appendChild(row(i)));
}

// ---------------- View Management ----------------
async function updateView() {
  const setup = await isAccountSetup();
  if (!setup) {
    heroEyebrow.textContent = 'Setup Required';
    heroEyebrow.classList.remove('unlocked');
    viewUnconfigured.classList.remove('hidden');
    viewLocked.classList.add('hidden');
    viewUnlocked.classList.add('hidden');
    return;
  }

  const active = await isParentSessionActive();
  if (!active) {
    heroEyebrow.textContent = 'Child Protection Active';
    heroEyebrow.classList.remove('unlocked');
    viewUnconfigured.classList.add('hidden');
    viewLocked.classList.remove('hidden');
    viewUnlocked.classList.add('hidden');
    unlockPassword.value = '';
    unlockError.classList.add('hidden');
    return;
  }

  heroEyebrow.textContent = 'Parent Mode Active';
  heroEyebrow.classList.add('unlocked');
  viewUnconfigured.classList.add('hidden');
  viewLocked.classList.add('hidden');
  viewUnlocked.classList.remove('hidden');
  await renderIncidents();
}

// ---------------- Event Listeners ----------------
btnLaunchSetup.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
});

formUnlock.addEventListener('submit', async (e) => {
  e.preventDefault();
  unlockError.classList.add('hidden');
  btnUnlock.disabled = true;
  btnUnlock.textContent = '...';

  const password = unlockPassword.value;
  try {
    const success = await loginParent(password);
    if (!success) {
      unlockError.textContent = 'Incorrect master password.';
      unlockError.classList.remove('hidden');
      formUnlock.classList.add('shake');
      setTimeout(() => formUnlock.classList.remove('shake'), 350);
      return;
    }
    await updateView();
  } catch (err) {
    unlockError.textContent = err?.message || 'Login failed.';
    unlockError.classList.remove('hidden');
  } finally {
    btnUnlock.disabled = false;
    btnUnlock.textContent = 'Unlock';
  }
});

btnLock.addEventListener('click', async () => {
  await lockSession();
  await updateView();
});

btnExport.onclick = async () => {
  const url = URL.createObjectURL(new Blob([await exportJSON()], { type: 'application/json' }));
  Object.assign(document.createElement('a'), {
    href: url,
    download: `surakshanet-${Date.now()}.json`,
  }).click();
  URL.revokeObjectURL(url);
};

btnExportPdf.onclick = async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const items = await listIncidents();
    if (!items.length) {
      alert('No flagged messages to export.');
      return;
    }
    await exportIncidentsPDF(items);
  } finally {
    button.disabled = false;
  }
};

btnClear.onclick = async () => {
  if (!confirm('Clear all local incidents?')) return;
  await clearIncidents();
  renderIncidents();
};

// Initialize View on load
updateView();
