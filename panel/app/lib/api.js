const API = process.env.NEXT_PUBLIC_API;

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}
export function setToken(t) { localStorage.setItem('token', t); }
export function clearToken() { localStorage.removeItem('token'); }

export async function api(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/';
    throw new Error('unauthorized');
  }
  return res.json().catch(() => ({}));
}

export async function upload(path, formData) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  return res.json();
}

export function streamLogs(bot, onData) {
  const token = getToken();
  const url = `${API}/api/bots/${bot}/logs/stream?token=${token}`;
  const es = new EventSource(url);
  es.onmessage = e => onData(e.data);
  return es;
}
