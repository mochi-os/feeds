// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// A comment reaction shows on the click and goes back if the server refuses
// it, in the feed list and on the post page alike. Only the comment's own
// reaction fields go back, so anything else that changed on the post while the
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

type Shown = Pick<FeedComment, 'reactions' | 'userReaction'>

const chain = undoChain<Shown>()

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
  return {
    apply: (post) =>
      patchComment(post, commentId, (comment) => {
        step.remember({
          reactions: comment.reactions,
          userReaction: comment.userReaction,
        })
        return {
          ...comment,
          ...applyReaction(comment.reactions, comment.userReaction, reaction),
        }
      }),
    accepted: step.accepted,
    refused: () => {
      const before = step.refused()
      if (!before) return null
      const shown = before.value
      return (post) =>
        patchComment(post, commentId, (comment) => ({ ...comment, ...shown }))
    },
  }
}
