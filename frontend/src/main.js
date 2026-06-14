import './styles.css';
import { api } from './api';
import { state, normalizeBookSearch, escapeHtmlAttr } from './state';
import { createViewController } from './views/view-controller';
import { bindEventHandlers } from './handlers/event-binders';

const viewContent = document.getElementById('view-content');
const viewTitle = document.getElementById('view-title');
const modal = document.getElementById('modal');
const toastHost = document.getElementById('toast');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userChip = document.getElementById('user-chip');
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
  [/order not/gi, '订单状态不匹配，请刷新后重试'],
  [/order not payable|order_not_payable/i, '该订单当前不可支付'],
  [/address not found/i, '未找到收货地址'],
  [/category exists/i, '分类已存在'],
  [/book exists/i, '书籍已存在'],
  [/invalid_file_type/i, '仅支持 JPG/PNG/WEBP/GIF/SVG 格式图片'],
  [/file_too_large/i, '图片大小不能超过 2MB'],
  [/forbidden/i, '没有权限执行该操作'],
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

const { updateAuthUI, safeRender } = createViewController({
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

async function loadBooks(params = {}) {
  state.bookSearch = normalizeBookSearch(params);
  state.loading.books = true;
  safeRender();
  state.books = await api.getBooks(state.bookSearch);
  state.loading.books = false;
  safeRender();
}

async function loadCategories() {
  state.categories = await api.getCategories();
}

async function loadCart() {
  if (!state.user) return;
  state.cart = await api.getCart();
}

async function loadOrders() {
  if (!state.user) return;
  state.orders = await api.getOrders();
}

async function loadAddresses() {
  if (!state.user) return;
  state.addresses = await api.getAddresses();
}

async function loadAdmin() {
  if (!state.user || state.user.role !== 'ADMIN') return;
  state.loading.admin = true;
  state.admin.books = await api.admin.getBooks();
  state.admin.categories = await api.admin.getCategories();
  state.admin.orders = await api.admin.getOrders();
  state.admin.stats = await api.admin.getOrderStats();
  state.loading.admin = false;
}

const viewLoaders = {
  books: async () => {
    await loadCategories();
    await loadBooks(state.bookSearch);
  },
  cart: async () => {
    await loadCart();
    await loadAddresses();
  },
  orders: loadOrders,
  profile: loadAddresses,
  admin: loadAdmin
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
logoutBtn.addEventListener('click', async () => {
  await api.logout();
  api.clearToken();
  state.user = null;
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
});

async function bootstrap() {
  api.initToken();
  try {
    const me = await api.getMe();
    state.user = me;
  } catch (error) {
    state.user = null;
  }

  updateAuthUI();
  await setView('books');
}

bootstrap();
