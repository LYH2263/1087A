import { escapeHtml } from '../state';

export function createViewController({
  state,
  viewContent,
  viewTitle,
  loginBtn,
  logoutBtn,
  userChip,
  adminNavBtn,
  adminNavSection,
  escapeHtmlAttr,
  showToast
}) {
  function formatCurrency(value) {
    return `¥${Number(value).toFixed(2)}`;
  }

  function formatStatus(status) {
    const map = {
      PENDING_PAYMENT: '待支付',
      PAID: '已支付',
      SHIPPED: '已发货',
      COMPLETED: '已完成',
      CANCELED: '已取消',
      REFUNDED: '已退款'
    };
    return map[status] || status;
  }

  function setNavActive(view) {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('bg-slate-200', active);
      btn.classList.toggle('text-slate-900', active);
    });
  }

  function updateAuthUI() {
    if (state.user) {
      loginBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      userChip.classList.remove('hidden');
      userChip.textContent = `${state.user.username} · ${state.user.role === 'ADMIN' ? '管理员' : '用户'}`;
    } else {
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      userChip.classList.add('hidden');
      userChip.textContent = '';
    }
    if (adminNavBtn) {
      adminNavBtn.classList.toggle('hidden', !state.user || state.user.role !== 'ADMIN');
    }
    if (adminNavSection) {
      adminNavSection.classList.toggle('hidden', !state.user || state.user.role !== 'ADMIN');
    }
  }

  function renderSkeleton(count = 6) {
    return `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${Array.from({ length: count })
      .map(
        () => `
        <div class="card p-4 animate-pulse space-y-4">
          <div class="h-40 bg-slate-200 rounded-xl"></div>
          <div class="h-4 bg-slate-200 rounded"></div>
          <div class="h-3 bg-slate-100 rounded w-2/3"></div>
          <div class="h-8 bg-slate-200 rounded"></div>
        </div>
      `
      )
      .join('')}</div>`;
  }

  function isBookFavorited(bookId) {
    return state.wishlist.some((item) => item.bookId === bookId);
  }

  function getSelectedSpecId(bookId) {
    return state.selectedSpecs[bookId] || '';
  }

  function getSelectedSpec(book) {
    if (!book.hasSpecs || !book.specs || book.specs.length === 0) return null;
    const specId = getSelectedSpecId(book.id);
    if (!specId) return book.specs[0];
    return book.specs.find((s) => s.id === specId) || book.specs[0];
  }

  function getEffectivePrice(book) {
    const spec = getSelectedSpec(book);
    if (spec) return spec.price;
    return book.price;
  }

  function getEffectiveStock(book) {
    const spec = getSelectedSpec(book);
    if (spec) return spec.stock;
    return book.stock;
  }

  function getEffectiveCover(book) {
    const spec = getSelectedSpec(book);
    if (spec && spec.coverUrl) return spec.coverUrl;
    return book.coverUrl;
  }

  function renderSpecSelector(book) {
    if (!book.hasSpecs || !book.specs || book.specs.length === 0) return '';
    const selectedSpec = getSelectedSpec(book);
    return `
      <div class="flex flex-wrap gap-2 mt-2">
        ${book.specs.map((spec) => `
          <button class="px-3 py-1 rounded-full text-sm border transition ${spec.id === selectedSpec.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'}"
            data-action="select-spec" data-book-id="${book.id}" data-spec-id="${spec.id}">
            ${spec.name}
          </button>
        `).join('')}
      </div>
    `;
  }

  function highlightKeyword(text, keyword) {
    if (!keyword) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const escapedKw = escapeHtml(keyword);
    const regex = new RegExp(`(${escapedKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark class="suggest-highlight">$1</mark>');
  }

  function renderBooks() {
    const search = state.bookSearch;
    const categoryOptions = state.categories
      .map((cat) => `<option value="${cat.id}" ${search.categoryId === cat.id ? 'selected' : ''}>${cat.name}</option>`)
      .join('');

    const highlightKw = search.title || '';

    const bookCards = state.books
      .map(
        (book) => {
          const favorited = isBookFavorited(book.id);
          const effectivePrice = getEffectivePrice(book);
          const effectiveStock = getEffectiveStock(book);
          const effectiveCover = getEffectiveCover(book);
          const selectedSpec = getSelectedSpec(book);
          return `
        <div class="card hover-card p-4 flex flex-col gap-3">
          <div class="relative rounded-xl overflow-hidden h-44 bg-slate-100">
            <img src="${effectiveCover}" alt="${escapeHtml(book.title)}" class="w-full h-full object-contain" />
            <button class="absolute top-2 right-2 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center text-lg transition hover:scale-110 ${favorited ? 'text-red-500' : 'text-slate-400 hover:text-red-400'}" data-action="toggle-favorite" data-id="${book.id}" title="${favorited ? '取消收藏' : '收藏'}">
              ${favorited ? '♥' : '♡'}
            </button>
          </div>
          <div>
            <h3 class="font-semibold text-lg">${highlightKeyword(book.title, highlightKw)}</h3>
            <p class="text-sm text-slate-500">${highlightKeyword(book.author, highlightKw)}</p>
            ${book.hasSpecs ? `<div class="flex flex-wrap gap-2 mt-2"><span class="badge">多规格</span></div>` : `<div class="flex flex-wrap gap-2 mt-2"><span class="badge">库存 ${effectiveStock}</span><span class="badge">销量 ${book.sales}</span></div>`}
            ${renderSpecSelector(book)}
          </div>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-lg font-semibold text-slate-900">${formatCurrency(effectivePrice)}</p>
              ${book.hasSpecs ? `<p class="text-xs text-slate-400">库存 ${effectiveStock}${selectedSpec ? ' · ' + selectedSpec.name : ''}</p>` : ''}
            </div>
            <button class="btn-primary" data-action="add-to-cart" data-id="${book.id}" data-spec-id="${selectedSpec ? selectedSpec.id : ''}">加入购物车</button>
          </div>
        </div>
      `;
        }
      )
      .join('');

    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">书籍查询</h2>
        <p class="text-sm text-slate-500">支持多条件筛选与排序</p>
      </div>
    `;

    viewContent.innerHTML = `
      <div class="card p-5">
        <form class="grid md:grid-cols-6 gap-3" data-form="book-search" novalidate>
          <div class="md:col-span-2 relative">
            <input class="input w-full" name="title" placeholder="书名" value="${escapeHtmlAttr(search.title)}" autocomplete="off" />
            <div id="suggest-dropdown" class="suggest-dropdown"></div>
          </div>
          <input class="input" name="author" placeholder="作者" value="${escapeHtmlAttr(search.author)}" />
          <input class="input" name="isbn" placeholder="ISBN" value="${escapeHtmlAttr(search.isbn)}" />
          <select class="input" name="categoryId">
            <option value="">全部分类</option>
            ${categoryOptions}
          </select>
          <select class="input" name="sort">
            <option value="" ${search.sort === '' ? 'selected' : ''}>默认排序</option>
            <option value="sales_desc" ${search.sort === 'sales_desc' ? 'selected' : ''}>销量最高</option>
            <option value="price_asc" ${search.sort === 'price_asc' ? 'selected' : ''}>价格最低</option>
            <option value="price_desc" ${search.sort === 'price_desc' ? 'selected' : ''}>价格最高</option>
          </select>
          <input class="input" name="minPrice" placeholder="最低价" value="${escapeHtmlAttr(search.minPrice)}" />
          <input class="input" name="maxPrice" placeholder="最高价" value="${escapeHtmlAttr(search.maxPrice)}" />
          <div class="md:col-span-6 flex flex-wrap justify-end gap-2">
            <button class="btn-primary" type="submit">查询</button>
            <button class="btn-outline" type="button" data-action="reset-search">重置</button>
          </div>
        </form>
      </div>
      ${state.loading.books ? renderSkeleton() : `<div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">${bookCards || '<div class="text-slate-500">暂无书籍</div>'}</div>`}
    `;
  }

  function renderCart() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">购物车</h2>
        <p class="text-sm text-slate-500">管理选购书籍并批量结算</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看购物车。</div>`;
      return;
    }

    const subtotal = state.cart.reduce((sum, item) => {
      let price = item.book.price;
      if (item.specPrice !== undefined) {
        price = item.specPrice;
      }
      return sum + price * item.quantity;
    }, 0);

    const member = state.user?.member || null;
    let memberDiscount = 0;
    let shippingFee = 10;
    let estimatedPoints = 0;
    let discountRate = 1;
    let levelName = null;
    let levelIcon = null;

    if (member) {
      discountRate = member.discountRate || 1;
      levelName = member.levelName;
      levelIcon = member.levelIcon;
      memberDiscount = subtotal - Math.floor(subtotal * discountRate * 100) / 100;
      memberDiscount = Math.round(memberDiscount * 100) / 100;
      const afterDiscount = subtotal - memberDiscount;
      estimatedPoints = Math.floor(afterDiscount);
      if (member.freeShipping) {
        shippingFee = 0;
      } else if (member.freeShippingThreshold && afterDiscount * 100 >= member.freeShippingThreshold) {
        shippingFee = 0;
      } else if (afterDiscount >= 99) {
        shippingFee = 0;
      }
    } else {
      estimatedPoints = Math.floor(subtotal - memberDiscount);
      if (subtotal >= 99) {
        shippingFee = 0;
      }
    }

    const total = Math.max(0, subtotal - memberDiscount) + shippingFee;

    const cartList = state.cart
      .map(
        (item) => {
          let price = item.book.price;
          let hasSpec = false;
          if (item.specPrice !== undefined) {
            price = item.specPrice;
            hasSpec = true;
          }
          return `
      <div class="flex flex-col md:flex-row md:items-center gap-4 border-b border-slate-200 pb-4">
        <img src="${item.book.coverUrl}" alt="${item.book.title}" class="w-24 h-24 object-contain rounded-xl bg-white" />
        <div class="flex-1">
          <h3 class="font-semibold">${item.book.title}</h3>
          <p class="text-sm text-slate-500">${item.book.author}</p>
          ${hasSpec ? `<p class="text-sm text-teal-700">规格：${item.specName}</p>` : ''}
          <p class="text-sm text-slate-500">单价 ${formatCurrency(price)}</p>
        </div>
        <div class="flex items-center gap-3">
          <input class="input w-20" type="number" min="1" value="${item.quantity}" data-action="update-qty" data-id="${item.id}" />
          <button class="btn-outline" data-action="remove-cart" data-id="${item.id}">删除</button>
        </div>
      </div>
    `;
        }
      )
      .join('');

    const addressOptions = state.addresses
      .map(
        (addr) => `
        <option value="${addr.id}" ${addr.isDefault ? 'selected' : ''}>
          ${addr.recipient} ${addr.phone} ${addr.state}${addr.city}${addr.line1}
        </option>
      `
      )
      .join('');

    viewContent.innerHTML = `
      <div class="card p-6 space-y-4">
        ${state.cart.length === 0 ? '<p class="text-slate-500">购物车为空</p>' : cartList}
        ${state.cart.length > 0 ? `
        <div class="border-t border-slate-200 pt-4 space-y-2">
          <div class="grid md:grid-cols-2 gap-3">
            <div class="bg-slate-50 rounded-xl p-3">
              <p class="text-xs text-slate-400">商品小计</p>
              <p class="text-lg font-semibold">${formatCurrency(subtotal)}</p>
            </div>
            ${member ? `
              <div class="bg-gradient-to-r from-teal-50 to-white rounded-xl p-3 border border-teal-100">
                <p class="text-xs text-teal-500">
                  ${levelIcon || ''} ${levelName || '会员'}权益
                </p>
                <p class="text-lg font-semibold text-teal-700">
                  ${(discountRate * 10).toFixed(1)} 折优惠
                </p>
              </div>
            ` : `
              <div class="bg-slate-50 rounded-xl p-3">
                <p class="text-xs text-slate-400">登录享权益</p>
                <p class="text-sm text-slate-600">登录查看会员折扣</p>
              </div>
            `}
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm md:text-base">
            <div class="space-y-1">
              ${memberDiscount > 0 ? `<p class="text-teal-600">会员折扣 -${formatCurrency(memberDiscount)}</p>` : ''}
              <p class="${shippingFee === 0 ? 'text-emerald-600' : 'text-slate-600'}">
                运费：${shippingFee === 0 ? '包邮 🎉' : formatCurrency(shippingFee)}
              </p>
              <p class="text-slate-500">预计获得积分：<span class="font-semibold text-amber-600">${estimatedPoints}</span> 分</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-slate-400">应付总额</p>
              <p class="text-2xl font-bold text-slate-800">${formatCurrency(total)}</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-slate-500">
              ${member && member.progress?.nextLevel ? `再消费 ${formatCurrency(Math.max(0, member.progress.remainingPoints) * 100)} 即可升级为 ${member.progress.nextLevel === 'SILVER' ? '银卡' : member.progress.nextLevel === 'GOLD' ? '金卡' : '更高等级'}会员！` : ''}
            </p>
            <div class="flex gap-2">
              <button class="btn-outline" data-action="clear-cart">清空购物车</button>
            </div>
          </div>
        </div>
        ` : ''}
      </div>

      ${state.cart.length > 0 ? `
      <div class="card p-6 space-y-4">
        <h3 class="text-lg font-semibold">订单确认</h3>
        <form data-form="checkout" class="space-y-3" novalidate>
          <div class="space-y-1">
            <select class="input input-lg" name="addressId" required>
              <option value="">选择配送地址</option>
              ${addressOptions}
            </select>
          </div>
          <div class="grid md:grid-cols-3 gap-3" data-error-group="paymentMethod">
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="WECHAT" checked /> 微信支付
            </label>
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="ALIPAY" /> 支付宝
            </label>
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="COD" /> 货到付款
            </label>
          </div>
          <div class="flex justify-end">
            <button class="btn-primary" type="submit">生成待支付订单</button>
          </div>
        </form>
      </div>
      ` : ''}
    `;
  }

  function renderOrders() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">订单管理</h2>
        <p class="text-sm text-slate-500">跟踪订单状态与售后服务</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看订单。</div>`;
      return;
    }

    if (state.orders.length === 0) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">暂无订单</div>`;
      return;
    }

    viewContent.innerHTML = state.orders
      .map(
        (order) => {
          const estimatedPoints = order.estimatedPoints || Math.floor(order.total);
          return `
        <div class="card p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-xs text-slate-400">订单号 ${order.id}</p>
              <h3 class="text-lg font-semibold">${formatStatus(order.status)}</h3>
            </div>
            <div class="text-right">
              <p class="text-sm text-slate-500">金额</p>
              <p class="text-lg font-semibold">${formatCurrency(order.total)}</p>
            </div>
          </div>
          ${order.memberDiscount > 0 || order.shippingFee > 0 ? `
          <div class="flex flex-wrap gap-4 text-sm bg-slate-50 rounded-lg p-3">
            <p class="text-slate-500">商品金额：${formatCurrency(order.subtotal)}</p>
            ${order.memberDiscount > 0 ? `<p class="text-teal-600">会员折扣：-${formatCurrency(order.memberDiscount)}</p>` : ''}
            ${order.discount > order.memberDiscount ? `<p class="text-teal-600">优惠：-${formatCurrency(Number(order.discount) - Number(order.memberDiscount))}</p>` : ''}
            <p class="text-slate-500">运费：${formatCurrency(order.shippingFee || 0)}</p>
          </div>
          ` : ''}
          ${order.status === 'COMPLETED' ? `
            <div class="flex items-center gap-2 text-sm bg-amber-50 rounded-lg p-3 text-amber-700">
              <span>✨</span>
              <span>本订单已获得 <span class="font-semibold">${estimatedPoints}</span> 积分奖励</span>
            </div>
          ` : order.status === 'SHIPPED' ? `
            <div class="flex items-center gap-2 text-sm bg-emerald-50 rounded-lg p-3 text-emerald-700">
              <span>🎁</span>
              <span>确认收货后将获得 <span class="font-semibold">${estimatedPoints}</span> 积分奖励</span>
            </div>
          ` : ''}
          <div class="space-y-3">
            ${order.items
              .map(
                (item) => `
              <div class="flex items-center gap-3">
                <img src="${item.coverUrl}" alt="${item.title}" class="w-16 h-16 rounded-lg object-contain bg-white" />
                <div class="flex-1">
                  <p class="font-medium">${item.title}</p>
                  <p class="text-xs text-slate-500">${item.author}${item.specName ? ' · ' + item.specName : ''} · ${item.quantity} 本</p>
                </div>
                <p class="text-sm font-semibold">${formatCurrency(item.price)}</p>
              </div>
            `
              )
              .join('')}
          </div>
          <div class="flex flex-wrap gap-2">
            ${order.status === 'PENDING_PAYMENT' ? `<button class="btn-primary" data-action="pay-order" data-id="${order.id}">立即支付（模拟）</button>` : ''}
            ${order.status === 'PENDING_PAYMENT' ? `<button class="btn-outline" data-action="cancel-order" data-id="${order.id}">取消订单</button>` : ''}
            ${order.status === 'SHIPPED' ? `<button class="btn-primary" data-action="confirm-order" data-id="${order.id}" data-points="${estimatedPoints}">确认收货（+${estimatedPoints}积分）</button>` : ''}
            ${order.status === 'COMPLETED' && !order.reviewText ? `<button class="btn-outline" data-action="review-order" data-id="${order.id}">评价订单</button>` : ''}
            ${order.reviewText ? `<span class="badge">已评价 ${order.rating}⭐</span>` : ''}
          </div>
        </div>
      `;
        }
      )
      .join('');
  }

  function renderProfile() {
    viewTitle.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">个人中心</h2>
          <p class="text-sm text-slate-500">管理账户与地址信息</p>
        </div>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看个人信息。</div>`;
      return;
    }

    const editingAddress = state.profile.editingAddress;
    const addressList = state.addresses
      .map(
        (addr) => `
        <div class="border border-slate-200 rounded-xl p-3 flex flex-col gap-2 ${addr.isDefault ? 'address-default' : ''}">
          <p class="font-semibold">${addr.recipient} <span class="text-xs text-slate-500">${addr.phone}</span></p>
          <p class="text-sm text-slate-500">${addr.state}${addr.city}${addr.line1} ${addr.postalCode}</p>
          <div class="flex gap-2">
            <button class="btn-outline" data-action="set-default" data-id="${addr.id}">${addr.isDefault ? '默认地址' : '设为默认'}</button>
            <button class="btn-outline" data-action="edit-address" data-id="${addr.id}">编辑</button>
            <button class="btn-outline" data-action="delete-address" data-id="${addr.id}">删除</button>
          </div>
        </div>
      `
      )
      .join('');

    viewContent.innerHTML = `
      <div class="card p-6 space-y-4">
        <h3 class="text-lg font-semibold">账号信息</h3>
        <div class="grid md:grid-cols-3 gap-3">
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-xs text-slate-400">用户名</p>
            <p class="font-semibold">${state.user.username}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-xs text-slate-400">邮箱</p>
            <p class="font-semibold">${state.user.email}</p>
          </div>
          <div class="bg-slate-50 rounded-xl p-3">
            <p class="text-xs text-slate-400">手机号</p>
            <p class="font-semibold">${state.user.phone}</p>
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="text-lg font-semibold">${editingAddress ? '编辑配送地址' : '新增配送地址'}</h3>
        <div class="grid md:grid-cols-2 gap-3">${addressList || '<p class="text-slate-500">暂无地址</p>'}</div>
        <form data-form="address" class="grid md:grid-cols-2 gap-3" novalidate>
          <input type="hidden" name="addressId" value="${editingAddress?.id || ''}" />
          <div class="space-y-1">
            <input class="input" name="recipient" placeholder="收件人" value="${editingAddress?.recipient || ''}" required />
          </div>
          <div class="space-y-1">
            <input class="input" name="phone" placeholder="手机号" value="${editingAddress?.phone || ''}" required />
          </div>
          <div class="space-y-1 md:col-span-2">
            <input class="input" name="line1" placeholder="详细地址" value="${editingAddress?.line1 || ''}" required />
          </div>
          <div class="space-y-1">
            <input class="input" name="city" placeholder="城市" value="${editingAddress?.city || ''}" required />
          </div>
          <div class="space-y-1">
            <input class="input" name="state" placeholder="省份" value="${editingAddress?.state || ''}" required />
          </div>
          <div class="space-y-1">
            <input class="input" name="postalCode" placeholder="邮编" value="${editingAddress?.postalCode || ''}" required />
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="isDefault" ${editingAddress?.isDefault ? 'checked' : ''} /> 设为默认地址
          </label>
          <div class="md:col-span-2 flex justify-end gap-2">
            <button class="btn-primary" type="submit">${editingAddress ? '保存地址' : '新增地址'}</button>
            ${editingAddress ? '<button class="btn-outline" type="button" data-action="cancel-edit-address">取消编辑</button>' : ''}
          </div>
        </form>
      </div>
    `;
  }

  function renderAdmin() {
    viewTitle.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">管理控制台</h2>
          <p class="text-sm text-slate-500">书籍、分类与订单运营</p>
        </div>
      </div>
    `;

    if (!state.user || state.user.role !== 'ADMIN') {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">仅管理员可访问。</div>`;
      return;
    }

    const adminTabs = `
      <div class="flex flex-wrap gap-2">
        <button class="btn-outline" data-action="admin-tab" data-tab="books">书籍管理</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="categories">分类管理</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="orders">订单管理</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="stock">库存预警</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="restock-logs">补货流水</button>
      </div>
    `;

    let content = '';
    if (state.admin.tab === 'books') {
      const categoryOptions = state.admin.categories
        .map(
          (cat) =>
            `<option value="${cat.id}" ${state.admin.editingBook?.category?.id === cat.id ? 'selected' : ''}>${cat.name}</option>`
        )
        .join('');

      const globalThreshold = state.admin.stockThreshold?.global?.threshold ?? 10;
      const bookThresholdMap = new Map(
        (state.admin.stockThreshold?.bookThresholds || []).map(bt => [bt.bookId, bt.threshold])
      );

      const bookRows = state.admin.books
        .map(
          (book) => {
            const threshold = bookThresholdMap.get(book.id) ?? globalThreshold;
            const isLowStock = book.stock < threshold;
            const isZeroStock = book.stock === 0;
            return `
        <div class="border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover-card ${isZeroStock ? 'border-red-300 bg-red-50' : isLowStock ? 'border-amber-300 bg-amber-50' : ''}">
          <div class="flex justify-between">
            <div class="flex items-start gap-2">
              <div>
                <h4 class="font-semibold">${book.title}</h4>
                <p class="text-sm text-slate-500">${book.author} · ${book.isbn}</p>
              </div>
              ${isZeroStock ? '<span class="badge bg-red-500 text-white">缺货</span>' : isLowStock ? '<span class="badge bg-amber-500 text-white">库存低</span>' : ''}
            </div>
            <span class="badge ${book.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}">${book.status === 'ACTIVE' ? '上架中' : '已下架'}</span>
          </div>
          <div class="flex flex-wrap gap-2 text-sm text-slate-600">
            <span>价格：${formatCurrency(book.price)}</span>
            <span class="${isLowStock ? 'text-amber-600 font-semibold' : ''}">库存：${book.stock} / 阈值：${threshold}</span>
            <span>分类：${book.category?.name || '-'}</span>
            ${book.hasSpecs ? `<span class="text-teal-700 font-semibold">${book.specs.length} 个规格</span>` : ''}
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-outline" data-action="edit-book" data-id="${book.id}">编辑</button>
            ${book.hasSpecs ? `<button class="btn-outline" data-action="manage-specs" data-id="${book.id}" data-title="${escapeHtmlAttr(book.title)}">管理规格</button>` : `<button class="btn-outline" data-action="manage-specs" data-id="${book.id}" data-title="${escapeHtmlAttr(book.title)}">添加规格</button>`}
            <button class="btn-outline" data-action="set-book-threshold" data-id="${book.id}" data-title="${escapeHtmlAttr(book.title)}" data-current="${bookThresholdMap.get(book.id) ?? ''}">设置阈值</button>
            ${isLowStock ? `<button class="btn-primary" data-action="quick-restock" data-id="${book.id}" data-title="${escapeHtmlAttr(book.title)}">补货</button>` : ''}
            ${book.status === 'ACTIVE'
              ? `<button class="btn-outline" data-action="deactivate-book" data-id="${book.id}">下架</button>`
              : `<button class="btn-outline" data-action="restore-book" data-id="${book.id}">上架</button>`}
          </div>
        </div>
      `;
          }
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <h3 class="text-lg font-semibold">${state.admin.editingBook ? '编辑书籍' : '新增书籍'}</h3>
          <form data-form="admin-book" class="grid md:grid-cols-2 gap-3" novalidate>
            <div class="space-y-1">
              <input class="input" name="title" placeholder="书名" value="${state.admin.editingBook?.title || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="author" placeholder="作者" value="${state.admin.editingBook?.author || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="isbn" placeholder="ISBN" value="${state.admin.editingBook?.isbn || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="price" placeholder="价格" value="${state.admin.editingBook?.price || ''}" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="stock" placeholder="库存" value="${state.admin.editingBook?.stock || ''}" required />
            </div>
            <div class="space-y-1">
              <select class="input" name="categoryId" required>
                <option value="">选择分类</option>
                ${categoryOptions}
              </select>
            </div>
            <div class="space-y-2">
              <input class="input" type="file" name="coverFile" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" />
              ${state.admin.editingBook?.coverUrl ? `<div class="flex items-center gap-3 text-xs text-slate-500"><img src="${state.admin.editingBook.coverUrl}" alt="cover" class="w-16 h-16 rounded-lg object-contain bg-white border border-slate-200" /><span>当前封面</span></div>` : '<p class="text-xs text-slate-500">支持 jpg/png/webp/gif/svg，最大 2MB</p>'}
            </div>
            <div class="space-y-1 md:col-span-2">
              <textarea class="input" name="description" placeholder="书籍简介" rows="3" required>${state.admin.editingBook?.description || ''}</textarea>
            </div>
            <div class="md:col-span-2 flex justify-end">
              <button class="btn-primary" type="submit">${state.admin.editingBook ? '保存修改' : '添加书籍'}</button>
            </div>
          </form>
        </div>
        <div class="grid lg:grid-cols-2 gap-4">${bookRows || '<div class="text-slate-500">暂无书籍</div>'}</div>
      `;
    }

    if (state.admin.tab === 'categories') {
      const categoryList = state.admin.categories
        .map(
          (cat) => `
        <div class="border border-slate-200 rounded-xl p-4 flex items-center justify-between hover-card">
          <span>${cat.name}</span>
          <button class="btn-outline" data-action="delete-category" data-id="${cat.id}">删除</button>
        </div>
      `
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <h3 class="text-lg font-semibold">新增分类</h3>
          <form data-form="admin-category" class="flex flex-col md:flex-row gap-3" novalidate>
            <div class="flex-1 space-y-1">
              <input class="input" name="name" placeholder="分类名称" required />
            </div>
            <button class="btn-primary" type="submit">添加</button>
          </form>
        </div>
        <div class="grid md:grid-cols-2 gap-4">${categoryList || '<div class="text-slate-500">暂无分类</div>'}</div>
      `;
    }

    if (state.admin.tab === 'orders') {
      const stats = state.admin.stats || { statusCounts: {}, revenue: 0 };
      const orderCards = state.admin.orders
        .map(
          (order) => `
        <div class="border border-slate-200 rounded-xl p-4 space-y-3 hover-card">
          <div class="flex justify-between">
            <div>
              <p class="text-xs text-slate-400">订单号 ${order.id}</p>
              <p class="font-semibold">${order.user.username} · ${formatStatus(order.status)}</p>
            </div>
            <p class="font-semibold">${formatCurrency(order.total)}</p>
          </div>
          <div class="text-xs text-slate-500">${order.recipient} ${order.phone}</div>
          <div class="flex flex-wrap gap-2">
            ${order.status === 'PENDING_PAYMENT' ? `<button class="btn-outline" data-action="admin-accept" data-id="${order.id}">接单</button>` : ''}
            ${order.status === 'PAID' ? `<button class="btn-outline" data-action="admin-ship" data-id="${order.id}">发货</button>` : ''}
            ${['PAID', 'SHIPPED'].includes(order.status) ? `<button class="btn-outline" data-action="admin-refund" data-id="${order.id}">退款</button>` : ''}
          </div>
        </div>
      `
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold">订单统计</h3>
              <p class="text-sm text-slate-500">实时订单数据与收入</p>
            </div>
            <button class="btn-outline" data-action="export-orders">导出报表</button>
          </div>
          <div class="grid md:grid-cols-4 gap-3">
            ${Object.entries(stats.statusCounts)
              .map(
                ([key, value]) => `
              <div class="bg-slate-50 rounded-xl p-3">
                <p class="text-xs text-slate-400">${formatStatus(key)}</p>
                <p class="text-lg font-semibold">${value}</p>
              </div>
            `
              )
              .join('')}
            <div class="bg-slate-50 rounded-xl p-3">
              <p class="text-xs text-slate-400">累计收入</p>
              <p class="text-lg font-semibold">${formatCurrency(stats.revenue)}</p>
            </div>
          </div>
        </div>
        <div class="grid lg:grid-cols-2 gap-4">${orderCards || '<div class="text-slate-500">暂无订单</div>'}</div>
      `;
    }

    if (state.admin.tab === 'stock') {
      const warningStats = state.admin.stockWarningStats || { total: 0, zeroStockCount: 0 };
      const globalThreshold = state.admin.stockThreshold?.global?.threshold ?? 10;
      const selectedCount = state.admin.selectedRestockBooks.size;
      const allSelected = state.admin.stockWarnings.length > 0 && state.admin.selectedRestockBooks.size === state.admin.stockWarnings.length;

      const warningRows = state.admin.stockWarnings
        .map(
          (book) => {
            const isSelected = state.admin.selectedRestockBooks.has(book.id);
            return `
        <div class="border ${book.isZeroStock ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'} rounded-xl p-4 flex flex-col gap-3 hover-card">
          <div class="flex items-start gap-3">
            <input type="checkbox" class="mt-1" data-action="toggle-restock-select" data-id="${book.id}" ${isSelected ? 'checked' : ''} />
            <div class="flex-1">
              <div class="flex justify-between items-start">
                <div>
                  <h4 class="font-semibold">${book.title}</h4>
                  <p class="text-sm text-slate-500">${book.author} · ${book.isbn}</p>
                </div>
                <div class="flex gap-2">
                  ${book.isZeroStock ? '<span class="badge bg-red-500 text-white">缺货</span>' : '<span class="badge bg-amber-500 text-white">库存低</span>'}
                  <span class="badge bg-slate-600 text-white">缺口 ${book.gap}</span>
                </div>
              </div>
              <div class="flex flex-wrap gap-3 mt-2 text-sm">
                <span class="${book.isZeroStock ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold'}">当前库存：${book.stock}</span>
                <span>预警阈值：${book.threshold}</span>
                <span>分类：${book.category?.name || '-'}</span>
              </div>
              <div class="flex flex-wrap gap-2 mt-3">
                <button class="btn-outline" data-action="set-book-threshold" data-id="${book.id}" data-title="${escapeHtmlAttr(book.title)}" data-current="${book.threshold}">调整阈值</button>
                <button class="btn-primary" data-action="single-restock" data-id="${book.id}" data-title="${escapeHtmlAttr(book.title)}" data-stock="${book.stock}" data-threshold="${book.threshold}">单条补货</button>
              </div>
            </div>
          </div>
        </div>
      `;
          }
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold">库存预警</h3>
              <p class="text-sm text-slate-500">低于阈值的书籍将显示在此处，按缺口排序</p>
            </div>
            <button class="btn-outline" data-action="set-global-threshold" data-current="${globalThreshold}">设置全局阈值</button>
          </div>
          <div class="grid md:grid-cols-3 gap-3">
            <div class="bg-red-50 rounded-xl p-3">
              <p class="text-xs text-slate-400">预警书籍总数</p>
              <p class="text-lg font-semibold text-red-600">${warningStats.total}</p>
            </div>
            <div class="bg-amber-50 rounded-xl p-3">
              <p class="text-xs text-slate-400">缺货书籍</p>
              <p class="text-lg font-semibold text-amber-600">${warningStats.zeroStockCount}</p>
            </div>
            <div class="bg-slate-50 rounded-xl p-3">
              <p class="text-xs text-slate-400">全局阈值</p>
              <p class="text-lg font-semibold">${globalThreshold} 本</p>
            </div>
          </div>
        </div>

        <div class="card p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" data-action="toggle-select-all" ${allSelected ? 'checked' : ''} ${state.admin.stockWarnings.length === 0 ? 'disabled' : ''} />
                全选
              </label>
              <span class="text-sm text-slate-500">已选 ${selectedCount} 项</span>
            </div>
            <button class="btn-primary" data-action="batch-restock" ${selectedCount === 0 ? 'disabled' : ''}>
              ${selectedCount > 0 ? `批量补货 (${selectedCount})` : '批量补货'}
            </button>
          </div>
          ${state.admin.stockWarnings.length === 0
            ? '<div class="text-slate-500 text-center py-8">暂无库存预警，所有书籍库存充足！</div>'
            : `<div class="space-y-3">${warningRows}</div>`
          }
        </div>

        <div class="card p-6 space-y-4">
          <h3 class="text-lg font-semibold">单品阈值配置</h3>
          <div class="space-y-2">
            ${state.admin.stockThreshold?.bookThresholds?.length === 0
              ? '<p class="text-sm text-slate-500">暂无单品阈值配置，所有书籍使用全局阈值</p>'
              : state.admin.stockThreshold.bookThresholds.map(bt => `
                <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p class="font-medium">${bt.bookTitle}</p>
                    <p class="text-xs text-slate-500">阈值：${bt.threshold} 本</p>
                  </div>
                  <button class="btn-outline text-sm" data-action="delete-book-threshold" data-id="${bt.bookId}" data-title="${escapeHtmlAttr(bt.bookTitle)}">删除</button>
                </div>
              `).join('')
            }
          </div>
        </div>
      `;
    }

    if (state.admin.tab === 'restock-logs') {
      const logStats = state.admin.restockLogStats || { total: 0, page: 1, pageSize: 20 };
      const totalPages = Math.ceil(logStats.total / logStats.pageSize);

      const logRows = state.admin.restockLogs
        .map(
          (log) => `
        <div class="border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
          <div class="flex justify-between items-start">
            <div>
              <h4 class="font-semibold">${log.bookTitle}</h4>
              <p class="text-xs text-slate-500">操作时间：${new Date(log.createdAt).toLocaleString('zh-CN')}</p>
            </div>
            <span class="badge bg-emerald-500 text-white">+${log.quantity}</span>
          </div>
          <div class="flex flex-wrap gap-3 text-sm text-slate-600">
            <span>补货前：${log.oldStock} 本</span>
            <span>→</span>
            <span>补货后：${log.newStock} 本</span>
            <span>操作人：${log.operator}</span>
          </div>
        </div>
      `
        )
        .join('');

      content = `
        <div class="card p-6 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold">补货流水</h3>
              <p class="text-sm text-slate-500">所有补货操作的记录</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-slate-500">共 ${logStats.total} 条记录</span>
            </div>
          </div>
          ${state.admin.restockLogs.length === 0
            ? '<div class="text-slate-500 text-center py-8">暂无补货记录</div>'
            : `<div class="space-y-3">${logRows}</div>`
          }
          ${totalPages > 1 ? `
          <div class="flex justify-center gap-2 pt-4">
            <button class="btn-outline" data-action="restock-log-prev" ${logStats.page <= 1 ? 'disabled' : ''}>上一页</button>
            <span class="px-3 py-2 text-sm text-slate-600">第 ${logStats.page} / ${totalPages} 页</span>
            <button class="btn-outline" data-action="restock-log-next" ${logStats.page >= totalPages ? 'disabled' : ''}>下一页</button>
          </div>
          ` : ''}
        </div>
      `;
    }

    viewContent.innerHTML = `${adminTabs}${content}`;
  }

  function renderWishlist() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">我的收藏</h2>
        <p class="text-sm text-slate-500">收藏心仪书籍，降价时及时提醒</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看收藏。</div>`;
      return;
    }

    if (state.wishlist.length === 0) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">暂无收藏书籍，去书籍查询页面发现好书吧~</div>`;
      return;
    }

    const wishlistCards = state.wishlist
      .map(
        (item) => {
          const book = item.book;
          const isInactive = book.status !== 'ACTIVE';
          const isPriceDropped = item.isPriceDropped;
          return `
        <div class="card hover-card p-4 flex flex-col gap-3 ${isInactive ? 'opacity-60' : ''}">
          <div class="relative rounded-xl overflow-hidden h-44 bg-slate-100">
            <img src="${book.coverUrl}" alt="${book.title}" class="w-full h-full object-contain" />
            ${isPriceDropped ? `<span class="absolute top-2 left-2 badge bg-emerald-500 text-white">已降价 -${item.dropPercent}%</span>` : ''}
            ${isInactive ? '<span class="absolute top-2 left-2 badge bg-slate-600 text-white">已下架</span>' : ''}
            <button class="absolute top-2 right-2 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center text-lg text-red-500 transition hover:scale-110" data-action="remove-wishlist" data-id="${item.id}" data-book-id="${book.id}" title="取消收藏">
              ♥
            </button>
          </div>
          <div>
            <h3 class="font-semibold text-lg">${book.title}</h3>
            <p class="text-sm text-slate-500">${book.author}</p>
          </div>
          <div class="space-y-1">
            <div class="flex items-baseline gap-2">
              <span class="text-lg font-semibold text-slate-900">${formatCurrency(book.price)}</span>
              ${isPriceDropped ? `<span class="text-xs text-slate-400 line-through">${formatCurrency(item.savedPrice)}</span>` : ''}
            </div>
            ${isPriceDropped ? `<p class="text-xs text-emerald-600">比收藏时便宜 ${formatCurrency(item.dropAmount)}</p>` : ''}
            ${!isPriceDropped && !isInactive ? `<p class="text-xs text-slate-400">收藏价 ${formatCurrency(item.savedPrice)}</p>` : ''}
            ${isInactive ? '<p class="text-xs text-slate-500">该书籍已下架，暂不可购买</p>' : ''}
          </div>
          <div class="flex gap-2">
            <button class="btn-primary flex-1" data-action="wishlist-to-cart" data-id="${item.id}" ${isInactive || book.stock < 1 ? 'disabled' : ''}>
              ${isInactive ? '已下架' : book.stock < 1 ? '缺货' : '移入购物车'}
            </button>
            <button class="btn-outline" data-action="remove-wishlist" data-id="${item.id}" data-book-id="${book.id}">移除</button>
          </div>
        </div>
      `;
        }
      )
      .join('');

    viewContent.innerHTML = `
      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        ${wishlistCards}
      </div>
    `;
  }

  function renderNotifications() {
    viewTitle.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">消息中心</h2>
          <p class="text-sm text-slate-500">查看订单状态变更通知</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-outline" data-action="mark-all-read" ${state.notifications.unreadCount === 0 ? 'disabled' : ''}>
            全部已读 (${state.notifications.unreadCount})
          </button>
        </div>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看消息。</div>`;
      return;
    }

    if (state.loading.notifications) {
      viewContent.innerHTML = renderSkeleton();
      return;
    }

    const { list, total, page, pageSize, unreadCount } = state.notifications;
    const totalPages = Math.ceil(total / pageSize);

    if (list.length === 0) {
      viewContent.innerHTML = `
        <div class="card p-12 text-center">
          <div class="text-5xl mb-4">🔔</div>
          <p class="text-lg font-semibold text-slate-700">暂无消息</p>
          <p class="text-sm text-slate-500 mt-2">订单状态变更时会在这里通知您</p>
        </div>
      `;
      return;
    }

    const typeIcons = {
      ORDER_PAID: '💳',
      ORDER_SHIPPED: '📦',
      ORDER_COMPLETED: '✅',
      ORDER_REFUNDED: '💰'
    };

    const notificationList = list
      .map(
        (notification) => `
        <div class="card p-5 space-y-3 ${!notification.isRead ? 'bg-teal-50/50 border-teal-200' : ''}">
          <div class="flex items-start gap-4">
            <div class="text-3xl">${typeIcons[notification.type] || '📩'}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="font-semibold text-base ${!notification.isRead ? 'text-teal-700' : ''}">
                    ${notification.title}
                    ${!notification.isRead ? '<span class="ml-2 inline-block w-2 h-2 bg-teal-500 rounded-full"></span>' : ''}
                  </h3>
                  <p class="text-xs text-slate-400 mt-1">
                    ${new Date(notification.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
              <p class="text-sm text-slate-600 mt-2">${notification.content}</p>
              ${notification.orderId ? `<p class="text-xs text-slate-400 mt-2">订单号：${notification.orderId}</p>` : ''}
            </div>
          </div>
          <div class="flex gap-2 pt-2 border-t border-slate-100">
            ${!notification.isRead ? `
              <button class="btn-outline btn-sm" data-action="mark-read" data-id="${notification.id}">
                标记已读
              </button>
            ` : ''}
            <button class="btn-outline btn-sm text-red-600 border-red-200 hover:border-red-400 hover:text-red-700" data-action="delete-notification" data-id="${notification.id}">
              删除
            </button>
          </div>
        </div>
      `
      )
      .join('');

    const pagination = totalPages > 1 ? `
      <div class="flex justify-center items-center gap-3 pt-4">
        <button class="btn-outline" data-action="notification-prev" ${page <= 1 ? 'disabled' : ''}>
          上一页
        </button>
        <span class="text-sm text-slate-600">
          第 ${page} / ${totalPages} 页，共 ${total} 条
        </span>
        <button class="btn-outline" data-action="notification-next" ${page >= totalPages ? 'disabled' : ''}>
          下一页
        </button>
      </div>
    ` : '';

    viewContent.innerHTML = `
      <div class="mb-4 flex items-center justify-between">
        <p class="text-sm text-slate-500">
          共 ${total} 条消息，${unreadCount} 条未读
        </p>
      </div>
      <div class="space-y-4">
        ${notificationList}
      </div>
      ${pagination}
    `;
  }

  function renderMember() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">我的会员</h2>
        <p class="text-sm text-slate-500">查看会员等级、积分与成长进度</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看会员信息。</div>`;
      return;
    }

    if (state.loading.member) {
      viewContent.innerHTML = renderSkeleton();
      return;
    }

    const profile = state.member.profile;
    const logs = state.member.pointLogs;
    const levels = state.member.levels;

    if (!profile) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">加载会员信息失败，请刷新重试。</div>`;
      return;
    }

    const levelCards = levels.map((lv) => {
      const isCurrent = lv.level === profile.level;
      const isAchieved = levels.findIndex(l => l.level === profile.level) >= levels.findIndex(l => l.level === lv.level);
      return `
        <div class="rounded-xl p-4 border-2 transition ${isCurrent ? 'border-teal-500 bg-teal-50' : isAchieved ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white opacity-60'}">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-2xl">${lv.icon}</span>
            <h4 class="font-semibold" style="color: ${isCurrent ? lv.color : 'inherit'}">${lv.name}</h4>
            ${isCurrent ? '<span class="badge bg-teal-500 text-white">当前等级</span>' : ''}
          </div>
          <p class="text-xs text-slate-500 mb-2">需 ${lv.minPoints} 积分</p>
          <div class="space-y-1 text-sm">
            <p>折扣：<span class="font-semibold">${(lv.discountRate * 10).toFixed(1)} 折</span></p>
            <p>包邮：<span class="font-semibold">${lv.freeShipping ? '全场包邮' : lv.freeShippingThresholdCents ? `满 ¥${(lv.freeShippingThresholdCents / 100).toFixed(2)} 包邮` : '无特殊权益'}</span></p>
          </div>
        </div>
      `;
    }).join('');

    const progress = profile.progress || {};
    const progressPercent = progress.progress || 100;

    const logItems = logs.list.map((log) => {
      const isEarn = log.points > 0;
      return `
        <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-b-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-xl ${isEarn ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}">
              ${isEarn ? '+' : '-'}
            </div>
            <div>
              <p class="font-medium text-sm">${log.remark || log.sourceText}</p>
              <p class="text-xs text-slate-400">${new Date(log.createdAt).toLocaleString('zh-CN')}</p>
              ${log.orderId ? `<p class="text-xs text-slate-400">订单号：${log.orderId}</p>` : ''}
            </div>
          </div>
          <p class="text-lg font-semibold ${isEarn ? 'text-emerald-600' : 'text-amber-600'}">
            ${isEarn ? '+' : ''}${log.points}
          </p>
        </div>
      `;
    }).join('');

    const logTotalPages = Math.ceil(logs.total / logs.pageSize);

    viewContent.innerHTML = `
      <div class="card p-6" style="background: linear-gradient(135deg, ${profile.levelColor}22 0%, #ffffff 100%); border: 2px solid ${profile.levelColor}44;">
        <div class="flex flex-col md:flex-row md:items-center gap-6">
          <div class="w-24 h-24 rounded-full flex items-center justify-center text-6xl bg-white shadow-md" style="box-shadow: 0 0 0 4px ${profile.levelColor}44;">
            ${profile.levelIcon}
          </div>
          <div class="flex-1 space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <h3 class="text-2xl font-bold" style="color: ${profile.levelColor}">${profile.levelName}</h3>
              <span class="badge" style="background: ${profile.levelColor}; color: white;">Lv.${levels.findIndex(l => l.level === profile.level) + 1}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div class="bg-white rounded-lg p-3">
                <p class="text-xs text-slate-500">累计积分</p>
                <p class="text-xl font-bold text-slate-800">${profile.totalPoints}</p>
              </div>
              <div class="bg-white rounded-lg p-3">
                <p class="text-xs text-slate-500">可用积分</p>
                <p class="text-xl font-bold text-emerald-600">${profile.availablePoints}</p>
              </div>
              <div class="bg-white rounded-lg p-3">
                <p class="text-xs text-slate-500">累计消费</p>
                <p class="text-xl font-bold text-slate-800">¥${(profile.totalSpentCents / 100).toFixed(2)}</p>
              </div>
              <div class="bg-white rounded-lg p-3">
                <p class="text-xs text-slate-500">会员折扣</p>
                <p class="text-xl font-bold" style="color: ${profile.levelColor}">${(profile.discountRate * 10).toFixed(1)} 折</p>
              </div>
            </div>
            ${progress.nextLevel ? `
              <div class="space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-slate-600">距离 <span class="font-semibold">${levels.find(l => l.level === progress.nextLevel)?.name || '下一等级'}</span> 还差 <span class="font-semibold" style="color: ${profile.levelColor}">${progress.remainingPoints}</span> 积分</span>
                  <span class="text-slate-500">${progress.currentPoints} / ${progress.requiredPoints}</span>
                </div>
                <div class="h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all" style="width: ${progressPercent}%; background: linear-gradient(90deg, ${profile.levelColor} 0%, ${profile.levelColor}cc 100%);"></div>
                </div>
              </div>
            ` : `
              <div class="flex items-center gap-2 text-sm text-slate-600">
                <span class="text-lg">🎊</span>
                <span>恭喜您已达到最高等级，感谢您的支持！</span>
              </div>
            `}
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="text-lg font-semibold">等级权益</h3>
        <div class="grid md:grid-cols-3 gap-4">
          ${levelCards}
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-lg font-semibold">积分明细</h3>
          <div class="flex gap-3 text-sm">
            <span class="badge bg-emerald-100 text-emerald-700">累计获得 ${logs.totalEarned}</span>
            <span class="badge bg-amber-100 text-amber-700">累计扣除 ${logs.totalSpent}</span>
          </div>
        </div>
        ${logs.list.length === 0 ? `
          <div class="text-center py-12 text-slate-500">
            <div class="text-5xl mb-3">📝</div>
            <p>暂无积分记录</p>
            <p class="text-sm mt-1">完成订单后将获得积分奖励</p>
          </div>
        ` : `
          <div class="divide-y divide-slate-100">
            ${logItems}
          </div>
        `}
        ${logTotalPages > 1 ? `
          <div class="flex justify-center gap-2 pt-4 border-t border-slate-100">
            <button class="btn-outline" data-action="member-log-prev" ${logs.page <= 1 ? 'disabled' : ''}>上一页</button>
            <span class="px-3 py-2 text-sm text-slate-600">第 ${logs.page} / ${logTotalPages} 页</span>
            <button class="btn-outline" data-action="member-log-next" ${logs.page >= logTotalPages ? 'disabled' : ''}>下一页</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  const viewRenderers = {
    books: renderBooks,
    cart: renderCart,
    wishlist: renderWishlist,
    orders: renderOrders,
    member: renderMember,
    notifications: renderNotifications,
    profile: renderProfile,
    admin: renderAdmin
  };

  function renderView() {
    setNavActive(state.view);
    const renderer = viewRenderers[state.view];
    if (renderer) renderer();
  }

  function safeRender() {
    try {
      renderView();
    } catch (error) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">页面渲染失败，请刷新重试。</div>`;
      showToast('页面渲染失败', 'error');
    }
  }

  return {
    formatCurrency,
    formatStatus,
    setNavActive,
    updateAuthUI,
    renderView,
    safeRender
  };
}
