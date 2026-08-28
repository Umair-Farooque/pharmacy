const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

class ApiClient {
  getToken() {
    return localStorage.getItem('token');
  }

  async request(method, endpoint, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE}${endpoint}`, config);
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
  }

  get(endpoint) { return this.request('GET', endpoint); }
  post(endpoint, body) { return this.request('POST', endpoint, body); }
  put(endpoint, body) { return this.request('PUT', endpoint, body); }
  delete(endpoint) { return this.request('DELETE', endpoint); }
}

export const api = new ApiClient();
export default ApiClient;
