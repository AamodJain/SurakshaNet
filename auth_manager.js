/**
 * Parental Authentication & Session Manager for SurakshaNet
 * Uses Web Crypto API with PBKDF2-HMAC-SHA256 (100,000 iterations)
 */

const SYNC_KEY = 'surakshanet_auth';
const SESSION_KEY = 'surakshanet_session';
const ITERATIONS = 100000;
const SALT_LENGTH = 16; // 16 bytes = 128 bits
const KEY_LENGTH = 256; // 256 bits

/**
 * Converts Uint8Array to hex string
 */
function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts hex string to Uint8Array
 */
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a PBKDF2-HMAC-SHA256 hash from password and salt
 */
async function deriveHash(password, saltUint8) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltUint8,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH,
  );
  return toHex(derived);
}

/**
 * Safe wrapper to retrieve auth record from chrome.storage.sync (with local fallback)
 */
async function getAuthRecord() {
  try {
    if (chrome.storage?.sync) {
      const { [SYNC_KEY]: syncRecord } = await chrome.storage.sync.get(SYNC_KEY);
      if (syncRecord?.hash && syncRecord?.salt) return syncRecord;
    }
  } catch (e) {
    console.warn('[SurakshaNet Auth] chrome.storage.sync unavailable, checking local:', e);
  }

  // Fallback to chrome.storage.local
  if (chrome.storage?.local) {
    const { [SYNC_KEY]: localRecord } = await chrome.storage.local.get(SYNC_KEY);
    if (localRecord?.hash && localRecord?.salt) return localRecord;
  }
  return null;
}

/**
 * Checks if a parent master account has been set up
 */
export async function isAccountSetup() {
  const record = await getAuthRecord();
  return Boolean(record?.hash && record?.salt);
}

/**
 * Returns parent email if configured
 */
export async function getParentEmail() {
  const record = await getAuthRecord();
  return record?.email || null;
}

/**
 * Sets up the parental master account with email and password
 */
export async function setupParentAccount({ email, password }) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const saltHex = toHex(saltBytes);
  const hashHex = await deriveHash(password, saltBytes);

  const authData = {
    email: String(email || '').trim().toLowerCase(),
    salt: saltHex,
    hash: hashHex,
    setupAt: new Date().toISOString(),
  };

  if (chrome.storage?.sync) {
    try {
      await chrome.storage.sync.set({ [SYNC_KEY]: authData });
    } catch (e) {
      console.warn('[SurakshaNet Auth] sync storage write failed:', e);
    }
  }
  if (chrome.storage?.local) {
    await chrome.storage.local.set({ [SYNC_KEY]: authData });
  }

  // Automatically activate parent session upon initial setup
  await unlockSession();
  return true;
}

/**
 * Verifies if candidate password matches stored hash
 */
export async function verifyParentPassword(password) {
  if (typeof password !== 'string' || !password) return false;
  const record = await getAuthRecord();
  if (!record?.salt || !record?.hash) return false;

  const saltBytes = fromHex(record.salt);
  const computedHash = await deriveHash(password, saltBytes);
  return computedHash === record.hash;
}

/**
 * Unlocks the active session in chrome.storage.session
 */
export async function unlockSession() {
  if (chrome.storage?.session) {
    await chrome.storage.session.set({ [SESSION_KEY]: { unlocked: true, ts: Date.now() } });
  } else if (chrome.storage?.local) {
    await chrome.storage.local.set({ [SESSION_KEY]: { unlocked: true, ts: Date.now() } });
  }
}

/**
 * Logs in parent by validating password and unlocking session
 */
export async function loginParent(password) {
  const valid = await verifyParentPassword(password);
  if (!valid) return false;
  await unlockSession();
  return true;
}

/**
 * Checks if the parent session is currently unlocked
 */
export async function isParentSessionActive() {
  if (!(await isAccountSetup())) return false;

  try {
    if (chrome.storage?.session) {
      const { [SESSION_KEY]: session } = await chrome.storage.session.get(SESSION_KEY);
      if (session?.unlocked === true) return true;
    }
  } catch (e) {
    // Session storage fallback
  }

  if (chrome.storage?.local) {
    const { [SESSION_KEY]: session } = await chrome.storage.local.get(SESSION_KEY);
    return session?.unlocked === true;
  }
  return false;
}

/**
 * Locks the active parent session (reverts to Child Protection mode)
 */
export async function lockSession() {
  if (chrome.storage?.session) {
    await chrome.storage.session.remove(SESSION_KEY);
  }
  if (chrome.storage?.local) {
    await chrome.storage.local.remove(SESSION_KEY);
  }
}

/**
 * Resets / Logs out parent account. Strictly requires password verification.
 */
export async function logoutParent(confirmPassword) {
  const valid = await verifyParentPassword(confirmPassword);
  if (!valid) {
    throw new Error('Incorrect master password. Reset denied.');
  }

  // Clear auth records
  if (chrome.storage?.sync) {
    await chrome.storage.sync.remove(SYNC_KEY);
  }
  if (chrome.storage?.local) {
    await chrome.storage.local.remove(SYNC_KEY);
  }
  await lockSession();
  return true;
}
