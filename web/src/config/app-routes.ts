export const APP_ROUTES = {
  // Chat app
  CHAT: {
    BASE: '/chat/',
    HOME: '/chat/',
  },
  // Friends app
  FRIENDS: {
    BASE: '/friends/',
    HOME: '/friends/',
  },
  // Home app (future)
  HOME: {
    BASE: '/home/',
    HOME: '/home/',
  },
  // Feeds app (future)
  FEEDS: {
    BASE: './',
    HOME: './',
  },
  // Forums app
  FORUMS: {
    BASE: '/forums/',
    HOME: '/forums/',
  },
  // Notifications app
  NOTIFICATIONS: {
    BASE: '/notifications/',
    HOME: '/notifications/',
  },
  // Settings app
  SETTINGS: {
    BASE: '/settings/',
    HOME: '/settings/',
  },
  // Template app
  TEMPLATE: {
    BASE: '/template/',
    HOME: '/template/',
  },
} as const

export type AppRoutes = typeof APP_ROUTES
