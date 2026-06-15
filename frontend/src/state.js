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
  selectedSpecs: {},
  cart: [],
  wishlist: [],
  orders: [],
  addresses: [],
  loading: {
    books: false,
    cart: false,
    wishlist: false,
    orders: false,
    addresses: false,
    admin: false,
    notifications: false,
    member: false
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
    goalMonth: null
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
