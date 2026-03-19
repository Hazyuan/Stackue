(() => {
  'use strict';

  // ===== State =====
  let items = [];
  let doneItems = [];
  let snapshots = [];
  let workspaces = [];    // { id, name, note, items: [...], createdAt }
  let archivedSnapshots = []; // { id, date, label, snapshots: [...] }
  let tags = [];
  let settings = {
    autoSnapshot: true,
    snapshotInterval: 5,
  };
  let currentView = 'active';
  let searchQuery = '';
  let filterTagId = null;
  let selectedTagIds = [];
  let checkedIds = new Set(); // multi-select for workspace creation

  // ===== DOM Refs =====
  const viewTabs = document.querySelectorAll('.view-tab');
  const noteInput = document.getElementById('note-input');
  const pushBtn = document.getElementById('push-btn');
  const pushCloseBtn = document.getElementById('push-close-btn');
  const popFirstBtn = document.getElementById('pop-first-btn');
  const popLastBtn = document.getElementById('pop-last-btn');
  const bottomBar = document.getElementById('bottom-bar');
  const listArea = document.getElementById('list-area');
  const activeCount = document.getElementById('active-count');
  const doneCount = document.getElementById('done-count');
  const snapshotCount = document.getElementById('snapshot-count');
  const workspaceCount = document.getElementById('workspace-count');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const snapshotBtn = document.getElementById('snapshot-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const autoSnapshotToggle = document.getElementById('auto-snapshot-toggle');
  const snapshotIntervalSelect = document.getElementById('snapshot-interval');
  const snapshotIntervalRow = document.getElementById('snapshot-interval-row');
  const newTagInput = document.getElementById('new-tag-input');
  const newTagColor = document.getElementById('new-tag-color');
  const addTagBtn = document.getElementById('add-tag-btn');
  const tagListEl = document.getElementById('tag-list');
  const tagFilterEl = document.getElementById('tag-filter');
  const inputTagsEl = document.getElementById('input-tags');
  const inputPriority = document.getElementById('input-priority');
  const pushPosition = document.getElementById('push-position');
  const selectionBar = document.getElementById('selection-bar');
  const selectionCountEl = document.getElementById('selection-count');
  const createWorkspaceBtn = document.getElementById('create-workspace-btn');
  const cancelSelectionBtn = document.getElementById('cancel-selection-btn');
  const wsDialog = document.getElementById('ws-dialog');
  const wsNameInput = document.getElementById('ws-name-input');
  const wsNoteInput = document.getElementById('ws-note-input');
  const wsConfirmBtn = document.getElementById('ws-confirm-btn');
  const wsCancelBtn = document.getElementById('ws-cancel-btn');
  const archiveCount = document.getElementById('archive-count');

  // ===== Init =====
  async function init() {
    const data = await chrome.storage.local.get([
      'items', 'doneItems', 'snapshots', 'workspaces', 'archivedSnapshots', 'tags', 'settings'
    ]);
    items = data.items || [];
    doneItems = data.doneItems || [];
    snapshots = data.snapshots || [];
    workspaces = data.workspaces || [];
    archivedSnapshots = data.archivedSnapshots || [];
    tags = data.tags || [];
    if (data.settings) settings = { ...settings, ...data.settings };

    autoSnapshotToggle.checked = settings.autoSnapshot;
    snapshotIntervalSelect.value = settings.snapshotInterval;
    snapshotIntervalRow.style.display = settings.autoSnapshot ? '' : 'none';

    updateCounts();
    renderTags();
    renderTagFilter();
    renderInputTags();
    render();
    setupAutoSnapshot();
  }

  // ===== Storage =====
  async function save() {
    await chrome.storage.local.set({ items, doneItems, snapshots, workspaces, archivedSnapshots, tags, settings });
    updateCounts();
  }

  function updateCounts() {
    activeCount.textContent = items.length;
    doneCount.textContent = doneItems.length;
    snapshotCount.textContent = snapshots.length;
    workspaceCount.textContent = workspaces.length;
    archiveCount.textContent = archivedSnapshots.reduce((s, g) => s + g.snapshots.length, 0);
  }

  // ===== Settings =====
  settingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? '' : 'none';
  });

  autoSnapshotToggle.addEventListener('change', async () => {
    settings.autoSnapshot = autoSnapshotToggle.checked;
    snapshotIntervalRow.style.display = settings.autoSnapshot ? '' : 'none';
    await save();
    setupAutoSnapshot();
  });

  snapshotIntervalSelect.addEventListener('change', async () => {
    settings.snapshotInterval = parseInt(snapshotIntervalSelect.value);
    await save();
  });

  // ===== Tags Management =====
  addTagBtn.addEventListener('click', addNewTag);
  newTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addNewTag();
  });

  async function addNewTag() {
    const name = newTagInput.value.trim();
    if (!name) return;
    if (tags.some(t => t.name === name)) return showToast('标签已存在');
    tags.push({ id: genId(), name, color: newTagColor.value });
    newTagInput.value = '';
    await save();
    renderTags();
    renderTagFilter();
    renderInputTags();
  }

  async function deleteTag(tagId) {
    tags = tags.filter(t => t.id !== tagId);
    // Remove from items
    items.forEach(i => { if (i.tags) i.tags = i.tags.filter(t => t !== tagId); });
    doneItems.forEach(i => { if (i.tags) i.tags = i.tags.filter(t => t !== tagId); });
    selectedTagIds = selectedTagIds.filter(t => t !== tagId);
    if (filterTagId === tagId) filterTagId = null;
    await save();
    renderTags();
    renderTagFilter();
    renderInputTags();
    render();
  }

  function renderTags() {
    tagListEl.innerHTML = '';
    tags.forEach(tag => {
      const el = document.createElement('span');
      el.className = 'tag';
      el.style.background = tag.color + '22';
      el.style.color = tag.color;
      el.innerHTML = `${escHtml(tag.name)}<span class="tag-remove" data-tag-del="${tag.id}">&times;</span>`;
      tagListEl.appendChild(el);
    });
    tagListEl.querySelectorAll('[data-tag-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTag(btn.dataset.tagDel);
      });
    });
  }

  function renderTagFilter() {
    if (tags.length === 0) {
      tagFilterEl.style.display = 'none';
      return;
    }
    tagFilterEl.style.display = '';
    tagFilterEl.innerHTML = '<span class="tag-filter-label">筛选:</span>';
    const allBtn = document.createElement('span');
    allBtn.className = `tag${!filterTagId ? ' active' : ''}`;
    allBtn.style.background = 'rgba(255,255,255,0.08)';
    allBtn.style.color = 'var(--text-secondary)';
    allBtn.textContent = '全部';
    allBtn.addEventListener('click', () => { filterTagId = null; renderTagFilter(); render(); });
    tagFilterEl.appendChild(allBtn);

    tags.forEach(tag => {
      const el = document.createElement('span');
      el.className = `tag${filterTagId === tag.id ? ' active' : ''}`;
      el.style.background = tag.color + '22';
      el.style.color = tag.color;
      el.textContent = tag.name;
      el.addEventListener('click', () => {
        filterTagId = filterTagId === tag.id ? null : tag.id;
        renderTagFilter();
        render();
      });
      tagFilterEl.appendChild(el);
    });
  }

  function renderInputTags() {
    inputTagsEl.innerHTML = '';
    if (tags.length === 0) return;
    tags.forEach(tag => {
      const el = document.createElement('span');
      el.className = `tag${selectedTagIds.includes(tag.id) ? ' selected' : ''}`;
      el.style.background = selectedTagIds.includes(tag.id) ? tag.color + '33' : tag.color + '11';
      el.style.color = tag.color;
      el.style.borderColor = selectedTagIds.includes(tag.id) ? tag.color : 'transparent';
      el.textContent = tag.name;
      el.addEventListener('click', () => {
        if (selectedTagIds.includes(tag.id)) {
          selectedTagIds = selectedTagIds.filter(t => t !== tag.id);
        } else {
          selectedTagIds.push(tag.id);
        }
        renderInputTags();
      });
      inputTagsEl.appendChild(el);
    });
  }

  function getTagsHtml(tagIds) {
    if (!tagIds || tagIds.length === 0) return '';
    return tagIds.map(id => {
      const tag = tags.find(t => t.id === id);
      if (!tag) return '';
      return `<span class="tag" style="background:${tag.color}22;color:${tag.color}">${escHtml(tag.name)}</span>`;
    }).join('');
  }

  // ===== View Switching =====
  viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      currentView = tab.dataset.view;
      viewTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      render();
    });
  });

  // ===== Search =====
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    searchClear.style.display = searchQuery ? '' : 'none';
    render();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.style.display = 'none';
    render();
  });

  // ===== URL Subtitle =====
  function getUrlSubtitle(url) {
    try {
      const u = new URL(url);
      let path = u.pathname;
      // Remove trailing slash
      if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
      // For root paths, show host only
      if (path === '/' || path === '') return u.host;
      // Show host + meaningful path
      const display = u.host + path;
      // Add hash/search if meaningful
      const extra = u.hash || (u.search ? u.search.slice(0, 30) : '');
      return display + (extra ? extra : '');
    } catch {
      return url;
    }
  }

  // ===== Extract Page Info via Content Script =====
  async function extractPageInfo(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-extract.js'],
      });
      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    } catch (e) {
      // Can't inject into chrome://, edge://, etc.
    }
    return null;
  }

  function buildSmartTitle(tab, pageInfo) {
    const baseTitle = tab.title || tab.url;
    if (!pageInfo) return { title: baseTitle, pageContext: '' };

    // Pick the most descriptive title
    const candidates = [
      pageInfo.ogTitle,
      pageInfo.h1,
      pageInfo.h2 || '',
      pageInfo.docTitle,
    ].filter(Boolean);

    // Find one that's different and more descriptive than tab.title
    let bestTitle = baseTitle;
    for (const c of candidates) {
      if (c.length > bestTitle.length && c !== baseTitle) {
        bestTitle = c;
        break;
      }
    }

    // Build context snippet from first content or description
    const context = pageInfo.firstContent
      || pageInfo.ogDescription
      || pageInfo.metaDescription
      || '';

    return {
      title: bestTitle,
      pageContext: context.slice(0, 200),
    };
  }

  // ===== Push =====
  async function pushCurrentTab(closeAfter = false) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return showToast('无法获取当前标签页');

      // Extract page info
      const pageInfo = await extractPageInfo(tab.id);
      const smart = buildSmartTitle(tab, pageInfo);

      const item = {
        id: genId(),
        url: tab.url,
        title: smart.title,
        customTitle: '',
        pageContext: smart.pageContext,
        favicon: tab.favIconUrl || '',
        note: noteInput.value.trim(),
        tags: [...selectedTagIds],
        priority: inputPriority.value || '',
        timestamp: Date.now(),
      };

      const pos = pushPosition.value;
      if (pos === 'last') {
        items.push(item);
      } else {
        items.unshift(item);
      }

      noteInput.value = '';
      inputPriority.value = '';
      await save();

      if (currentView !== 'active') {
        currentView = 'active';
        viewTabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'active'));
      }
      render();

      if (closeAfter) {
        await chrome.tabs.remove(tab.id);
        showToast('已推入并关闭标签页');
      } else {
        showToast('已推入');
      }
    } catch (e) {
      showToast('操作失败: ' + e.message);
    }
  }

  pushBtn.addEventListener('click', () => pushCurrentTab(false));
  pushCloseBtn.addEventListener('click', () => pushCurrentTab(true));

  // ===== Pop =====
  async function popItem(position) {
    if (items.length === 0) return;
    const item = position === 'first' ? items.shift() : items.pop();
    item.completedAt = Date.now();
    doneItems.unshift(item);
    await save();
    render();
    await smartNavigate(item.url);
    showToast(position === 'first' ? '已弹出首项' : '已弹出末项');
  }

  popFirstBtn.addEventListener('click', () => popItem('first'));
  popLastBtn.addEventListener('click', () => popItem('last'));

  async function popSpecificItem(itemId) {
    const idx = items.findIndex(i => i.id === itemId);
    if (idx === -1) return;
    const [item] = items.splice(idx, 1);
    item.completedAt = Date.now();
    doneItems.unshift(item);
    await save();
    render();
    await smartNavigate(item.url);
    showToast('已弹出并跳转');
  }

  // ===== Restore =====
  async function restoreItem(itemId) {
    const idx = doneItems.findIndex(i => i.id === itemId);
    if (idx === -1) return;
    const [item] = doneItems.splice(idx, 1);
    delete item.completedAt;
    items.unshift(item);
    await save();
    render();
    showToast('已恢复到列表');
  }

  // ===== Delete =====
  async function deleteItem(itemId, fromDone = false) {
    if (fromDone) {
      doneItems = doneItems.filter(i => i.id !== itemId);
    } else {
      items = items.filter(i => i.id !== itemId);
    }
    await save();
    render();
  }

  // ===== Smart Navigate =====
  async function smartNavigate(url) {
    try {
      const allTabs = await chrome.tabs.query({});
      const existing = allTabs.find(t => t.url === url);
      if (existing) {
        await chrome.tabs.update(existing.id, { active: true });
        await chrome.windows.update(existing.windowId, { focused: true });
        return;
      }
    } catch {}
    chrome.tabs.create({ url });
  }

  // ===== Edit Note =====
  function startEditNote(itemId, fromDone = false) {
    const list = fromDone ? doneItems : items;
    const item = list.find(i => i.id === itemId);
    if (!item) return;

    const noteEl = document.querySelector(`[data-note-id="${itemId}"]`);
    if (!noteEl) return;

    const textarea = document.createElement('textarea');
    textarea.className = 'card-note-edit';
    textarea.value = item.note;
    textarea.rows = 2;
    noteEl.replaceWith(textarea);
    textarea.focus();

    const commit = async () => {
      item.note = textarea.value.trim();
      await save();
      render();
    };

    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textarea.blur(); }
      if (e.key === 'Escape') render();
    });
  }

  // ===== Edit Title =====
  function startEditTitle(itemId, fromDone = false) {
    const list = fromDone ? doneItems : items;
    const item = list.find(i => i.id === itemId);
    if (!item) return;

    const titleEl = document.querySelector(`[data-title-id="${itemId}"]`);
    if (!titleEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'card-title-edit';
    input.value = item.customTitle || item.title;
    input.placeholder = item.title;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
      const val = input.value.trim();
      item.customTitle = (val && val !== item.title) ? val : '';
      await save();
      render();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') render();
    });
  }

  // ===== Cycle Priority =====
  async function cyclePriority(itemId, fromDone = false) {
    const list = fromDone ? doneItems : items;
    const item = list.find(i => i.id === itemId);
    if (!item) return;
    const cycle = ['', 'high', 'medium', 'low'];
    const idx = cycle.indexOf(item.priority || '');
    item.priority = cycle[(idx + 1) % cycle.length];
    await save();
    render();
  }

  // ===== Toggle Tag on Item =====
  async function toggleItemTag(itemId, tagId, fromDone = false) {
    const list = fromDone ? doneItems : items;
    const item = list.find(i => i.id === itemId);
    if (!item) return;
    if (!item.tags) item.tags = [];
    if (item.tags.includes(tagId)) {
      item.tags = item.tags.filter(t => t !== tagId);
    } else {
      item.tags.push(tagId);
    }
    await save();
    render();
  }

  // ===== Drag & Drop =====
  let dragSrcIndex = null;

  function setupDrag(card, index) {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragSrcIndex = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragSrcIndex === null || dragSrcIndex === index) return;
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const from = dragSrcIndex;
      if (from === null || from === index) return;
      const [moved] = items.splice(from, 1);
      items.splice(index, 0, moved);
      await save();
      render();
      showToast('已调整顺序');
    });
  }

  // ===== Snapshots =====
  async function takeSnapshot() {
    try {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const snapshot = {
        id: genId(),
        timestamp: Date.now(),
        tabs: allTabs.map(t => ({
          url: t.url,
          title: t.title || t.url,
          favicon: t.favIconUrl || '',
        })),
      };
      snapshots.unshift(snapshot);
      if (snapshots.length > 30) snapshots = snapshots.slice(0, 30);
      await save();
      if (currentView === 'snapshots') render();
      else updateCounts();
      showToast(`快照已保存 (${snapshot.tabs.length} 个标签页)`);
    } catch (e) {
      showToast('快照失败: ' + e.message);
    }
  }

  snapshotBtn.addEventListener('click', takeSnapshot);

  let autoSnapshotCleanup = null;
  function setupAutoSnapshot() {
    if (autoSnapshotCleanup) { autoSnapshotCleanup(); autoSnapshotCleanup = null; }
    if (!settings.autoSnapshot) return;

    let lastAutoSnapshot = 0;
    const handler = async (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      const now = Date.now();
      if (now - lastAutoSnapshot < settings.snapshotInterval * 60 * 1000) return;
      lastAutoSnapshot = now;
      try {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const snapshot = {
          id: genId(),
          timestamp: now,
          auto: true,
          tabs: allTabs.map(t => ({
            url: t.url,
            title: t.title || t.url,
            favicon: t.favIconUrl || '',
          })),
        };
        snapshots.unshift(snapshot);
        if (snapshots.length > 30) snapshots = snapshots.slice(0, 30);
        await save();
      } catch {}
    };

    chrome.windows.onFocusChanged.addListener(handler);
    autoSnapshotCleanup = () => chrome.windows.onFocusChanged.removeListener(handler);
  }

  async function restoreSnapshot(snapshotId) {
    const snap = snapshots.find(s => s.id === snapshotId);
    if (!snap) return;
    for (const t of snap.tabs) {
      await smartNavigate(t.url);
    }
    showToast(`正在恢复 ${snap.tabs.length} 个标签页`);
  }

  async function deleteSnapshot(snapshotId) {
    snapshots = snapshots.filter(s => s.id !== snapshotId);
    await save();
    render();
  }

  // ===== Archive Snapshots =====
  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  async function archiveSnapshot(snapshotId) {
    const snap = snapshots.find(s => s.id === snapshotId);
    if (!snap) return;
    snapshots = snapshots.filter(s => s.id !== snapshotId);

    const dateKey = fmtDate(snap.timestamp);
    let group = archivedSnapshots.find(g => g.date === dateKey);
    if (!group) {
      group = { id: genId(), date: dateKey, label: dateKey, snapshots: [] };
      archivedSnapshots.push(group);
      archivedSnapshots.sort((a, b) => b.date.localeCompare(a.date));
    }
    group.snapshots.unshift(snap);
    await save();
    render();
    showToast(`快照已归档到 ${dateKey}`);
  }

  async function archiveAllSnapshots() {
    if (snapshots.length === 0) return;
    for (const snap of snapshots) {
      const dateKey = fmtDate(snap.timestamp);
      let group = archivedSnapshots.find(g => g.date === dateKey);
      if (!group) {
        group = { id: genId(), date: dateKey, label: dateKey, snapshots: [] };
        archivedSnapshots.push(group);
      }
      group.snapshots.unshift(snap);
    }
    archivedSnapshots.sort((a, b) => b.date.localeCompare(a.date));
    const count = snapshots.length;
    snapshots = [];
    await save();
    render();
    showToast(`已归档 ${count} 条快照`);
  }

  async function unarchiveSnapshot(groupDate, snapshotId) {
    const group = archivedSnapshots.find(g => g.date === groupDate);
    if (!group) return;
    const idx = group.snapshots.findIndex(s => s.id === snapshotId);
    if (idx === -1) return;
    const [snap] = group.snapshots.splice(idx, 1);
    if (group.snapshots.length === 0) {
      archivedSnapshots = archivedSnapshots.filter(g => g.date !== groupDate);
    }
    snapshots.unshift(snap);
    await save();
    render();
    showToast('已取消归档');
  }

  async function deleteArchivedSnapshot(groupDate, snapshotId) {
    const group = archivedSnapshots.find(g => g.date === groupDate);
    if (!group) return;
    group.snapshots = group.snapshots.filter(s => s.id !== snapshotId);
    if (group.snapshots.length === 0) {
      archivedSnapshots = archivedSnapshots.filter(g => g.date !== groupDate);
    }
    await save();
    render();
  }

  async function deleteArchiveGroup(groupDate) {
    archivedSnapshots = archivedSnapshots.filter(g => g.date !== groupDate);
    await save();
    render();
  }

  function exportArchive() {
    const data = {
      exportedAt: new Date().toISOString(),
      version: 1,
      archivedSnapshots,
      snapshots,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stackue-snapshots-${fmtDate(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出快照');
  }

  function importArchive() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version) throw new Error('无效的文件格式');

        let imported = 0;
        if (data.archivedSnapshots) {
          for (const group of data.archivedSnapshots) {
            let existing = archivedSnapshots.find(g => g.date === group.date);
            if (!existing) {
              existing = { id: genId(), date: group.date, label: group.label || group.date, snapshots: [] };
              archivedSnapshots.push(existing);
            }
            for (const snap of group.snapshots) {
              if (!existing.snapshots.some(s => s.id === snap.id)) {
                existing.snapshots.push(snap);
                imported++;
              }
            }
          }
          archivedSnapshots.sort((a, b) => b.date.localeCompare(a.date));
        }
        if (data.snapshots) {
          for (const snap of data.snapshots) {
            if (!snapshots.some(s => s.id === snap.id)) {
              snapshots.push(snap);
              imported++;
            }
          }
        }
        await save();
        render();
        showToast(`已导入 ${imported} 条快照`);
      } catch (err) {
        showToast('导入失败: ' + err.message);
      }
    });
    input.click();
  }

  // ===== Selection / Checkbox =====
  function updateSelectionBar() {
    const count = checkedIds.size;
    if (count > 0) {
      selectionBar.style.display = '';
      selectionCountEl.textContent = `已选 ${count} 项`;
      bottomBar.style.display = 'none';
    } else {
      selectionBar.style.display = 'none';
      bottomBar.style.display = currentView === 'active' && items.length > 0 ? '' : 'none';
    }
  }

  function toggleCheck(itemId) {
    if (checkedIds.has(itemId)) checkedIds.delete(itemId);
    else checkedIds.add(itemId);
    updateSelectionBar();
    // Update checkbox visual without full re-render
    const cb = document.querySelector(`[data-check="${itemId}"]`);
    if (cb) cb.classList.toggle('checked', checkedIds.has(itemId));
  }

  cancelSelectionBtn.addEventListener('click', () => {
    checkedIds.clear();
    updateSelectionBar();
    render();
  });

  createWorkspaceBtn.addEventListener('click', () => {
    if (checkedIds.size === 0) return;
    wsNameInput.value = '';
    wsNoteInput.value = '';
    wsDialog.style.display = '';
    wsNameInput.focus();
  });

  wsCancelBtn.addEventListener('click', () => { wsDialog.style.display = 'none'; });

  wsConfirmBtn.addEventListener('click', async () => {
    const name = wsNameInput.value.trim();
    if (!name) return showToast('请输入工作区名称');

    // Extract checked items from active list
    const wsItems = items.filter(i => checkedIds.has(i.id));
    items = items.filter(i => !checkedIds.has(i.id));

    workspaces.unshift({
      id: genId(),
      name,
      note: wsNoteInput.value.trim(),
      items: wsItems,
      createdAt: Date.now(),
    });

    checkedIds.clear();
    wsDialog.style.display = 'none';
    await save();
    updateSelectionBar();
    currentView = 'workspaces';
    viewTabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'workspaces'));
    render();
    showToast(`工作区「${name}」已创建 (${wsItems.length} 项)`);
  });

  // ===== Workspace Actions =====
  async function restoreWorkspaceAllTabs(wsId) {
    const ws = workspaces.find(w => w.id === wsId);
    if (!ws) return;
    for (const item of ws.items) {
      await smartNavigate(item.url);
    }
    showToast(`正在恢复「${ws.name}」的 ${ws.items.length} 个标签页`);
  }

  async function suspendWorkspace(wsId) {
    const ws = workspaces.find(w => w.id === wsId);
    if (!ws) return;
    const allTabs = await chrome.tabs.query({});
    let closed = 0;
    for (const item of ws.items) {
      const tab = allTabs.find(t => t.url === item.url);
      if (tab) {
        try { await chrome.tabs.remove(tab.id); closed++; } catch {}
      }
    }
    showToast(`已关闭「${ws.name}」的 ${closed} 个标签页`);
  }

  async function dissolveWorkspace(wsId) {
    const ws = workspaces.find(w => w.id === wsId);
    if (!ws) return;
    // Move items back to active list
    items.unshift(...ws.items);
    workspaces = workspaces.filter(w => w.id !== wsId);
    await save();
    render();
    showToast(`「${ws.name}」已解散，${ws.items.length} 项已退回待处理`);
  }

  async function deleteWorkspace(wsId) {
    workspaces = workspaces.filter(w => w.id !== wsId);
    await save();
    render();
  }

  function startEditWsNote(wsId) {
    const ws = workspaces.find(w => w.id === wsId);
    if (!ws) return;
    const el = document.querySelector(`[data-ws-note="${wsId}"]`);
    if (!el) return;

    const textarea = document.createElement('textarea');
    textarea.className = 'card-note-edit';
    textarea.value = ws.note;
    textarea.rows = 2;
    el.replaceWith(textarea);
    textarea.focus();

    const commit = async () => {
      ws.note = textarea.value.trim();
      await save();
      render();
    };
    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textarea.blur(); }
      if (e.key === 'Escape') render();
    });
  }

  // ===== Render =====
  function render() {
    listArea.innerHTML = '';
    updateSelectionBar();

    if (currentView === 'active') renderActiveList();
    else if (currentView === 'workspaces') renderWorkspaces();
    else if (currentView === 'done') renderDoneList();
    else if (currentView === 'snapshots') renderSnapshots();
    else if (currentView === 'archive') renderArchive();
  }

  function filterItems(list) {
    let result = list;
    if (filterTagId) {
      result = result.filter(i => i.tags && i.tags.includes(filterTagId));
    }
    if (searchQuery) {
      result = result.filter(i =>
        (i.title && i.title.toLowerCase().includes(searchQuery)) ||
        (i.customTitle && i.customTitle.toLowerCase().includes(searchQuery)) ||
        (i.note && i.note.toLowerCase().includes(searchQuery)) ||
        (i.url && i.url.toLowerCase().includes(searchQuery))
      );
    }
    return result;
  }

  function displayTitle(item) {
    return item.customTitle || item.title;
  }

  function renderActiveList() {
    const filtered = filterItems(items);

    if (filtered.length === 0) {
      listArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${searchQuery || filterTagId ? '&#128270;' : '&#128218;'}</div>
          <p>${searchQuery || filterTagId ? '未找到匹配项' : '列表是空的'}</p>
          <p class="empty-hint">${searchQuery || filterTagId ? '试试其他关键词或标签' : '点击上方按钮保存当前标签页'}</p>
        </div>`;
      return;
    }

    filtered.forEach((item) => {
      const realIndex = items.indexOf(item);
      const isFirst = realIndex === 0;
      const isLast = realIndex === items.length - 1;

      let posLabel = '';
      if (isFirst && items.length > 1) posLabel = 'FIRST';
      else if (isLast && items.length > 1) posLabel = 'LAST';

      const prioClass = item.priority ? ` priority-${item.priority}` : '';
      const prioIcon = item.priority === 'high' ? '&#128308;' : item.priority === 'medium' ? '&#128992;' : item.priority === 'low' ? '&#128309;' : '&#9898;';

      const card = document.createElement('div');
      card.className = `card${prioClass}`;
      card.dataset.index = realIndex;

      const contextHtml = item.pageContext
        ? `<div class="card-context">${escHtml(item.pageContext)}</div>` : '';

      card.innerHTML = `
        ${posLabel ? `<div class="position-label">${posLabel}</div>` : ''}
        <div class="card-header">
          <span class="card-checkbox${checkedIds.has(item.id) ? ' checked' : ''}" data-check="${item.id}"></span>
          <span class="card-index">${realIndex + 1}</span>
          ${item.favicon ? `<img class="card-favicon" src="${escAttr(item.favicon)}" onerror="this.style.display='none'">` : ''}
          <div class="card-title-group">
            <span class="card-title" data-title-id="${item.id}" data-url="${escAttr(item.url)}" title="双击编辑标题">${escHtml(displayTitle(item))}</span>
            <div class="card-subtitle">${escHtml(getUrlSubtitle(item.url))}</div>
          </div>
        </div>
        ${contextHtml}
        <div class="card-note" data-note-id="${item.id}">${escHtml(item.note)}</div>
        ${item.tags && item.tags.length ? `<div class="card-tags">${getTagsHtml(item.tags)}</div>` : ''}
        <div class="card-meta">
          <span class="card-time">${fmtTime(item.timestamp)}</span>
          <div class="card-actions">
            <button class="card-action-btn labeled" title="切换优先级" data-prio="${item.id}">优先级</button>
            <button class="card-action-btn labeled navigate" title="跳转到页面" data-url="${escAttr(item.url)}">跳转</button>
            <button class="card-action-btn labeled" title="弹出并跳转" data-pop="${item.id}">弹出</button>
            <button class="card-action-btn labeled" title="编辑备注" data-edit="${item.id}">备注</button>
            <button class="card-action-btn labeled delete" title="删除" data-del="${item.id}">删除</button>
          </div>
        </div>`;

      if (!searchQuery && !filterTagId) setupDrag(card, realIndex);
      listArea.appendChild(card);
    });

    bindActiveActions();
  }

  function renderDoneList() {
    const filtered = filterItems(doneItems);

    if (filtered.length === 0) {
      listArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${searchQuery || filterTagId ? '&#128270;' : '&#9989;'}</div>
          <p>${searchQuery || filterTagId ? '未找到匹配项' : '没有已完成的项目'}</p>
          <p class="empty-hint">${searchQuery || filterTagId ? '试试其他关键词或标签' : '弹出的项目会出现在这里'}</p>
        </div>`;
      return;
    }

    filtered.forEach((item) => {
      const prioClass = item.priority ? ` priority-${item.priority}` : '';
      const card = document.createElement('div');
      card.className = `card done-card${prioClass}`;

      const contextHtml = item.pageContext
        ? `<div class="card-context">${escHtml(item.pageContext)}</div>` : '';

      card.innerHTML = `
        <div class="card-header">
          ${item.favicon ? `<img class="card-favicon" src="${escAttr(item.favicon)}" onerror="this.style.display='none'">` : ''}
          <div class="card-title-group">
            <span class="card-title" data-title-id="${item.id}" data-url="${escAttr(item.url)}">${escHtml(displayTitle(item))}</span>
            <div class="card-subtitle">${escHtml(getUrlSubtitle(item.url))}</div>
          </div>
        </div>
        ${contextHtml}
        <div class="card-note" data-note-id="${item.id}">${escHtml(item.note)}</div>
        ${item.tags && item.tags.length ? `<div class="card-tags">${getTagsHtml(item.tags)}</div>` : ''}
        <div class="card-meta">
          <span class="card-time">${fmtTime(item.completedAt || item.timestamp)}</span>
          <div class="card-actions">
            <button class="card-action-btn labeled navigate" title="跳转到页面" data-url="${escAttr(item.url)}">跳转</button>
            <button class="card-action-btn labeled restore" title="恢复到待处理列表" data-restore="${item.id}">恢复</button>
            <button class="card-action-btn labeled" title="编辑备注" data-edit-done="${item.id}">备注</button>
            <button class="card-action-btn labeled delete" title="永久删除" data-del-done="${item.id}">删除</button>
          </div>
        </div>`;
      listArea.appendChild(card);
    });

    bindDoneActions();
  }

  function renderWorkspaces() {
    if (workspaces.length === 0) {
      listArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128188;</div>
          <p>没有工作区</p>
          <p class="empty-hint">在待处理列表中勾选多项，然后点击「创建工作区」</p>
        </div>`;
      return;
    }

    workspaces.forEach((ws) => {
      const card = document.createElement('div');
      card.className = 'workspace-card';
      card.innerHTML = `
        <div class="ws-header">
          <div class="ws-title-row">
            <span class="ws-icon">&#128188;</span>
            <span class="ws-name">${escHtml(ws.name)}</span>
            <span class="badge">${ws.items.length}</span>
          </div>
          <div class="ws-time">${fmtTime(ws.createdAt)}</div>
        </div>
        <div class="ws-note" data-ws-note="${ws.id}">${escHtml(ws.note)}</div>
        <div class="ws-items">
          ${ws.items.map(item => `
            <div class="ws-item">
              ${item.favicon ? `<img src="${escAttr(item.favicon)}" onerror="this.style.display='none'">` : ''}
              <span class="ws-item-title" data-url="${escAttr(item.url)}">${escHtml(item.customTitle || item.title)}</span>
            </div>
          `).join('')}
        </div>
        <div class="ws-actions">
          <button class="action-btn primary small" data-ws-open="${ws.id}">全部打开</button>
          <button class="action-btn outline small" data-ws-suspend="${ws.id}">挂起关闭</button>
          <button class="action-btn outline small" data-ws-note-edit="${ws.id}">备注</button>
          <button class="action-btn outline small" data-ws-dissolve="${ws.id}">解散</button>
          <button class="action-btn outline small ws-delete" data-ws-del="${ws.id}">删除</button>
        </div>`;
      listArea.appendChild(card);
    });

    // Bind workspace actions
    listArea.querySelectorAll('[data-ws-open]').forEach(btn => {
      btn.addEventListener('click', () => restoreWorkspaceAllTabs(btn.dataset.wsOpen));
    });
    listArea.querySelectorAll('[data-ws-suspend]').forEach(btn => {
      btn.addEventListener('click', () => suspendWorkspace(btn.dataset.wsSuspend));
    });
    listArea.querySelectorAll('[data-ws-dissolve]').forEach(btn => {
      btn.addEventListener('click', () => dissolveWorkspace(btn.dataset.wsDissolve));
    });
    listArea.querySelectorAll('[data-ws-del]').forEach(btn => {
      btn.addEventListener('click', () => deleteWorkspace(btn.dataset.wsDel));
    });
    listArea.querySelectorAll('[data-ws-note-edit]').forEach(btn => {
      btn.addEventListener('click', () => startEditWsNote(btn.dataset.wsNoteEdit));
    });
    listArea.querySelectorAll('.ws-item-title').forEach(el => {
      el.addEventListener('click', () => smartNavigate(el.dataset.url));
    });
  }

  function renderSnapshots() {
    if (snapshots.length === 0) {
      listArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128247;</div>
          <p>没有快照</p>
          <p class="empty-hint">点击右上角相机按钮手动保存${settings.autoSnapshot ? '，或切换窗口时自动保存' : ''}</p>
        </div>`;
      return;
    }

    // Top action bar
    const toolbar = document.createElement('div');
    toolbar.className = 'snapshot-toolbar';
    toolbar.innerHTML = `
      <button class="action-btn outline small" id="archive-all-btn">全部归档</button>
      <button class="action-btn outline small" id="export-btn">导出</button>
      <button class="action-btn outline small" id="import-btn">导入</button>
    `;
    listArea.appendChild(toolbar);

    toolbar.querySelector('#archive-all-btn').addEventListener('click', archiveAllSnapshots);
    toolbar.querySelector('#export-btn').addEventListener('click', exportArchive);
    toolbar.querySelector('#import-btn').addEventListener('click', importArchive);

    snapshots.forEach((snap) => {
      const card = document.createElement('div');
      card.className = 'snapshot-card';
      card.innerHTML = `
        <div class="snapshot-header" data-toggle="${snap.id}">
          <div class="snapshot-title">
            ${snap.auto ? '&#9201;' : '&#128247;'} ${fmtTime(snap.timestamp)}
            <span class="badge">${snap.tabs.length}</span>
          </div>
          <div class="snapshot-actions">
            <button class="card-action-btn labeled" title="归档此快照" data-archive-snap="${snap.id}">归档</button>
            <button class="card-action-btn restore" title="恢复所有标签页" data-restore-snap="${snap.id}">&#8634;</button>
            <button class="card-action-btn delete" title="删除快照" data-del-snap="${snap.id}">&#10005;</button>
          </div>
        </div>
        <div class="snapshot-body" id="snap-body-${snap.id}">
          ${snap.tabs.map(t => `
            <div class="snapshot-item">
              ${t.favicon ? `<img src="${escAttr(t.favicon)}" onerror="this.style.display='none'">` : ''}
              <span class="snapshot-item-title" data-url="${escAttr(t.url)}">${escHtml(t.title)}</span>
            </div>
          `).join('')}
        </div>`;
      listArea.appendChild(card);
    });

    listArea.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.snapshot-actions')) return;
        const body = document.getElementById(`snap-body-${el.dataset.toggle}`);
        if (body) body.classList.toggle('open');
      });
    });

    listArea.querySelectorAll('[data-archive-snap]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); archiveSnapshot(btn.dataset.archiveSnap); });
    });
    listArea.querySelectorAll('[data-restore-snap]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); restoreSnapshot(btn.dataset.restoreSnap); });
    });
    listArea.querySelectorAll('[data-del-snap]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteSnapshot(btn.dataset.delSnap); });
    });
    listArea.querySelectorAll('.snapshot-item-title').forEach(el => {
      el.addEventListener('click', () => smartNavigate(el.dataset.url));
    });
  }

  function renderArchive() {
    const totalCount = archivedSnapshots.reduce((s, g) => s + g.snapshots.length, 0);

    // Top toolbar with export/import
    const toolbar = document.createElement('div');
    toolbar.className = 'snapshot-toolbar';
    toolbar.innerHTML = `
      <button class="action-btn outline small" id="export-archive-btn">导出</button>
      <button class="action-btn outline small" id="import-archive-btn">导入</button>
    `;
    listArea.appendChild(toolbar);

    toolbar.querySelector('#export-archive-btn').addEventListener('click', exportArchive);
    toolbar.querySelector('#import-archive-btn').addEventListener('click', importArchive);

    if (totalCount === 0) {
      listArea.innerHTML = '';
      listArea.appendChild(toolbar);
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-icon">&#128230;</div>
        <p>没有归档快照</p>
        <p class="empty-hint">在快照页面点击「归档」按钮将快照归档至此</p>
      `;
      listArea.appendChild(empty);
      return;
    }

    archivedSnapshots.forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'archive-group';
      groupEl.innerHTML = `
        <div class="archive-group-header" data-group-toggle="${group.date}">
          <div class="archive-group-title">
            &#128197; ${group.date}
            <span class="badge">${group.snapshots.length}</span>
          </div>
          <div class="snapshot-actions">
            <button class="card-action-btn labeled delete" title="删除整组" data-del-group="${group.date}">删除</button>
          </div>
        </div>
        <div class="archive-group-body" id="archive-group-${group.date}">
          ${group.snapshots.map(snap => `
            <div class="snapshot-card archive-snap-card">
              <div class="snapshot-header" data-toggle="ar-${snap.id}">
                <div class="snapshot-title">
                  ${snap.auto ? '&#9201;' : '&#128247;'} ${fmtTime(snap.timestamp)}
                  <span class="badge">${snap.tabs.length}</span>
                </div>
                <div class="snapshot-actions">
                  <button class="card-action-btn labeled restore" title="恢复到快照列表" data-unarchive="${group.date}|${snap.id}">恢复</button>
                  <button class="card-action-btn labeled delete" title="删除" data-del-archived="${group.date}|${snap.id}">删除</button>
                </div>
              </div>
              <div class="snapshot-body" id="snap-body-ar-${snap.id}">
                ${snap.tabs.map(t => `
                  <div class="snapshot-item">
                    ${t.favicon ? `<img src="${escAttr(t.favicon)}" onerror="this.style.display='none'">` : ''}
                    <span class="snapshot-item-title" data-url="${escAttr(t.url)}">${escHtml(t.title)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
      listArea.appendChild(groupEl);
    });

    // Bind group toggle
    listArea.querySelectorAll('[data-group-toggle]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.snapshot-actions')) return;
        const body = document.getElementById(`archive-group-${el.dataset.groupToggle}`);
        if (body) body.classList.toggle('collapsed');
      });
    });

    // Bind snapshot expand
    listArea.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.snapshot-actions')) return;
        const body = document.getElementById(`snap-body-${el.dataset.toggle}`);
        if (body) body.classList.toggle('open');
      });
    });

    // Bind unarchive
    listArea.querySelectorAll('[data-unarchive]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [groupDate, snapId] = btn.dataset.unarchive.split('|');
        unarchiveSnapshot(groupDate, snapId);
      });
    });

    // Bind delete archived
    listArea.querySelectorAll('[data-del-archived]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [groupDate, snapId] = btn.dataset.delArchived.split('|');
        deleteArchivedSnapshot(groupDate, snapId);
      });
    });

    // Bind delete group
    listArea.querySelectorAll('[data-del-group]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteArchiveGroup(btn.dataset.delGroup); });
    });

    // Bind navigate
    listArea.querySelectorAll('.snapshot-item-title').forEach(el => {
      el.addEventListener('click', () => smartNavigate(el.dataset.url));
    });
  }

  // ===== Bind Actions =====
  function bindActiveActions() {
    // Checkboxes
    listArea.querySelectorAll('[data-check]').forEach(cb => {
      cb.addEventListener('click', (e) => { e.stopPropagation(); toggleCheck(cb.dataset.check); });
    });
    // Click title to navigate
    listArea.querySelectorAll('.card-title').forEach(el => {
      el.addEventListener('click', () => smartNavigate(el.dataset.url));
      // Double-click to edit title
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEditTitle(el.dataset.titleId, false);
      });
    });
    listArea.querySelectorAll('.card-action-btn.navigate').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); smartNavigate(btn.dataset.url); });
    });
    listArea.querySelectorAll('[data-pop]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); popSpecificItem(btn.dataset.pop); });
    });
    listArea.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); startEditNote(btn.dataset.edit, false); });
    });
    listArea.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteItem(btn.dataset.del, false); });
    });
    listArea.querySelectorAll('[data-prio]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); cyclePriority(btn.dataset.prio, false); });
    });
  }

  function bindDoneActions() {
    listArea.querySelectorAll('.card-title').forEach(el => {
      el.addEventListener('click', () => smartNavigate(el.dataset.url));
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEditTitle(el.dataset.titleId, true);
      });
    });
    listArea.querySelectorAll('.card-action-btn.navigate').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); smartNavigate(btn.dataset.url); });
    });
    listArea.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); restoreItem(btn.dataset.restore); });
    });
    listArea.querySelectorAll('[data-edit-done]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); startEditNote(btn.dataset.editDone, true); });
    });
    listArea.querySelectorAll('[data-del-done]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteItem(btn.dataset.delDone, true); });
    });
  }

  // ===== Utilities =====
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    if (d.getFullYear() === now.getFullYear()) return `${mm}-${dd} ${hh}:${mi}`;
    return `${d.getFullYear()}-${mm}-${dd} ${hh}:${mi}`;
  }

  function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
  }

  // ===== Start =====
  init();
})();
