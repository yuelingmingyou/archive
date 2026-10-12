// script.js — 本地存储 + 多版本滑动 + 局部划线

const STORAGE_KEY = 'ai_chat_archive_v2';

// 数据结构：
// [{ id, question, responses: [{ id, ai, text, highlights: [{start, end}] }] }]
// highlights 存储被标记文字在原文本中的字符索引区间

let archiveData = [];

// ---------- DOM ----------
const questionInput = document.getElementById('questionInput');
const aiSelect = document.getElementById('aiSelect');
const responseInput = document.getElementById('responseInput');
const saveEntryBtn = document.getElementById('saveEntryBtn');
const clearFormBtn = document.getElementById('clearFormBtn');
const archiveListDiv = document.getElementById('archiveList');
const clearAllBtn = document.getElementById('clearAllBtn');

// ---------- 存储 ----------
function loadFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      archiveData = JSON.parse(stored);
      // 兼容旧数据：确保每个 response 有 highlights 数组
      archiveData.forEach(item => {
        item.responses.forEach(res => {
          if (!Array.isArray(res.highlights)) res.highlights = [];
        });
      });
    } catch (e) {
      console.error('读取存档失败', e);
      archiveData = [];
    }
  } else {
    archiveData = [];
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(archiveData));
}

function generateId() {
  return Date.now() + Math.random().toString(36).substring(2, 8);
}

// ---------- 根据 highlights 生成带 <mark> 的 HTML ----------
// text: 原始文本；highlights: [{start, end}] 不重叠区间（已排序）
function buildHighlightedHTML(text, highlights) {
  if (!highlights || highlights.length === 0) {
    return escapeHtml(text);
  }
  // 合并重叠区间
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const h of sorted) {
    if (merged.length === 0) {
      merged.push({ ...h });
    } else {
      const last = merged[merged.length - 1];
      if (h.start <= last.end) {
        last.end = Math.max(last.end, h.end);
      } else {
        merged.push({ ...h });
      }
    }
  }

  let html = '';
  let cursor = 0;
  for (const h of merged) {
    if (h.start > cursor) {
      html += escapeHtml(text.slice(cursor, h.start));
    }
    html += `<mark class="highlight">${escapeHtml(text.slice(h.start, h.end))}</mark>`;
    cursor = h.end;
  }
  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------- 渲染档案列表 ----------
function renderArchive() {
  if (!archiveData.length) {
    archiveListDiv.innerHTML = `<div class="empty-state">还没有任何档案，添加第一条吧 ✨</div>`;
    return;
  }

  const reversed = [...archiveData].reverse();
  let html = '';

  reversed.forEach(entry => {
    const entryId = entry.id;
    const total = entry.responses.length;

    // 每一个 slide
    let slidesHtml = '';
    entry.responses.forEach((res, idx) => {
      const textHtml = buildHighlightedHTML(res.text, res.highlights);
      slidesHtml += `
        <div class="slide" data-entry-id="${entryId}" data-res-id="${res.id}">
          <div class="slide-inner">
            <div class="response-header">
              <span class="ai-badge">${escapeHtml(res.ai)}</span>
              <div class="slide-actions">
                <button class="btn-mark" data-action="mark" data-entry-id="${entryId}" data-res-id="${res.id}">✏️ 标记重点</button>
                <button class="btn-mark" data-action="clear-mark" data-entry-id="${entryId}" data-res-id="${res.id}">清除划线</button>
              </div>
            </div>
            <div class="response-text" data-raw-id="${res.id}">${textHtml}</div>
          </div>
        </div>
      `;
    });

    // dots
    let dotsHtml = '';
    for (let i = 0; i < total; i++) {
      dotsHtml += `<button class="dot ${i === 0 ? 'active' : ''}" data-action="dot" data-entry-id="${entryId}" data-index="${i}"></button>`;
    }

    html += `
      <div class="archive-card" data-entry-id="${entryId}" data-current-index="0">
        <div class="question">❓ ${escapeHtml(entry.question)}</div>
        <div class="slider-wrap">
          <button class="slider-arrow" data-action="prev" data-entry-id="${entryId}" ${total <= 1 ? 'disabled' : ''}>‹</button>
          <div class="slider-viewport">
            <div class="slider-track" data-track-id="${entryId}">
              ${slidesHtml}
            </div>
          </div>
          <button class="slider-arrow" data-action="next" data-entry-id="${entryId}" ${total <= 1 ? 'disabled' : ''}>›</button>
        </div>
        ${total > 1 ? `<div class="slider-dots" data-dots-id="${entryId}">${dotsHtml}</div>` : ''}
      </div>
    `;
  });

  archiveListDiv.innerHTML = html;

  // 重新绑定滑动 / 标记事件
  bindSliderEvents();
  bindMarkEvents();
}

// ---------- 滑动逻辑 ----------
function updateSlider(entryId, newIndex) {
  const card = document.querySelector(`.archive-card[data-entry-id="${entryId}"]`);
  if (!card) return;
  const entry = archiveData.find(e => e.id === entryId);
  if (!entry) return;
  const total = entry.responses.length;
  if (total === 0) return;

  newIndex = Math.max(0, Math.min(total - 1, newIndex));
  card.dataset.currentIndex = newIndex;

  const track = card.querySelector('.slider-track');
  if (track) {
    track.style.transform = `translateX(-${newIndex * 100}%)`;
  }

  // 更新 dots
  const dots = card.querySelectorAll('.dot');
  dots.forEach((d, i) => {
    d.classList.toggle('active', i === newIndex);
  });
}

function bindSliderEvents() {
  document.querySelectorAll('.slider-arrow').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const card = document.querySelector(`.archive-card[data-entry-id="${entryId}"]`);
      if (!card) return;
      const entry = archiveData.find(e => e.id === entryId);
      if (!entry) return;
      const total = entry.responses.length;
      let cur = parseInt(card.dataset.currentIndex || '0', 10);
      if (btn.dataset.action === 'prev') cur = Math.max(0, cur - 1);
      if (btn.dataset.action === 'next') cur = Math.min(total - 1, cur + 1);
      updateSlider(entryId, cur);
    });
  });

  document.querySelectorAll('.dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = dot.dataset.entryId;
      const index = parseInt(dot.dataset.index, 10);
      updateSlider(entryId, index);
    });
  });

  // 触摸滑动
  document.querySelectorAll('.slider-viewport').forEach(vp => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let moved = false;

    vp.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
      moved = false;
    }, { passive: true });

    vp.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        moved = true;
      }
    }, { passive: true });

    vp.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      if (!moved) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      if (Math.abs(dx) < 40) return;

      const card = vp.closest('.archive-card');
      if (!card) return;
      const entryId = card.dataset.entryId;
      const entry = archiveData.find(e => e.id === entryId);
      if (!entry) return;
      const total = entry.responses.length;
      let cur = parseInt(card.dataset.currentIndex || '0', 10);

      if (dx < 0) cur = Math.min(total - 1, cur + 1); // 左滑 -> 下一个
      else cur = Math.max(0, cur - 1);                // 右滑 -> 上一个

      updateSlider(entryId, cur);
    });
  });
}

// ---------- 标记逻辑 ----------
function getSelectionOffsets(container) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;

  // 确保选区在 container 内
  if (!container.contains(range.commonAncestorContainer)) return null;

  // 计算相对于 container 文本内容的偏移
  function getOffset(root, node, offset) {
    let total = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = walker.nextNode())) {
      if (n === node) {
        return total + offset;
      }
      total += n.textContent.length;
    }
    return total;
  }

  let start = getOffset(container, range.startContainer, range.startOffset);
  let end = getOffset(container, range.endContainer, range.endOffset);
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

function bindMarkEvents() {
  document.querySelectorAll('[data-action="mark"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const resId = btn.dataset.resId;
      const entry = archiveData.find(e => e.id === entryId);
      if (!entry) return;
      const res = entry.responses.find(r => r.id === resId);
      if (!res) return;

      // 找到对应的 response-text 元素
      const textEl = document.querySelector(`.response-text[data-raw-id="${resId}"]`);
      if (!textEl) return;

      const offsets = getSelectionOffsets(textEl);
      if (!offsets) {
        alert('请先用鼠标或手指选中要标记的文字，再点「标记重点」。');
        return;
      }

      // 防止选中空白
      if (offsets.start === offsets.end) return;

      if (!Array.isArray(res.highlights)) res.highlights = [];
      res.highlights.push({ start: offsets.start, end: offsets.end });

      // 清空选区
      window.getSelection().removeAllRanges();

      saveToStorage();
      renderArchive();
    });
  });

  document.querySelectorAll('[data-action="clear-mark"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const resId = btn.dataset.resId;
      const entry = archiveData.find(e => e.id === entryId);
      if (!entry) return;
      const res = entry.responses.find(r => r.id === resId);
      if (!res) return;
      res.highlights = [];
      saveToStorage();
      renderArchive();
    });
  });
}

// ---------- 添加新档案 ----------
function addNewEntry() {
  const question = questionInput.value.trim();
  const ai = aiSelect.value;
  const responseText = responseInput.value.trim();

  if (!question) {
    alert('请输入问题内容。');
    questionInput.focus();
    return;
  }
  if (!responseText) {
    alert('请输入 AI 的回答。');
    responseInput.focus();
    return;
  }

  const newResponse = {
    id: generateId(),
    ai: ai,
    text: responseText,
    highlights: []
  };

  const existingEntry = archiveData.find(
    entry => entry.question.toLowerCase() === question.toLowerCase()
  );

  if (existingEntry) {
    existingEntry.responses.push(newResponse);
  } else {
    archiveData.push({
      id: generateId(),
      question: question,
      responses: [newResponse]
    });
  }

  saveToStorage();
  responseInput.value = '';
  renderArchive();
  responseInput.focus();
}

function clearForm() {
  questionInput.value = '';
  aiSelect.value = 'DeepSeek';
  responseInput.value = '';
  questionInput.focus();
}

function clearAllArchives() {
  if (!archiveData.length) {
    alert('还没有任何档案。');
    return;
  }
  if (window.confirm('⚠️ 确定要删除所有存档吗？此操作不可撤销。')) {
    archiveData = [];
    saveToStorage();
    renderArchive();
    clearForm();
  }
}

// ---------- 初始化 ----------
function init() {
  loadFromStorage();
  renderArchive();

  saveEntryBtn.addEventListener('click', addNewEntry);
  clearFormBtn.addEventListener('click', clearForm);
  clearAllBtn.addEventListener('click', clearAllArchives);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      addNewEntry();
    }
  };
  questionInput.addEventListener('keydown', handleKeyDown);
  responseInput.addEventListener('keydown', handleKeyDown);

  questionInput.focus();
}

init();
