import { state, escapeHtml, escapeHtmlAttr } from './state';

function formatCurrency(value) {
  return `¥${Number(value).toFixed(2)}`;
}

export function createBookDetail({ api, openModal, closeModal, showToast, addToCart, toggleFavorite, loadWishlist, safeRender }) {
  let detailSpecId = '';

  function getDetailSpec(book) {
    if (!book.hasSpecs || !book.specs || book.specs.length === 0) return null;
    if (!detailSpecId) return book.specs[0];
    return book.specs.find((s) => s.id === detailSpecId) || book.specs[0];
  }

  function getDetailPrice(book) {
    const spec = getDetailSpec(book);
    if (spec) return spec.price;
    return book.price;
  }

  function getDetailStock(book) {
    const spec = getDetailSpec(book);
    if (spec) return spec.stock;
    return book.stock;
  }

  function getDetailCover(book) {
    const spec = getDetailSpec(book);
    if (spec && spec.coverUrl) return spec.coverUrl;
    return book.coverUrl;
  }

  function renderDetailSpecSelector(book) {
    if (!book.hasSpecs || !book.specs || book.specs.length === 0) return '';
    const selectedSpec = getDetailSpec(book);
    return `
      <div class="flex flex-wrap gap-2">
        ${book.specs
          .map(
            (spec) => `
          <button class="px-3 py-1 rounded-full text-sm border transition ${
            spec.id === selectedSpec.id
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'
          }"
            data-action="detail-select-spec" data-book-id="${book.id}" data-spec-id="${spec.id}">
            ${escapeHtml(spec.name)}
          </button>
        `
          )
          .join('')}
      </div>
    `;
  }

  function renderBookDetailContent(book) {
    const selectedSpec = getDetailSpec(book);
    const price = getDetailPrice(book);
    const stock = getDetailStock(book);
    const cover = getDetailCover(book);
    const favorited = state.wishlist.some((item) => item.bookId === book.id);
    const outOfStock = stock < 1;

    return `
      <div class="space-y-5">
        <div class="flex flex-col md:flex-row gap-5">
          <div class="flex-shrink-0 mx-auto md:mx-0">
            <div class="w-48 h-60 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
              <img src="${cover}" alt="${escapeHtml(book.title)}" class="w-full h-full object-contain" />
            </div>
          </div>
          <div class="flex-1 space-y-3">
            <div class="space-y-1">
              <h3 class="text-xl font-semibold text-slate-900">${escapeHtml(book.title)}</h3>
              <p class="text-sm text-slate-500">作者：${escapeHtml(book.author)}${
      book.category ? ` · 分类：${escapeHtml(book.category.name)}` : ''
    }</p>
              <p class="text-xs text-slate-400">ISBN：${escapeHtml(book.isbn)} · 销量 ${book.sales}</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-teal-700">${formatCurrency(price)}</p>
            </div>
            ${
              book.hasSpecs
                ? `<div class="space-y-1">
              <p class="text-sm font-medium text-slate-700">规格</p>
              ${renderDetailSpecSelector(book)}
            </div>`
                : `<div class="space-y-1">
              <p class="text-sm font-medium text-slate-700">库存</p>
              <p class="text-sm ${outOfStock ? 'text-red-600 font-semibold' : 'text-slate-600'}">${
                    outOfStock ? '缺货' : `库存 ${stock} 本`
                  }</p>
            </div>`
            }
            ${
              book.hasSpecs && selectedSpec
                ? `<p class="text-xs text-slate-500">已选：${escapeHtml(
                    selectedSpec.name
                  )} · 库存 ${selectedSpec.stock}</p>`
                : ''
            }
            <div class="space-y-1">
              <p class="text-sm font-medium text-slate-700">简介</p>
              <p class="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">${escapeHtml(
                book.description
              )}</p>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-3 justify-end pt-2 border-t border-slate-100">
          <button class="btn-outline" data-action="detail-toggle-favorite" data-book-id="${book.id}">
            ${favorited ? '♥ 已收藏' : '♡ 收藏'}
          </button>
          <button class="btn-primary" data-action="detail-add-to-cart" data-book-id="${book.id}" data-spec-id="${
      selectedSpec ? selectedSpec.id : ''
    }" ${outOfStock ? 'disabled' : ''}>
            ${outOfStock ? '缺货' : '加入购物车'}
          </button>
        </div>
      </div>
    `;
  }

  async function openBookDetail(bookId) {
    try {
      const book = await api.getBook(bookId);
      detailSpecId = '';
      openModal(renderBookDetailContent(book));
      document.getElementById('modal').dataset.bookId = bookId;
    } catch (error) {
      showToast(error.message || '加载书籍详情失败', 'error');
    }
  }

  function rerenderModalBookDetail(book) {
    const modalEl = document.getElementById('modal');
    if (!modalEl) return;
    const wrapper = modalEl.querySelector('.card');
    if (!wrapper) return;
    const closeBtn = wrapper.querySelector('[data-action="close-modal"]');
    const content = document.createElement('div');
    content.innerHTML = renderBookDetailContent(book);
    const inner = content.firstElementChild;
    if (!inner) return;
    const spaceDiv = wrapper.querySelector('.space-y-5');
    if (spaceDiv) {
      spaceDiv.replaceWith(inner);
    } else if (closeBtn) {
      closeBtn.insertAdjacentElement('afterend', inner);
    }
  }

  function handleDetailSpecSelect(bookId, specId) {
    detailSpecId = specId;
    const modal = document.getElementById('modal');
    if (!modal || modal.dataset.bookId !== bookId) return;
    const book = state.books.find((b) => b.id === bookId);
    if (book) {
      rerenderModalBookDetail(book);
    }
  }

  async function handleDetailFavorite(bookId) {
    try {
      const isFavorited = state.wishlist.some((item) => item.bookId === bookId);
      if (isFavorited) {
        await api.removeFromWishlistByBook(bookId);
        showToast('已取消收藏', 'success');
      } else {
        await api.addToWishlist(bookId);
        showToast('已收藏', 'success');
      }
      await loadWishlist();
      safeRender();
      const modal = document.getElementById('modal');
      if (modal && modal.dataset.bookId === bookId) {
        const book = state.books.find((b) => b.id === bookId) || (await api.getBook(bookId).catch(() => null));
        if (book) {
          rerenderModalBookDetail(book);
        }
      }
    } catch (error) {
      showToast(error.message || '操作失败', 'error');
    }
  }

  async function handleDetailAddToCart(bookId, specId) {
    try {
      await addToCart(bookId, specId || '');
      closeModal();
    } catch (error) {
      showToast(error.message || '加入购物车失败', 'error');
    }
  }

  function attachDetailHandlers(modalEl) {
    if (!modalEl) return;
    modalEl.addEventListener('click', (event) => {
      const actionTarget = event.target.closest('[data-action]');
      if (!(actionTarget instanceof HTMLElement)) return;
      const action = actionTarget.dataset.action;

      if (action === 'detail-select-spec') {
        event.preventDefault();
        const bookId = actionTarget.dataset.bookId;
        const specId = actionTarget.dataset.specId;
        if (bookId) handleDetailSpecSelect(bookId, specId);
        return;
      }

      if (action === 'detail-toggle-favorite') {
        event.preventDefault();
        const bookId = actionTarget.dataset.bookId;
        if (bookId) handleDetailFavorite(bookId);
        return;
      }

      if (action === 'detail-add-to-cart') {
        event.preventDefault();
        const bookId = actionTarget.dataset.bookId;
        const specId = actionTarget.dataset.specId || '';
        if (bookId) handleDetailAddToCart(bookId, specId);
        return;
      }
    });
  }

  return {
    openBookDetail,
    attachDetailHandlers,
    renderBookDetailContent
  };
}
