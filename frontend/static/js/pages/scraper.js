const ScraperPage = (() => {

  let pollTimer    = null;
  let currentJobId = null;
  let jobHistory   = [];
  let isPaused     = false;

  // Current URL being tracked for settings load/save
  let _settingsUrl = '';

  // ── UI helpers ────────────────────────────────────────────────────

  function setRunning(running) {
    const urlInput = document.getElementById('scrapeUrl');
    const btn      = document.getElementById('scrapeBtn');
    urlInput.disabled = running;
    btn.disabled      = running;
    btn.innerHTML     = running
      ? '<span class="spin">⟳</span> Scraping…'
      : '⬡ Scrap';

    // Show/hide control buttons
    const pauseBtn  = document.getElementById('pauseResumeBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    pauseBtn.style.display  = running ? '' : 'none';
    cancelBtn.style.display = running ? '' : 'none';

    if (!running) {
      isPaused = false;
      _setPauseIcon(false);
    }
  }

  function _setPauseIcon(paused) {
    const icon = document.getElementById('pauseResumeIcon');
    const btn  = document.getElementById('pauseResumeBtn');
    if (paused) {
      icon.className = 'fi fi-rr-play pause-resume-anim';
      btn.title = 'Resume';
    } else {
      icon.className = 'fi fi-rr-pause pause-resume-anim';
      btn.title = 'Pause';
    }
  }

  async function togglePause() {
    if (!currentJobId) return;
    try {
      if (isPaused) {
        await API.resumeScrape(currentJobId);
        isPaused = false;
        _setPauseIcon(false);
        showToast('Resumed ▶', 'success');
      } else {
        await API.pauseScrape(currentJobId);
        isPaused = true;
        _setPauseIcon(true);
        showToast('Paused ⏸', 'success');
      }
    } catch (e) {
      showToast('Could not pause/resume: ' + e.message, 'error');
    }
  }

  async function cancelScrape() {
    if (!currentJobId) return;
    if (!confirm('Cancel this scrape?')) return;
    try {
      await API.cancelScrape(currentJobId);
      showToast('Cancelled ✕', 'error');
      stopPolling();
      setRunning(false);
      updateProgress({ status: 'cancelled', scraped: 0, errors: 0 });
    } catch (e) {
      showToast('Could not cancel: ' + e.message, 'error');
    }
  }

  function showProgress(visible) {
    document.getElementById('progressPanel').style.display = visible ? '' : 'none';
  }

  function updateProgress(job) {
    const total   = job.total    || 0;
    const current = job.progress || 0;
    const pct     = total ? Math.round((current / total) * 100) : 0;

    document.getElementById('progressBar').style.width     = pct + '%';
    document.getElementById('progressPct').textContent     = pct + '%';
    document.getElementById('progressSaved').textContent   = job.scraped  || 0;
    document.getElementById('progressErrors').textContent  = job.errors   || 0;
    document.getElementById('progressUrl').textContent     = job.current_url || '—';

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

  function renderJobHistory() {
    const el = document.getElementById('jobHistoryBody');
    if (!el) return;
    if (!jobHistory.length) {
      el.innerHTML = '<tr><td colspan="4" class="empty" style="padding:16px">No scrapes this session.</td></tr>';
      return;
    }
    el.innerHTML = jobHistory.slice().reverse().map(j => `
      <tr>
        <td style="word-break:break-all;font-size:12px;color:var(--text-2)">${esc(j.url)}</td>
        <td>
          <span class="badge ${j.status === 'done' ? 'badge-mp4' : j.status === 'error' ? '' : 'badge-blogger'}"
                style="${j.status === 'error' ? 'background:#3a1a1e;color:var(--danger)' : ''}">
            ${j.status}
          </span>
        </td>
        <td style="font-family:var(--font-mono);font-size:12px">${j.scraped ?? '—'}</td>
        <td style="font-size:11px;color:var(--text-3)">${j.startedAt ? new Date(j.startedAt).toLocaleTimeString() : '—'}</td>
      </tr>
    `).join('');
  }

  // ── Site Settings panel ───────────────────────────────────────────

  /**
   * Load settings for the given URL and update the toggle + fields.
   * Called when URL input loses focus or on page init.
   */
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
    const posterRow   = document.getElementById('posterPatternRow');

    const isCustom = !!cfg.custom_mode;
    toggle.checked = isCustom;
    panel.style.display = isCustom ? '' : 'none';

    videoInput.value  = cfg.video_pattern      || '';
    posterCheck.checked = cfg.poster_keep_default !== false; // default true
    posterInput.value = cfg.poster_pattern     || '';
    posterRow.style.display = posterCheck.checked ? 'none' : '';
  }

  async function saveSettings() {
    const url = document.getElementById('scrapeUrl').value.trim();
    if (!url) { showToast('Enter a URL first', 'error'); return; }

    const cfg = readSettingsFromUI(url);
    try {
      await API.saveScrapeSettings(cfg);
      showToast('Settings saved ✓', 'success');
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  }

  function readSettingsFromUI(url) {
    return {
      site_url:           url,
      custom_mode:        document.getElementById('customModeToggle').checked,
      video_pattern:      document.getElementById('videoPatternInput').value.trim(),
      poster_keep_default: document.getElementById('posterKeepDefault').checked,
      poster_pattern:     document.getElementById('posterPatternInput').value.trim(),
    };
  }

  function bindSettingsUI() {
    const toggle      = document.getElementById('customModeToggle');
    const panel       = document.getElementById('customSettingsPanel');
    const posterCheck = document.getElementById('posterKeepDefault');
    const posterRow   = document.getElementById('posterPatternRow');
    const saveBtn     = document.getElementById('saveSettingsBtn');
    const urlInput    = document.getElementById('scrapeUrl');

    // Toggle shows/hides the custom settings panel
    toggle.addEventListener('change', () => {
      panel.style.display = toggle.checked ? '' : 'none';
    });

    // Poster keep-default checkbox shows/hides poster URL input
    posterCheck.addEventListener('change', () => {
      posterInput.style.display = posterCheck.checked ? 'none' : '';
    });

    // Load settings when URL input loses focus
    urlInput.addEventListener('blur', () => {
      const url = urlInput.value.trim();
      if (url) loadSettings(url);
    });

    // Save button
    saveBtn.addEventListener('click', saveSettings);
  }

  // ── Polling ──────────────────────────────────────────────────────

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

        // Sync paused state from server
        if (job.status === 'paused' && !isPaused) {
          isPaused = true;
          _setPauseIcon(true);
        } else if (job.status === 'running' && isPaused) {
          isPaused = false;
          _setPauseIcon(false);
        }

        if (['done', 'error', 'cancelled'].includes(job.status)) {
          stopPolling();
          setRunning(false);
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

  // ── Start scrape ─────────────────────────────────────────────────

  async function startScrape() {
    const url = document.getElementById('scrapeUrl').value.trim();
    if (!url) { showToast('Enter a URL first', 'error'); return; }

    try { new URL(url); } catch {
      showToast('Invalid URL — include https://', 'error');
      return;
    }

    // Auto-save settings before starting (so crawl picks them up)
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
      setRunning(true);
      showProgress(true);
      updateProgress({ status: 'running', progress: 0, total: 0, scraped: 0, errors: 0 });
      startPolling(resp.job_id, url);
    } catch (e) {
      showToast('Failed to start: ' + e.message, 'error');
    }
  }

  // ── Init ─────────────────────────────────────────────────────────

  function init() {
    document.getElementById('scrapeBtn').addEventListener('click', startScrape);
    document.getElementById('scrapeUrl').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) startScrape();
    });
    document.getElementById('pauseResumeBtn').addEventListener('click', togglePause);
    document.getElementById('cancelBtn').addEventListener('click', cancelScrape);
    bindSettingsUI();
    renderJobHistory();
  }

  return { init };
})();
