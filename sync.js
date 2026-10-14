// ── NutriWise Cloud Sync ─────────────────────────────────────────────────────
// Adds optional encrypted backup/sync on top of the existing localStorage flow.
// Nothing here changes how the app works if you never tap "Sync".
//
// SETUP: replace these two values with your own Supabase project's details.
// Both are safe to expose publicly — they are not secret keys. Real protection
// comes from the Row Level Security policy on the nutriwise_sync table.
const SUPABASE_URL = "https://ltqrqmbadgiujnclzdun.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KdIfc4nKNrYjh5zy8VstmQ_TiCeXZPj";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SYNC_KEYS = [LS_FOODS, LS_OPENCATS, LS_TRY, LS_AVOID, LS_BODY, LS_TRIGGERS, LS_SHOP];
const LS_PASSPHRASE_FLAG = "nutriwise_sync_unlocked"; // marks "we have a derived key in memory this session"
const LS_LAST_SYNCED_AT = "nutriwise_last_synced_at";

let encryptionKey = null; // CryptoKey, derived from passphrase, kept in memory only
let syncDebounceTimer = null;
let currentUser = null;

// ── Crypto helpers ───────────────────────────────────────────────────────────

async function deriveKeyFromPassphrase(passphrase, saltB64) {
  const enc = new TextEncoder();
  const salt = saltB64
    ? Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));

  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return { key, saltB64: btoa(String.fromCharCode(...salt)) };
}

async function encryptPayload(plainObj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(plainObj));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encryptionKey, data);
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipherBuf)))
  };
}

async function decryptPayload(ivB64, ciphertextB64) {
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, encryptionKey, cipherBytes);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// ── Passphrase handling ──────────────────────────────────────────────────────
// The passphrase itself is never stored or sent anywhere. Only the salt
// (not secret) is stored locally + in the cloud row, so the same key can be
// re-derived on any device once you type the same passphrase again.

function getLocalSalt() {
  return localStorage.getItem("nutriwise_salt");
}
function setLocalSalt(saltB64) {
  localStorage.setItem("nutriwise_salt", saltB64);
}

async function unlockEncryption(remoteSaltB64) {
  const existingSalt = remoteSaltB64 || getLocalSalt();
  const passphrase = prompt(
    existingSalt
      ? "Enter your NutriWise sync passphrase:"
      : "Choose a sync passphrase (used to encrypt your data — write it down, it can't be recovered if lost):"
  );
  if (!passphrase) return false;

  const { key, saltB64 } = await deriveKeyFromPassphrase(passphrase, existingSalt);
  encryptionKey = key;
  setLocalSalt(saltB64);
  sessionStorage.setItem(LS_PASSPHRASE_FLAG, "1"); // remembered for this browser session
  return true;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function sendMagicLink(email) {
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  });
  return error;
}

async function getSession() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

async function signOutSync() {
  await supabaseClient.auth.signOut();
  encryptionKey = null;
  currentUser = null;
  sessionStorage.removeItem(LS_PASSPHRASE_FLAG);
  updateSyncUI();
}

// ── Push / pull ──────────────────────────────────────────────────────────────

function gatherLocalSnapshot() {
  const snapshot = {};
  SYNC_KEYS.forEach(k => { snapshot[k] = localStorage.getItem(k); });
  return snapshot;
}

function applySnapshot(snapshot) {
  SYNC_KEYS.forEach(k => {
    if (snapshot[k] !== undefined && snapshot[k] !== null) {
      localStorage.setItem(k, snapshot[k]);
    }
  });
}

async function pushToCloud() {
  if (!currentUser || !encryptionKey) return;
  try {
    const snapshot = gatherLocalSnapshot();
    const { iv, ciphertext } = await encryptPayload(snapshot);
    const salt = getLocalSalt();
    const { error } = await supabaseClient.from("nutriwise_sync").upsert({
      user_id: currentUser.id,
      iv,
      ciphertext,
      salt,
      updated_at: new Date().toISOString()
    });
    if (error) console.error("Sync push failed:", error.message);
    else {
      localStorage.setItem(LS_LAST_SYNCED_AT, new Date().toISOString());
      updateSyncUI();
    }
  } catch (e) {
    console.error("Sync push error:", e);
  }
}

function queuePush() {
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(pushToCloud, 1500);
}

async function pullFromCloud() {
  if (!currentUser) {
    alert("Pull failed: not logged in (currentUser is empty).");
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from("nutriwise_sync")
      .select("iv, ciphertext, salt, updated_at")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) {
      alert("Sync pull failed: " + error.message);
      console.error("Sync pull failed:", error);
      return;
    }
    if (!data) {
      alert("No cloud backup found yet for this account. This is expected the very first time — try Sync again after making a change, or this means push hasn't succeeded yet.");
      return;
    }

    const unlocked = await unlockEncryption(data.salt);
    if (!unlocked) {
      alert("No passphrase entered — cancelled.");
      return;
    }

    const snapshot = await decryptPayload(data.iv, data.ciphertext);
    applySnapshot(snapshot);
    localStorage.setItem(LS_LAST_SYNCED_AT, data.updated_at);

    // Re-render the app with the freshly pulled data
    loadFromStorage();
    loadBodyFromStorage();
    renderFoods();
    renderTryList();
    renderAvoidList();
    renderShopTab();
    renderTimingPanel();
    updateSyncUI();
  } catch (e) {
    alert("Sync pull error: " + e.message + " (likely wrong passphrase — try again with the exact passphrase you set originally)");
    console.error("Sync pull error:", e);
  }
}

// ── Hook into existing save functions ───────────────────────────────────────
// We wrap rather than edit the originals, so app.js stays untouched.

const _originalSaveToStorage = saveToStorage;
saveToStorage = function () {
  _originalSaveToStorage();
  if (currentUser && encryptionKey) queuePush();
};

const _originalSaveBodyToStorage = saveBodyToStorage;
saveBodyToStorage = function () {
  _originalSaveBodyToStorage();
  if (currentUser && encryptionKey) queuePush();
};

// ── UI wiring ────────────────────────────────────────────────────────────────

function updateSyncUI() {
  const btn = document.getElementById("sync-status-btn");
  if (!btn) return;
  if (currentUser && encryptionKey) {
    const last = localStorage.getItem(LS_LAST_SYNCED_AT);
    btn.innerHTML = `<i class="ti ti-cloud-check"></i> Synced`;
    btn.title = last ? `Last synced ${new Date(last).toLocaleString()}` : "Synced";
    btn.classList.add("sync-active");
  } else if (currentUser) {
    btn.innerHTML = `<i class="ti ti-lock"></i> Unlock`;
    btn.classList.remove("sync-active");
  } else {
    btn.innerHTML = `<i class="ti ti-cloud-off"></i> Sync`;
    btn.classList.remove("sync-active");
  }
}

async function handleSyncButtonClick() {
  if (currentUser && encryptionKey) {
    if (confirm("Signed in as " + currentUser.email + ". Sign out of sync?")) {
      await signOutSync();
    }
    return;
  }
  if (currentUser && !encryptionKey) {
    await pullFromCloud();
    return;
  }
  const email = prompt("Enter your email to sync NutriWise across devices:");
  if (!email) return;
  const error = await sendMagicLink(email);
  if (error) alert("Couldn't send link: " + error.message);
  else alert("Check your email for a sign-in link, then come back to this tab.");
}

function injectSyncButton() {
  const header = document.querySelector("header");
  if (!header || document.getElementById("sync-status-btn")) return;
  const btn = document.createElement("button");
  btn.id = "sync-status-btn";
  btn.className = "sync-btn";
  btn.innerHTML = `<i class="ti ti-cloud-off"></i> Sync`;
  btn.onclick = handleSyncButtonClick;
  header.appendChild(btn);

  const style = document.createElement("style");
  style.textContent = `
    .sync-btn {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 999px;
      border: 1px solid #ddd;
      background: #fff;
      font-size: 0.85rem;
      cursor: pointer;
      color: #555;
    }
    .sync-btn.sync-active { border-color: #1D9E75; color: #1D9E75; }
  `;
  document.head.appendChild(style);
}

// ── Init ─────────────────────────────────────────────────────────────────────

(async function initSync() {
  injectSyncButton();

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session) {
      currentUser = session.user;
      await pullFromCloud(); // will also prompt for passphrase if needed
      updateSyncUI();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      encryptionKey = null;
      updateSyncUI();
    }
  });

  const session = await getSession();
  if (session) {
    currentUser = session.user;
    updateSyncUI();
    // Don't auto-prompt for passphrase on every page load — wait for the
    // user to tap "Unlock" so they're not interrupted by a prompt() on open.
  }
})();
