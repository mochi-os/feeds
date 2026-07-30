// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Trans } from '@lingui/react/macro'
import { OptionsMenu as SharedOptionsMenu } from '@mochi/web'
import { feedsApi } from '@/api/feeds'

interface OptionsMenuProps {
  entityId?: string
  showRss?: boolean
  onSources?: () => void
  onSettings?: () => void
  onUnsubscribe?: () => void
  unsubscribePending?: boolean
  /** Show 'Copy invite link' - owner only (the share action is owner-gated). */
  canShare?: boolean
}

const createShareLink = async (entityId: string) =>
  (await feedsApi.share(entityId)).data.link

const createRssToken = async (entity: string, mode: 'posts' | 'all') =>
  (await feedsApi.getRssToken(entity, mode)).token

const revokeRssToken = async (entity: string) => {
  await feedsApi.revokeRssToken(entity)
}

// Binds the feeds api and routing to the shared entity menu.
export function OptionsMenu(props: OptionsMenuProps) {
  return (
    <SharedOptionsMenu
      {...props}
      linkTitle={<Trans>Feed link</Trans>}
      createShareLink={createShareLink}
      createRssToken={createRssToken}
      revokeRssToken={revokeRssToken}
    />
  )
}
