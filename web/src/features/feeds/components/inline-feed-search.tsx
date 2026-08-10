// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useNavigate } from '@tanstack/react-router'
import type { DirectoryEntry } from '@/types'
import { useLingui } from '@lingui/react/macro'
import { InlineEntitySearch, toastAction, getErrorMessage } from '@mochi/web'
import { Rss } from 'lucide-react'
import { feedsApi } from '@/api/feeds'

interface InlineFeedSearchProps {
  subscribedIds: Set<string>
  onRefresh?: () => void
}

export function InlineFeedSearch({
  subscribedIds,
  onRefresh,
}: InlineFeedSearchProps) {
  const { t } = useLingui()
  const navigate = useNavigate()

  const search = async (query: string): Promise<DirectoryEntry[]> => {
    const response = await feedsApi.search({ search: query })
    return response.data ?? []
  }

  const probe = async (url: string): Promise<DirectoryEntry[]> => {
    const probed = await feedsApi.probe({ url })
    const data = probed?.data
    return data?.id
      ? [
          {
            id: data.id,
            name: data.name ?? '',
            fingerprint: data.fingerprint ?? '',
            fingerprint_hyphens: '',
            class: 'feed',
            created: 0,
            location: data.server ?? '',
            peer: data.peer,
          },
        ]
      : []
  }

  const handleSubscribe = async (feed: DirectoryEntry) => {
    await toastAction(
      feedsApi.subscribe(feed.id, feed.location || undefined, feed.peer),
      {
        loading: t`Subscribing...`,
        success: t`Subscribed`,
        error: (e) => getErrorMessage(e, t`Failed to subscribe`),
      }
    )
    onRefresh?.()
    void navigate({ to: '/$feedId', params: { feedId: feed.id } })
  }

  return (
    <InlineEntitySearch
      subscribedIds={subscribedIds}
      search={search}
      probe={probe}
      onSubscribe={handleSubscribe}
      icon={Rss}
      iconClassName='bg-orange-500/10 text-orange-600'
      placeholder={t`Search for feeds...`}
      emptyMessage={t`No feeds found`}
      searchErrorMessage={t`Failed to search feeds`}
      subscribeLabel={t`Subscribe`}
    />
  )
}
