import { TagInput as CommonTagInput } from '@mochi/common'
import { feedsApi } from '@/api/feeds'

interface TagInputProps {
  feedId: string
  postId: string
  existingLabels: string[]
  onAdded: (tag: { id: string; label: string }) => void
}

export function TagInput({
  feedId,
  postId,
  existingLabels,
  onAdded,
}: TagInputProps) {
  return (
    <CommonTagInput
      existingLabels={existingLabels}
      onAdded={onAdded}
      loadSuggestions={() => feedsApi.getFeedTags(feedId)}
      submitTag={(label) => feedsApi.addPostTag(feedId, postId, label)}
      submitErrorMessage='Failed to add tag'
    />
  )
}
