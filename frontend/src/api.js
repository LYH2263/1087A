const API_BASE = '/api';

let accessToken = null;
let refreshing = null;

function getStoredToken() {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

function setStoredToken(token, remember) {
  localStorage.removeItem('access_token');
  sessionStorage.removeItem('access_token');
  if (!token) {
    return;
  }
  if (remember) {
    localStorage.setItem('access_token', token);
  } else {
    sessionStorage.setItem('access_token', token);
  }
}

function setAccessToken(token) {
  accessToken = token;
}

function getAccessToken() {
  if (!accessToken) {
    accessToken = getStoredToken();
  }
  return accessToken;
}

async function request(path, options = {}, retry = true) {
  const headers = options.headers || {};
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && retry) {
      await refresh();
      return request(path, options, false);
    }
    const message = data.message || data.error || '请求失败';
    const error = new Error(message);
    error.payload = data;
    throw error;
  }

  return data;
}

async function refresh() {
  if (refreshing) {
    return refreshing;
  }

  refreshing = request('/auth/refresh', { method: 'POST' }, false)
    .then((data) => {
      setAccessToken(data.accessToken);
      setStoredToken(data.accessToken, true);
      refreshing = null;
      return data;
    })
    .catch((error) => {
      setAccessToken(null);
      setStoredToken(null, false);
      refreshing = null;
      throw error;
    });

  return refreshing;
}

export const api = {
  initToken() {
    const stored = getStoredToken();
    if (stored) {
      setAccessToken(stored);
    }
    return stored;
  },
  setToken(token, remember) {
    setAccessToken(token);
    setStoredToken(token, remember);
  },
  clearToken() {
    setAccessToken(null);
    setStoredToken(null, false);
  },
  request,
  login(payload) {
    return request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  register(payload) {
    return request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  logout() {
    return request('/auth/logout', { method: 'POST' });
  },
  forgotPassword(payload) {
    return request('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  resetPassword(payload) {
    return request('/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  getMe() {
    return request('/auth/me');
  },
  getBooks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/books${query ? `?${query}` : ''}`);
  },
  getCategories() {
    return request('/books/categories');
  },
  getCart() {
    return request('/cart');
  },
  addToCart(payload) {
    return request('/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  updateCart(itemId, payload) {
    return request(`/cart/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  removeCart(itemId) {
    return request(`/cart/${itemId}`, { method: 'DELETE' });
  },
  clearCart() {
    return request('/cart', { method: 'DELETE' });
  },
  getOrders() {
    return request('/orders');
  },
  checkout(payload) {
    return request('/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  payOrder(orderId) {
    return request(`/orders/${orderId}/pay`, { method: 'POST' });
  },
  cancelOrder(orderId) {
    return request(`/orders/${orderId}/cancel`, { method: 'POST' });
  },
  confirmOrder(orderId) {
    return request(`/orders/${orderId}/confirm`, { method: 'POST' });
  },
  reviewOrder(orderId, payload) {
    return request(`/orders/${orderId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  getAddresses() {
    return request('/addresses');
  },
  addAddress(payload) {
    return request('/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  updateAddress(id, payload) {
    return request(`/addresses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  setDefaultAddress(id) {
    return request(`/addresses/${id}/default`, { method: 'POST' });
  },
  deleteAddress(id) {
    return request(`/addresses/${id}`, { method: 'DELETE' });
  },
  admin: {
    getBooks(params = {}) {
      const query = new URLSearchParams(params).toString();
      return request(`/admin/books${query ? `?${query}` : ''}`);
    },
    createBook(payload) {
      return request('/admin/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    },
    updateBook(id, payload) {
      return request(`/admin/books/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    },
    deactivateBook(id) {
      return request(`/admin/books/${id}`, { method: 'DELETE' });
    },
    restoreBook(id) {
      return request(`/admin/books/${id}/restore`, { method: 'POST' });
    },
    getCategories() {
      return request('/admin/categories');
    },
    createCategory(payload) {
      return request('/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    },
    deleteCategory(id) {
      return request(`/admin/categories/${id}`, { method: 'DELETE' });
    },
    getOrders(params = {}) {
      const query = new URLSearchParams(params).toString();
      return request(`/admin/orders${query ? `?${query}` : ''}`);
    },
    getOrderStats() {
      return request('/admin/orders/stats');
    },
    acceptOrder(id) {
      return request(`/admin/orders/${id}/accept`, { method: 'POST' });
    },
    shipOrder(id) {
      return request(`/admin/orders/${id}/ship`, { method: 'POST' });
    },
    refundOrder(id) {
      return request(`/admin/orders/${id}/refund`, { method: 'POST' });
    },
    exportOrders() {
      return fetch(`${API_BASE}/admin/orders/export`, {
        method: 'GET',
        credentials: 'include',
        headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}
      });
    },
    uploadCover(file) {
      const formData = new FormData();
      formData.append('file', file);
      return request('/admin/upload', {
        method: 'POST',
        body: formData
      });
    }
  }
};
