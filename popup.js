import { listIncidents, clearIncidents, exportJSON } from './store.js';
import { exportIncidentsPDF } from './pdf_exporter.js';

const listEl = document.getElementById('list');
const countEl = document.getElementById('incident-count');
const highCountEl = document.getElementById('high-count');

const modalOverlay = document.getElementById('modal-overlay');
const modalImg = document.getElementById('modal-img');
const modalTitle = document.getElementById('modal-title');
const modalSubtitle = document.getElementById('modal-subtitle');
const modalClose = document.getElementById('modal-close');
const modalDismiss = document.getElementById('modal-dismiss');
const modalDownload = document.getElementById('modal-download');

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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
    closeScreenshotModal();
  }
});

function formatTimestamp(value) {
  try {
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return 'Unknown time';
  }
}

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

async function render() {
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

document.getElementById('export').onclick = async () => {
  const url = URL.createObjectURL(new Blob([await exportJSON()], { type: 'application/json' }));
  Object.assign(document.createElement('a'), {
    href: url,
    download: `surakshanet-${Date.now()}.json`,
  }).click();
  URL.revokeObjectURL(url);
};

document.getElementById('export-pdf').onclick = async (event) => {
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

document.getElementById('clear').onclick = async () => {
  if (!confirm('Clear all local incidents?')) return;
  await clearIncidents();
  render();
};

render();
