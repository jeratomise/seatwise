import { QueryClient } from "@tanstack/react-query";

// On Render (and any standard Node host), the frontend and backend are
// served from the same origin — relative paths work perfectly.
export const API_BASE = "";

export const TOKEN_KEY = 'sw_token';

export async function apiRequest(method: string, path: string, body?: unknown) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Token is invalid or expired — clear it and send user to login
    localStorage.removeItem(TOKEN_KEY);
    window.location.hash = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});
