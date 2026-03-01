// ─── SubVault API Client ───
// Drop this file alongside your React app and import where needed.

const API_BASE = "http://localhost:3001/api";

let _token = null;

export function setToken(token) {
  _token = token;
  if (token) localStorage.setItem("subvault_token", token);
  else localStorage.removeItem("subvault_token");
}

export function getToken() {
  if (!_token) _token = localStorage.getItem("subvault_token");
  return _token;
}

async function request(path, options = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    if (err?.name === "TypeError" && /failed to fetch|load failed/i.test(err?.message || "")) {
      throw new Error("Unable to connect to the server. Please check that it's running and try again.");
    }
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid response from server.");
  }

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event("subvault:logout"));
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

// ─── Auth ───
export const auth = {
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  register: (email, password, name) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }),

  me: () => request("/auth/me"),

  updateProfile: (data) =>
    request("/auth/me", { method: "PUT", body: JSON.stringify(data) }),

  oauthCallback: (provider, code, redirectUri) =>
    request(`/oauth/${provider}/callback`, {
      method: "POST",
      body: JSON.stringify({ code, redirectUri }),
    }),

  getAuthMethods: (email) =>
    request(`/oauth/auth-methods/${email}`),
};

// ─── Subscriptions ───
export const subscriptions = {
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
    ).toString();
    return request(`/subscriptions${query ? `?${query}` : ""}`);
  },

  get: (id) => request(`/subscriptions/${id}`),

  create: (data) =>
    request("/subscriptions", { method: "POST", body: JSON.stringify(data) }),

  update: (id, data) =>
    request(`/subscriptions/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  toggle: (id) =>
    request(`/subscriptions/${id}/toggle`, { method: "PATCH" }),

  delete: (id) =>
    request(`/subscriptions/${id}`, { method: "DELETE" }),

  bulkDelete: (ids) =>
    request("/subscriptions/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
};

// ─── Analytics ───
export const analytics = {
  summary: () => request("/analytics/summary"),
  categories: () => request("/analytics/categories"),
  trends: () => request("/analytics/trends"),
  upcoming: (limit = 10, days = 30) => request(`/analytics/upcoming?limit=${limit}&days=${days}`),
  insights: () => request("/analytics/insights"),
};

// ─── Health ───
export const health = () => request("/health");
