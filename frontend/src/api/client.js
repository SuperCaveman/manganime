import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('idToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const titles = {
  list: (params) => api.get('/titles', { params }),
  search: (q) => api.get('/titles', { params: { search: q, limit: 100 } }),
  divergent: () => api.get('/titles', { params: { divergent: '1', limit: 6 } }),
  get: (titleId) => api.get(`/titles/${titleId}`),
  getSeasonScores: (titleId) => api.get(`/titles/${titleId}/season-scores`),
  getVolumeScores: (titleId) => api.get(`/titles/${titleId}/volume-scores`),
  create: (data) => api.post('/titles', data),
  getReviews: (titleId, params) => api.get(`/titles/${titleId}/reviews`, { params }),
  submitReview: (titleId, data) => api.post(`/titles/${titleId}/reviews`, data),
  fetchCover: (titleId) => api.post(`/titles/${titleId}/fetch-cover`),
};

export const news = {
  get: (params) => api.get('/news', { params }),
};

export const reviews = {
  translate: (titleId, reviewId, targetLang) =>
    api.post(`/titles/${titleId}/reviews/${reviewId}/translate`, null, {
      params: { targetLang },
    }),
  update: (titleId, reviewId, data) =>
    api.patch(`/titles/${titleId}/reviews/${reviewId}`, data),
  remove: (titleId, reviewId) =>
    api.delete(`/titles/${titleId}/reviews/${reviewId}`),
};

export const me = {
  getReviews: (params) => api.get('/users/me/reviews', { params }),
};

export const comments = {
  list: (titleId, reviewId) => api.get(`/titles/${titleId}/reviews/${reviewId}/comments`),
  post: (titleId, reviewId, data) => api.post(`/titles/${titleId}/reviews/${reviewId}/comments`, data),
};

export const notifications = {
  get: () => api.get('/users/me/notifications'),
  markRead: (notificationIds) => api.post('/users/me/notifications/read', { notificationIds }),
};

export const releases = {
  get: (week, locale = 'en') => api.get('/releases', { params: { week, locale } }),
};

export const contact = {
  send: (data) => api.post('/contact', data),
};

export default api;
