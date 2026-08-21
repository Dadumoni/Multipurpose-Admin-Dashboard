const ScraperPage = (() => {

  let pollTimer    = null;
  let currentJobId = null;
  let jobHistory   = [];
  let isPaused     = false;

  // Current URL being tracked for settings load/save
  let _settingsUrl = '';

  // ── Scraping Controls state machine ──────────────────────────────
  // States: idle | running | paused | cancelled | done | error
  let _scrapeState = 'idle';

  function _setControlState(state) {
    _scrapeState = state;

    const ctrl       = document.getElementById('scrapeControls');
    const pauseBtn   = document.getElementById('pauseBtn');
    const resumeBtn  = document.getElementById('resumeBtn');
    const cancelBtn  = document.getElementById('cancelBtn');
    const dot        = document.getElementById('scrapeStatusDot');
    const label      = document.getElementById('scrapeStatusLabel');
    const scrapeBtn  = document.getElementById('scrapeBtn');
    const urlInput   = document.getElementById('scrapeUrl');

    if (state === 'idle' || state === 'done' || state === 'error') {
      // Hide controls panel entirely
      ctrl.style.display  = 'none';
      scrapeBtn.disabled  = false;
      urlInput.disabled   = false;
      scrapeBtn.innerHTML = '⬡ Scrap';
      return;
    }

    // Show controls panel for active states
    ctrl.style.display = '';

    // Scrap button disabled while active
    scrapeBtn.disabled  = true;
    urlInput.disabled   = true;
    scrapeBtn.innerHTML = '<span class="spin">⟳</span> Scraping…';

    if (state === 'running') {
      pauseBtn.style.display  = '';
      resumeBtn.style.display = 'none';
      cancelBtn.style.display = '';
      dot.className   = 'scrape-status-dot';
      label.textContent = 'Running';
    } else if (state === 'paused') {
      pauseBtn.style.display  = 'none';
      resumeBtn.style.display = '';
      cancelBtn.style.display = '';
      dot.className   = 'scrape-status-dot paused';
      label.textContent = 'Paused';
    } else if (state === 'cancelled') {
      pauseBtn.style.display  = 'none';
      resumeBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      dot.className   = 'scrape-status-dot cancelled';
      label.textContent = 'Cancelled';
      scrapeBtn.disabled  = false;
      urlInput.disabled   = false;
      scrapeBtn.innerHTML = '⬡ Scrap';
      // Auto-hide after 3s
      setTimeout(() => { ctrl.style.display = 'none'; }, 3000);
    }
  }

  // ── Pause / Resume / Cancel — public so HTML onclick can call them ─

  async function pauseScrape() {
    if (!currentJobId || _scrapeState !== 'running') return;
    try {
      await API.pauseScrape(currentJobId);
      isPaused = true;
      _setControlState('paused');
      showToast('Paused ⏸', 'success');
    } catch (e) {
      showToast('Pause failed: ' + e.message, 'error');
    }
  }

  async function resumeScrape() {
    if (!currentJobId || _scrapeState !== 'paused') return;
    try {
      await API.resumeScrape(currentJobId);
      isPaused = false;
      _setControlState('running');
      showToast('Resumed ▶', 'success');
    } catch (e) {
      showToast('Resume failed: ' + e.message, 'error');
    }
  }

  async function cancelScrape() {
    if (!currentJobId) return;
    if (!confirm('Cancel this scrape?')) return;
    try {
      await API.cancelScrape(currentJobId);
      showToast('Cancelled ✕', 'error');
      stopPolling();
      _setControlState('cancelled');
      updateProgress({ status: 'cancelled', scraped: 0, errors: 0 });
    } catch (e) {
      showToast('Could not cancel: ' + e.message, 'error');
    }
  }

  // ── Progress panel ────────────────────────────────────────────────

  function showProgress(visible) {
    document.getElementById('progressPanel').style.display = visible ? '' : 'none';
  }

  function updateProgress(job) {
    const total   = job.total    || 0;
    const current = job.progress || 0;
    const pct     = total ? Math.round((current / total) * 100) : 0;

    document.getElementById('progressBar').style.width    = pct + '%';
    document.getElementById('progressPct').textContent    = pct + '%';
    document.getElementById('progressSaved').textContent  = job.scraped  || 0;
    document.getElementById('progressErrors').textContent = job.errors   || 0;
    document.getElementById('progressUrl').textContent    = job.current_url || '—';

    let labelText = '';
    if (job.status === 'done') {
      labelText = `Finished — ${job.scraped || 0} videos saved from ${total} posts`;
    } else if (job.status === 'cancelled') {
      labelText = `Cancelled after ${current} of ${total} posts`;
    } else if (job.status === 'error') {
      labelText = `Error after ${current} posts`;
    } else if (job.status === 'paused') {
      labelText = total > 0 ? `Paused at post ${current} of ${total}` : 'Paused…';
    } else if (total > 0) {
      labelText = `Scraping post ${current} of ${total}`;
    } else {
      labelText = 'Discovering posts…';
    }
    document.getElementById('progressLabel').textContent = labelText;

    const statusEl = document.getElementById('progressStatus');
    if (job.status === 'done') {
      statusEl.innerHTML = `<span style="color:var(--success)">✓ Scrape complete. <a href="#links" style="color:var(--amber)" onclick="navigate('links')">View scraped links →</a></span>`;
    } else if (job.status === 'cancelled') {
      statusEl.innerHTML = `<span style="color:var(--text-3)">✕ Scrape cancelled.</span>`;
    } else if (job.status === 'error') {
      statusEl.innerHTML = `<span style="color:var(--danger)">✗ ${esc(job.error || 'Scrape failed')}</span>`;
    } else {
      statusEl.textContent = '';
    }
  }

  // ── Job History table ─────────────────────────────────────────────

  function renderJobHistory() {
    const el = document.getElementById('jobHistoryBody');
    if (!el) return;
    if (!jobHistory.length) {
      el.innerHTML = '<tr><td colspan="4" class="empty" style="padding:16px">No scrapes this session.</td></tr>';
      return;
    }
    el.innerHTML = jobHistory.slice().reverse().map(j => {
      const stateColor = {
        done:      'badge-mp4',
        error:     '',
        cancelled: '',
        paused:    'badge-blogger',
        running:   'badge-blogger',
      }[j.status] || '';
      const inlineStyle = (j.status === 'error' || j.status === 'cancelled')
        ? 'background:#3a1a1e;color:var(--danger)'
        : '';
      return `
        <tr>
          <td style="word-break:break-all;font-size:12px;color:var(--text-2)">${esc(j.url)}</td>
          <td>
            <span class="badge ${stateColor}" style="${inlineStyle}">
              ${j.status}
            </span>
          </td>
          <td style="font-family:var(--font-mono);font-size:12px">${j.scraped ?? '—'}</td>
          <td style="font-size:11px;color:var(--text-3)">${j.startedAt ? new Date(j.startedAt).toLocaleTimeString() : '—'}</td>
        </tr>`;
    }).join('');
  }

  // ── Site Settings panel ───────────────────────────────────────────

  async function loadSettings(url) {
    if (!url) return;
    _settingsUrl = url;
    try {
      const cfg = await API.getScrapeSettings(url);
      applySettings(cfg);
    } catch (e) {
      // No settings yet — keep defaults (toggle off)
    }
  }

  function applySettings(cfg) {
    const toggle      = document.getElementById('customModeToggle');
    const panel       = document.getElementById('customSettingsPanel');
    const videoInput  = document.getElementById('videoPatternInput');
    const posterCheck = document.getElementById('posterKeepDefault');
    const posterInput = document.getElementById('posterPatternInput');

    toggle.checked      = !!cfg.custom_mode;
    panel.style.display = cfg.custom_mode ? '' : 'none';
    videoInput.value    = cfg.video_pattern    || '';
    posterCheck.checked = cfg.poster_keep_default !== false;
    posterInput.value   = cfg.poster_pattern   || '';
    posterInput.style.display = posterCheck.checked ? 'none' : '';
  }

  async function saveSettings() {
    const url = document.getElementById('scrapeUrl').value.trim();
    if (!url) { showToast('Enter a URL first', 'error'); return; }
    try {
      await API.saveScrapeSettings(readSettingsFromUI(url));
      showToast('Settings saved ✓', 'success');
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  }

  function readSettingsFromUI(url) {
    return {
      site_url:            url,
      custom_mode:         document.getElementById('customModeToggle').checked,
      video_pattern:       document.getElementById('videoPatternInput').value.trim(),
      poster_keep_default: document.getElementById('posterKeepDefault').checked,
      poster_pattern:      document.getElementById('posterPatternInput').value.trim(),
    };
  }

  function bindSettingsUI() {
    const toggle      = document.getElementById('customModeToggle');
    const panel       = document.getElementById('customSettingsPanel');
    const posterCheck = document.getElementById('posterKeepDefault');
    const posterInput = document.getElementById('posterPatternInput');
    const urlInput    = document.getElementById('scrapeUrl');

    toggle.addEventListener('change', () => {
      panel.style.display = toggle.checked ? '' : 'none';
    });

    posterCheck.addEventListener('change', () => {
      posterInput.style.display = posterCheck.checked ? 'none' : '';
    });

    urlInput.addEventListener('blur', () => {
      const url = urlInput.value.trim();
      if (url) loadSettings(url);
    });

    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  }

  // ── Polling ───────────────────────────────────────────────────────

  function startPolling(jobId, url) {
    stopPolling();
    currentJobId = jobId;

    const jobEntry = { jobId, url, status: 'running', scraped: 0, startedAt: Date.now() };
    jobHistory.push(jobEntry);
    renderJobHistory();

    pollTimer = setInterval(async () => {
      try {
        const job = await API.scrapeStatus(jobId);
        updateProgress(job);

        jobEntry.status  = job.status;
        jobEntry.scraped = job.scraped;
        renderJobHistory();

        // Sync control state from server (handles race conditions)
        if (job.status === 'paused'  && _scrapeState !== 'paused')    _setControlState('paused');
        if (job.status === 'running' && _scrapeState === 'paused')    _setControlState('running');

        if (['done', 'error', 'cancelled'].includes(job.status)) {
          stopPolling();
          _setControlState(job.status === 'cancelled' ? 'cancelled' : 'idle');
          showProgress(job.status !== 'cancelled');
          OverviewPage.loadStats();
        }
      } catch (e) {
        console.warn('Poll error:', e.message);
      }
    }, 2000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── Start scrape ──────────────────────────────────────────────────

  async function startScrape() {
    const url = document.getElementById('scrapeUrl').value.trim();
    if (!url) { showToast('Enter a URL first', 'error'); return; }

    try { new URL(url); } catch {
      showToast('Invalid URL — include https://', 'error');
      return;
    }

    if (document.getElementById('customModeToggle').checked) {
      try {
        await API.saveScrapeSettings(readSettingsFromUI(url));
      } catch (e) {
        showToast('Could not save settings: ' + e.message, 'error');
        return;
      }
    }

    try {
      const resp = await API.startScrape(url);
      showToast('Scrape started ✓', 'success');
      _setControlState('running');
      showProgress(true);
      updateProgress({ status: 'running', progress: 0, total: 0, scraped: 0, errors: 0 });
      startPolling(resp.job_id, url);
    } catch (e) {
      showToast('Failed to start: ' + e.message, 'error');
    }
  }

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    document.getElementById('scrapeBtn').addEventListener('click', startScrape);
    document.getElementById('scrapeUrl').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) startScrape();
    });
    bindSettingsUI();
    renderJobHistory();
  }

  // Expose pause/resume/cancel for HTML onclick
  return { init, pauseScrape, resumeScrape, cancelScrape };

})();
