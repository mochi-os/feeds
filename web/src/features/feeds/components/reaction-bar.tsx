import { Button } from '@/components/ui/button'
import { reactionOptions } from '../constants'
import type { ReactionCounts, ReactionId } from '../types'

type ReactionBarProps = {
  counts: ReactionCounts
  activeReaction?: ReactionId | null
  onSelect: (reaction: ReactionId) => void
}

export function ReactionBar({ counts, activeReaction, onSelect }: ReactionBarProps) {
  return (
    <div className='flex flex-wrap gap-2'>
      {reactionOptions.map((reaction) => {
        const count = counts[reaction.id] ?? 0
        const isActive = activeReaction === reaction.id
        return (
          <Button
            key={reaction.id}
            type='button'
            size='sm'
            variant={isActive ? 'default' : 'outline'}
            className='h-8 gap-1 px-2 text-xs transition-all duration-300 hover:scale-110'
            aria-label={`${reaction.label} (${count})`}
            onClick={() => onSelect(reaction.id)}
          >
            <span aria-hidden='true' role='img' className='text-base'>
              {reaction.emoji}
            </span>
            <span className='font-medium'>{count}</span>
          </Button>
        )
      })}
    </div>
  )
}
