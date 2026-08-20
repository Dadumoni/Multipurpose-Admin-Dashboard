/**
 * Thin API wrapper — centralises all fetch calls.
 */
const API = (() => {
  const BASE = '/api';

  async function req(method, path, body, isForm = false) {
    const opts = {
      method,
      headers: isForm ? {} : { 'Content-Type': 'application/json' },
      body: body
        ? (isForm ? body : JSON.stringify(body))
        : undefined,
    };
    const r = await fetch(BASE + path, opts);
    if (!r.ok) {
      const msg = await r.text();
      throw new Error(`${r.status}: ${msg}`);
    }
    return r.json();
  }

  return {
    // ── Overview ──────────────────────────────────────────────────
    getStats:       () => req('GET', '/stats'),
    getScanHistory: (limit = 20) => req('GET', `/monitor/history?limit=${limit}`),

    // ── Videos ────────────────────────────────────────────────────
    listVideos: (page, perPage, search, type) => {
      const q = new URLSearchParams({ page, per_page: perPage, search, type });
      return req('GET', `/videos?${q}`);
    },
    getVideo:        (id)       => req('GET',    `/videos/${id}`),
    updateVideo:     (id, data) => req('PATCH',  `/videos/${id}`, data),
    deleteVideo:     (id)       => req('DELETE', `/videos/${id}`),
    bulkDelete:      (ids)      => req('POST',   '/videos/bulk-delete', { ids }),
    uploadThumbnail: (id, fd)   => req('POST',   `/videos/${id}/thumbnail`, fd, true),

    // ── Scraper ───────────────────────────────────────────────────
    startScrape:   (url)    => req('POST', '/scrape/start',          { url }),
    scrapeStatus:  (jobId)  => req('GET',  `/scrape/status/${jobId}`),
    activeScrapes: ()       => req('GET',  '/scrape/active'),
    pauseScrape:   (jobId)  => req('POST', `/scrape/pause/${jobId}`),
    resumeScrape:  (jobId)  => req('POST', `/scrape/resume/${jobId}`),
    cancelScrape:  (jobId)  => req('POST', `/scrape/cancel/${jobId}`),

    // ── Site settings ─────────────────────────────────────────────
    getScrapeSettings:  (url)  => req('GET',  `/scrape/settings?url=${encodeURIComponent(url)}`),
    saveScrapeSettings: (data) => req('POST', '/scrape/settings', data),

    // ── Monitor ───────────────────────────────────────────────────
    listSites:   ()      => req('GET',    '/monitor/sites'),
    scanNow:     (url)   => req('POST',   '/monitor/scan-now', { url }),
    scanHistory: (limit = 50) => req('GET', `/monitor/history?limit=${limit}`),
    removeSite:  (url)   => req('DELETE', '/monitor/sites', { url }),

    // ── Thumbnail ─────────────────────────────────────────────────
    deleteThumbnail: (id, which = 'original') =>
      req('DELETE', `/videos/${id}/thumbnail?which=${which}`),

    // ── Utils ─────────────────────────────────────────────────────
    newSlug:   (title = '') => req('GET', `/utils/slug?title=${encodeURIComponent(title)}`),
    checkSlug: (slug)       => req('GET', `/videos/check-slug?slug=${encodeURIComponent(slug)}`),

    // ── Tracking ──────────────────────────────────────────────────
    trackVisit: () => req('POST', '/track/visit').catch(() => {}),
  };
})();
