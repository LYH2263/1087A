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
  loadOrders,
  loadAddresses,
  loadAdmin,
  safeRender,
  openModal,
  closeModal,
  openLoginModal,
  openRegisterModal,
  openForgotModal,
  openResetModal
}) {
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
    'add-to-cart': async (target) => {
      if (!state.user) {
        openLoginModal();
        return;
      }
      await api.addToCart({ bookId: target.dataset.id, quantity: 1 });
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
      await api.confirmOrder(target.dataset.id);
      await loadOrders();
      safeRender();
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
