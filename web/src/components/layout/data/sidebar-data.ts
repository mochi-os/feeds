// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Home } from 'lucide-react'
import type { SidebarData } from '@mochi/web'
import { useLingui } from '@lingui/react/macro'
import { APP_ROUTES } from '@/config/routes'

// Static sidebar data for CommandMenu (Cmd+K)
// The full dynamic sidebar is built in FeedsLayout
export function useSidebarData(): SidebarData {
  const { t } = useLingui()
  return {
    navGroups: [
      {
        title: t`All feeds`,
        items: [
          { title: t`Home`, url: APP_ROUTES.HOME, icon: Home },
        ],
      },
    ],
  }
}
