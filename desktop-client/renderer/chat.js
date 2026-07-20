/* MPL Logistik Desktop Client — VTC Chat
 * Isolated from telemetry/sync logic. Only touches its own DOM nodes and
 * talks to the /api/public/messages/* endpoints using the VTC api key.
 */
(function () {
  const $ = (id) => document.getElementById(id);

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem("mpl.settings")) || {};
    } catch {
      return {};
    }
  }

  const chat = {
    messages: [],
    ids: new Set(),
    lastCreatedAt: null,
    pollTimer: null,
    inflight: false,
    active: false,
  };

  function apiBase() {
    const s = getSettings();
    return (s.apiUrl || "https://vtc-truck-hub.de").replace(/\/+$/, "");
  }

  function authHeaders() {
    const s = getSettings();
    return {
      "content-type": "application/json",
      Authorization: `Bearer ${s.apiKey || ""}`,
    };
  }

  function driverParams() {
    const s = getSettings();
    const p = new URLSearchParams();
    if (s.userId) p.set("driver_user_id", s.userId);
    else if (s.steamId) p.set("driver_steam_id", s.steamId);
    return p;
  }

  function driverBody() {
    const s = getSettings();
    if (s.userId) return { driver_user_id: s.userId };
    if (s.steamId) return { driver_steam_id: s.steamId };
    return {};
  }

  function setStatus(text, isError = false) {
    const el = $("chatStatus");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "#F87171" : "";
  }

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function myUserId() {
    return (getSettings().userId || "").toLowerCase();
  }

  function renderMessages() {
    const log = $("chatLog");
    if (!log) return;
    if (chat.messages.length === 0) {
      log.innerHTML = '<div class="chat-empty muted small">Noch keine Nachrichten. Schreibe die erste!</div>';
      return;
    }
    const mine = myUserId();
    const html = chat.messages
      .map((m) => {
        const isMine = (m.sender_id || "").toLowerCase() === mine;
        const cls = "chat-msg" + (isMine ? " mine" : "");
        const name = escapeHtml(m.sender_name || "Fahrer");
        const body = escapeHtml(m.message || "");
        return `<div class="${cls}">
          <div class="chat-meta"><span>${name}</span><span>${fmtTime(m.created_at)}</span></div>
          <div class="chat-bubble">${body}</div>
        </div>`;
      })
      .join("");
    log.innerHTML = html;
    // Auto-scroll to bottom
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function appendMessages(list) {
    let added = 0;
    for (const m of list) {
      if (!m || !m.id || chat.ids.has(m.id)) continue;
      chat.ids.add(m.id);
      chat.messages.push(m);
      if (!chat.lastCreatedAt || m.created_at > chat.lastCreatedAt) {
        chat.lastCreatedAt = m.created_at;
      }
      added++;
    }
    if (added > 0) {
      chat.messages.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      // Cap in-memory list
      if (chat.messages.length > 300) {
        const drop = chat.messages.length - 300;
        chat.messages.splice(0, drop);
      }
      renderMessages();
    }
    return added;
  }

  async function fetchMessages() {
    if (chat.inflight) return;
    const s = getSettings();
    if (!s.apiKey || (!s.userId && !s.steamId)) {
      setStatus("Bitte API-Schlüssel und Fahrer-ID in den Einstellungen setzen.", true);
      return;
    }
    chat.inflight = true;
    try {
      const params = driverParams();
      if (chat.lastCreatedAt) params.set("since", chat.lastCreatedAt);
      params.set("limit", chat.lastCreatedAt ? "100" : "50");
      const res = await fetch(`${apiBase()}/api/public/messages/list?${params.toString()}`, {
        method: "GET",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus(`Fehler beim Laden: ${err.error || res.status}`, true);
        return;
      }
      const data = await res.json();
      appendMessages(data.messages || []);
      setStatus("");
    } catch (e) {
      setStatus(`Verbindungsfehler: ${e.message}`, true);
    } finally {
      chat.inflight = false;
    }
  }

  async function sendMessage(text) {
    const body = { ...driverBody(), message: text };
    const res = await fetch(`${apiBase()}/api/public/messages/send`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.message) appendMessages([data.message]);
  }

  function startPolling() {
    stopPolling();
    fetchMessages();
    chat.pollTimer = setInterval(fetchMessages, 4000);
  }

  function stopPolling() {
    if (chat.pollTimer) {
      clearInterval(chat.pollTimer);
      chat.pollTimer = null;
    }
  }

  function onTabActivated() {
    if (chat.active) return;
    chat.active = true;
    startPolling();
  }

  function onTabDeactivated() {
    if (!chat.active) return;
    chat.active = false;
    stopPolling();
  }

  function initTabHooks() {
    // Attach listeners to nav buttons without replacing the existing renderer.js handlers.
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'chat') onTabActivated();
        else onTabDeactivated();
      });
    });
    // If the chat panel is already visible at load (unlikely), activate.
    const panel = document.querySelector('.panel[data-panel="chat"]');
    if (panel && panel.classList.contains('active')) onTabActivated();
  }

  function initComposer() {
    const form = $("chatForm");
    const input = $("chatInput");
    const btn = $("chatSend");
    if (!form || !input || !btn) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = (input.value || "").trim();
      if (!text) return;
      btn.disabled = true;
      input.disabled = true;
      setStatus("Sende…");
      try {
        await sendMessage(text);
        input.value = "";
        setStatus("");
      } catch (err) {
        setStatus(`Senden fehlgeschlagen: ${err.message}`, true);
      } finally {
        btn.disabled = false;
        input.disabled = false;
        input.focus();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTabHooks();
    initComposer();
  });
})();
