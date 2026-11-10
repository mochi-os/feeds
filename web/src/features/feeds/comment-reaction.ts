// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// A comment reaction shows on the click and goes back if the server refuses
// it, in the feed list and on the post page alike. Only the reader's own
// reaction goes back, so anything else that changed on the post while the
// request was out stays.
//
// Two quick clicks on one comment send two requests. A refusal must not wipe a
// later click that is still waiting, and must not undo one the server has
// already taken:
// - refused with a later click still waiting: nothing changes on screen, and
//   the later click takes over what to put back if it is refused too
// - refused as the last click waiting: the comment goes back
// - accepted: every earlier click on the comment has nothing left to undo
//
// The order of two quick clicks on one comment is kept by `undoChain`. The
// feed list keeps its posts in React state as well as the caches, so this
// works on a post wherever it is held.
import type { FeedComment, FeedPost, ReactionId } from '@/types'
import { undoChain } from '@mochi/web'
import { applyReaction, updateCommentTree } from './utils'

// The reader's own reaction on the comment, or null for none.
type Mine = ReactionId | null

const chain = undoChain<Mine>()

export interface CommentReaction {
  /** The post with the reaction applied. Use it on every copy of the post. */
  apply: <T extends Pick<FeedPost, 'comments'>>(post: T) => T
  /** The server took the reaction. */
  accepted: () => void
  /**
   * The server refused it. Returns the change that puts the comment back, for
   * every copy `apply` was used on, or null when nothing should change.
   */
  refused: () => (<T extends Pick<FeedPost, 'comments'>>(post: T) => T) | null
}

function patchComment<T extends Pick<FeedPost, 'comments'>>(
  post: T,
  commentId: string,
  update: (comment: FeedComment) => FeedComment
): T {
  if (!post.comments?.length) return post
  const comments = updateCommentTree(post.comments, commentId, update)
  return comments === post.comments ? post : { ...post, comments }
}

export function startCommentReaction(
  commentId: string,
  reaction: ReactionId | ''
): CommentReaction {
  const step = chain(commentId)
  // The reaction this click showed as the reader's own.
  let guess: Mine | undefined
  return {
    apply: (post) =>
      patchComment(post, commentId, (comment) => {
        step.remember(comment.userReaction ?? null)
        const next = {
          ...comment,
          ...applyReaction(comment.reactions, comment.userReaction, reaction),
        }
        guess ??= next.userReaction
        return next
      }),
    accepted: step.accepted,
    // The reader's reaction goes back to what it was, moved on the counts each
    // copy shows now rather than putting back old counts: another reader's
    // reaction that came in meanwhile, from the websocket or a reload, stays,
    // and a copy fetched at another time keeps its own counts. A copy that no
    // longer shows this click's reaction as the reader's own was replaced by
    // the server's data since, and is left as it is.
    refused: () => {
      const before = step.refused()
      if (!before) return null
      const mine = before.value
      return (post) =>
        patchComment(post, commentId, (comment) => {
          const current = comment.userReaction ?? null
          if (current !== guess || current === mine) return comment
          return {
            ...comment,
            ...applyReaction(comment.reactions, current, mine ?? ''),
          }
        })
    },
  }
}
