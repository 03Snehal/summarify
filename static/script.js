/* ════════════════════════════════════════════
   Summarify – Frontend Logic
   ════════════════════════════════════════════ */

'use strict';

// ── State ────────────────────────────────────
const state = {
  format: 'paragraph',
  method: 'extractive',
  length: 'medium',
  files: [],
  lastResult: null,
  activeResultTab: 'paragraph',
};

// ── DOM refs ─────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Theme ────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('summarify-theme') || 'light';
  setTheme(saved);
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.textContent = t === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('summarify-theme', t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  setTheme(cur === 'dark' ? 'light' : 'dark');
}

// ── Tabs & Pills ─────────────────────────────
function bindTabs(containerId, key, callback) {
  const container = $(containerId);
  if (!container) return;
  container.querySelectorAll('[data-' + key + ']').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-' + key + ']').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (callback) callback(btn.dataset[key]);
    });
  });
}

// ── Word counter ──────────────────────────────
function updateWordCount() {
  const ta = $('textInput');
  if (!ta) return;
  const words = ta.value.trim().split(/\s+/).filter(Boolean).length;
  const wc = $('wordCount');
  if (wc) wc.textContent = words;
}

// ── File handling ─────────────────────────────
function renderFileList() {
  const fl = $('fileList');
  if (!fl) return;
  fl.innerHTML = '';
  state.files.forEach((f, i) => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `<span>📄 ${f.name}</span><span class="remove" data-idx="${i}">✕</span>`;
    fl.appendChild(chip);
  });
  fl.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.files.splice(parseInt(e.target.dataset.idx), 1);
      renderFileList();
    });
  });
}

function handleFiles(fileList) {
  const allowed = ['text/plain', 'application/pdf'];
  Array.from(fileList).forEach(f => {
    if (allowed.includes(f.type) || f.name.endsWith('.txt') || f.name.endsWith('.pdf')) {
      state.files.push(f);
    } else {
      showToast(`Unsupported file: ${f.name}`, 'error');
    }
  });
  renderFileList();
}

// ── Loader messages ───────────────────────────
const LOADER_MSGS = [
  'Tokenizing sentences…',
  'Building similarity matrix…',
  'Running LexRank algorithm…',
  'Scoring sentences…',
  'Generating summary…',
];
let loaderInterval;
function startLoader() {
  const overlay = $('overlayLoader');
  const text = $('loaderText');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  let i = 0;
  if (text) text.textContent = LOADER_MSGS[0];
  loaderInterval = setInterval(() => {
    i = (i + 1) % LOADER_MSGS.length;
    if (text) text.textContent = LOADER_MSGS[i];
  }, 1400);
}
function stopLoader() {
  clearInterval(loaderInterval);
  const overlay = $('overlayLoader');
  if (overlay) overlay.classList.add('hidden');
}

// ── Toast ─────────────────────────────────────
function showToast(msg, type = 'info') {
  const tc = $('toastContainer');
  if (!tc) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  tc.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'slideOut 0.25s ease forwards';
    setTimeout(() => t.remove(), 260);
  }, 3500);
}

// ── Summarize ─────────────────────────────────
async function doSummarize() {
  const textInput = $('textInput');
  const text = textInput ? textInput.value.trim() : '';

  if (!text && state.files.length === 0) {
    showToast('Please paste text or upload a file first.', 'error');
    return;
  }

  const btn = $('summarizeBtn');
  if (btn) btn.classList.add('loading');
  startLoader();

  try {
    const fd = new FormData();
    if (text) fd.append('text', text);
    state.files.forEach(f => fd.append('files', f));
    fd.append('method', state.method);
    fd.append('length', state.length);

    const resp = await fetch('/summarize', { method: 'POST', body: fd });
    const data = await resp.json();

    if (!resp.ok || data.error) {
      throw new Error(data.error || 'Summarization failed.');
    }

    state.lastResult = data;
    renderResults(data);
    showToast('Summary generated successfully!', 'success');

  } catch (err) {
    showToast(err.message || 'An error occurred.', 'error');
  } finally {
    stopLoader();
    if (btn) btn.classList.remove('loading');
  }
}

// ── Render Results ────────────────────────────
function renderResults(data) {
  const emptyState = $('emptyState');
  const results = $('results');
  if (emptyState) emptyState.classList.add('hidden');
  if (results) results.classList.remove('hidden');

  renderAnalytics(data.analytics);
  renderContent(data);
}

function renderAnalytics(a) {
  const bar = $('analyticsBar');
  if (!bar || !a) return;

  const stats = [
    { label: 'Original Words', value: a.original_words, cls: '' },
    { label: 'Summary Words', value: a.summary_words, cls: 'teal' },
    { label: 'Compression', value: a.compression_ratio + '%', cls: 'orange' },
    { label: 'Orig. Read Time', value: a.original_read_time + ' min', cls: '' },
    { label: 'Summ. Read Time', value: a.summary_read_time + ' min', cls: 'teal' },
    { label: 'Time Saved', value: a.time_saved + ' min', cls: 'yellow' },
  ];

  bar.innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value ${s.cls}">${s.value}</div>
    </div>
  `).join('');
}

function renderContent(data) {
  const rc = $('resultContent');
  if (!rc) return;

  const showAll = state.format === 'all';
  const fmt = state.format;

  // Build result tabs
  const tabs = [
    { key: 'paragraph', label: '¶ Paragraph' },
    { key: 'bullets',   label: '• Bullets'   },
    { key: 'headline',  label: '★ Headline'  },
    { key: 'gist',      label: '⚡ Gist'     },
    { key: 'actions',   label: '✓ Actions'   },
    { key: 'highlight', label: '🔆 Highlight' },
  ];

  const activeTab = showAll ? 'paragraph' : fmt;

  rc.innerHTML = `
    <div class="result-tabs" id="resultTabs">
      ${tabs.map(t => `
        <button class="result-tab ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">
          ${t.label}
        </button>
      `).join('')}
    </div>
    <div class="result-body">
      ${tabs.map(t => `
        <div class="result-section ${t.key === activeTab ? 'active' : ''}" id="sec-${t.key}">
          ${buildSection(t.key, data)}
        </div>
      `).join('')}
    </div>
  `;

  // Bind result tabs
  rc.querySelectorAll('.result-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      rc.querySelectorAll('.result-tab').forEach(b => b.classList.remove('active'));
      rc.querySelectorAll('.result-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const sec = rc.querySelector(`#sec-${btn.dataset.tab}`);
      if (sec) sec.classList.add('active');
      state.activeResultTab = btn.dataset.tab;
    });
  });

  state.activeResultTab = activeTab;
}

function buildSection(key, data) {
  switch (key) {
    case 'paragraph':
      return `<p class="result-para">${escHtml(data.paragraph || '')}</p>`;

    case 'bullets': {
      const bullets = data.bullets || [];
      if (!bullets.length) return `<p class="no-actions">No bullet points available.</p>`;
      return `<div class="result-bullets">${
        bullets.map(b => `
          <div class="bullet-item">
            <span class="bullet-dot"></span>
            <span>${escHtml(b)}</span>
          </div>`).join('')
      }</div>`;
    }

    case 'headline':
      return `<div class="result-headline">${escHtml(data.headline || '')}</div>`;

    case 'gist':
      return `<p class="result-gist">${escHtml(data.gist || '')}</p>`;

    case 'actions': {
      const actions = data.actions || [];
      if (!actions.length) return `<p class="no-actions">No clear action points detected in this text.</p>`;
      return `<div class="action-list">${
        actions.map(a => `
          <div class="action-item">
            <span class="action-badge">ACTION</span>
            <span>${escHtml(a)}</span>
          </div>`).join('')
      }</div>`;
    }

    case 'highlight':
      return `<div class="highlighted-text">${data.highlighted || escHtml(data.paragraph || '')}</div>`;

    default:
      return '';
  }
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// For highlighted section we intentionally allow HTML (mark tags)
function buildSection(key, data) {
  switch (key) {
    case 'paragraph':
      return `<p class="result-para">${safeText(data.paragraph || '')}</p>`;

    case 'bullets': {
      const bullets = data.bullets || [];
      if (!bullets.length) return `<p class="no-actions">No bullet points available.</p>`;
      return `<div class="result-bullets">${
        bullets.map(b => `
          <div class="bullet-item">
            <span class="bullet-dot"></span>
            <span>${safeText(b)}</span>
          </div>`).join('')
      }</div>`;
    }

    case 'headline':
      return `<div class="result-headline">${safeText(data.headline || '')}</div>`;

    case 'gist':
      return `<p class="result-gist">${safeText(data.gist || '')}</p>`;

    case 'actions': {
      const actions = data.actions || [];
      if (!actions.length) return `<p class="no-actions">No clear action points detected in this text.</p>`;
      return `<div class="action-list">${
        actions.map(a => `
          <div class="action-item">
            <span class="action-badge">ACTION</span>
            <span>${safeText(a)}</span>
          </div>`).join('')
      }</div>`;
    }

    case 'highlight':
      // Allow <mark> tags in highlighted HTML
      return `<div class="highlighted-text">${data.highlighted || safeText(data.paragraph || '')}</div>`;

    default:
      return '';
  }
}

function safeText(str) {
  // Escape HTML but allow <mark> from our own code
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/&lt;mark class=&quot;highlight&quot;&gt;/g, '<mark class="highlight">')
    .replace(/&lt;\/mark&gt;/g, '</mark>');
}

// ── Copy / Download ───────────────────────────
function getActiveText() {
  const data = state.lastResult;
  if (!data) return '';
  const tab = state.activeResultTab;
  switch (tab) {
    case 'paragraph': return data.paragraph || '';
    case 'bullets':   return (data.bullets || []).map((b, i) => `${i+1}. ${b}`).join('\n');
    case 'headline':  return data.headline || '';
    case 'gist':      return data.gist || '';
    case 'actions':   return (data.actions || []).map((a, i) => `• ${a}`).join('\n');
    case 'highlight': return data.paragraph || '';
    default:          return data.paragraph || '';
  }
}

async function copyText() {
  const txt = getActiveText();
  if (!txt) { showToast('Nothing to copy.', 'error'); return; }
  try {
    await navigator.clipboard.writeText(txt);
    showToast('Copied to clipboard!', 'success');
  } catch {
    showToast('Copy failed – please select and copy manually.', 'error');
  }
}

function downloadTxt() {
  const txt = getActiveText();
  if (!txt) { showToast('Nothing to download.', 'error'); return; }
  const fd = new FormData();
  fd.append('content', txt);
  submitHiddenForm('/download/txt', { content: txt });
}

function downloadPdf() {
  const txt = getActiveText();
  if (!txt) { showToast('Nothing to download.', 'error'); return; }
  submitHiddenForm('/download/pdf', { content: txt });
}

function submitHiddenForm(action, fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.style.display = 'none';
  Object.entries(fields).forEach(([k, v]) => {
    const inp = document.createElement('input');
    inp.type = 'hidden';
    inp.name = k;
    inp.value = v;
    form.appendChild(inp);
  });
  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 1000);
}

// ── Init ──────────────────────────────────────
function init() {
  initTheme();

  // Theme toggle
  document.querySelectorAll('#themeToggle').forEach(btn =>
    btn.addEventListener('click', toggleTheme));

  // Format tabs
  const formatTabs = $('formatTabs');
  if (formatTabs) {
    formatTabs.querySelectorAll('[data-format]').forEach(btn => {
      btn.addEventListener('click', () => {
        formatTabs.querySelectorAll('[data-format]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.format = btn.dataset.format;
        if (state.lastResult) renderContent(state.lastResult);
      });
    });
  }

  // Method pills
  const methodPills = $('methodPills');
  if (methodPills) {
    methodPills.querySelectorAll('[data-method]').forEach(btn => {
      btn.addEventListener('click', () => {
        methodPills.querySelectorAll('[data-method]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.method = btn.dataset.method;
      });
    });
  }

  // Length pills
  const lengthPills = $('lengthPills');
  if (lengthPills) {
    lengthPills.querySelectorAll('[data-length]').forEach(btn => {
      btn.addEventListener('click', () => {
        lengthPills.querySelectorAll('[data-length]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.length = btn.dataset.length;
      });
    });
  }

  // Word counter
  const ta = $('textInput');
  if (ta) {
    ta.addEventListener('input', updateWordCount);
    updateWordCount();
  }

  // Paste button
  const pasteBtn = $('pasteBtn');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (ta) { ta.value = txt; updateWordCount(); }
        showToast('Text pasted!', 'success');
      } catch {
        showToast('Clipboard access denied. Please paste manually.', 'error');
      }
    });
  }

  // Clear button
  const clearBtn = $('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (ta) { ta.value = ''; updateWordCount(); }
      state.files = [];
      renderFileList();
      showToast('Cleared.', 'info');
    });
  }

  // File upload
  const uploadZone = $('uploadZone');
  const fileInput = $('fileInput');
  if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', (e) => {
      if (!e.target.classList.contains('remove')) fileInput.click();
    });
    fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files);
    });
  }

  // Summarize button
  const summarizeBtn = $('summarizeBtn');
  if (summarizeBtn) summarizeBtn.addEventListener('click', doSummarize);

  // Copy / Download
  const copyBtn = $('copyBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyText);

  const dlTxtBtn = $('dlTxtBtn');
  if (dlTxtBtn) dlTxtBtn.addEventListener('click', downloadTxt);

  const dlPdfBtn = $('dlPdfBtn');
  if (dlPdfBtn) dlPdfBtn.addEventListener('click', downloadPdf);
}

document.addEventListener('DOMContentLoaded', init);
