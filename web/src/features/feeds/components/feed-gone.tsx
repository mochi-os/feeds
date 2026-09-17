// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Link, useNavigate } from '@tanstack/react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button, EmptyState, Main, PageHeader } from '@mochi/web'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import type { FeedGoneReason } from '@/hooks/useFeedWebsocket'

// Rendered in place of a feed whose owner removed this user from it, or
// deleted it, while the page was open: the local copy is already gone, so the
// page says why rather than failing on its next fetch.
export function FeedGone({ reason }: { reason: FeedGoneReason }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  return (
    <>
      <PageHeader
        title={t`Feed`}
        back={{
          label: t`Back to feeds`,
          onFallback: () => navigate({ to: '/' }),
        }}
      />
      <Main className='space-y-4'>
        <EmptyState
          icon={FileQuestion}
          title={
            reason === 'removed'
              ? t`You were removed from this feed`
              : t`This feed was deleted`
          }
        >
          <Link to='/'>
            <Button variant='outline'>
              <ArrowLeft className='size-4 rtl:rotate-180' />
              <Trans>Back to feeds</Trans>
            </Button>
          </Link>
        </EmptyState>
      </Main>
    </>
  )
}
