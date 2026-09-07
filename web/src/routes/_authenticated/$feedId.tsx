// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createFileRoute, useRouter, useNavigate, Link } from '@tanstack/react-router'
import { t } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button, EmptyState, GeneralError, Main, PageHeader, getErrorMessage } from '@mochi/web'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import type { Feed } from '@/types'
import { feedsApi } from '@/api/feeds'
import { EntityFeedPage } from '@/features/feeds/pages'

export type FeedLoaderData = {
  feed: Feed | null
  permissions?: import('@/types').FeedPermissions
  loaderError: string | null
  notFound: boolean
}

// Resolve the routed feed. A missing/inaccessible feed returns notFound (the
// page renders an explanatory empty state) rather than silently redirecting to
// the timeline, so a user who followed a dead or private link learns why.
export async function loadFeed(feedId: string): Promise<FeedLoaderData> {
  let response: Awaited<ReturnType<typeof feedsApi.getInfo>>
  try {
    response = await feedsApi.getInfo(feedId)
  } catch (error) {
    return {
      feed: null,
      permissions: undefined,
      loaderError: getErrorMessage(error, t`Failed to load feed`),
      notFound: false,
    }
  }

  if (!response.data.feed || !response.data.feed.id) {
    return { feed: null, permissions: undefined, loaderError: null, notFound: true }
  }

  return {
    permissions: response.data.permissions,
    feed: response.data.feed as Feed,
    loaderError: null,
    notFound: false,
  }
}

export const Route = createFileRoute('/_authenticated/$feedId')({
  loader: ({ params }) => loadFeed(params.feedId),
  component: FeedPage,
})

function FeedPage() {
  const { t } = useLingui()
  const data = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()

  if (data.notFound) {
    return (
      <>
        <PageHeader title={t`Feed`} back={{ label: t`Back to feeds`, onFallback: () => navigate({ to: '/' }) }} />
        <Main className="space-y-4">
          <EmptyState
            icon={FileQuestion}
            title={t`Feed not found`}
            description={t`This feed may have been deleted, or you may not have access to it.`}
          >
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="size-4 rtl:rotate-180" />
                <Trans>Back to feeds</Trans>
              </Button>
            </Link>
          </EmptyState>
        </Main>
      </>
    )
  }

  if (!data.feed) {
    return (
      <>
        <PageHeader title={t`Feed`} back={{ label: t`Back to feeds`, onFallback: () => navigate({ to: '/' }) }} />
        <Main>
          <GeneralError
            error={new Error(data.loaderError ?? t`Failed to load feed`)}
            minimal
            mode='inline'
            reset={() => void router.invalidate()}
          />
        </Main>
      </>
    )
  }

  return <EntityFeedPage feed={data.feed} permissions={data.permissions} />
}
