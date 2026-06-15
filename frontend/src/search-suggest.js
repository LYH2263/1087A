import { state } from './state';
import { escapeHtml, escapeHtmlAttr } from './state';

let requestId = 0;
let debounceTimer = null;

function debounce(fn, delay) {
  return function (...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function highlightMatch(text, keyword) {
  if (!keyword) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedKeyword = escapeHtml(keyword);
  const regex = new RegExp(`(${escapedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark class="suggest-highlight">$1</mark>');
}

function renderSuggestionDropdown(container, items, keyword, activeIndex, history) {
  if (!container) return;
  if (!items.length && !keyword && history && history.length > 0) {
    container.innerHTML = `
      <div class="history-section">
        <div class="history-header">
          <span class="history-title">搜索历史</span>
          <button class="history-clear" data-action="clear-search-history">清空</button>
        </div>
        <div class="history-tags">
          ${history
            .map(
              (kw) => `
            <span class="history-tag">
              <span class="history-tag-keyword" data-history-keyword="${escapeHtmlAttr(kw)}">${escapeHtml(kw)}</span>
              <button class="history-tag-remove" data-action="remove-search-history" data-history-keyword="${escapeHtmlAttr(kw)}" title="移除">×</button>
            </span>
          `
            )
            .join('')}
        </div>
      </div>
    `;
    container.classList.add('suggest-visible');
    return;
  }
  if (!items.length && keyword) {
    container.innerHTML = `
      <div class="suggest-empty">
        <p>未找到「${escapeHtml(keyword)}」相关书籍</p>
        <p class="text-xs text-slate-400 mt-1">试试其他关键词吧</p>
      </div>
    `;
    container.classList.add('suggest-visible');
    return;
  }
  if (!items.length) {
    container.innerHTML = '';
    container.classList.remove('suggest-visible');
    return;
  }
  container.innerHTML = items
    .map(
      (item, idx) => `
    <div class="suggest-item${idx === activeIndex ? ' suggest-active' : ''}" data-suggest-index="${idx}" data-suggest-id="${item.id}">
      <img class="suggest-cover" src="${item.coverUrl}" alt="${escapeHtml(item.title)}" />
      <div class="suggest-info suggest-clickable" data-suggest-action="detail" data-suggest-index="${idx}">
        <p class="suggest-title">${highlightMatch(item.title, keyword)}</p>
        <p class="suggest-author">${highlightMatch(item.author, keyword)}</p>
      </div>
      <div class="suggest-meta">
        <span class="suggest-price">¥${Number(item.price).toFixed(2)}</span>
        <button class="suggest-search-btn" data-suggest-action="search" data-suggest-index="${idx}" title="搜索此书名">
          🔍 搜索
        </button>
      </div>
    </div>
  `
    )
    .join('');
  container.classList.add('suggest-visible');
}

export function createSearchSuggest({ api, onSuggestSelect, onSuggestDetail, onSearchKeyword, onClearHistory, onRemoveHistory }) {
  const DEBOUNCE_MS = 300;

  async function fetchSuggestions(keyword) {
    if (!keyword) {
      state.searchSuggestion.items = [];
      state.searchSuggestion.visible = false;
      state.searchSuggestion.activeIndex = -1;
      state.searchSuggestion.keyword = '';
      updateDropdown();
      return;
    }
    const currentRequestId = ++requestId;
    try {
      const items = await api.suggestBooks({ q: keyword, limit: 8 });
      if (currentRequestId !== requestId) return;
      state.searchSuggestion.items = items;
      state.searchSuggestion.visible = true;
      state.searchSuggestion.activeIndex = -1;
      state.searchSuggestion.keyword = keyword;
      updateDropdown();
    } catch (_e) {
      if (currentRequestId !== requestId) return;
      state.searchSuggestion.items = [];
      state.searchSuggestion.visible = false;
      state.searchSuggestion.activeIndex = -1;
      updateDropdown();
    }
  }

  const debouncedFetch = debounce(fetchSuggestions, DEBOUNCE_MS);

  function updateDropdown() {
    const container = document.getElementById('suggest-dropdown');
    if (!container) return;
    renderSuggestionDropdown(
      container,
      state.searchSuggestion.items,
      state.searchSuggestion.keyword,
      state.searchSuggestion.activeIndex,
      state.searchHistory.items
    );
  }

  function hideDropdown() {
    state.searchSuggestion.visible = false;
    state.searchSuggestion.activeIndex = -1;
    const container = document.getElementById('suggest-dropdown');
    if (container) {
      container.innerHTML = '';
      container.classList.remove('suggest-visible');
    }
  }

  function handleInput(event) {
    const input = event.target;
    if (input.name !== 'title') return;
    const keyword = input.value.trim();
    if (!keyword) {
      clearTimeout(debounceTimer);
      requestId++;
      state.searchSuggestion.items = [];
      state.searchSuggestion.visible = true;
      state.searchSuggestion.keyword = '';
      state.searchSuggestion.activeIndex = -1;
      updateDropdown();
      return;
    }
    debouncedFetch(keyword);
  }

  function handleKeydown(event) {
    const input = event.target;
    if (input.name !== 'title') return;
    const { items, visible, activeIndex } = state.searchSuggestion;

    if (event.key === 'ArrowDown' && visible && items.length) {
      event.preventDefault();
      state.searchSuggestion.activeIndex =
        activeIndex < items.length - 1 ? activeIndex + 1 : 0;
      updateDropdown();
      scrollActiveIntoView();
      return;
    }

    if (event.key === 'ArrowUp' && visible && items.length) {
      event.preventDefault();
      state.searchSuggestion.activeIndex =
        activeIndex > 0 ? activeIndex - 1 : items.length - 1;
      updateDropdown();
      scrollActiveIntoView();
      return;
    }

    if (event.key === 'Enter' && visible && activeIndex >= 0 && items[activeIndex]) {
      event.preventDefault();
      selectItemDetail(items[activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      hideDropdown();
      return;
    }
  }

  function scrollActiveIntoView() {
    const container = document.getElementById('suggest-dropdown');
    if (!container) return;
    const active = container.querySelector('.suggest-active');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function selectItemDetail(item) {
    hideDropdown();
    if (onSuggestDetail) {
      onSuggestDetail(item);
    }
  }

  function selectItemSearch(item) {
    hideDropdown();
    const titleInput = document.querySelector('form[data-form="book-search"] input[name="title"]');
    if (titleInput) {
      titleInput.value = item.title;
    }
    if (onSuggestSelect) {
      onSuggestSelect(item);
    }
  }

  function handleClickOutside(event) {
    const dropdown = document.getElementById('suggest-dropdown');
    const titleInput = document.querySelector('form[data-form="book-search"] input[name="title"]');
    if (!dropdown || !titleInput) return;
    if (!dropdown.contains(event.target) && event.target !== titleInput) {
      hideDropdown();
    }
  }

  function handleSuggestClick(event) {
    const clearBtn = event.target.closest('[data-action="clear-search-history"]');
    if (clearBtn) {
      event.preventDefault();
      event.stopPropagation();
      if (onClearHistory) onClearHistory();
      updateDropdown();
      return;
    }

    const removeBtn = event.target.closest('[data-action="remove-search-history"]');
    if (removeBtn) {
      event.preventDefault();
      event.stopPropagation();
      const kw = removeBtn.dataset.historyKeyword;
      if (onRemoveHistory) onRemoveHistory(kw);
      updateDropdown();
      return;
    }

    const historyTag = event.target.closest('[data-history-keyword]');
    if (historyTag && !event.target.closest('[data-action="remove-search-history"]')) {
      event.preventDefault();
      event.stopPropagation();
      const kw = historyTag.dataset.historyKeyword;
      const titleInput = document.querySelector('form[data-form="book-search"] input[name="title"]');
      if (titleInput) {
        titleInput.value = kw;
      }
      hideDropdown();
      if (onSearchKeyword) onSearchKeyword(kw);
      return;
    }

    const suggestAction = event.target.closest('[data-suggest-action]');
    if (suggestAction) {
      event.preventDefault();
      event.stopPropagation();
      const action = suggestAction.dataset.suggestAction;
      const idx = parseInt(suggestAction.dataset.suggestIndex, 10);
      const suggestion = state.searchSuggestion.items[idx];
      if (!suggestion) return;
      if (action === 'search') {
        selectItemSearch(suggestion);
      } else if (action === 'detail') {
        selectItemDetail(suggestion);
      }
      return;
    }

    const item = event.target.closest('[data-suggest-index]');
    if (item) {
      event.preventDefault();
      const idx = parseInt(item.dataset.suggestIndex, 10);
      const suggestion = state.searchSuggestion.items[idx];
      if (suggestion) {
        selectItemDetail(suggestion);
      }
    }
  }

  function attach() {
    const viewContent = document.getElementById('view-content');
    if (!viewContent) return;

    viewContent.addEventListener('input', handleInput);
    viewContent.addEventListener('keydown', handleKeydown);

    document.addEventListener('click', handleClickOutside);

    const dropdown = document.getElementById('suggest-dropdown');
    if (dropdown) {
      dropdown.addEventListener('click', handleSuggestClick);
    }

    const titleInput = viewContent.querySelector('form[data-form="book-search"] input[name="title"]');
    if (titleInput) {
      titleInput.addEventListener('focus', () => {
        state.searchSuggestion.visible = true;
        updateDropdown();
      });
    }
  }

  return {
    attach,
    hideDropdown,
    updateDropdown,
    destroy() {
      clearTimeout(debounceTimer);
      requestId++;
      state.searchSuggestion.items = [];
      state.searchSuggestion.visible = false;
      state.searchSuggestion.activeIndex = -1;
      state.searchSuggestion.keyword = '';
      const viewContent = document.getElementById('view-content');
      if (viewContent) {
        viewContent.removeEventListener('input', handleInput);
        viewContent.removeEventListener('keydown', handleKeydown);
      }
      document.removeEventListener('click', handleClickOutside);
    }
  };
}
