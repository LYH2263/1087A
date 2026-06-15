import './styles.css';
import { api } from './api';
import { state, normalizeBookSearch, escapeHtmlAttr } from './state';
import { createViewController } from './views/view-controller';
import { bindEventHandlers } from './handlers/event-binders';
import { createSearchSuggest } from './search-suggest';

const viewContent = document.getElementById('view-content');
const viewTitle = document.getElementById('view-title');
const modal = document.getElementById('modal');
const toastHost = document.getElementById('toast');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userChip = document.getElementById('user-chip');
const notificationBtn = document.getElementById('notification-btn');
const notificationBadge = document.getElementById('notification-badge');
const navNotificationBadge = document.getElementById('nav-notification-badge');
const adminNavBtn = document.querySelector('[data-view="admin"]');
const adminNavSection = document.getElementById('admin-nav');

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    setView(btn.dataset.view);
  });
});

const toastMap = [
  [/(network|fetch|failed to fetch|timeout)/i, '网络请求失败，请检查连接'],
  [/invalid credentials|invalid password|unauthorized|invalid token/i, '账号或密码错误'],
  [/username exists|username_exists/i, '用户名已被占用'],
  [/email exists|email_exists/i, '邮箱已被占用'],
  [/phone exists|phone_exists/i, '手机号已被占用'],
  [/account exists|user exists|already exists/i, '账号已存在'],
  [/validation_error|输入校验失败/i, '提交信息不完整或格式有误'],
  [/not found/i, '未找到相关数据'],
  [/insufficient stock/i, '库存不足'],
  [/cart empty|cart_empty/i, '当前购物车为空,请到书籍查询页面购买书籍.'],
  [/book_not_active|book not active/i, '该书籍已下架，无法购买'],
  [/wishlist_item_not_found|wishlist item not found/i, '收藏项不存在'],
  [/order not/gi, '订单状态不匹配，请刷新后重试'],
  [/order not payable|order_not_payable/i, '该订单当前不可支付'],
  [/address not found/i, '未找到收货地址'],
  [/category exists/i, '分类已存在'],
  [/book exists/i, '书籍已存在'],
  [/invalid_file_type/i, '仅支持 JPG/PNG/WEBP/GIF/SVG 格式图片'],
  [/file_too_large/i, '图片大小不能超过 2MB'],
  [/forbidden/i, '没有权限执行该操作'],
  [/spec_required/i, '该书籍有多个规格，请选择规格'],
  [/spec_not_found/i, '所选规格不存在，请重新选择'],
  [/spec_name_exists/i, '规格名称已存在'],
  [/coupon_not_found/i, '优惠券不存在'],
  [/coupon_expired/i, '优惠券已过期'],
  [/coupon_not_active/i, '优惠券尚未生效'],
  [/coupon_not_available/i, '优惠券不可用'],
  [/coupon_sold_out/i, '优惠券已被领完'],
  [/coupon_limit_reached/i, '已达到领取上限'],
  [/coupon_already_used/i, '优惠券已被使用'],
  [/coupon_concurrent_use/i, '优惠券已被其他订单使用'],
  [/min_amount_not_reached/i, '未达到优惠券使用门槛'],
  [/user_coupon_not_found/i, '未找到该优惠券'],
  [/aftersale_already_exists/i, '该订单已有正在处理的售后申请，请等待审核完成后再提交'],
  [/exceed_returnable_quantity/i, '申请的退货数量超过了可退货数量上限'],
  [/item_already_returned/i, '该商品已全部退货，无法再次申请'],
  [/order_not_eligible_for_aftersale/i, '当前订单状态不支持申请退换货'],
  [/aftersale_not_pending/i, '该售后单当前状态无法执行此操作'],
  [/aftersale_not_found/i, '售后单不存在'],
  [/no_returnable_items/i, '请选择要退换的商品和数量'],
  [/internal server error/i, '服务器开小差了，请稍后再试']
];

function toChineseToast(message) {
  if (!message) return '操作失败，请稍后再试';
  const found = toastMap.find(([regex]) => regex.test(message));
  if (found) return found[1];
  if (/^[\u4e00-\u9fa5]/.test(message)) return message;
  return '操作失败，请检查输入或稍后再试';
}

function showToast(message, type = 'info') {
  const el = document.createElement('div');
  const color = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-emerald-500' : 'bg-slate-800';
  el.className = `text-white px-4 py-2 rounded-xl shadow-lg text-sm ${color}`;
  el.textContent = toChineseToast(message);
  toastHost.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 2000);
}

function openModal(content) {
  modal.innerHTML = `
    <div class="card w-full max-w-lg p-6 relative">
      <button class="absolute right-4 top-4 text-slate-400 hover:text-slate-700" data-action="close-modal">✕</button>
      ${content}
    </div>
  `;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModal() {
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  modal.innerHTML = '';
}

const originalViewController = createViewController({
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
});

function updateAuthUI() {
    originalViewController.updateAuthUI();
    updateNotificationUI();
    if (state.user) {
      startUnreadPolling();
    } else {
      stopUnreadPolling();
    }
    if (state.user && state.user.member) {
      userChip.textContent = `${state.user.username} · ${state.user.member.levelIcon}${state.user.member.levelName} · ${state.user.role === 'ADMIN' ? '管理员' : '用户'}`;
    } else if (state.user) {
      userChip.textContent = `${state.user.username} · ${state.user.role === 'ADMIN' ? '管理员' : '用户'}`;
    }
  }

const { safeRender } = originalViewController;

let searchSuggestInstance = null;

function initSearchSuggest() {
  if (searchSuggestInstance) {
    searchSuggestInstance.destroy();
  }
  searchSuggestInstance = createSearchSuggest({
    api,
    onSuggestSelect(item) {
      loadBooks({ title: item.title });
    }
  });
  searchSuggestInstance.attach();
}

async function loadBooks(params = {}) {
  state.bookSearch = normalizeBookSearch(params);
  state.loading.books = true;
  safeRender();
  initSearchSuggest();
  state.books = await api.getBooks(state.bookSearch);
  state.loading.books = false;
  safeRender();
  initSearchSuggest();
}

async function loadCategories() {
  state.categories = await api.getCategories();
}

async function loadCart() {
  if (!state.user) return;
  state.cart = await api.getCart();
}

async function loadWishlist() {
  if (!state.user) return;
  state.wishlist = await api.getWishlist();
}

async function loadOrders() {
  if (!state.user) return;
  state.orders = await api.getOrders();
}

async function loadAfterSales() {
  if (!state.user) return;
  state.afterSales = await api.getAfterSales();
}

async function loadAddresses() {
  if (!state.user) return;
  state.addresses = await api.getAddresses();
}

async function loadMember(page = 1) {
  if (!state.user) return;
  state.loading.member = true;
  safeRender();
  const [profile, logs, levels] = await Promise.all([
    api.getMemberProfile(),
    api.getMemberPointLogs({ page, pageSize: state.member.pointLogs.pageSize }),
    api.getMemberLevels()
  ]);
  state.member.profile = profile;
  state.member.pointLogs = {
    list: logs.logs,
    total: logs.total,
    page: logs.page,
    pageSize: logs.pageSize,
    totalEarned: logs.totalEarned,
    totalSpent: logs.totalSpent
  };
  state.member.levels = levels;
  state.loading.member = false;
  safeRender();
}

async function loadWallet(page = 1) {
  if (!state.user) return;
  state.wallet.loading = true;
  safeRender();
  const data = await api.getWalletTransactions({ page, pageSize: state.wallet.transactions.pageSize });
  state.wallet.balance = data.balance;
  state.wallet.balanceCents = data.balanceCents;
  state.wallet.transactions = {
    list: data.transactions,
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
    totalIncome: data.totalIncome,
    totalIncomeCents: data.totalIncomeCents,
    totalExpense: data.totalExpense,
    totalExpenseCents: data.totalExpenseCents
  };
  state.wallet.loading = false;
  safeRender();
}

async function loadAdmin() {
  if (!state.user || state.user.role !== 'ADMIN') return;
  state.loading.admin = true;
  const [books, categories, orders, stats, stockThreshold, stockWarnings, restockLogs, goalsOverview, coupons, afterSales] = await Promise.all([
    api.admin.getBooks(),
    api.admin.getCategories(),
    api.admin.getOrders(),
    api.admin.getOrderStats(),
    api.admin.getStockThreshold(),
    api.admin.getStockWarnings(),
    api.admin.getRestockLogs({ page: 1, pageSize: 20 }),
    api.admin.getGoalsOverview(),
    api.admin.getCoupons(),
    api.admin.getAfterSales()
  ]);
  state.admin.books = books;
  state.admin.categories = categories;
  state.admin.orders = orders;
  state.admin.stats = stats;
  state.admin.stockThreshold = stockThreshold;
  state.admin.stockWarnings = stockWarnings.books;
  state.admin.stockWarningStats = { total: stockWarnings.total, zeroStockCount: stockWarnings.zeroStockCount };
  state.admin.restockLogs = restockLogs.logs;
  state.admin.restockLogStats = { total: restockLogs.total, page: restockLogs.page, pageSize: restockLogs.pageSize };
  state.admin.goalsOverview = goalsOverview;
  state.admin.coupons = coupons;
  state.admin.afterSales = afterSales;
  state.loading.admin = false;
}

async function loadNotifications(page = 1) {
  if (!state.user) return;
  state.loading.notifications = true;
  safeRender();
  const data = await api.getNotifications({ page, pageSize: state.notifications.pageSize });
  state.notifications.list = data.notifications;
  state.notifications.total = data.total;
  state.notifications.page = data.page;
  state.notifications.pageSize = data.pageSize;
  state.notifications.unreadCount = data.unreadCount;
  state.loading.notifications = false;
  updateNotificationBadge();
  safeRender();
}

async function loadCoupons() {
  if (!state.user) return;
  state.loading.coupons = true;
  safeRender();
  const data = await api.getAvailableCoupons();
  state.coupons.available = data;
  state.loading.coupons = false;
  safeRender();
}

async function loadMyCoupons() {
  if (!state.user) return;
  const data = await api.getMyCoupons();
  state.coupons.mine = data.items;
  state.coupons.mineCounts = data.counts;
}

async function loadApplicableCoupons() {
  if (!state.user || state.cart.length === 0) return;
  const subtotal = state.cart.reduce((sum, item) => {
    let price = item.book.price;
    if (item.specPrice !== undefined) price = item.specPrice;
    return sum + price * item.quantity;
  }, 0);
  try {
    const data = await api.getApplicableCoupons(subtotal);
    state.coupons.applicable = data.applicable;
    state.coupons.notApplicable = data.notApplicable;
  } catch (e) {
    state.coupons.applicable = [];
    state.coupons.notApplicable = [];
  }
}

async function calculateCoupon(userCouponId, subtotal) {
  const result = await api.calculateCoupon(userCouponId, subtotal);
  state.coupons.couponCalcResult = result;
  return result;
}

async function loadUnreadNotificationCount() {
  if (!state.user) return;
  try {
    const data = await api.getUnreadNotificationCount();
    state.notifications.unreadCount = data.unreadCount;
    updateNotificationBadge();
  } catch (error) {
    // 静默失败，不影响用户体验
  }
}

function updateNotificationBadge() {
  const count = state.notifications.unreadCount;
  if (count > 0) {
    notificationBadge.textContent = count > 99 ? '99+' : count;
    notificationBadge.classList.remove('hidden');
    navNotificationBadge.textContent = count > 99 ? '99+' : count;
    navNotificationBadge.classList.remove('hidden');
  } else {
    notificationBadge.classList.add('hidden');
    navNotificationBadge.classList.add('hidden');
  }
}

function updateNotificationUI() {
  if (state.user) {
    notificationBtn.classList.remove('hidden');
    updateNotificationBadge();
  } else {
    notificationBtn.classList.add('hidden');
    notificationBadge.classList.add('hidden');
    navNotificationBadge.classList.add('hidden');
  }
}

const viewLoaders = {
  books: async () => {
    await loadCategories();
    await loadBooks(state.bookSearch);
    await loadWishlist();
  },
  cart: async () => {
    await Promise.all([loadCart(), loadAddresses(), loadMyCoupons()]);
    await loadApplicableCoupons();
    try {
      const balanceData = await api.getWalletBalance();
      state.wallet.balance = balanceData.balance;
      state.wallet.balanceCents = balanceData.balanceCents;
    } catch (e) {}
  },
  wishlist: loadWishlist,
  orders: async () => {
    await loadOrders();
    await loadAfterSales();
  },
  'after-sales': loadAfterSales,
  member: () => loadMember(1),
  wallet: () => loadWallet(1),
  notifications: () => loadNotifications(1),
  profile: loadAddresses,
  admin: loadAdmin,
  'coupon-center': loadCoupons,
  'my-coupons': loadMyCoupons
};

async function setView(view) {
  state.view = view;
  try {
    const loader = viewLoaders[view];
    if (loader) await loader();
  } catch (error) {
    showToast(error.message || '加载失败', 'error');
  }
  safeRender();
}

function openLoginModal() {
  openModal(`
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">账号登录</h3>
      <form data-form="login" class="space-y-3" novalidate>
        <input class="input" name="account" placeholder="用户名 / 手机 / 邮箱" required />
        <input class="input" type="password" name="password" placeholder="密码" required />
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="remember" /> 记住登录状态
        </label>
        <button class="btn-primary w-full" type="submit">登录</button>
      </form>
      <div class="flex justify-between text-sm">
        <button class="text-teal-700" data-action="show-register">注册新账号</button>
        <button class="text-teal-700" data-action="show-forgot">忘记密码</button>
      </div>
    </div>
  `);
}

function openRegisterModal() {
  openModal(`
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">创建账号</h3>
      <form data-form="register" class="space-y-3" novalidate>
        <input class="input" name="username" placeholder="用户名" required />
        <input class="input" name="email" placeholder="邮箱" required />
        <input class="input" name="phone" placeholder="手机号" required />
        <input class="input" type="password" name="password" placeholder="密码 (含大小写 + 数字)" required />
        <button class="btn-primary w-full" type="submit">注册</button>
      </form>
      <button class="text-teal-700 text-sm" data-action="show-login">已有账号？登录</button>
    </div>
  `);
}

function openForgotModal() {
  openModal(`
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">找回密码</h3>
      <form data-form="forgot" class="space-y-3" novalidate>
        <input class="input" name="account" placeholder="用户名 / 手机 / 邮箱" required />
        <div class="space-y-2">
          <p class="text-sm text-slate-600">选择验证码接收方式</p>
          <div class="grid grid-cols-2 gap-3" data-error-group="method">
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="method" value="email" checked /> 邮箱
            </label>
            <label class="card p-3 flex items-center gap-2 cursor-pointer">
              <input type="radio" name="method" value="sms" /> 短信
            </label>
          </div>
        </div>
        <button class="btn-primary w-full" type="submit">发送验证码</button>
      </form>
      <button class="text-teal-700 text-sm" data-action="show-login">返回登录</button>
    </div>
  `);
}

function openResetModal(token = '') {
  openModal(`
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">重置密码</h3>
      <form data-form="reset" class="space-y-3" novalidate>
        <input class="input" name="token" placeholder="请输入验证码" value="${token}" required />
        <input class="input" type="password" name="newPassword" placeholder="新密码" required />
        <button class="btn-primary w-full" type="submit">更新密码</button>
      </form>
    </div>
  `);
}

loginBtn.addEventListener('click', openLoginModal);
notificationBtn.addEventListener('click', () => {
  if (state.user) {
    setView('notifications');
  }
});
logoutBtn.addEventListener('click', async () => {
  await api.logout();
  api.clearToken();
  state.user = null;
  state.notifications = {
    list: [],
    unreadCount: 0,
    total: 0,
    page: 1,
    pageSize: 20
  };
  stopUnreadPolling();
  updateAuthUI();
  showToast('已退出登录', 'success');
  await setView('books');
});

bindEventHandlers({
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
  loadMember,
  loadWallet,
  loadCoupons,
  loadMyCoupons,
  loadApplicableCoupons,
  calculateCoupon,
  loadAfterSales
});

let unreadPollInterval = null;

function startUnreadPolling() {
  if (unreadPollInterval) {
    clearInterval(unreadPollInterval);
  }
  unreadPollInterval = setInterval(() => {
    if (state.user) {
      loadUnreadNotificationCount();
    }
  }, 30000);
}

function stopUnreadPolling() {
  if (unreadPollInterval) {
    clearInterval(unreadPollInterval);
    unreadPollInterval = null;
  }
}

async function bootstrap() {
  api.initToken();
  try {
    const me = await api.getMe();
    state.user = me;
    if (state.user) {
      await loadUnreadNotificationCount();
    }
  } catch (error) {
    state.user = null;
  }

  updateAuthUI();
  await setView('books');
}

bootstrap();
