import { z } from 'zod';
import {
  loginSchema,
  registerSchema,
  forgotSchema,
  resetSchema,
  reviewSchema,
  checkoutSchema,
  addressSchema,
  adminBookSchema,
  adminCategorySchema,
  COVER_MAX_SIZE,
  COVER_TYPES
} from '../validation/schemas.js';

function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function clearFormErrors(form) {
  form.querySelectorAll('.error-text').forEach((el) => el.remove());
  form.querySelectorAll('.input-error').forEach((el) => {
    el.classList.remove('input-error');
    el.removeAttribute('aria-invalid');
  });
  form.querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));
}

function markFieldError(field, message) {
  if (!field) return;
  field.classList.add('input-error');
  field.setAttribute('aria-invalid', 'true');
  const msg = document.createElement('p');
  msg.className = 'error-text';
  msg.textContent = message;
  field.insertAdjacentElement('afterend', msg);
}

function applyZodErrors(form, error) {
  const issues = error.issues || error.errors || [];
  const seen = new Set();

  issues.forEach((issue) => {
    const name = issue.path?.[0];
    if (!name || seen.has(name)) return;
    seen.add(name);

    const fields = Array.from(form.querySelectorAll(`[name="${name}"]`));
    if (!fields.length) return;

    if (fields.length > 1 && fields[0].type === 'radio') {
      fields.forEach((field) => {
        const card = field.closest('.card') || field.closest('label');
        if (card) card.classList.add('field-error');
        field.setAttribute('aria-invalid', 'true');
      });
      const group =
        form.querySelector(`[data-error-group="${name}"]`) ||
        fields[fields.length - 1].parentElement;
      if (group) {
        const msg = document.createElement('p');
        msg.className = 'error-text';
        msg.textContent = issue.message;
        group.insertAdjacentElement('afterend', msg);
      }
      return;
    }

    fields.forEach((field) => markFieldError(field, issue.message));
  });
}

function handleZodError(form, error) {
  if (error instanceof z.ZodError) {
    applyZodErrors(form, error);
    return true;
  }
  return false;
}

function handleApiValidationError(form, error) {
  const issues = error?.payload?.details;
  if (!Array.isArray(issues) || issues.length === 0) {
    return false;
  }

  applyZodErrors(form, { issues });
  return true;
}

function clearFieldError(field) {
  if (!field) return;
  const form = field.closest('form');
  if (field.type === 'radio' && form) {
    const group = form.querySelector(`[data-error-group="${field.name}"]`);
    if (group && group.nextElementSibling?.classList.contains('error-text')) {
      group.nextElementSibling.remove();
    }
    form.querySelectorAll(`[name="${field.name}"]`).forEach((radio) => {
      const card = radio.closest('.card') || radio.closest('label');
      if (card) card.classList.remove('field-error');
      radio.removeAttribute('aria-invalid');
    });
    return;
  }

  field.classList.remove('input-error');
  field.removeAttribute('aria-invalid');
  if (field.nextElementSibling?.classList.contains('error-text')) {
    field.nextElementSibling.remove();
  }
}

function validateCoverFile(file, form) {
  if (!file) return true;
  const input = form.querySelector('[name="coverFile"]');
  if (!COVER_TYPES.includes(file.type)) {
    markFieldError(input, '仅支持 JPG/PNG/WEBP/GIF/SVG 格式');
    return false;
  }
  if (file.size > COVER_MAX_SIZE) {
    markFieldError(input, '图片大小不能超过 2MB');
    return false;
  }
  return true;
}

export function bindEventHandlers({
  state,
  api,
  modal,
  viewContent,
  showToast,
  updateAuthUI,
  setView,
  loadBooks,
  normalizeBookSearch,
  loadCart,
  loadWishlist,
  loadOrders,
  loadAddresses,
  loadAdmin,
  loadNotifications,
  loadUnreadNotificationCount,
  updateNotificationBadge,
  safeRender,
  openModal,
  closeModal,
  openLoginModal,
  openRegisterModal,
  openForgotModal,
  openResetModal,
  escapeHtmlAttr,
  loadMember
}) {
  function formatCurrency(value) {
    return `¥${Number(value).toFixed(2)}`;
  }

  async function loadStockWarnings() {
    const data = await api.admin.getStockWarnings();
    state.admin.stockWarnings = data.books;
    state.admin.stockWarningStats = { total: data.total, zeroStockCount: data.zeroStockCount };
  }

  async function loadStockThreshold() {
    state.admin.stockThreshold = await api.admin.getStockThreshold();
  }

  async function loadRestockLogs(page = 1) {
    const data = await api.admin.getRestockLogs({ page, pageSize: state.admin.restockLogStats.pageSize });
    state.admin.restockLogs = data.logs;
    state.admin.restockLogStats = { total: data.total, page: data.page, pageSize: data.pageSize };
  }

  function openSetThresholdModal(bookId, bookTitle, currentThreshold) {
    const isGlobal = !bookId;
    const title = isGlobal ? '设置全局低库存阈值' : `设置「${bookTitle}」的低库存阈值`;
    const hint = isGlobal ? '所有未单独设置阈值的书籍将使用此阈值' : '设置后将覆盖全局阈值';
    openModal(`
      <div class="space-y-4">
        <h3 class="text-lg font-semibold">${title}</h3>
        <p class="text-sm text-slate-500">${hint}</p>
        <form data-form="set-threshold" data-book-id="${bookId || ''}" novalidate>
          <div class="space-y-2">
            <label class="text-sm text-slate-600">低库存阈值（本）</label>
            <input class="input input-lg" name="threshold" type="number" min="0" value="${currentThreshold || 10}" required placeholder="请输入阈值" />
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button type="button" class="btn-outline" data-action="close-modal">取消</button>
            <button type="submit" class="btn-primary">确认设置</button>
          </div>
        </form>
      </div>
    `);
  }

  function openSingleRestockModal(bookId, bookTitle, currentStock, threshold) {
    const suggestedQty = Math.max(threshold - currentStock, 10);
    openModal(`
      <div class="space-y-4">
        <h3 class="text-lg font-semibold">「${bookTitle}」补货</h3>
        <div class="bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
          <p>当前库存：<span class="font-semibold ${currentStock === 0 ? 'text-red-600' : 'text-amber-600'}">${currentStock} 本</span></p>
          <p>预警阈值：<span class="font-semibold">${threshold} 本</span></p>
          <p>建议补货：<span class="font-semibold text-emerald-600">${suggestedQty} 本（补足到阈值 + 10 本安全库存）</span></p>
        </div>
        <form data-form="single-restock" data-book-id="${bookId}" novalidate>
          <div class="space-y-2">
            <label class="text-sm text-slate-600">补货数量（本）</label>
            <input class="input input-lg" name="quantity" type="number" min="1" value="${suggestedQty}" required placeholder="请输入补货数量" />
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button type="button" class="btn-outline" data-action="close-modal">取消</button>
            <button type="submit" class="btn-primary">确认补货</button>
          </div>
        </form>
      </div>
    `);
  }

  function openBatchRestockModal() {
    const selectedBooks = state.admin.stockWarnings.filter(b => state.admin.selectedRestockBooks.has(b.id));
    if (selectedBooks.length === 0) {
      showToast('请先选择需要补货的书籍', 'error');
      return;
    }

    const bookList = selectedBooks.map(b => `
      <div class="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
        <div>
          <p class="font-medium text-sm">${b.title}</p>
          <p class="text-xs text-slate-500">当前库存：${b.stock} / 阈值：${b.threshold}</p>
        </div>
        <input class="input w-24" name="qty_${b.id}" type="number" min="1" value="${Math.max(b.threshold - b.stock, 10)}" required />
      </div>
    `).join('');

    openModal(`
      <div class="space-y-4">
        <h3 class="text-lg font-semibold">批量补货</h3>
        <p class="text-sm text-slate-500">已选择 ${selectedBooks.length} 本书籍，请分别设置补货数量</p>
        <form data-form="batch-restock" novalidate>
          <div class="space-y-2 max-h-80 overflow-y-auto">
            ${bookList}
          </div>
          <div class="flex justify-between items-center mt-4 pt-4 border-t border-slate-200">
            <button type="button" class="btn-outline" data-action="close-modal">取消</button>
            <button type="submit" class="btn-primary">确认批量补货</button>
          </div>
        </form>
      </div>
    `);
  }

  const modalActionHandlers = {
    'close-modal': closeModal,
    'show-register': openRegisterModal,
    'show-login': openLoginModal,
    'show-forgot': openForgotModal
  };

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
      return;
    }
    const action = event.target?.dataset?.action;
    const handler = modalActionHandlers[action];
    if (handler) handler();
  });

  document.addEventListener('input', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
      return;
    }
    if (!field.closest('form')) return;
    clearFieldError(field);
  });

  const modalFormHandlers = {
    login: async (form) => {
      const data = getFormData(form);
      const parsed = loginSchema.parse({
        account: data.account,
        password: data.password,
        remember: Boolean(data.remember)
      });
      const response = await api.login(parsed);
      api.setToken(response.accessToken, parsed.remember);
      state.user = response.user;
      updateAuthUI();
      closeModal();
      showToast('登录成功', 'success');
      try { await loadMember(1); } catch (e) {}
      await setView('books');
    },
    register: async (form) => {
      const data = getFormData(form);
      const parsed = registerSchema.parse({
        username: data.username,
        email: data.email,
        phone: data.phone,
        password: data.password
      });
      await api.register(parsed);
      showToast('注册成功，请登录', 'success');
      openLoginModal();
    },
    forgot: async (form) => {
      const data = getFormData(form);
      const parsed = forgotSchema.parse({ account: data.account, method: data.method });
      const response = await api.forgotPassword(parsed);
      const methodText = parsed.method === 'email' ? '邮箱' : '手机';
      showToast(`验证码已发送至您的${methodText}，验证码：${response.code}`, 'success');
      openResetModal();
    },
    reset: async (form) => {
      const data = getFormData(form);
      const parsed = resetSchema.parse({ token: data.token, newPassword: data.newPassword });
      await api.resetPassword(parsed);
      showToast('密码已更新', 'success');
      openLoginModal();
    },
    review: async (form) => {
      const data = getFormData(form);
      const parsed = reviewSchema.parse({
        rating: data.rating,
        reviewText: data.reviewText
      });
      await api.reviewOrder(form.dataset.order, parsed);
      closeModal();
      await loadOrders();
      safeRender();
      showToast('评价已提交', 'success');
    },
    'set-threshold': async (form) => {
      const data = getFormData(form);
      const bookId = form.dataset.bookId || undefined;
      const threshold = parseInt(data.threshold, 10);
      if (isNaN(threshold) || threshold < 0) {
        throw new Error('请输入有效的阈值');
      }
      await api.admin.setStockThreshold({ threshold, bookId });
      closeModal();
      await Promise.all([loadStockThreshold(), loadStockWarnings(), loadAdmin()]);
      safeRender();
      showToast(bookId ? '单品阈值已更新' : '全局阈值已更新', 'success');
    },
    'single-restock': async (form) => {
      const data = getFormData(form);
      const bookId = form.dataset.bookId;
      const quantity = parseInt(data.quantity, 10);
      if (isNaN(quantity) || quantity < 1) {
        throw new Error('请输入有效的补货数量');
      }
      await api.admin.restockBook({ bookId, quantity });
      closeModal();
      await Promise.all([loadStockWarnings(), loadAdmin(), loadRestockLogs(1)]);
      state.admin.selectedRestockBooks.delete(bookId);
      safeRender();
      showToast('补货成功', 'success');
    },
    'batch-restock': async (form) => {
      const data = getFormData(form);
      const items = [];
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('qty_')) {
          const bookId = key.replace('qty_', '');
          const quantity = parseInt(value, 10);
          if (!isNaN(quantity) && quantity > 0) {
            items.push({ bookId, quantity });
          }
        }
      }
      if (items.length === 0) {
        throw new Error('请输入有效的补货数量');
      }
      const result = await api.admin.batchRestock({ items });
      closeModal();
      await Promise.all([loadStockWarnings(), loadAdmin(), loadRestockLogs(1)]);
      state.admin.selectedRestockBooks.clear();
      safeRender();
      showToast(`批量补货成功，共补货 ${result.results.length} 本书籍`, 'success');
    },
    'admin-add-spec': async (form) => {
      const data = getFormData(form);
      const bookId = form.dataset.bookId;
      const payload = {
        name: data.name,
        price: parseFloat(data.price),
        stock: parseInt(data.stock, 10),
        coverUrl: data.coverUrl || null
      };
      if (!payload.name || isNaN(payload.price) || payload.price <= 0 || isNaN(payload.stock) || payload.stock < 0) {
        throw new Error('请填写正确的规格信息');
      }
      await api.admin.createBookSpec(bookId, payload);
      closeModal();
      await loadAdmin();
      safeRender();
      showToast('规格已添加', 'success');
    },
    'admin-edit-spec': async (form) => {
      const data = getFormData(form);
      const bookId = form.dataset.bookId;
      const specId = form.dataset.specId;
      const payload = {
        name: data.name,
        price: parseFloat(data.price),
        stock: parseInt(data.stock, 10),
        coverUrl: data.coverUrl || null
      };
      if (!payload.name || isNaN(payload.price) || payload.price <= 0 || isNaN(payload.stock) || payload.stock < 0) {
        throw new Error('请填写正确的规格信息');
      }
      await api.admin.updateBookSpec(bookId, specId, payload);
      closeModal();
      await loadAdmin();
      safeRender();
      showToast('规格已更新', 'success');
    }
  };

  modal.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const formType = form.dataset.form;
    const handler = modalFormHandlers[formType];
    if (!handler) return;

    try {
      clearFormErrors(form);
      await handler(form);
    } catch (error) {
      if (handleZodError(form, error)) return;
      if (handleApiValidationError(form, error)) return;
      showToast(error.message || '操作失败', 'error');
    }
  });

  const contentFormHandlers = {
    'book-search': async (form) => {
      const data = getFormData(form);
      await loadBooks(normalizeBookSearch(data));
    },
    checkout: async (form) => {
      const data = getFormData(form);
      const parsed = checkoutSchema.parse({
        addressId: data.addressId,
        paymentMethod: data.paymentMethod
      });
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent;
      if (submitBtn) {
        if (submitBtn.disabled) return;
        submitBtn.disabled = true;
        submitBtn.textContent = '处理中...';
      }

      try {
        await api.checkout(parsed);
        showToast('订单已生成，请完成支付', 'success');
        await loadCart();
        await loadOrders();
        state.view = 'orders';
        safeRender();
      } finally {
        if (submitBtn && document.body.contains(submitBtn)) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText || '生成待支付订单';
        }
      }
    },
    address: async (form) => {
      const data = getFormData(form);
      const parsed = addressSchema.parse({
        ...data,
        isDefault: Boolean(data.isDefault)
      });
      if (data.addressId) {
        await api.updateAddress(data.addressId, parsed);
        showToast('地址已更新', 'success');
      } else {
        await api.addAddress(parsed);
        showToast('地址已新增', 'success');
      }
      await loadAddresses();
      state.profile.editingAddress = null;
      safeRender();
    },
    'admin-book': async (form) => {
      const data = getFormData(form);
      const coverFile = data.coverFile instanceof File && data.coverFile.size > 0 ? data.coverFile : null;
      let coverUrl = state.admin.editingBook?.coverUrl || '';
      if (!validateCoverFile(coverFile, form)) {
        return;
      }
      if (coverFile) {
        const upload = await api.admin.uploadCover(coverFile);
        coverUrl = upload.url;
      }
      const payload = adminBookSchema.parse({
        title: data.title,
        author: data.author,
        isbn: data.isbn,
        description: data.description,
        price: data.price,
        stock: data.stock,
        coverUrl,
        categoryId: data.categoryId
      });
      if (state.admin.editingBook) {
        await api.admin.updateBook(state.admin.editingBook.id, payload);
        state.admin.editingBook = null;
        showToast('书籍已更新', 'success');
      } else {
        await api.admin.createBook(payload);
        showToast('书籍已添加', 'success');
      }
      await loadAdmin();
      safeRender();
      form.reset();
    },
    'admin-category': async (form) => {
      const data = getFormData(form);
      const parsed = adminCategorySchema.parse({ name: data.name });
      await api.admin.createCategory(parsed);
      showToast('分类已添加', 'success');
      await loadAdmin();
      safeRender();
      form.reset();
    }
  };

  viewContent.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const formType = form.dataset.form;
    const handler = contentFormHandlers[formType];
    if (!handler) return;

    try {
      clearFormErrors(form);
      await handler(form);
    } catch (error) {
      if (handleZodError(form, error)) return;
      if (handleApiValidationError(form, error)) return;
      showToast(error.message || '提交失败', 'error');
    }
  });

  const contentActionHandlers = {
    'toggle-favorite': async (target) => {
      if (!state.user) {
        openLoginModal();
        return;
      }
      const bookId = target.dataset.id;
      const isFavorited = state.wishlist.some((item) => item.bookId === bookId);
      try {
        if (isFavorited) {
          await api.removeFromWishlistByBook(bookId);
          showToast('已取消收藏', 'success');
        } else {
          await api.addToWishlist(bookId);
          showToast('已收藏', 'success');
        }
        await loadWishlist();
        safeRender();
      } catch (error) {
        showToast(error.message || '操作失败', 'error');
      }
    },
    'remove-wishlist': async (target) => {
      const itemId = target.dataset.id;
      await api.removeFromWishlist(itemId);
      showToast('已移除收藏', 'success');
      await loadWishlist();
      safeRender();
    },
    'wishlist-to-cart': async (target) => {
      const itemId = target.dataset.id;
      await api.addWishlistToCart(itemId);
      showToast('已加入购物车', 'success');
      await loadCart();
      await loadWishlist();
      safeRender();
    },
    'add-to-cart': async (target) => {
      if (!state.user) {
        openLoginModal();
        return;
      }
      const bookId = target.dataset.id;
      const specId = target.dataset.specId || '';
      await api.addToCart({ bookId, quantity: 1, specId });
      showToast('已加入购物车', 'success');
    },
    'reset-search': async (target) => {
      const form = target.closest('form');
      if (form) {
        form.reset();
        clearFormErrors(form);
      }
      state.bookSearch = normalizeBookSearch();
      await loadBooks(state.bookSearch);
    },
    'remove-cart': async (target) => {
      await api.removeCart(target.dataset.id);
      await loadCart();
      safeRender();
    },
    'clear-cart': async () => {
      await api.clearCart();
      await loadCart();
      safeRender();
    },
    'cancel-order': async (target) => {
      await api.cancelOrder(target.dataset.id);
      await loadOrders();
      safeRender();
    },
    'pay-order': async (target) => {
      await api.payOrder(target.dataset.id);
      await loadOrders();
      safeRender();
      showToast('支付成功', 'success');
    },
    'confirm-order': async (target) => {
      const order = state.orders.find(o => o.id === target.dataset.id);
      const result = await api.confirmOrder(target.dataset.id);
      await loadOrders();
      try { await loadMember(1); } catch (e) {}
      safeRender();
      const earned = result?.earnedPoints ?? order?.estimatedPoints ?? 0;
      if (earned > 0) {
        showToast(`确认收货成功，获得 ${earned} 积分`, 'success');
      } else {
        showToast('确认收货成功', 'success');
      }
    },
    'review-order': async (target) => {
      const orderId = target.dataset.id;
      openModal(`
        <div class="space-y-4">
          <h3 class="text-lg font-semibold">评价订单</h3>
          <form data-form="review" data-order="${orderId}" class="space-y-3" novalidate>
            <input class="input" name="rating" type="number" min="1" max="5" placeholder="评分 1-5" required />
            <textarea class="input" name="reviewText" rows="3" placeholder="评价内容" required></textarea>
            <button class="btn-primary w-full" type="submit">提交评价</button>
          </form>
        </div>
      `);
    },
    'set-default': async (target) => {
      await api.setDefaultAddress(target.dataset.id);
      await loadAddresses();
      if (state.profile.editingAddress?.id === target.dataset.id) {
        state.profile.editingAddress = state.addresses.find((item) => item.id === target.dataset.id) || null;
      }
      safeRender();
    },
    'edit-address': async (target) => {
      state.profile.editingAddress = state.addresses.find((item) => item.id === target.dataset.id) || null;
      safeRender();
    },
    'cancel-edit-address': async () => {
      state.profile.editingAddress = null;
      safeRender();
    },
    'delete-address': async (target) => {
      await api.deleteAddress(target.dataset.id);
      await loadAddresses();
      if (state.profile.editingAddress?.id === target.dataset.id) {
        state.profile.editingAddress = null;
      }
      safeRender();
    },
    'admin-tab': async (target) => {
      state.admin.tab = target.dataset.tab;
      safeRender();
    },
    'edit-book': async (target) => {
      const book = state.admin.books.find((item) => item.id === target.dataset.id);
      state.admin.editingBook = book;
      safeRender();
    },
    'select-spec': async (target) => {
      const bookId = target.dataset.bookId;
      const specId = target.dataset.specId;
      state.selectedSpecs[bookId] = specId;
      safeRender();
    },
    'manage-specs': async (target) => {
      const bookId = target.dataset.id;
      const bookTitle = target.dataset.title;
      const book = state.admin.books.find((b) => b.id === bookId);
      const specs = book?.specs || [];
      const specRows = specs.length > 0
        ? specs.map((spec) => `
          <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div class="flex-1">
              <p class="font-medium">${spec.name}</p>
              <p class="text-sm text-slate-500">价格 ${formatCurrency(spec.price)} · 库存 ${spec.stock}</p>
            </div>
            <button class="btn-outline text-sm" data-action="edit-spec" data-book-id="${bookId}" data-spec-id="${spec.id}" data-name="${escapeHtmlAttr(spec.name)}" data-price="${spec.price}" data-stock="${spec.stock}" data-cover="${spec.coverUrl || ''}">编辑</button>
            <button class="btn-outline text-sm text-red-600 border-red-200" data-action="delete-spec" data-book-id="${bookId}" data-spec-id="${spec.id}" data-name="${escapeHtmlAttr(spec.name)}">删除</button>
          </div>
        `).join('')
        : '<p class="text-slate-500 text-sm">暂无规格，请添加</p>';
      openModal(`
        <div class="space-y-4">
          <h3 class="text-lg font-semibold">「${bookTitle}」规格管理</h3>
          <div class="space-y-2 max-h-60 overflow-y-auto">${specRows}</div>
          <div class="border-t border-slate-200 pt-4">
            <h4 class="font-semibold text-sm mb-2">新增规格</h4>
            <form data-form="admin-add-spec" data-book-id="${bookId}" class="grid grid-cols-2 gap-3" novalidate>
              <input class="input" name="name" placeholder="规格名称（如平装）" required />
              <input class="input" name="price" type="number" step="0.01" min="0.01" placeholder="价格" required />
              <input class="input" name="stock" type="number" min="0" placeholder="库存" required />
              <input class="input" name="coverUrl" placeholder="封面URL（可选）" />
              <div class="col-span-2 flex justify-end gap-2">
                <button type="button" class="btn-outline" data-action="close-modal">取消</button>
                <button type="submit" class="btn-primary">添加规格</button>
              </div>
            </form>
          </div>
        </div>
      `);
    },
    'edit-spec': async (target) => {
      const bookId = target.dataset.bookId;
      const specId = target.dataset.specId;
      const name = target.dataset.name;
      const price = target.dataset.price;
      const stock = target.dataset.stock;
      const cover = target.dataset.cover;
      const book = state.admin.books.find((b) => b.id === bookId);
      const bookTitle = book?.title || '';
      openModal(`
        <div class="space-y-4">
          <h3 class="text-lg font-semibold">编辑规格「${name}」</h3>
          <form data-form="admin-edit-spec" data-book-id="${bookId}" data-spec-id="${specId}" class="grid grid-cols-2 gap-3" novalidate>
            <input class="input" name="name" placeholder="规格名称" value="${name}" required />
            <input class="input" name="price" type="number" step="0.01" min="0.01" placeholder="价格" value="${price}" required />
            <input class="input" name="stock" type="number" min="0" placeholder="库存" value="${stock}" required />
            <input class="input" name="coverUrl" placeholder="封面URL（可选）" value="${cover}" />
            <div class="col-span-2 flex justify-end gap-2">
              <button type="button" class="btn-outline" data-action="close-modal">取消</button>
              <button type="submit" class="btn-primary">保存修改</button>
            </div>
          </form>
        </div>
      `);
    },
    'delete-spec': async (target) => {
      const bookId = target.dataset.bookId;
      const specId = target.dataset.specId;
      const name = target.dataset.name;
      if (!confirm(`确定要删除规格「${name}」吗？`)) return;
      await api.admin.deleteBookSpec(bookId, specId);
      await loadAdmin();
      safeRender();
      showToast('规格已删除', 'success');
    },
    'deactivate-book': async (target) => {
      await api.admin.deactivateBook(target.dataset.id);
      await loadAdmin();
      safeRender();
    },
    'restore-book': async (target) => {
      await api.admin.restoreBook(target.dataset.id);
      await loadAdmin();
      safeRender();
    },
    'delete-category': async (target) => {
      await api.admin.deleteCategory(target.dataset.id);
      await loadAdmin();
      safeRender();
    },
    'admin-accept': async (target) => {
      await api.admin.acceptOrder(target.dataset.id);
      await loadAdmin();
      safeRender();
    },
    'admin-ship': async (target) => {
      await api.admin.shipOrder(target.dataset.id);
      await loadAdmin();
      safeRender();
    },
    'admin-refund': async (target) => {
      await api.admin.refundOrder(target.dataset.id);
      await loadAdmin();
      safeRender();
    },
    'export-orders': async () => {
      const response = await api.admin.exportOrders();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'orders.csv';
      link.click();
      URL.revokeObjectURL(url);
    },
    'set-global-threshold': async (target) => {
      const current = target.dataset.current || 10;
      openSetThresholdModal(null, null, current);
    },
    'set-book-threshold': async (target) => {
      const bookId = target.dataset.id;
      const bookTitle = target.dataset.title;
      const current = target.dataset.current || '';
      openSetThresholdModal(bookId, bookTitle, current);
    },
    'delete-book-threshold': async (target) => {
      const bookId = target.dataset.id;
      const bookTitle = target.dataset.title;
      if (!confirm(`确定要删除「${bookTitle}」的单品阈值配置吗？删除后将使用全局阈值。`)) {
        return;
      }
      await api.admin.deleteBookThreshold(bookId);
      await Promise.all([loadStockThreshold(), loadStockWarnings(), loadAdmin()]);
      safeRender();
      showToast('已删除单品阈值，将使用全局阈值', 'success');
    },
    'quick-restock': async (target) => {
      const bookId = target.dataset.id;
      const bookTitle = target.dataset.title;
      const book = state.admin.books.find(b => b.id === bookId);
      const threshold = state.admin.stockThreshold?.bookThresholds?.find(bt => bt.bookId === bookId)?.threshold
        ?? state.admin.stockThreshold?.global?.threshold ?? 10;
      openSingleRestockModal(bookId, bookTitle, book?.stock ?? 0, threshold);
    },
    'single-restock': async (target) => {
      const bookId = target.dataset.id;
      const bookTitle = target.dataset.title;
      const currentStock = parseInt(target.dataset.stock, 10) || 0;
      const threshold = parseInt(target.dataset.threshold, 10) || 10;
      openSingleRestockModal(bookId, bookTitle, currentStock, threshold);
    },
    'toggle-restock-select': async (target) => {
      const bookId = target.dataset.id;
      if (target.checked) {
        state.admin.selectedRestockBooks.add(bookId);
      } else {
        state.admin.selectedRestockBooks.delete(bookId);
      }
      safeRender();
    },
    'toggle-select-all': async (target) => {
      if (target.checked) {
        state.admin.stockWarnings.forEach(book => {
          state.admin.selectedRestockBooks.add(book.id);
        });
      } else {
        state.admin.selectedRestockBooks.clear();
      }
      safeRender();
    },
    'batch-restock': async () => {
      openBatchRestockModal();
    },
    'restock-log-prev': async () => {
      const currentPage = state.admin.restockLogStats.page;
      if (currentPage > 1) {
        await loadRestockLogs(currentPage - 1);
        safeRender();
      }
    },
    'restock-log-next': async () => {
      const currentPage = state.admin.restockLogStats.page;
      const totalPages = Math.ceil(state.admin.restockLogStats.total / state.admin.restockLogStats.pageSize);
      if (currentPage < totalPages) {
        await loadRestockLogs(currentPage + 1);
        safeRender();
      }
    },
    'mark-read': async (target) => {
      const notificationId = target.dataset.id;
      await api.markNotificationRead(notificationId);
      if (state.view === 'notifications') {
        await loadNotifications(state.notifications.page);
      } else {
        await loadUnreadNotificationCount();
      }
      showToast('已标记为已读', 'success');
    },
    'mark-all-read': async () => {
      await api.markAllNotificationsRead();
      if (state.view === 'notifications') {
        await loadNotifications(state.notifications.page);
      } else {
        await loadUnreadNotificationCount();
      }
      showToast('所有消息已标记为已读', 'success');
    },
    'delete-notification': async (target) => {
      const notificationId = target.dataset.id;
      if (!confirm('确定要删除这条消息吗？')) {
        return;
      }
      await api.deleteNotification(notificationId);
      if (state.view === 'notifications') {
        const currentPage = state.notifications.page;
        const totalPages = Math.ceil((state.notifications.total - 1) / state.notifications.pageSize);
        const newPage = currentPage > totalPages && totalPages > 0 ? totalPages : currentPage;
        await loadNotifications(newPage);
      } else {
        await loadUnreadNotificationCount();
      }
      showToast('消息已删除', 'success');
    },
    'notification-prev': async () => {
      const currentPage = state.notifications.page;
      if (currentPage > 1) {
        await loadNotifications(currentPage - 1);
      }
    },
    'notification-next': async () => {
      const currentPage = state.notifications.page;
      const totalPages = Math.ceil(state.notifications.total / state.notifications.pageSize);
      if (currentPage < totalPages) {
        await loadNotifications(currentPage + 1);
      }
    },
    'member-log-prev': async () => {
      const currentPage = state.member.pointLogs.page;
      if (currentPage > 1) {
        await loadMember(currentPage - 1);
      }
    },
    'member-log-next': async () => {
      const currentPage = state.member.pointLogs.page;
      const totalPages = Math.ceil(state.member.pointLogs.total / state.member.pointLogs.pageSize);
      if (currentPage < totalPages) {
        await loadMember(currentPage + 1);
      }
    }
  };

  viewContent.addEventListener('click', async (event) => {
    const actionTarget = event.target.closest('[data-action]');
    if (!(actionTarget instanceof HTMLElement)) return;
    const action = actionTarget.dataset.action;
    const handler = contentActionHandlers[action];
    if (!handler) return;

    try {
      await handler(actionTarget);
    } catch (error) {
      showToast(error.message || '操作失败', 'error');
    }
  });

  const contentChangeHandlers = {
    'update-qty': async (target) => {
      await api.updateCart(target.dataset.id, { quantity: Number(target.value) });
      await loadCart();
      safeRender();
    }
  };

  viewContent.addEventListener('change', async (event) => {
    const target = event.target;
    const action = target?.dataset?.action;
    const handler = contentChangeHandlers[action];
    if (!handler) return;

    try {
      await handler(target);
    } catch (error) {
      showToast(error.message || '更新失败', 'error');
    }
  });

  window.addEventListener('error', () => {
    showToast('页面发生错误', 'error');
  });

  window.addEventListener('unhandledrejection', () => {
    showToast('请求失败，请稍后重试', 'error');
  });
}
