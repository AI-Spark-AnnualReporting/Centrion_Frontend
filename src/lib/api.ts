// API configuration for FastAPI backend integration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

// Placeholder API functions
export const api = {
  login: (email: string, password: string) =>
    apiCall('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (data: Record<string, string>) =>
    apiCall('/signup', { method: 'POST', body: JSON.stringify(data) }),
  getReports: () => apiCall('/reports'),
  getDashboard: () => apiCall('/dashboard'),
  getKPIs: () => apiCall('/kpis'),
  getCompliance: () => apiCall('/compliance'),
  getStakeholders: () => apiCall('/stakeholders'),
  getMeetings: () => apiCall('/meetings'),
  generateESGReport: (data: Record<string, unknown>) =>
    apiCall('/reports/generate', { method: 'POST', body: JSON.stringify(data) }),
};
