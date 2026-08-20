/* ────────────────────────────────────────────────────────────────────────────
   App shell — routing, modal management, shared utilities
   ──────────────────────────────────────────────────────────────────────────── */

// ── Shared utilities (used by page modules) ──────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('open');
  // Stop video playback when preview closes
  if (id === 'previewModal') {
    const player = document.getElementById('previewPlayer');
    player.pause();
    player.src = '';
  }
}

// ── Modal close handlers ─────────────────────────────────────────────────────

document.querySelectorAll('.modal-close, [data-modal]').forEach(el => {
  el.addEventListener('click', () => {
    const id = el.dataset.modal || el.closest('.modal-overlay')?.id;
    if (id) closeModal(id);
  });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ── Router ───────────────────────────────────────────────────────────────────

const pages = {
  overview: { el: 'page-overview', title: 'Overview',       module: OverviewPage },
  links:    { el: 'page-links',    title: 'Scraped Links',  module: LinksPage    },
  scraper:  { el: 'page-scraper',  title: 'Scrapper',       module: ScraperPage  },
  monitor:  { el: 'page-monitor',  title: 'Site Monitoring', module: MonitorPage  },
};

let currentPage = null;
let initiated   = new Set();

function navigate(pageId) {
  if (!pages[pageId]) return;
  const conf = pages[pageId];

  // Deactivate current
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Activate new
  document.getElementById(conf.el)?.classList.add('active');
  document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = conf.title;
  currentPage = pageId;

  // Init once, then refresh on each visit
  if (!initiated.has(pageId)) {
    conf.module.init();
    initiated.add(pageId);
  } else if (conf.module.load) {
    conf.module.load();
  }

  // Close sidebar on mobile after navigation
  document.getElementById('sidebar').classList.remove('open');
}

// Nav link clicks
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigate(el.dataset.page);
  });
});

// Refresh button
document.getElementById('refreshBtn').addEventListener('click', () => {
  if (currentPage) {
    const mod = pages[currentPage].module;
    if (mod.load) mod.load();
    else mod.init();
  }
});

// Mobile sidebar toggle
document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
  }
});

// ── Expose navigate globally (used by inline onclick handlers) ────────────────
window.navigate = navigate;

// ── Visitor tracking (fire-and-forget) ───────────────────────────────────────
API.trackVisit();

// ── Initial load ─────────────────────────────────────────────────────────────
navigate('overview');
