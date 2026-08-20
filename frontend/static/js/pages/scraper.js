const ScraperPage = (() => {

  let pollTimer    = null;
  let currentJobId = null;
  let jobHistory   = [];    // in-session history

  // ── UI state ─────────────────────────────────────────────────────

  function setRunning(running) {
    const urlInput = document.getElementById('scrapeUrl');
    const btn      = document.getElementById('scrapeBtn');
    urlInput.disabled = running;
    btn.disabled      = running;
    btn.innerHTML     = running
      ? '<span class="spin">⟳</span> Scraping…'
      : '⬡ Scrap';
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
    } else if (job.status === 'error') {
      labelText = `Error after ${current} posts`;
    } else if (total > 0) {
      labelText = `Scraping post ${current} of ${total}`;
    } else {
      labelText = 'Discovering posts…';
    }
    document.getElementById('progressLabel').textContent = labelText;

    const statusEl = document.getElementById('progressStatus');
    if (job.status === 'done') {
      statusEl.innerHTML = `<span style="color:var(--success)">✓ Scrape complete. <a href="#links" style="color:var(--amber)" onclick="navigate('links')">View scraped links →</a></span>`;
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

  // ── Polling ──────────────────────────────────────────────────────

  function startPolling(jobId, url) {
    stopPolling();
    currentJobId = jobId;

    // Add to history
    const jobEntry = { jobId, url, status: 'running', scraped: 0, startedAt: Date.now() };
    jobHistory.push(jobEntry);
    renderJobHistory();

    pollTimer = setInterval(async () => {
      try {
        const job = await API.scrapeStatus(jobId);
        updateProgress(job);

        // Sync history entry
        jobEntry.status  = job.status;
        jobEntry.scraped = job.scraped;
        renderJobHistory();

        if (job.status === 'done' || job.status === 'error') {
          stopPolling();
          setRunning(false);
          OverviewPage.loadStats();
        }
      } catch (e) {
        // Network hiccup — keep polling
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

    // Basic URL validation
    try { new URL(url); } catch {
      showToast('Invalid URL — include https://', 'error');
      return;
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
    renderJobHistory();
  }

  return { init };
})();
