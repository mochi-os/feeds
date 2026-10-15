// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
//
// A post's poll (phase 17): its options with their share of the votes, the
// reader's own choice, and a vote while it is open.
import { useState } from 'react'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  cn,
  getErrorMessage,
  toast,
  useFormat,
  type PostPoll as PostPollData,
} from '@mochi/web'
import { Check, Loader2 } from 'lucide-react'
import { feedsApi } from '@/api/feeds'

export function PostPoll({
  feedId,
  postId,
  poll,
  voted,
  canVote,
  onVoted,
}: {
  feedId: string
  postId: string
  poll: PostPollData
  voted?: number[]
  canVote: boolean
  onVoted?: (poll: PostPollData, voted: number[]) => void
}) {
  const { t } = useLingui()
  const { formatTimestamp, formatNumber } = useFormat()
  const [chosen, setChosen] = useState<number[]>(voted ?? [])
  const [busy, setBusy] = useState(false)
  const now = Math.floor(Date.now() / 1000)
  const closed = poll.expires > 0 && poll.expires <= now
  const hasVoted = (voted ?? []).length > 0
  const showResults = closed || hasVoted || !canVote
  const total = poll.options.reduce((sum, o) => sum + o.votes, 0)

  const toggle = (index: number) => {
    if (poll.multiple) {
      setChosen((current) =>
        current.includes(index)
          ? current.filter((i) => i !== index)
          : [...current, index]
      )
    } else {
      setChosen([index])
    }
  }

  const vote = async () => {
    if (chosen.length === 0) return
    setBusy(true)
    try {
      const answer = await feedsApi.votePoll(feedId, postId, chosen)
      onVoted?.(
        (answer as { poll?: PostPollData }).poll ?? poll,
        answer.voted ?? chosen
      )
    } catch (error) {
      toast.error(getErrorMessage(error, t`Could not vote`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className='my-2 space-y-2 rounded-[8px] border p-3'
      onClick={(event) => event.stopPropagation()}
    >
      {poll.options.map((option, index) => {
        const share = total > 0 ? option.votes / total : 0
        const mine = (voted ?? []).includes(index)
        if (showResults) {
          return (
            <div key={index} className='space-y-1'>
              <div className='flex items-center justify-between gap-2 text-sm'>
                <span className='flex items-center gap-1.5'>
                  {mine && <Check className='text-primary size-4' />}
                  {option.name}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {formatNumber(Math.round(share * 100))}%
                </span>
              </div>
              <div className='bg-muted h-2 overflow-hidden rounded-full'>
                <div
                  className={cn(
                    'h-full rounded-full',
                    mine ? 'bg-primary' : 'bg-primary/40'
                  )}
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </div>
            </div>
          )
        }
        return (
          <label
            key={index}
            className='flex cursor-pointer items-center gap-2 text-sm'
          >
            <input
              type={poll.multiple ? 'checkbox' : 'radio'}
              name={`poll-${postId}`}
              checked={chosen.includes(index)}
              onChange={() => toggle(index)}
              className='accent-primary'
            />
            {option.name}
          </label>
        )
      })}
      <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs'>
        <span>
          <Plural value={poll.voters} _1='# vote' one='# vote' other='# votes' />
          {poll.expires > 0 && (
            <>
              {' · '}
              {closed ? (
                <Trans>Closed</Trans>
              ) : (
                <Trans>Closes {formatTimestamp(poll.expires)}</Trans>
              )}
            </>
          )}
        </span>
        {!showResults && (
          <Button
            size='sm'
            disabled={chosen.length === 0 || busy}
            onClick={() => void vote()}
          >
            {busy ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <Check className='size-4' />
            )}
            <Trans>Vote</Trans>
          </Button>
        )}
      </div>
    </div>
  )
}
