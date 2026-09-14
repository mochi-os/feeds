// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { APP_ROUTES } from '@/config/routes'
import { useLingui } from '@lingui/react/macro'
import type { SidebarData } from '@mochi/web'
import { Home } from 'lucide-react'

// Static sidebar data for CommandMenu (Cmd+K)
// The full dynamic sidebar is built in FeedsLayout
export function useSidebarData(): SidebarData {
  const { t } = useLingui()
  return {
    navGroups: [
      {
        title: t`All feeds`,
        items: [{ title: t`Home`, url: APP_ROUTES.HOME, icon: Home }],
      },
    ],
  }
}
