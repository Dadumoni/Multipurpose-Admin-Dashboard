const LinksPage = (() => {

  let currentPage = 1;
  let totalRows   = 0;
  const PER_PAGE  = 50;
  let selectedIds = new Set();
  let deleteTarget = null;

  // ── Render table ────────────────────────────────────────────────

  async function load() {
    const search = document.getElementById('searchInput').value.trim();
    const type   = document.getElementById('typeFilter').value;
    const tbody  = document.getElementById('linksBody');
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Loading…</td></tr>`;

    try {
      const data = await API.listVideos(currentPage, PER_PAGE, search, type);
      totalRows = data.total || 0;
      const rows = data.rows || [];

      selectedIds.clear();
      updateBulkUI();

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty">No videos found.</td></tr>`;
        renderPagination();
        return;
      }

      tbody.innerHTML = rows.map(v => `
        <tr data-id="${v.id}">
          <td class="col-check">
            <input type="checkbox" class="row-check" data-id="${v.id}" />
          </td>
          <td class="thumb-cell">
            ${(v.thumbnail_2 || v.thumbnail)
              ? `<img src="${esc(v.thumbnail_2 || v.thumbnail)}" loading="lazy"
                      onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb-placeholder',textContent:'▶'}))" />`
              : `<div class="thumb-placeholder">▶</div>`}
          </td>
          <td>
            <div class="title-cell">
              <div class="title">${esc(v.title)}</div>
              <div class="slug">${esc(v.slug)}</div>
            </div>
          </td>
          <td>
            <span class="badge badge-${v.type}">${v.type.toUpperCase()}</span>
          </td>
          <td class="col-actions">
            <button class="btn-icon" title="Preview" data-action="preview"
                    data-id="${v.id}" data-title="${esc(v.title)}"
                    data-link="${esc(v.video_link)}" data-type="${v.type}">▶</button>
            <button class="btn-icon" title="Edit" data-action="edit" data-id="${v.id}">✎</button>
            <button class="btn-icon" title="Delete" data-action="delete"
                    data-id="${v.id}" style="color:var(--danger)">✕</button>
          </td>
        </tr>
      `).join('');

      // Delegate action clicks
      tbody.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const { action, id, title, link, type } = btn.dataset;
          const numId = +id;
          if (action === 'preview') preview(numId, title, link, type);
          else if (action === 'edit') openEdit(numId);
          else if (action === 'delete') confirmDelete([numId], false);
        });
      });

      // Row checkboxes
      tbody.querySelectorAll('.row-check').forEach(cb => {
        cb.addEventListener('change', () => {
          const id = +cb.dataset.id;
          cb.checked ? selectedIds.add(id) : selectedIds.delete(id);
          updateBulkUI();
        });
      });

      renderPagination();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">Error: ${esc(e.message)}</td></tr>`;
    }
  }

  function renderPagination() {
    const totalPages = Math.ceil(totalRows / PER_PAGE) || 1;
    const el = document.getElementById('linksPagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    const maxButtons = 7;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end   = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);

    let html = '';
    if (currentPage > 1)
      html += `<button class="page-btn" data-p="${currentPage - 1}">‹</button>`;
    if (start > 1)
      html += `<button class="page-btn" data-p="1">1</button>${start > 2 ? '<span style="color:var(--text-3);padding:0 4px">…</span>' : ''}`;
    for (let p = start; p <= end; p++)
      html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-p="${p}">${p}</button>`;
    if (end < totalPages)
      html += `${end < totalPages - 1 ? '<span style="color:var(--text-3);padding:0 4px">…</span>' : ''}<button class="page-btn" data-p="${totalPages}">${totalPages}</button>`;
    if (currentPage < totalPages)
      html += `<button class="page-btn" data-p="${currentPage + 1}">›</button>`;

    el.innerHTML = html;
    el.querySelectorAll('[data-p]').forEach(btn => {
      btn.addEventListener('click', () => gotoPage(+btn.dataset.p));
    });
  }

  function gotoPage(p) { currentPage = p; load(); }

  function updateBulkUI() {
    const btn   = document.getElementById('bulkDeleteBtn');
    const count = document.getElementById('selectedCount');
    btn.disabled = selectedIds.size === 0;
    count.textContent = selectedIds.size ? `${selectedIds.size} selected` : '';
  }

  // ── Preview modal ────────────────────────────────────────────────

  function preview(id, title, videoLink, type) {
    document.getElementById('previewTitle').textContent = title;
    const player = document.getElementById('previewPlayer');

    // For Blogger links we can't embed directly — show a link instead
    if (type === 'blogger') {
      player.removeAttribute('src');
      player.style.display = 'none';
      let msgEl = document.getElementById('previewBloggerMsg');
      if (!msgEl) {
        msgEl = document.createElement('div');
        msgEl.id = 'previewBloggerMsg';
        msgEl.style.cssText = 'padding:24px;text-align:center;color:var(--text-2);font-size:13px';
        player.parentNode.insertBefore(msgEl, player.nextSibling);
      }
      msgEl.innerHTML = `
        <p style="margin-bottom:12px">Blogger native player links cannot be embedded directly.</p>
        <a href="${esc(videoLink)}" target="_blank" rel="noopener"
           style="color:var(--amber);text-decoration:none;font-family:var(--font-mono);font-size:12px;word-break:break-all">
          ${esc(videoLink)}
        </a>`;
      msgEl.style.display = '';
    } else {
      player.style.display = '';
      player.src = videoLink;
      const msgEl = document.getElementById('previewBloggerMsg');
      if (msgEl) msgEl.style.display = 'none';
    }

    openModal('previewModal');
  }

  // ── Edit modal ───────────────────────────────────────────────────

  async function openEdit(id) {
    try {
      const v = await API.getVideo(id);
      document.getElementById('editId').value        = v.id;
      document.getElementById('editTitle').value     = v.title || '';
      document.getElementById('editSlug').value      = v.slug  || '';
      document.getElementById('editVideoLink').value = v.video_link || '';
      document.getElementById('editType').value      = v.type || 'mp4';

      const thumbSrc = v.thumbnail_2 || v.thumbnail || '';
      const thumbImg  = document.getElementById('editThumbPreview');
      thumbImg.src    = thumbSrc;
      thumbImg.style.display = thumbSrc ? '' : 'none';

      // Show which thumbnail is active
      const label = document.getElementById('editThumbLabel');
      if (label) {
        if (v.thumbnail_2) label.textContent = 'Active: thumbnail_2 (R2 override)';
        else if (v.thumbnail) label.textContent = 'Active: thumbnail (original R2)';
        else label.textContent = 'No thumbnail set';
      }

      // Reset file input
      document.getElementById('editThumbFile').value = '';

      openModal('editModal');
    } catch (e) {
      showToast('Failed to load video: ' + e.message, 'error');
    }
  }

  async function saveEdit() {
    const id = +document.getElementById('editId').value;
    const fileInput = document.getElementById('editThumbFile');
    const delOrig   = document.getElementById('deleteOriginalCb')?.checked;

    // Upload new thumbnail if chosen
    if (fileInput.files.length) {
      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      if (delOrig) fd.append('delete_original', 'true');
      try {
        await API.uploadThumbnail(id, fd);
        showToast('Thumbnail uploaded to R2 as thumbnail_2', 'success');
      } catch (e) {
        showToast('Thumbnail upload failed: ' + e.message, 'error');
        return;
      }
    }

    const data = {
      title:      document.getElementById('editTitle').value.trim(),
      slug:       document.getElementById('editSlug').value.trim(),
      video_link: document.getElementById('editVideoLink').value.trim(),
      type:       document.getElementById('editType').value,
    };

    if (!data.title || !data.slug || !data.video_link) {
      showToast('Title, slug and video link are required', 'error');
      return;
    }

    try {
      await API.updateVideo(id, data);
      showToast('Saved ✓', 'success');
      closeModal('editModal');
      load();
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  }

  async function deleteOriginalThumbnail() {
    const id = +document.getElementById('editId').value;
    if (!id) return;
    if (!confirm('Delete the original thumbnail from R2? This cannot be undone.')) return;
    try {
      await API.deleteThumbnail(id, 'original');
      showToast('Original thumbnail deleted', 'success');
      document.getElementById('editThumbPreview').src = '';
      document.getElementById('editThumbPreview').style.display = 'none';
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  }

  async function regenSlug() {
    const title = document.getElementById('editTitle').value.trim();
    try {
      const r = await API.newSlug(title);
      document.getElementById('editSlug').value = r.slug;
    } catch (e) {
      showToast('Slug generation failed', 'error');
    }
  }

  // ── Delete ───────────────────────────────────────────────────────

  function confirmDelete(ids, isBulk) {
    deleteTarget = { ids, isBulk };
    const msg = isBulk
      ? `Delete ${ids.length} selected videos? This cannot be undone.`
      : 'Delete this video? This cannot be undone.';
    document.getElementById('deleteMsg').textContent = msg;
    openModal('deleteModal');
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.isBulk) {
        await API.bulkDelete(deleteTarget.ids);
        showToast(`Deleted ${deleteTarget.ids.length} videos`, 'success');
      } else {
        await API.deleteVideo(deleteTarget.ids[0]);
        showToast('Deleted', 'success');
      }
      selectedIds.clear();
      updateBulkUI();
      document.getElementById('selectAll').checked = false;
      closeModal('deleteModal');
      load();
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
    deleteTarget = null;
  }

  // ── Init ─────────────────────────────────────────────────────────

  function init() {
    // Select all
    document.getElementById('selectAll').addEventListener('change', function () {
      document.querySelectorAll('.row-check').forEach(cb => {
        cb.checked = this.checked;
        const id = +cb.dataset.id;
        this.checked ? selectedIds.add(id) : selectedIds.delete(id);
      });
      updateBulkUI();
    });

    // Search & filter
    document.getElementById('searchInput').addEventListener('input', debounce(() => {
      currentPage = 1;
      load();
    }, 350));

    document.getElementById('typeFilter').addEventListener('change', () => {
      currentPage = 1;
      load();
    });

    // Bulk delete
    document.getElementById('bulkDeleteBtn').addEventListener('click', () => {
      if (selectedIds.size) confirmDelete([...selectedIds], true);
    });

    // Edit modal actions
    document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
    document.getElementById('deleteThumbBtn').addEventListener('click', deleteOriginalThumbnail);

    // Regen slug button (may not exist yet — created below via HTML patch)
    const regenBtn = document.getElementById('regenSlugBtn');
    if (regenBtn) regenBtn.addEventListener('click', regenSlug);

    // Confirm delete
    document.getElementById('confirmDeleteBtn').addEventListener('click', doDelete);

    load();
  }

  return { init, load, gotoPage, preview, openEdit, confirmDelete };
})();
