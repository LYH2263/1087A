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
    notifications: false
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
    selectedRestockBooks: new Set()
  },
  profile: {
    editingAddress: null
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
