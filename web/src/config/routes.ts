export const APP_ROUTES = {
  HOME: '/',
  FEEDS: {
    LIST: '/feeds',
    VIEW: (feedId: string) => `/feeds/${feedId}` as const,
  },
  NEW: '/new',
  SEARCH: '/search',
  // User account routes
  SETTINGS: {
    USER: {
      ACCOUNT: '/user/account',
      SESSIONS: '/user/sessions',
      PREFERENCES: '/user/preferences',
    },
    SYSTEM: {
      SETTINGS: '/system/settings',
      USERS: '/system/users',
      STATUS: '/system/status',
    },
  },
} as const

export type AppRoutes = typeof APP_ROUTES
