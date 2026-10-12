// script.js — 本地存储 + 轮播 + 划重点

const STORAGE_KEY = 'ai_chat_archive_v2';

// ---------- DOM ----------
const questionInput = document.getElementById('questionInput');
const aiSelect = document.getElementById('aiSelect');
const responseInput = document.getElementById('responseInput');
const saveEntryBtn = document.getElementById('saveEntryBtn');
const clearFormBtn = document.getElementById('clearFormBtn');
const archiveListDiv = document.getElementById('archiveList');
const clearAllBtn = document.getElementById('clearAllBtn');

// ---------- 数据 ----------
// { id, question, responses: [{ id, ai, text, marks: [{ start, end }] }] }
let archiveData = [];

// 用于记录每张卡片当前显示的 slide 索引 { entryId: index }
const carouselState = {};

// ---------- 工具 ----------
function loadFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      archiveData = JSON.parse(stored);
      // 兼容旧数据：补全 marks 字段
      archiveData.forEach(entry => {
        entry.responses.forEach(res => {
          if (!Array.isArray(res.marks)) res.marks = [];
        });
      });
    } catch (e) {
      console.error('读取失败', e);
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 把纯文本 + 下划线区间渲染成 HTML
// marks: [{start, end}] 基于原始纯文本的索引
function renderTextWithMarks(text, marks) {
  if (!marks || marks.length === 0) {
    return escapeHtml(text);
  }
  // 排序 & 合并重叠区间
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const m of sorted) {
    if (merged.length === 0) {
      merged.push({ ...m });
    } else {
      const last = merged[merged.length - 1];
      if (m.start <= last.end) {
        last.end = Math.max(last.end, m.end);
      } else {
        merged.push({ ...m });
      }
    }
  }

  let html = '';
  let cursor = 0;
  for (const m of merged) {
    const start = Math.max(0, Math.min(m.start, text.length));
    const end = Math.max(start, Math.min(m.end, text.length));
    if (start > cursor) {
      html += escapeHtml(text.slice(cursor, start));
    }
    if (end > start) {
      html += `<span class="underline-mark">${escapeHtml(text.slice(start, end))}</span>`;
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }
  return html;
}

// ---------- 渲染 ----------
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
    // 保证 carouselState 有值
    if (carouselState[entryId] === undefined || carouselState[entryId] >= total) {
      carouselState[entryId] = 0;
    }
    const current = carouselState[entryId];

    let slidesHtml = '';
    entry.responses.forEach((res, idx) => {
      const markedHtml = renderTextWithMarks(res.text, res.marks);
      slidesHtml += `
        <div class="carousel-slide" data-entry-id="${entryId}" data-res-id="${res.id}" data-index="${idx}">
          <div class="slide-header">
            <span class="ai-badge">${escapeHtml(res.ai)}</span>
            <div class="slide-actions">
              <button class="small-btn" data-action="mark" data-entry-id="${entryId}" data-res-id="${res.id}">✏️ 划重点</button>
              <button class="small-btn danger-btn" data-action="delete-res" data-entry-id="${entryId}" data-res-id="${res.id}">删除</button>
            </div>
          </div>
          <div class="response-text" id="res-text-${res.id}">${markedHtml}</div>
        </div>
      `;
    });

    html += `
      <div class="archive-card" data-entry-id="${entryId}">
        <div class="question">❓ ${escapeHtml(entry.question)}</div>
        <div class="carousel">
          <div class="carousel-viewport">
            <div class="carousel-track" id="track-${entryId}" style="transform: translateX(-${current * 100}%);">
              ${slidesHtml}
            </div>
          </div>
          <div class="slide-controls">
            <button class="nav-btn" data-action="prev" data-entry-id="${entryId}" ${current === 0 ? 'disabled' : ''}>‹</button>
            <span class="slide-indicator">${current + 1} / ${total}</span>
            <button class="nav-btn" data-action="next" data-entry-id="${entryId}" ${current >= total - 1 ? 'disabled' : ''}>›</button>
            <button class="small-btn" data-action="delete-entry" data-entry-id="${entryId}" style="margin-left:auto;">删除整个问题</button>
          </div>
        </div>
      </div>
    `;
  });

  archiveListDiv.innerHTML = html;
  bindEvents();
}

// ---------- 事件绑定 ----------
function bindEvents() {
  // 左右切换
  document.querySelectorAll('[data-action="prev"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      if (carouselState[entryId] > 0) {
        carouselState[entryId]--;
        updateCarousel(entryId);
      }
    });
  });
  document.querySelectorAll('[data-action="next"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const entry = archiveData.find(en => en.id === entryId);
      if (entry && carouselState[entryId] < entry.responses.length - 1) {
        carouselState[entryId]++;
        updateCarousel(entryId);
      }
    });
  });

  // 划重点
  document.querySelectorAll('[data-action="mark"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const resId = btn.dataset.resId;
      handleMark(entryId, resId);
    });
  });

  // 删除单个回答
  document.querySelectorAll('[data-action="delete-res"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const resId = btn.dataset.resId;
      deleteResponse(entryId, resId);
    });
  });

  // 删除整个问题
  document.querySelectorAll('[data-action="delete-entry"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      deleteEntry(entryId);
    });
  });
}

// 更新单个卡片轮播位置，不重新渲染整个列表（保持滚动位置）
function updateCarousel(entryId) {
  const track = document.getElementById(`track-${entryId}`);
  if (!track) return;
  const current = carouselState[entryId];
  track.style.transform = `translateX(-${current * 100}%)`;

  // 更新箭头状态和指示器
  const card = track.closest('.archive-card');
  const entry = archiveData.find(e => e.id === entryId);
  if (!entry) return;
  const total = entry.responses.length;

  const prevBtn = card.querySelector('[data-action="prev"]');
  const nextBtn = card.querySelector('[data-action="next"]');
  const indicator = card.querySelector('.slide-indicator');

  if (prevBtn) prevBtn.disabled = current === 0;
  if (nextBtn) nextBtn.disabled = current >= total - 1;
  if (indicator) indicator.textContent = `${current + 1} / ${total}`;
}

// ---------- 划重点逻辑 ----------
function handleMark(entryId, resId) {
  const entry = archiveData.find(e => e.id === entryId);
  if (!entry) return;
  const response = entry.responses.find(r => r.id === resId);
  if (!response) return;

  const textEl = document.getElementById(`res-text-${resId}`);
  if (!textEl) return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    alert('请先用手指 / 鼠标选中要划重点的文字，再点「划重点」。');
    return;
  }

  const range = selection.getRangeAt(0);

  // 确认选区在这个回答的文本范围内
  if (!textEl.contains(range.startContainer) || !textEl.contains(range.endContainer)) {
    alert('请选中当前回答里的文字。');
    return;
  }

  // 计算在原始纯文本里的偏移
  const startOffset = getTextOffset(textEl, range.startContainer, range.startOffset);
  const endOffset = getTextOffset(textEl, range.endContainer, range.endOffset);

  if (startOffset === null || endOffset === null || startOffset >= endOffset) {
    alert('选区有误，请重新选择。');
    return;
  }

  // 保存 marks（基于纯文本偏移）
  if (!Array.isArray(response.marks)) response.marks = [];
  response.marks.push({ start: startOffset, end: endOffset });

  // 合并重叠
  response.marks = mergeMarks(response.marks);

  saveToStorage();

  // 局部更新当前 slide 的文本（不重新渲染整个列表，避免丢失轮播位置）
  textEl.innerHTML = renderTextWithMarks(response.text, response.marks);

  // 清除选区
  selection.removeAllRanges();
}

// 计算节点在容器纯文本中的偏移（忽略 HTML 标签，只数文本）
function getTextOffset(container, node, offset) {
  let total = 0;
  let found = false;

  function walk(n) {
    if (found) return;
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) {
        total += offset;
      } else {
        // 如果选中的是元素节点，累加它之前子节点的文本
        for (let i = 0; i < offset && i < n.childNodes.length; i++) {
          total += n.childNodes[i].textContent.length;
        }
      }
      found = true;
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) {
      total += n.textContent.length;
    } else {
      for (const child of n.childNodes) {
        walk(child);
        if (found) return;
      }
    }
  }

  walk(container);
  return found ? total : null;
}

// 合并重叠的区间
function mergeMarks(marks) {
  if (marks.length <= 1) return marks;
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

// ---------- 新增档案 ----------
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

  const existingEntry = archiveData.find(
    entry => entry.question.toLowerCase() === question.toLowerCase()
  );

  const newResponse = {
    id: generateId(),
    ai: ai,
    text: responseText,
    marks: []
  };

  if (existingEntry) {
    existingEntry.responses.push(newResponse);
    // 切换到新添加的那一页
    carouselState[existingEntry.id] = existingEntry.responses.length - 1;
  } else {
    const newEntry = {
      id: generateId(),
      question: question,
      responses: [newResponse]
    };
    archiveData.push(newEntry);
    carouselState[newEntry.id] = 0;
  }

  saveToStorage();
  responseInput.value = '';
  renderArchive();
  responseInput.focus();
}

// ---------- 删除 ----------
function deleteResponse(entryId, resId) {
  const entry = archiveData.find(e => e.id === entryId);
  if (!entry) return;
  if (entry.responses.length <= 1) {
    if (!confirm('这是该问题下最后一个回答，删除后会同时删除这个问题。确定吗？')) return;
    deleteEntry(entryId);
    return;
  }
  if (!confirm('确定删除这个回答版本吗？')) return;
  entry.responses = entry.responses.filter(r => r.id !== resId);
  // 修正当前索引
  if (carouselState[entryId] >= entry.responses.length) {
    carouselState[entryId] = entry.responses.length - 1;
  }
  saveToStorage();
  renderArchive();
}

function deleteEntry(entryId) {
  if (!confirm('确定删除这个问题及其所有回答吗？')) return;
  archiveData = archiveData.filter(e => e.id !== entryId);
  delete carouselState[entryId];
  saveToStorage();
  renderArchive();
}

// ---------- 清空表单 / 全部 ----------
function clearForm() {
  questionInput.value = '';
  aiSelect.value = 'ChatGPT';
  responseInput.value = '';
  questionInput.focus();
}

function clearAllArchives() {
  if (!archiveData.length) {
    alert('还没有任何档案。');
    return;
  }
  if (!confirm('⚠️ 确定要删除所有存档吗？此操作不可撤销。')) return;
  archiveData = [];
  Object.keys(carouselState).forEach(k => delete carouselState[k]);
  saveToStorage();
  renderArchive();
  clearForm();
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
