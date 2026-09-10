// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { CommandMenu } from '@mochi/web'
import { useSidebarData } from './data/sidebar-data'

export function FeedsCommandMenu() {
  const sidebarData = useSidebarData()
  return <CommandMenu sidebarData={sidebarData} />
}
