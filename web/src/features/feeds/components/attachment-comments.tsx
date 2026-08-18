// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { CommentBox } from '@mochi/web'
import { PostCommentsList, type PostCommentsListProps } from './feed-posts'

/**
 * The comment thread for one image, shown in the lightbox's comments panel.
 *
 * Comments are one thread per post; a comment may be ANCHORED to one of the
 * post's attachments. This panel renders the post's REAL thread - the same
 * PostCommentsList the post page draws, with replies, reactions, editing and
 * deletion intact - filtered to the comments anchored to the image being
 * viewed, offers the rest of the thread behind a toggle, and writes new
 * comments in the same CommentBox as the thread - attachments and all -
 * anchored to this image without the writer having to say so.
 */
export function AttachmentComments({
  attachmentId,
  thread,
  canComment,
  onAddComment,
}: {
  attachmentId: string
  /** The post's thread props, exactly as the inline thread receives them. */
  thread: PostCommentsListProps
  canComment: boolean
  onAddComment?: (body: string, files: File[] | undefined, attachment: string) => void | Promise<void>
}) {
  const { t } = useLingui()
  const [showAll, setShowAll] = useState(false)
  const [draft, setDraft] = useState('')

  const anchoredCount = useMemo(
    () => thread.post.comments.filter((comment) => comment.attachment === attachmentId).length,
    [thread.post.comments, attachmentId]
  )
  const others = thread.post.comments.length - anchoredCount

  return (
    <div className='flex h-full flex-col'>
      <div className='min-h-0 flex-1 overflow-y-auto p-4'>
        <PostCommentsList
          {...thread}
          // The panel shows the whole scoped set; the inline "view N more"
          // collapse is for the post card, not a focused view.
          isExpanded
          filter={showAll ? undefined : (comment) => comment.attachment === attachmentId}
          emptyState={
            <p className='text-muted-foreground text-sm'>
              <Trans>No comments on this image yet.</Trans>
            </p>
          }
        />
        {others > 0 && (
          <button
            type='button'
            className='text-muted-foreground hover:text-foreground mt-3 text-xs font-medium transition-colors'
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? (
              <Trans>Show only comments on this image</Trans>
            ) : (
              plural(others, {
                one: 'Show # other comment on this post',
                other: 'Show # other comments on this post',
              })
            )}
          </button>
        )}
      </div>
      {canComment && onAddComment && (
        <CommentBox
          className='border-t p-3'
          value={draft}
          onValueChange={setDraft}
          // Rejects on failure so the box keeps the draft and files for Retry.
          onSubmit={async (body, files) => {
            await onAddComment(body, files, attachmentId)
            setDraft('')
          }}
          onSearchPeople={thread.onSearchPeople}
          progress={thread.progress}
          placeholder={t`Comment on this image…`}
        />
      )}
    </div>
  )
}
