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

  function formatCouponValue(coupon) {
    if (coupon.type === 'FIXED_AMOUNT') {
      return `¥${Number(coupon.discountAmount).toFixed(0)}`;
    }
    return `${coupon.discountPercentage}%`;
  }

  function formatCouponDesc(coupon) {
    if (coupon.type === 'FIXED_AMOUNT') {
      return `满${Number(coupon.minAmount).toFixed(0)}减${Number(coupon.discountAmount).toFixed(0)}`;
    }
    let desc = `${coupon.discountPercentage}%折扣`;
    if (coupon.maxDiscount) {
      desc += `（上限¥${Number(coupon.maxDiscount).toFixed(0)}）`;
    }
    if (coupon.minAmount > 0) {
      desc = `满${Number(coupon.minAmount).toFixed(0)}享${desc}`;
    }
    return desc;
  }

  function renderCouponCard(coupon, opts = {}) {
    const { showClaim, showStatus, showSelect, selected } = opts;
    const value = formatCouponValue(coupon);
    const desc = formatCouponDesc(coupon);
    const isFixed = coupon.type === 'FIXED_AMOUNT';
    const isAvailable = coupon.status === 'AVAILABLE';
    const isUsed = coupon.status === 'USED';
    const isExpired = coupon.status === 'EXPIRED';
    const dimmed = isUsed || isExpired;

    let statusBadge = '';
    if (showStatus) {
      if (isUsed) statusBadge = '<span class="coupon-badge coupon-badge-used">已使用</span>';
      else if (isExpired) statusBadge = '<span class="coupon-badge coupon-badge-expired">已过期</span>';
      else statusBadge = '<span class="coupon-badge coupon-badge-available">可用</span>';
    }

    let actionBtn = '';
    if (showClaim) {
      if (coupon.canClaim) {
        actionBtn = `<button class="btn-primary text-sm" data-action="claim-coupon" data-id="${coupon.id}">领取</button>`;
      } else if (coupon.alreadyClaimed) {
        actionBtn = '<span class="text-sm text-slate-400">已领取</span>';
      } else {
        actionBtn = '<span class="text-sm text-slate-400">已领完</span>';
      }
    }
    if (showSelect) {
      actionBtn = `<button class="${selected ? 'btn-primary' : 'btn-outline'} text-sm" data-action="select-coupon" data-id="${showSelect === 'userCoupon' ? coupon.id : coupon.userCouponId}">${selected ? '已选择 ✓' : '使用此券'}</button>`;
    }

    return `
      <div class="coupon-card ${dimmed ? 'coupon-card-dimmed' : ''} ${selected ? 'coupon-card-selected' : ''}">
        <div class="coupon-left ${isFixed ? 'bg-gradient-to-br from-orange-500 to-amber-500' : 'bg-gradient-to-br from-teal-600 to-emerald-600'}">
          <div class="coupon-value">${value}</div>
          <div class="coupon-type-label">${isFixed ? '满减券' : '折扣券'}</div>
        </div>
        <div class="coupon-right">
          <div class="coupon-name">${escapeHtml(coupon.name)}</div>
          <div class="coupon-desc">${desc}</div>
          <div class="coupon-meta">
            ${coupon.validUntil ? `<span>有效期至 ${new Date(coupon.validUntil).toLocaleDateString('zh-CN')}</span>` : ''}
            ${coupon.remainQuantity !== undefined ? `<span>剩余 ${coupon.remainQuantity} 张</span>` : ''}
            ${coupon.code ? `<span>${coupon.code}</span>` : ''}
          </div>
          ${statusBadge}
          <div class="coupon-action">${actionBtn}</div>
        </div>
      </div>
    `;
  }

  function renderCouponCenter() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">领券中心</h2>
        <p class="text-sm text-slate-500">领取优惠券，购物更划算</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后领取优惠券。</div>`;
      return;
    }

    if (state.loading.coupons) {
      viewContent.innerHTML = renderSkeleton(4);
      return;
    }

    if (state.coupons.available.length === 0) {
      viewContent.innerHTML = `
        <div class="card p-12 text-center">
          <div class="text-5xl mb-4">🎫</div>
          <p class="text-lg font-semibold text-slate-700">暂无可领取的优惠券</p>
          <p class="text-sm text-slate-500 mt-2">有新优惠券上架时会在这里通知您</p>
        </div>
      `;
      return;
    }

    const couponCards = state.coupons.available
      .map((c) => renderCouponCard(c, { showClaim: true }))
      .join('');

    viewContent.innerHTML = `<div class="space-y-4">${couponCards}</div>`;
  }

  function renderMyCoupons() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">我的优惠券</h2>
        <p class="text-sm text-slate-500">查看与管理已领取的优惠券</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看优惠券。</div>`;
      return;
    }

    const counts = state.coupons.mineCounts;
    const currentTab = state.coupons.mineTab;
    const tabs = [
      { key: 'AVAILABLE', label: '可用', count: counts.AVAILABLE || 0 },
      { key: 'USED', label: '已使用', count: counts.USED || 0 },
      { key: 'EXPIRED', label: '已过期', count: counts.EXPIRED || 0 }
    ];

    const tabHtml = tabs.map((t) => `
      <button class="${currentTab === t.key ? 'btn-primary' : 'btn-outline'}" data-action="coupon-tab" data-tab="${t.key}">
        ${t.label} (${t.count})
      </button>
    `).join('');

    const filtered = state.coupons.mine.filter((c) => c.status === currentTab);

    if (filtered.length === 0) {
      const emptyMsg = currentTab === 'AVAILABLE' ? '暂无可用优惠券，去领券中心看看吧~'
        : currentTab === 'USED' ? '暂无已使用的优惠券'
        : '暂无已过期的优惠券';
      viewContent.innerHTML = `
        <div class="card p-6 space-y-4">
          <div class="flex flex-wrap gap-2">${tabHtml}</div>
        </div>
        <div class="card p-12 text-center">
          <div class="text-5xl mb-4">🎫</div>
          <p class="text-slate-500">${emptyMsg}</p>
          ${currentTab === 'AVAILABLE' ? '<button class="btn-primary mt-4" data-action="go-coupon-center">去领券中心</button>' : ''}
        </div>
      `;
      return;
    }

    const couponCards = filtered
      .map((c) => renderCouponCard(c, { showStatus: true }))
      .join('');

    viewContent.innerHTML = `
      <div class="card p-6 space-y-4">
        <div class="flex flex-wrap gap-2">${tabHtml}</div>
      </div>
      <div class="space-y-4">${couponCards}</div>
    `;
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

    const couponDiscount = state.coupons.couponCalcResult?.valid ? state.coupons.couponCalcResult.discount : 0;
    const total = Math.max(0, subtotal - memberDiscount - couponDiscount) + shippingFee;

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
              ${couponDiscount > 0 ? `<p class="text-orange-600">优惠券抵扣 -${formatCurrency(couponDiscount)}</p>` : ''}
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
        <h3 class="text-lg font-semibold">选择优惠券</h3>
        ${state.coupons.applicable.length > 0 || state.coupons.notApplicable.length > 0 ? `
          ${state.coupons.applicable.length > 0 ? `
            <div class="space-y-3">
              <p class="text-sm text-slate-500">可用优惠券（点击选择）</p>
              ${state.coupons.applicable.map((c) => renderCouponCard(c, {
                showSelect: 'userCoupon',
                selected: state.checkout.selectedCouponId === c.userCouponId
              })).join('')}
            </div>
          ` : ''}
          ${state.coupons.notApplicable.length > 0 ? `
            <div class="space-y-3 mt-4">
              <p class="text-sm text-slate-400">不可用优惠券</p>
              ${state.coupons.notApplicable.map((c) => `
                <div class="coupon-card coupon-card-dimmed">
                  <div class="coupon-left ${c.type === 'FIXED_AMOUNT' ? 'bg-gradient-to-br from-orange-400 to-amber-400' : 'bg-gradient-to-br from-teal-400 to-emerald-400'} opacity-50">
                    <div class="coupon-value">${formatCouponValue(c)}</div>
                    <div class="coupon-type-label">${c.type === 'FIXED_AMOUNT' ? '满减券' : '折扣券'}</div>
                  </div>
                  <div class="coupon-right">
                    <div class="coupon-name">${escapeHtml(c.name)}</div>
                    <div class="coupon-desc">${formatCouponDesc(c)}</div>
                    <div class="coupon-meta"><span class="text-red-400">未达使用门槛</span></div>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        ` : `
          <p class="text-sm text-slate-500">暂无可用优惠券，<a href="javascript:void(0)" data-action="go-coupon-center" class="text-teal-600 hover:text-teal-700">去领券中心 →</a></p>
        `}
        ${state.checkout.selectedCouponId ? `
          <div class="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl p-3">
            <div>
              <p class="text-sm text-orange-700">已选择优惠券，抵扣 <span class="font-semibold">${formatCurrency(couponDiscount)}</span></p>
            </div>
            <button class="btn-outline text-sm" data-action="clear-coupon">取消使用</button>
          </div>
        ` : ''}
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="text-lg font-semibold">订单确认</h3>
        <form data-form="checkout" class="space-y-3" novalidate>
          <input type="hidden" name="userCouponId" value="${state.checkout.selectedCouponId || ''}" />
          <div class="space-y-1">
            <select class="input input-lg" name="addressId" required>
              <option value="">选择配送地址</option>
              ${addressOptions}
            </select>
          </div>
          <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-3" data-error-group="paymentMethod">
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="WECHAT" checked /> 微信支付
            </label>
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="ALIPAY" /> 支付宝
            </label>
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="BALANCE" /> 余额支付
            </label>
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="paymentMethod" value="COD" /> 货到付款
            </label>
          </div>
          <p class="text-sm text-slate-500">
            💰 当前余额：<span class="font-semibold text-teal-600">${state.wallet?.balance || '0.00'}</span>
            <a href="javascript:void(0)" data-action="go-wallet" class="text-teal-600 hover:text-teal-700 ml-2">去充值 →</a>
          </p>
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
          ${order.discount > 0 || order.couponCode ? `
          <div class="flex flex-wrap gap-4 text-sm bg-orange-50 rounded-lg p-3 border border-orange-100">
            ${order.subtotal !== undefined && order.subtotal !== null ? `<p class="text-slate-500">商品金额：${formatCurrency(order.subtotal)}</p>` : ''}
            ${order.discount > 0 ? `<p class="text-orange-600">优惠券抵扣：-${formatCurrency(order.discount)}</p>` : ''}
            ${order.couponCode ? `<p class="text-slate-500">券码：${order.couponCode}</p>` : ''}
          </div>
          ` : ''}
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
        <button class="btn-outline" data-action="admin-tab" data-tab="coupons">优惠券管理</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="stock">库存预警</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="restock-logs">补货流水</button>
        <button class="btn-outline" data-action="admin-tab" data-tab="goals">目标管理</button>
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

    if (state.admin.tab === 'coupons') {
      const couponRows = (state.admin.coupons || [])
        .map((coupon) => {
          const isFixed = coupon.type === 'FIXED_AMOUNT';
          const isActive = coupon.status === 'ACTIVE';
          return `
            <div class="border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover-card ${!isActive ? 'opacity-60' : ''}">
              <div class="flex justify-between items-start">
                <div>
                  <h4 class="font-semibold">${escapeHtml(coupon.name)}</h4>
                  <p class="text-sm text-slate-500">${coupon.code}</p>
                </div>
                <span class="badge ${isActive ? 'badge-active' : 'badge-inactive'}">${isActive ? '进行中' : coupon.status === 'EXPIRED' ? '已过期' : '已停用'}</span>
              </div>
              <div class="flex flex-wrap gap-2 text-sm text-slate-600">
                <span class="badge ${isFixed ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}">${isFixed ? '满减券' : '折扣券'}</span>
                <span>${isFixed ? `减¥${Number(coupon.discountAmount).toFixed(0)}` : `${coupon.discountPercentage}%折扣`}</span>
                <span>满¥${Number(coupon.minAmount).toFixed(0)}</span>
                <span>已领${coupon.claimedQuantity}/${coupon.totalQuantity}</span>
              </div>
              <div class="text-xs text-slate-400">
                有效期：${new Date(coupon.validFrom).toLocaleDateString('zh-CN')} ~ ${new Date(coupon.validUntil).toLocaleDateString('zh-CN')}
              </div>
              <div class="flex flex-wrap gap-2">
                ${isActive ? `<button class="btn-outline" data-action="deactivate-coupon" data-id="${coupon.id}">停用</button>` : ''}
                ${!isActive && coupon.status === 'INACTIVE' ? `<button class="btn-outline" data-action="activate-coupon" data-id="${coupon.id}">启用</button>` : ''}
              </div>
            </div>
          `;
        }).join('');

      content = `
        <div class="card p-6 space-y-4">
          <h3 class="text-lg font-semibold">新增优惠券</h3>
          <form data-form="admin-coupon" class="grid md:grid-cols-2 gap-3" novalidate>
            <div class="space-y-1">
              <input class="input" name="name" placeholder="优惠券名称" required />
            </div>
            <div class="space-y-1">
              <select class="input" name="type" required>
                <option value="FIXED_AMOUNT">满减券</option>
                <option value="PERCENTAGE">折扣券</option>
              </select>
            </div>
            <div class="space-y-1">
              <input class="input" name="discountAmount" type="number" step="0.01" min="0.01" placeholder="减免金额（满减券填）" />
            </div>
            <div class="space-y-1">
              <input class="input" name="discountPercentage" type="number" step="0.1" min="0.1" max="100" placeholder="折扣百分比（折扣券填）" />
            </div>
            <div class="space-y-1">
              <input class="input" name="maxDiscount" type="number" step="0.01" min="0.01" placeholder="折上限金额（选填）" />
            </div>
            <div class="space-y-1">
              <input class="input" name="minAmount" type="number" step="0.01" min="0" placeholder="使用门槛（元）" value="0" />
            </div>
            <div class="space-y-1">
              <input class="input" name="totalQuantity" type="number" min="1" placeholder="发放总量" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="limitPerUser" type="number" min="1" placeholder="每人限领" value="1" />
            </div>
            <div class="space-y-1">
              <input class="input" name="validFrom" type="datetime-local" required />
            </div>
            <div class="space-y-1">
              <input class="input" name="validUntil" type="datetime-local" required />
            </div>
            <div class="space-y-1 md:col-span-2">
              <input class="input" name="description" placeholder="描述（选填）" />
            </div>
            <div class="md:col-span-2 flex justify-end">
              <button class="btn-primary" type="submit">创建优惠券</button>
            </div>
          </form>
        </div>
        <div class="grid lg:grid-cols-2 gap-4">${couponRows || '<div class="text-slate-500">暂无优惠券</div>'}</div>
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

    if (state.admin.tab === 'goals') {
      const overview = state.admin.goalsOverview;
      const current = overview?.current;
      const history = overview?.history || [];

      if (state.loading.admin || !overview) {
        content = `
          <div class="card p-6 space-y-4">
            <div class="animate-pulse space-y-4">
              <div class="h-8 bg-slate-200 rounded w-1/3"></div>
              <div class="grid md:grid-cols-2 gap-4">
                <div class="h-32 bg-slate-200 rounded-xl"></div>
                <div class="h-32 bg-slate-200 rounded-xl"></div>
              </div>
              <div class="h-8 bg-slate-200 rounded w-1/4"></div>
              <div class="space-y-3">
                ${Array.from({ length: 3 }).map(() => '<div class="h-20 bg-slate-200 rounded-xl"></div>').join('')}
              </div>
            </div>
          </div>
        `;
      } else {
        const hasGoal = current?.hasGoal;
        const goal = current?.goal;
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        function renderProgressBar(percent, color = 'emerald') {
          const clamped = Math.min(100, Math.max(0, percent));
          const colorClass = color === 'emerald' ? 'bg-emerald-500' : color === 'amber' ? 'bg-amber-500' : 'bg-blue-500';
          return `
            <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div class="${colorClass} h-full rounded-full transition-all duration-500" style="width: ${clamped}%"></div>
            </div>
          `;
        }

        function getProgressColor(percent) {
          if (percent >= 100) return 'emerald';
          if (percent >= 70) return 'amber';
          return 'blue';
        }

        const currentMonthCard = hasGoal ? `
          <div class="card p-6 space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 class="text-lg font-semibold">${currentYear}年${currentMonth}月 目标</h3>
                <p class="text-sm text-slate-500">实时追踪目标完成进度</p>
              </div>
              <div class="flex gap-2">
                <button class="btn-outline" data-action="edit-goal" data-year="${goal.year}" data-month="${goal.month}" data-revenue="${goal.revenueGoal}" data-orders="${goal.orderGoal}">编辑目标</button>
                <button class="btn-outline text-red-600 border-red-200 hover:border-red-400" data-action="delete-goal" data-year="${goal.year}" data-month="${goal.month}">删除</button>
              </div>
            </div>

            <div class="grid md:grid-cols-2 gap-6">
              <div class="space-y-3">
                <div class="flex justify-between items-baseline">
                  <span class="text-sm text-slate-500">销售额目标</span>
                  <span class="font-semibold">${formatCurrency(goal.revenueGoal)}</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-sm text-slate-500">已完成</span>
                  <span class="text-xl font-bold ${current.revenuePercent >= 100 ? 'text-emerald-600' : 'text-slate-800'}">${formatCurrency(current.netRevenue)}</span>
                </div>
                ${renderProgressBar(current.revenuePercent, getProgressColor(current.revenuePercent))}
                <div class="flex justify-between text-sm">
                  <span class="text-slate-500">完成度：${current.revenuePercent.toFixed(1)}%</span>
                  ${current.forecast?.forecastRevenue !== null ? `
                    <span class="text-slate-500">
                      预计月末：<span class="font-medium ${current.forecast.forecastRevenue >= goal.revenueGoal ? 'text-emerald-600' : 'text-amber-600'}">${formatCurrency(current.forecast.forecastRevenue)}</span>
                    </span>
                  ` : ''}
                </div>
                ${current.forecast?.daysPassed !== null ? `
                  <p class="text-xs text-slate-400">本月已过 ${current.forecast.daysPassed} / ${current.forecast.daysTotal} 天（${(current.forecast.progress * 100).toFixed(0)}%）</p>
                ` : ''}
              </div>

              <div class="space-y-3">
                <div class="flex justify-between items-baseline">
                  <span class="text-sm text-slate-500">订单量目标</span>
                  <span class="font-semibold">${goal.orderGoal} 单</span>
                </div>
                <div class="flex justify-between items-baseline">
                  <span class="text-sm text-slate-500">已完成</span>
                  <span class="text-xl font-bold ${current.orderPercent >= 100 ? 'text-emerald-600' : 'text-slate-800'}">${current.netOrders} 单</span>
                </div>
                ${renderProgressBar(current.orderPercent, getProgressColor(current.orderPercent))}
                <div class="flex justify-between text-sm">
                  <span class="text-slate-500">完成度：${current.orderPercent.toFixed(1)}%</span>
                  ${current.forecast?.forecastOrders !== null ? `
                    <span class="text-slate-500">
                      预计月末：<span class="font-medium ${current.forecast.forecastOrders >= goal.orderGoal ? 'text-emerald-600' : 'text-amber-600'}">${current.forecast.forecastOrders} 单</span>
                    </span>
                  ` : ''}
                </div>
              </div>
            </div>

            ${current.refundOrders > 0 ? `
              <div class="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                <h4 class="font-medium text-red-700">退款影响</h4>
                <div class="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span class="text-slate-500">退款订单：</span>
                    <span class="font-medium text-red-600">${current.refundOrders} 单</span>
                  </div>
                  <div>
                    <span class="text-slate-500">退款金额：</span>
                    <span class="font-medium text-red-600">-${formatCurrency(current.refundRevenue)}</span>
                  </div>
                </div>
                <p class="text-xs text-slate-500">已从完成额中扣除退款金额</p>
              </div>
            ` : ''}
          </div>
        ` : `
          <div class="card p-12 text-center space-y-4">
            <div class="text-5xl">🎯</div>
            <div>
              <h3 class="text-lg font-semibold text-slate-700">${currentYear}年${currentMonth}月 暂无目标</h3>
              <p class="text-sm text-slate-500 mt-2">设置销售目标，实时追踪完成进度</p>
            </div>
            <button class="btn-primary" data-action="add-goal" data-year="${currentYear}" data-month="${currentMonth}">
              设定本月目标
            </button>
            <div class="text-sm text-slate-400 pt-4 border-t border-slate-100">
              <p>本月实际销售额：${formatCurrency(current.netRevenue)}</p>
              <p>本月实际订单：${current.netOrders} 单</p>
            </div>
          </div>
        `;

        const historySection = history.length > 0 ? `
          <div class="card p-6 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 class="text-lg font-semibold">历史目标达成</h3>
                <p class="text-sm text-slate-500">最近 12 个月的目标完成情况</p>
              </div>
            </div>
            <div class="space-y-3">
              ${history.map(item => {
                const revenueColor = item.revenuePercent >= 100 ? 'text-emerald-600' : item.revenuePercent >= 70 ? 'text-amber-600' : 'text-slate-600';
                const orderColor = item.orderPercent >= 100 ? 'text-emerald-600' : item.orderPercent >= 70 ? 'text-amber-600' : 'text-slate-600';
                return `
                  <div class="border border-slate-200 rounded-xl p-4 hover-card">
                    <div class="flex flex-wrap items-center justify-between gap-4 mb-3">
                      <div>
                        <h4 class="font-semibold">${item.year}年${item.month}月</h4>
                        <p class="text-xs text-slate-500">
                          目标：${formatCurrency(item.revenueGoal)} / ${item.orderGoal} 单
                        </p>
                      </div>
                      <div class="flex items-center gap-2">
                        ${item.revenueAchieved ? '<span class="badge bg-emerald-500 text-white">销售额达标</span>' : ''}
                        ${item.orderAchieved ? '<span class="badge bg-blue-500 text-white">订单量达标</span>' : ''}
                        <button class="btn-outline text-sm" data-action="edit-goal" data-year="${item.year}" data-month="${item.month}" data-revenue="${item.revenueGoal}" data-orders="${item.orderGoal}">编辑</button>
                      </div>
                    </div>
                    <div class="grid md:grid-cols-2 gap-4">
                      <div class="space-y-2">
                        <div class="flex justify-between text-sm">
                          <span class="text-slate-500">销售额</span>
                          <span class="${revenueColor} font-medium">${formatCurrency(item.netRevenue)} / ${formatCurrency(item.revenueGoal)}</span>
                        </div>
                        ${renderProgressBar(item.revenuePercent, item.revenuePercent >= 100 ? 'emerald' : item.revenuePercent >= 70 ? 'amber' : 'blue')}
                        <p class="text-xs text-right text-slate-500">完成 ${item.revenuePercent.toFixed(1)}%</p>
                      </div>
                      <div class="space-y-2">
                        <div class="flex justify-between text-sm">
                          <span class="text-slate-500">订单量</span>
                          <span class="${orderColor} font-medium">${item.netOrders} / ${item.orderGoal} 单</span>
                        </div>
                        ${renderProgressBar(item.orderPercent, item.orderPercent >= 100 ? 'emerald' : item.orderPercent >= 70 ? 'amber' : 'blue')}
                        <p class="text-xs text-right text-slate-500">完成 ${item.orderPercent.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : `
          <div class="card p-8 text-center">
            <p class="text-slate-500">暂无历史目标记录</p>
          </div>
        `;

        content = `
          ${currentMonthCard}
          ${historySection}
        `;
      }
    }

    viewContent.innerHTML = `${adminTabs}${content}`;
  }

  function renderWishlist() {
    const filter = state.wishlistFilter;
    const totalItems = state.wishlist.length;
    const filteredItems = filter.onlyPriceDrop
      ? state.wishlist.filter((item) => item.isPriceDropped)
      : state.wishlist;
    const droppedCount = state.wishlist.filter((item) => item.isPriceDropped).length;

    viewTitle.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold">我的收藏</h2>
          <p class="text-sm text-slate-500">收藏心仪书籍，降价时及时提醒 · 共 ${totalItems} 本${droppedCount > 0 ? ` · ${droppedCount} 本已降价` : ''}</p>
        </div>
        ${state.user && totalItems > 0 ? `
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" ${filter.onlyPriceDrop ? 'checked' : ''} data-action="toggle-price-drop-filter" class="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              <span class="text-sm text-slate-600">只看降价</span>
            </label>
            <button class="btn-outline" data-action="clear-wishlist">一键清空收藏</button>
          </div>
        ` : ''}
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

    if (filteredItems.length === 0) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">当前筛选条件下暂无书籍，试试调整筛选条件。</div>`;
      return;
    }

    const wishlistCards = filteredItems
      .map(
        (item) => {
          const book = item.book;
          const isInactive = book.status !== 'ACTIVE';
          const isPriceDropped = item.isPriceDropped;
          const title = escapeHtml(book.title);
          const author = escapeHtml(book.author);
          const coverUrl = escapeHtmlAttr(book.coverUrl);
          const titleAttr = escapeHtmlAttr(book.title);
          return `
        <div class="card hover-card p-4 flex flex-col gap-3 ${isInactive ? 'opacity-60' : ''}">
          <div class="relative rounded-xl overflow-hidden h-44 bg-slate-100">
            <img src="${coverUrl}" alt="${titleAttr}" class="w-full h-full object-contain" />
            ${isPriceDropped ? `<span class="absolute top-2 left-2 badge bg-emerald-500 text-white">已降价 -${item.dropPercent}%</span>` : ''}
            ${isInactive ? '<span class="absolute top-2 left-2 badge bg-slate-600 text-white">已下架</span>' : ''}
            <button class="absolute top-2 right-2 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center text-lg text-red-500 transition hover:scale-110" data-action="remove-wishlist" data-id="${item.id}" data-book-id="${book.id}" title="取消收藏">
              ♥
            </button>
          </div>
          <div>
            <h3 class="font-semibold text-lg">${title}</h3>
            <p class="text-sm text-slate-500">${author}</p>
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

  function renderWallet() {
    viewTitle.innerHTML = `
      <div>
        <h2 class="text-xl font-semibold">我的钱包</h2>
        <p class="text-sm text-slate-500">查看余额、流水与充值</p>
      </div>
    `;

    if (!state.user) {
      viewContent.innerHTML = `<div class="card p-6 text-slate-500">请先登录后查看钱包。</div>`;
      return;
    }

    if (state.wallet.loading) {
      viewContent.innerHTML = renderSkeleton();
      return;
    }

    const wallet = state.wallet;
    const txs = wallet.transactions;

    const txItems = txs.list.map((tx) => {
      const isIncome = tx.type === 'RECHARGE' || tx.type === 'REFUND' || tx.type === 'ADJUST';
      const icon = isIncome ? '↑' : '↓';
      return `
        <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-b-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${isIncome ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}">
              ${icon}
            </div>
            <div>
              <p class="font-medium text-sm">${tx.remark || tx.sourceText}</p>
              <p class="text-xs text-slate-400">${new Date(tx.createdAt).toLocaleString('zh-CN')}</p>
              ${tx.orderId ? `<p class="text-xs text-slate-400">订单号：${tx.orderId}</p>` : ''}
            </div>
          </div>
          <p class="text-lg font-semibold ${isIncome ? 'text-emerald-600' : 'text-amber-600'}">
            ${isIncome ? '+' : '-'}${tx.amount}
          </p>
        </div>
      `;
    }).join('');

    const txTotalPages = Math.ceil(txs.total / txs.pageSize);

    viewContent.innerHTML = `
      <div class="card p-6" style="background: linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%); color: white;">
        <div class="space-y-3">
          <p class="text-sm opacity-80">账户余额</p>
          <p class="text-4xl font-bold">${wallet.balance}</p>
          <div class="grid grid-cols-2 gap-4 pt-4">
            <div class="bg-white/20 backdrop-blur-sm rounded-lg p-3">
              <p class="text-xs opacity-80">累计充值</p>
              <p class="text-lg font-semibold">${txs.totalIncome}</p>
            </div>
            <div class="bg-white/20 backdrop-blur-sm rounded-lg p-3">
              <p class="text-xs opacity-80">累计消费</p>
              <p class="text-lg font-semibold">${txs.totalExpense}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-lg font-semibold">模拟充值</h3>
        </div>
        <form data-form="wallet-recharge" class="flex flex-wrap gap-3" novalidate>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-outline" data-action="recharge-quick" data-amount="10">¥10</button>
            <button type="button" class="btn-outline" data-action="recharge-quick" data-amount="50">¥50</button>
            <button type="button" class="btn-outline" data-action="recharge-quick" data-amount="100">¥100</button>
            <button type="button" class="btn-outline" data-action="recharge-quick" data-amount="500">¥500</button>
          </div>
          <div class="flex gap-2 flex-1 min-w-[200px]">
            <input class="input flex-1" type="number" name="amount" step="0.01" min="0.01" placeholder="自定义金额" />
            <button class="btn-primary" type="submit">充值</button>
          </div>
        </form>
      </div>

      <div class="card p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="text-lg font-semibold">余额流水</h3>
          <div class="flex gap-3 text-sm">
            <span class="badge bg-emerald-100 text-emerald-700">收入 ${txs.totalIncome}</span>
            <span class="badge bg-amber-100 text-amber-700">支出 ${txs.totalExpense}</span>
          </div>
        </div>
        ${txs.list.length === 0 ? `
          <div class="text-center py-12 text-slate-500">
            <div class="text-5xl mb-3">💰</div>
            <p>暂无流水记录</p>
            <p class="text-sm mt-1">充值后将显示流水记录</p>
          </div>
        ` : `
          <div class="divide-y divide-slate-100">
            ${txItems}
          </div>
        `}
        ${txTotalPages > 1 ? `
          <div class="flex justify-center gap-2 pt-4 border-t border-slate-100">
            <button class="btn-outline" data-action="wallet-tx-prev" ${txs.page <= 1 ? 'disabled' : ''}>上一页</button>
            <span class="px-3 py-2 text-sm text-slate-600">第 ${txs.page} / ${txTotalPages} 页</span>
            <button class="btn-outline" data-action="wallet-tx-next" ${txs.page >= txTotalPages ? 'disabled' : ''}>下一页</button>
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
    wallet: renderWallet,
    notifications: renderNotifications,
    profile: renderProfile,
    admin: renderAdmin,
    'coupon-center': renderCouponCenter,
    'my-coupons': renderMyCoupons
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
