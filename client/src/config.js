// In production the frontend is served by the backend (same origin),
// so API_URL is empty (relative). In dev it points to localhost:3001.
export const API_URL = import.meta.env.VITE_API_URL || '';
