// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { FeedComment } from '@/types'
import { describe, expect, it } from 'vitest'
import { startCommentReaction } from './comment-reaction'
import { createReactionCounts } from './constants'

function post(likes = 1, userReaction: 'like' | null = null, body = 'Hi') {
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
    const back = second.refused()!(post(5, 'like'))
    expect(reply(back).userReaction).toBeNull()
    expect(reply(back).reactions.like).toBe(1)
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
