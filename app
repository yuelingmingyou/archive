// script.js — 本地存储 + 多版本标记

const STORAGE_KEY = 'ai_chat_archive_v1';

// ---------- 数据模型 ----------
// 结构: { id, question, responses: [{ id, ai, text, underlined }] }

// 初始化数据
let archiveData = [];

// ---------- DOM 元素 ----------
const questionInput = document.getElementById('questionInput');
const aiSelect = document.getElementById('aiSelect');
const responseInput = document.getElementById('responseInput');
const saveEntryBtn = document.getElementById('saveEntryBtn');
const clearFormBtn = document.getElementById('clearFormBtn');
const archiveListDiv = document.getElementById('archiveList');
const clearAllBtn = document.getElementById('clearAllBtn');

// ---------- 工具函数 ----------
function loadFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      archiveData = JSON.parse(stored);
      // 确保每个 response 都有 underlined 字段（向后兼容）
      archiveData.forEach(item => {
        item.responses.forEach(res => {
          if (res.underlined === undefined) res.underlined = false;
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

// 生成短ID
function generateId() {
  return Date.now() + Math.random().toString(36).substring(2, 8);
}

// ---------- 渲染档案列表 ----------
function renderArchive() {
  if (!archiveData.length) {
    archiveListDiv.innerHTML = `<div class="empty-state">还没有任何档案，添加第一条吧 ✨</div>`;
    return;
  }

  // 按创建时间倒序（最新的在前面）—— 依靠id中的时间戳，但id是字符串，用数值排序不可靠，这里用保存顺序倒序即可
  // 为了简单，按原数组倒序显示，最新的在顶部
  const reversed = [...archiveData].reverse();

  let html = '';
  reversed.forEach(entry => {
    const entryId = entry.id;
    const question = entry.question;

    let responsesHtml = '';
    entry.responses.forEach((res, idx) => {
      const underlinedClass = res.underlined ? 'underlined' : '';
      const toggleActive = res.underlined ? 'active' : '';
      const toggleText = res.underlined ? '✓ 已标记' : '📌 下划线标记';
      
      responsesHtml += `
        <div class="response-item" data-entry-id="${entryId}" data-res-id="${res.id}">
          <div class="response-header">
            <span class="ai-badge">${escapeHtml(res.ai)}</span>
            <button class="underline-toggle ${toggleActive}" data-action="toggle-underline" data-entry-id="${entryId}" data-res-id="${res.id}">
              ${toggleText}
            </button>
          </div>
          <div class="response-text ${underlinedClass}" id="res-text-${res.id}">
            ${escapeHtml(res.text)}
          </div>
        </div>
      `;
    });

    html += `
      <div class="archive-card" data-entry-id="${entryId}">
        <div class="question">❓ ${escapeHtml(question)}</div>
        <div class="responses-container">
          ${responsesHtml}
        </div>
      </div>
    `;
  });

  archiveListDiv.innerHTML = html;

  // 绑定所有下划线按钮事件 (事件委托也可以，但这里重新绑定更清晰)
  document.querySelectorAll('[data-action="toggle-underline"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      const resId = btn.dataset.resId;
      toggleUnderline(entryId, resId);
    });
  });
}

// 简单的转义，防止XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------- 切换下划线状态 ----------
function toggleUnderline(entryId, resId) {
  const entry = archiveData.find(e => e.id === entryId);
  if (!entry) return;
  const response = entry.responses.find(r => r.id === resId);
  if (!response) return;

  // 切换状态
  response.underlined = !response.underlined;

  // 保存并重新渲染
  saveToStorage();
  renderArchive();
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

  // 检查是否已存在完全相同的问题（不区分大小写）？为了便于归并，我们查找是否已存在相同问题（完全一致）的条目
  // 如果存在，就在该条目的 responses 里追加新回答；否则新建条目
  const existingEntry = archiveData.find(entry => entry.question.toLowerCase() === question.toLowerCase());

  const newResponse = {
    id: generateId(),
    ai: ai,
    text: responseText,
    underlined: false
  };

  if (existingEntry) {
    // 追加到已有问题
    existingEntry.responses.push(newResponse);
  } else {
    // 创建新条目
    const newEntry = {
      id: generateId(),
      question: question,
      responses: [newResponse]
    };
    archiveData.push(newEntry);
  }

  // 保存到 localStorage
  saveToStorage();

  // 清空表单（但保留问题？方便继续问同一问题？ 可以保留问题方便继续问，但AI选择不变? 这里重置回答部分，保留问题以便继续添加其他AI回答）
  // 更符合场景：保存后清空回答输入，保留问题（便于同问题多AI回答）
  responseInput.value = '';
  // 可选: 把问题保留，方便继续添加同一个问题的其他版本
  // 但如果是新问题，下次可以修改问题，这里不强制清空问题，但为了灵活，让用户自己决定
  // 如果用户想开始新问题，可以手动清空。这里保留问题文本。
  // 但为了友好，如果用户想要新的问题可以点击"清空输入"。
  // 所以不清空问题

  // 重新渲染
  renderArchive();

  // 滚动到新添加的档案附近（但不强制）
  // 可以聚焦到回答框，方便继续添加
  responseInput.focus();
}

// ---------- 清空表单 ----------
function clearForm() {
  questionInput.value = '';
  aiSelect.value = 'ChatGPT';
  responseInput.value = '';
  questionInput.focus();
}

// ---------- 清空所有档案 ----------
function clearAllArchives() {
  if (!archiveData.length) {
    alert('还没有任何档案。');
    return;
  }
  const confirm = window.confirm('⚠️ 确定要删除所有存档吗？此操作不可撤销。');
  if (confirm) {
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

  // 事件绑定
  saveEntryBtn.addEventListener('click', addNewEntry);
  clearFormBtn.addEventListener('click', clearForm);
  clearAllBtn.addEventListener('click', clearAllArchives);

  // 支持 Ctrl+Enter 快捷保存
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      addNewEntry();
    }
  };
  questionInput.addEventListener('keydown', handleKeyDown);
  responseInput.addEventListener('keydown', handleKeyDown);

  // 自动聚焦问题输入
  questionInput.focus();
}

// 启动
init();
