const MonitorPage = (() => {

  let tickTimer    = null;
  let refreshTimer = null;
  const countdownEls = new Map();  // url → { el, secs }

  // ── Helpers ──────────────────────────────────────────────────────

  function fmtTs(ts) {
    if (!ts) return '<span style="color:var(--text-3)">Never</span>';
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch { return ts; }
  }

  function renderCountdown(secs) {
    if (secs == null || secs < 0) return '<span style="color:var(--text-3)">—</span>';
    if (secs === 0) return '<span style="color:var(--success)">Scanning…</span>';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const hStr = h > 0 ? `${h}h ` : '';
    return `<span class="countdown">${hStr}${m}m ${String(s).padStart(2,'0')}s</span>`;
  }

  function tick() {
    for (const [url, state] of countdownEls) {
      if (state.secs > 0) state.secs--;
      state.el.innerHTML = renderCountdown(state.secs);
    }
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(tick, 1000);
  }

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  // ── Load ─────────────────────────────────────────────────────────

  async function load() {
    const tbody = document.getElementById('monitorBody');

    try {
      const sites = await API.listSites();
      countdownEls.clear();
      stopTick();

      if (!sites.length) {
        tbody.innerHTML = `
          <tr><td colspan="5" class="empty">
            No monitored sites yet.<br>
            <span style="font-size:12px">Start a scrape — sites are tracked automatically.</span>
          </td></tr>`;
        return;
      }

      tbody.innerHTML = sites.map(site => {
        const nextSecs = site.next_scan_in;
        return `
          <tr data-url="${esc(site.url)}">
            <td>
              <a href="${esc(site.url)}" target="_blank" rel="noopener"
                 style="color:var(--amber);text-decoration:none;word-break:break-all;font-size:13px">
                ${esc(site.url)}
              </a>
            </td>
            <td>${fmtTs(site.last_scanned_at)}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--text-3)">
              ${site.last_post_url
                ? `<a href="${esc(site.last_post_url)}" target="_blank" rel="noopener"
                      style="color:var(--text-3);text-decoration:none" title="${esc(site.last_post_url)}">
                     ${esc(site.last_post_url).slice(0, 50)}${site.last_post_url.length > 50 ? '…' : ''}
                   </a>`
                : '—'}
            </td>
            <td>
              <span class="cd-cell" data-url="${esc(site.url)}" data-secs="${nextSecs ?? -1}">
                ${renderCountdown(nextSecs)}
              </span>
            </td>
            <td>
              <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" data-action="scan" data-url="${esc(site.url)}">
                  ▶ Scan Now
                </button>
                <button class="btn btn-danger btn-sm" data-action="remove" data-url="${esc(site.url)}"
                        title="Remove from monitoring">✕</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Register countdown cells
      tbody.querySelectorAll('.cd-cell').forEach(el => {
        const secs = +el.dataset.secs;
        countdownEls.set(el.dataset.url, { el, secs: secs < 0 ? null : secs });
      });

      // Action buttons
      tbody.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const { action, url } = btn.dataset;
          if (action === 'scan')   scanNow(url);
          if (action === 'remove') removeSite(url);
        });
      });

      startTick();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">Error loading sites: ${esc(e.message)}</td></tr>`;
    }
  }

  // ── Actions ──────────────────────────────────────────────────────

  async function scanNow(url) {
    try {
      const resp = await API.scanNow(url);
      showToast(`Scan triggered for ${new URL(url).hostname}`, 'success');
      // Update countdown cell immediately to 0
      const state = countdownEls.get(url);
      if (state) { state.secs = 0; state.el.innerHTML = renderCountdown(0); }
      // Refresh full list after a moment
      setTimeout(load, 2000);
    } catch (e) {
      showToast('Failed to trigger scan: ' + e.message, 'error');
    }
  }

  async function removeSite(url) {
    const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    if (!confirm(`Remove "${host}" from monitoring? This won't delete scraped videos.`)) return;
    try {
      await API.removeSite(url);
      showToast(`Removed ${host}`, 'success');
      load();
    } catch (e) {
      showToast('Remove failed: ' + e.message, 'error');
    }
  }

  // ── Init ─────────────────────────────────────────────────────────

  function init() {
    load();
    // Auto-refresh site list every 60 seconds (keeps next_scan_in fresh)
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(load, 60_000);
  }

  return { init, load, scanNow };
})();
