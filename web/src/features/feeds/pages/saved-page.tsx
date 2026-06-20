// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Bookmark } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Main,
  PageHeader,
  usePageTitle,
} from '@mochi/web'
import type { FeedPost, SavedItem, SavedPostSnapshot } from '@/types'
import { createReactionCounts } from '@/features/feeds/constants'
import { FeedPosts } from '../components/feed-posts'
import {
  clearSaved,
  getSaved,
  loadSaved,
  onSavedChange,
} from '@/lib/saved'

// Rebuild a FeedPost from the stored snapshot so the saved list can reuse the
// real FeedPosts card (identical layout: body, location maps, attachment grid,
// tags, reaction counts). Fields not captured in the slim snapshot get
// harmless defaults; FeedPosts is rendered read-only so interactive controls
// (reactions/comments/edit) never appear.
function snapshotToPost(s: SavedPostSnapshot): FeedPost {
  return {
    id: s.id,
    feedId: s.feedId,
    feedFingerprint: s.feedFingerprint,
    feedName: s.feedName,
    author: s.author,
    role: '',
    created: s.created,
    body: s.body,
    bodyHtml: s.bodyHtml,
    data: s.data,
    tags: s.tags,
    attachments: s.attachments,
    reactions: s.reactions ?? createReactionCounts(),
    comments: [],
  }
}

export function SavedPage() {
  const { t } = useLingui()
  usePageTitle(t`Saved`)
  const [saved, setSaved] = useState<SavedItem[]>(getSaved())
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    const unsubscribe = onSavedChange(() => setSaved(getSaved()))
    void loadSaved()
    return unsubscribe
  }, [])

  const posts = useMemo(() => saved.map((item) => snapshotToPost(item.post)), [saved])

  const noop = () => {}

  return (
    <>
      <PageHeader
        icon={<Bookmark className='size-4 md:size-5' />}
        title={t`Saved`}
        actions={
          saved.length > 0 ? (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setShowClearConfirm(true)}
            >
              <Trans>Clear all</Trans>
            </Button>
          ) : undefined
        }
      />
      <Main fixed>
        <div className='flex-1 overflow-y-auto px-2 md:px-0'>
          {saved.length === 0 ? (
            <div className='py-24'>
              <EmptyState
                icon={Bookmark}
                title={t`Nothing saved yet`}
                description={t`Tap the bookmark on any post to save it here for later.`}
              />
            </div>
          ) : (
            <div className='pb-20'>
              <FeedPosts
                posts={posts}
                readOnly
                showFeedName
                isLoggedIn
                commentDrafts={{}}
                onDraftChange={noop}
                onAddComment={noop}
                onReplyToComment={noop}
                onPostReaction={noop}
                onCommentReaction={noop}
              />
            </div>
          )}
        </div>
      </Main>

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title={<Trans>Clear all saved posts?</Trans>}
        desc={
          <Trans>
            This removes every post from your saved list. This cannot be undone.
          </Trans>
        }
        destructive
        confirmText={<Trans>Clear all</Trans>}
        handleConfirm={() => {
          clearSaved()
          setShowClearConfirm(false)
        }}
      />
    </>
  )
}
