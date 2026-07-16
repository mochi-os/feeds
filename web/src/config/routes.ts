// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export const APP_ROUTES = {
  HOME: '/',
  FEEDS: {
    VIEW: (feedId: string) => `/${feedId}` as const,
    SETTINGS: (feedId: string) => `/${feedId}/settings` as const,
  },
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
