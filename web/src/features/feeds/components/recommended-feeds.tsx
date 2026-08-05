// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Trans, useLingui } from '@lingui/react/macro'
import { RecommendedEntities, toastAction, getErrorMessage } from '@mochi/web'
import { Rss } from 'lucide-react'
import { feedsApi, type RecommendedFeed } from '@/api/feeds'

interface RecommendedFeedsProps {
  subscribedIds: Set<string>
  onSubscribe: () => void
}

export function RecommendedFeeds({
  subscribedIds,
  onSubscribe,
}: RecommendedFeedsProps) {
  const { t } = useLingui()

  const load = async (): Promise<RecommendedFeed[]> => {
    const response = await feedsApi.recommendations()
    return response.data?.feeds ?? []
  }

  const handleSubscribe = async (feed: RecommendedFeed) => {
    await toastAction(feedsApi.subscribe(feed.id, feed.server || undefined), {
      loading: t`Subscribing...`,
      success: t`Subscribed to ${feed.name}`,
      error: (e) => getErrorMessage(e, t`Failed to subscribe`),
    })
    onSubscribe()
  }

  return (
    <RecommendedEntities
      subscribedIds={subscribedIds}
      load={load}
      onSubscribe={handleSubscribe}
      icon={Rss}
      iconClassName='bg-orange-500/10 text-orange-600'
      title={<Trans>Recommended feeds</Trans>}
      errorMessage={t`Failed to load recommended feeds`}
      subscribeLabel={t`Subscribe`}
    />
  )
}
