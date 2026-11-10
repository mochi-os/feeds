// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { FeedComment, ReactionId } from '@/types'
import { describe, expect, it } from 'vitest'
import { startCommentReaction } from './comment-reaction'
import { createReactionCounts } from './constants'

function post(likes = 1, userReaction: ReactionId | null = null, body = 'Hi') {
  const reply: FeedComment = {
    id: 'c2',
    subscriberId: 's',
    author: 'A',
    created: 0,
    body,
    reactions: createReactionCounts({ like: likes }),
    userReaction,
  }
  const top: FeedComment = { ...reply, id: 'c1', replies: [reply] }
  return { id: 'p1', comments: [top] }
}

const reply = (p: ReturnType<typeof post>) => p.comments[0].replies![0]

describe('startCommentReaction', () => {
  it('shows the reaction on a reply and puts it back when refused', () => {
    const change = startCommentReaction('c2', 'like')
    const shown = change.apply(post())
    expect(reply(shown)).toMatchObject({ userReaction: 'like' })
    expect(reply(shown).reactions.like).toBe(2)

    const undo = change.refused()!
    const back = undo(shown)
    expect(reply(back).userReaction).toBeNull()
    expect(reply(back).reactions.like).toBe(1)
  })

  it('puts back only the reaction, keeping other changes to the comment', () => {
    const change = startCommentReaction('c2', 'like')
    change.apply(post())
    const edited = post(2, 'like', 'Edited')
    const back = change.refused()!(edited)
    expect(reply(back)).toMatchObject({ body: 'Edited', userReaction: null })
    expect(reply(back).reactions.like).toBe(1)
  })

  it('leaves a post without the comment as it is', () => {
    const change = startCommentReaction('c9', 'like')
    const p = post()
    expect(change.apply(p)).toBe(p)
    change.refused()
  })

  it('keeps a later click still waiting when the first is refused', () => {
    const first = startCommentReaction('c2', 'like')
    const second = startCommentReaction('c2', '')
    const shown = second.apply(first.apply(post()))
    expect(reply(shown).userReaction).toBeNull()

    expect(first.refused()).toBeNull()

    // The later click now puts back what showed before both.
    const back = second.refused()!(shown)
    expect(reply(back).userReaction).toBeNull()
    expect(reply(back).reactions.like).toBe(1)
  })

  it("keeps another reader's reaction that came in meanwhile", () => {
    const change = startCommentReaction('c2', 'like')
    change.apply(post())
    // The websocket brought in another reader's like while the click was out.
    const back = change.refused()!(post(3, 'like'))
    expect(reply(back).userReaction).toBeNull()
    expect(reply(back).reactions.like).toBe(2)
  })

  it("leaves a copy the server's data has replaced since", () => {
    const change = startCommentReaction('c2', 'like')
    change.apply(post())
    // A reload: the server never took the like, and another reader liked.
    const back = change.refused()!(post(2))
    expect(reply(back).userReaction).toBeNull()
    expect(reply(back).reactions.like).toBe(2)
  })

  it('leaves another reaction the reader set elsewhere meanwhile', () => {
    const change = startCommentReaction('c2', 'like')
    change.apply(post())
    // A reload shows the reader's love, set from another device.
    const back = change.refused()!(post(1, 'love'))
    expect(reply(back).userReaction).toBe('love')
  })

  it('puts back each copy on its own counts', () => {
    const change = startCommentReaction('c2', 'like')
    // The list state and a list fetched at another time hold other counts.
    const first = change.apply(post(1))
    const second = change.apply(post(4))
    const undo = change.refused()!
    expect(reply(undo(first)).reactions.like).toBe(1)
    expect(reply(undo(second)).reactions.like).toBe(4)
    expect(reply(undo(second)).userReaction).toBeNull()
  })

  it('undoes nothing for an earlier click once a later one is taken', () => {
    const first = startCommentReaction('c2', 'like')
    const second = startCommentReaction('c2', '')
    second.apply(first.apply(post()))

    second.accepted()
    expect(first.refused()).toBeNull()
  })

  it('puts back the earlier click when the later one is refused last', () => {
    const first = startCommentReaction('c2', 'like')
    const second = startCommentReaction('c2', '')
    const shown = second.apply(first.apply(post()))

    first.accepted()
    const back = second.refused()!(shown)
    expect(reply(back).userReaction).toBe('like')
    expect(reply(back).reactions.like).toBe(2)
  })
})
