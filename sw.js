import { pipeline, env } from '@xenova/transformers';
import { saveIncident } from './store.js';
import { isAccountSetup } from './auth_manager.js';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = chrome.runtime.getURL('assets/models/');
// CacheStorage rejects chrome-extension:// request URLs in Chrome.
env.useBrowserCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('assets/');

const DEBUG = true;
const DEBUG_LOG_MESSAGES = true;
const FLAG = 0.5;
const HIGH = 0.9;
const PREFIX = '[SurakshaNet]';

let classifier = null;
let modelPromise = null;
const queue = [];
let busy = false;

function log(event, details = {}) {
  if (DEBUG) console.info(PREFIX, event, details);
}

function logError(event, error, details = {}) {
  console.error(PREFIX, event, {
    ...details,
    error: String(error?.stack || error?.message || error),
  });
}

function debugText(text) {
  return DEBUG_LOG_MESSAGES ? text : `[redacted:${text.length} chars]`;
}

log('worker:loaded', {
  model: 'custom-macd-model',
  localModels: env.allowLocalModels,
  remoteModels: env.allowRemoteModels,
  wasmThreads: env.backends.onnx.wasm.numThreads,
});

async function ensureModel() {
  if (classifier) return classifier;
  if (!modelPromise) {
    log('model:load:start', { modelPath: env.localModelPath });
    modelPromise = pipeline('text-classification', 'custom-macd-model', { top_k: null })
      .then((loaded) => {
        classifier = loaded;
        log('model:load:success');
        return loaded;
      })
      .catch((error) => {
        modelPromise = null;
        logError('model:load:failed', error, { modelPath: env.localModelPath });
        throw error;
      });
  }
  return modelPromise;
}

function abusiveScore(results) {
  const rows = Array.isArray(results) ? results : [results];
  for (const r of rows) {
    const l = String(r.label).toLowerCase();
    if (l === 'abusive' || l === 'label_0') return r.score;
  }
  for (const r of rows) {
    const l = String(r.label).toLowerCase();
    if (l === 'non-abusive' || l === 'label_1') return 1 - r.score;
  }
  return 0;
}

async function classify(text) {
  log('classify:start', { text: debugText(text), textLength: text.length });
  await ensureModel();
  const score = abusiveScore(await classifier(text));
  const flagged = score > FLAG;
  const result = {
    flagged,
    score,
    severity: !flagged ? null : score >= HIGH ? 'high' : 'medium',
  };
  log('classify:complete', {
    text: debugText(text),
    textLength: text.length,
    flagged: result.flagged,
    score: Number(result.score.toFixed(4)),
    severity: result.severity,
  });
  return result;
}

async function captureScreen(windowId) {
  try {
    if (typeof windowId !== 'number') return null;
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'jpeg',
      quality: 60,
    });
    log('screenshot:captured', { windowId, bytes: dataUrl?.length || 0 });
    return dataUrl;
  } catch (error) {
    log('screenshot:failed', { windowId, error: String(error?.message || error) });
    return null;
  }
}

async function drain() {
  if (busy) return;
  busy = true;
  log('queue:drain:start', { pending: queue.length });
  try {
    while (queue.length) {
      const job = queue.shift();
      log('queue:job:start', {
        pending: queue.length,
        text: debugText(job.text),
        textLength: job.text.length,
        contact: job.contact,
        windowId: job.windowId,
      });
      try {
        const result = await classify(job.text);
        if (result.flagged) {
          const screenshot = await captureScreen(job.windowId);
          const saved = await saveIncident({
            text: job.text,
            contact: job.contact,
            score: result.score,
            severity: result.severity,
            screenshot,
          });
          log('incident:save', {
            created: Boolean(saved),
            id: saved?.id?.slice(0, 12) || null,
            text: debugText(job.text),
            contact: job.contact,
            hasScreenshot: Boolean(screenshot),
          });
        }
        job.resolve(result);
        log('queue:job:success', { pending: queue.length, flagged: result.flagged });
      } catch (error) {
        logError('queue:job:failed', error, {
          textLength: job.text.length,
          contact: job.contact,
        });
        job.reject(error);
      }
    }
  } finally {
    busy = false;
    log('queue:drain:complete', { pending: queue.length });
  }
}

function enqueue(text, contact, windowId) {
  log('queue:enqueue', {
    text: debugText(text),
    pending: queue.length + 1,
    textLength: text.length,
    contact,
    windowId,
  });
  return new Promise((resolve, reject) => {
    queue.push({ text, contact, windowId, resolve, reject });
    drain();
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  log('runtime:installed', { reason: details.reason });
  ensureModel().catch(() => {});
  try {
    const configured = await isAccountSetup();
    if (!configured) {
      chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
    }
  } catch (e) {
    logError('runtime:installed:auth-check-failed', e);
  }
});
chrome.runtime.onStartup.addListener(() => {
  log('runtime:startup');
  ensureModel().catch(() => {});
});
chrome.runtime.onSuspend.addListener(() => log('runtime:suspend'));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'ANALYZE') {
    log('message:ignored', { type: msg?.type || null });
    return false;
  }
  if (typeof msg.text !== 'string' || !msg.text.trim()) {
    log('message:invalid', { textType: typeof msg.text });
    sendResponse({ flagged: false, error: 'Message text is required.' });
    return false;
  }
  const windowId = sender.tab?.windowId ?? null;
  log('message:analyze', {
    text: debugText(msg.text),
    textLength: msg.text.length,
    contact: msg.contact,
    windowId,
  });
  enqueue(msg.text, msg.contact, windowId)
    .then((r) => sendResponse(r))
    .catch((error) => {
      logError('message:analyze:failed', error, {
        text: debugText(msg.text),
        textLength: msg.text.length,
        contact: msg.contact,
      });
      sendResponse({ flagged: false, error: String(error.message || error) });
    });
  return true;
});
