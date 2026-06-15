export const state = {
  user: null,
  view: 'books',
  books: [],
  categories: [],
  bookSearch: {
    title: '',
    author: '',
    isbn: '',
    categoryId: '',
    sort: '',
    minPrice: '',
    maxPrice: ''
  },
  searchSuggestion: {
    items: [],
    activeIndex: -1,
    visible: false,
    keyword: ''
  },
  searchHistory: {
    items: [],
    maxItems: 10
  },
  selectedSpecs: {},
  cart: [],
  wishlist: [],
  wishlistFilter: {
    onlyPriceDrop: false
  },
  orders: [],
  afterSales: [],
  addresses: [],
  loading: {
    books: false,
    cart: false,
    wishlist: false,
    orders: false,
    addresses: false,
    admin: false,
    notifications: false,
    member: false,
    coupons: false
  },
  notifications: {
    list: [],
    unreadCount: 0,
    total: 0,
    page: 1,
    pageSize: 20
  },
  admin: {
    tab: 'books',
    books: [],
    categories: [],
    orders: [],
    coupons: [],
    stats: null,
    editingBook: null,
    stockWarnings: [],
    stockWarningStats: { total: 0, zeroStockCount: 0 },
    stockThreshold: { global: { threshold: 10 }, bookThresholds: [] },
    restockLogs: [],
    restockLogStats: { total: 0, page: 1, pageSize: 20 },
    selectedRestockBooks: new Set(),
    goalsOverview: null,
    editingGoal: null,
    goalYear: null,
    goalMonth: null,
    afterSales: [],
    afterSaleTab: 'all',
    afterSaleFilters: { status: '', type: '' }
  },
  profile: {
    editingAddress: null
  },
  member: {
    loading: false,
    profile: null,
    pointLogs: {
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalEarned: 0,
      totalSpent: 0
    },
    levels: [],
    preview: null
  },
  wallet: {
    loading: false,
    balance: '0.00',
    balanceCents: 0,
    transactions: {
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalIncome: '0.00',
      totalIncomeCents: 0,
      totalExpense: '0.00',
      totalExpenseCents: 0
    }
  },
  coupons: {
    available: [],
    mine: [],
    mineCounts: { AVAILABLE: 0, USED: 0, EXPIRED: 0 },
    mineTab: 'AVAILABLE',
    applicable: [],
    notApplicable: [],
    selectedCouponId: null,
    couponCalcResult: null
  },
  checkout: {
    selectedCouponId: null
  }
};

export function normalizeBookSearch(params = {}) {
  return {
    title: String(params.title || '').trim(),
    author: String(params.author || '').trim(),
    isbn: String(params.isbn || '').trim(),
    categoryId: String(params.categoryId || '').trim(),
    sort: String(params.sort || '').trim(),
    minPrice: String(params.minPrice || '').trim(),
    maxPrice: String(params.maxPrice || '').trim()
  };
}

export function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const SEARCH_HISTORY_KEY = 'bookshop_search_history';
const SEARCH_HISTORY_MAX = 10;

export function loadSearchHistory() {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        state.searchHistory.items = parsed.filter(Boolean).slice(0, SEARCH_HISTORY_MAX);
        return;
      }
    }
  } catch (_e) {}
  state.searchHistory.items = [];
}

export function saveSearchHistory() {
  try {
    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify(state.searchHistory.items.slice(0, SEARCH_HISTORY_MAX))
    );
  } catch (_e) {}
}

export function addSearchKeyword(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return;
  const items = state.searchHistory.items.filter((k) => k !== kw);
  items.unshift(kw);
  state.searchHistory.items = items.slice(0, SEARCH_HISTORY_MAX);
  saveSearchHistory();
}

export function removeSearchKeyword(keyword) {
  state.searchHistory.items = state.searchHistory.items.filter((k) => k !== keyword);
  saveSearchHistory();
}

export function clearSearchHistory() {
  state.searchHistory.items = [];
  saveSearchHistory();
}
