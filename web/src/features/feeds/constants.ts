import { type ReactionCounts, type ReactionId } from './types'

export const reactionOptions: { id: ReactionId; label: string; emoji: string }[] = [
  { id: 'like', label: 'Like', emoji: '👍' },
  { id: 'dislike', label: 'Dislike', emoji: '👎' },
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'amazed', label: 'Amazed', emoji: '😮' },
  { id: 'love', label: 'Love', emoji: '😍' },
  { id: 'sad', label: 'Sad', emoji: '😢' },
  { id: 'angry', label: 'Angry', emoji: '😡' },
  { id: 'agree', label: 'Agree', emoji: '🤝' },
  { id: 'disagree', label: 'Disagree', emoji: '🙅' },
]

export const createReactionCounts = (
  preset: Partial<ReactionCounts> = {}
): ReactionCounts => {
  return reactionOptions.reduce((acc, option) => {
    acc[option.id] = preset[option.id] ?? 0
    return acc
  }, {} as ReactionCounts)
}
