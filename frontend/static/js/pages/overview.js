const OverviewPage = (() => {

  function fmt(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString();
  }

  function tsToAgo(ts) {
    if (!ts) return '—';
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  }

  async function loadStats() {
    try {
      const s = await API.getStats();
      document.getElementById('statTotal').textContent    = fmt(s.total_videos);
      document.getElementById('statMp4').textContent      = fmt(s.total_mp4);
      document.getElementById('statBlogger').textContent  = fmt(s.total_blogger);
      document.getElementById('statViews').textContent    = fmt(s.total_views);
      document.getElementById('statVisitors').textContent = fmt(s.total_visitors);
      document.getElementById('statSites').textContent    = fmt(s.monitoring_sites);

      document.getElementById('statusDot').className = 'status-dot ok';
      document.getElementById('statusText').textContent = 'Connected';
    } catch (e) {
      document.getElementById('statusDot').className = 'status-dot error';
      document.getElementById('statusText').textContent = 'API error';
    }
  }

  async function loadHistory() {
    const tbody = document.getElementById('historyBody');
    try {
      const rows = await API.getScanHistory(15);
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">No scan history yet.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td style="max-width:280px;word-break:break-all">${r.site_url || '—'}</td>
          <td>${fmt(r.total_posts)}</td>
          <td>${fmt(r.scraped)}</td>
          <td>${fmt(r.errors)}</td>
          <td>${tsToAgo(r.finished_at)}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">Failed to load history.</td></tr>';
    }
  }

  async function init() {
    await Promise.all([loadStats(), loadHistory()]);
  }

  return { init, loadStats };
})();
