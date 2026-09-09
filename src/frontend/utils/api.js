function getApiBase() {
  const serverIp = localStorage.getItem('server_ip');
  if (serverIp) {
    return `http://${serverIp}:3000/api`;
  }
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';
}

function generateRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const BILLING_ENDPOINTS = new Set([
  '/sales',
  '/sales/return',
  '/customers',
]);

class ApiClient {
  getToken() {
    return localStorage.getItem('token');
  }

  async request(method, endpoint, body = null) {
    const isBilling = BILLING_ENDPOINTS.has(endpoint.split('?')[0]);
    const maxRetries = isBilling ? 2 : 0;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (method === 'POST') {
          headers['X-Request-ID'] = generateRequestId();
        }

        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);

        const response = await fetch(`${getApiBase()}${endpoint}`, config);
        let data;
        try {
          data = await response.json();
        } catch {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        if (!response.ok) {
          throw new Error(data.error || `Request failed: ${response.status}`);
        }
        return data;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 4000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (lastError && (lastError.message.includes('Server error') || lastError.message.includes('Request failed'))) {
      throw new Error('Operation failed after multiple attempts. Please try again or contact support.');
    }
    throw lastError;
  }

  get(endpoint) { return this.request('GET', endpoint); }
  post(endpoint, body) { return this.request('POST', endpoint, body); }
  put(endpoint, body) { return this.request('PUT', endpoint, body); }
  delete(endpoint) { return this.request('DELETE', endpoint); }
}

export const api = new ApiClient();
export default ApiClient;
