import { state } from './state';
import { escapeHtml } from './state';

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

function renderSuggestionDropdown(container, items, keyword, activeIndex) {
  if (!container) return;
  if (!items.length && keyword) {
    container.innerHTML = `
      <div class="suggest-empty">
        <p>未找到「${escapeHtml(keyword)}」相关书籍</p>
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
      <div class="suggest-info">
        <p class="suggest-title">${highlightMatch(item.title, keyword)}</p>
        <p class="suggest-author">${highlightMatch(item.author, keyword)}</p>
      </div>
      <div class="suggest-meta">
        <span class="suggest-price">¥${Number(item.price).toFixed(2)}</span>
        <span class="suggest-sales">销量 ${item.sales}</span>
      </div>
    </div>
  `
    )
    .join('');
  container.classList.add('suggest-visible');
}

export function createSearchSuggest({ api, onSuggestSelect }) {
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
      state.searchSuggestion.activeIndex
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
      state.searchSuggestion.visible = false;
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
      selectItem(items[activeIndex]);
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

  function selectItem(item) {
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
    const item = event.target.closest('[data-suggest-index]');
    if (!item) return;
    const idx = parseInt(item.dataset.suggestIndex, 10);
    const suggestion = state.searchSuggestion.items[idx];
    if (suggestion) {
      selectItem(suggestion);
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
        if (state.searchSuggestion.items.length && state.searchSuggestion.keyword) {
          state.searchSuggestion.visible = true;
          updateDropdown();
        }
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
