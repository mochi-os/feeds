import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CreateEntityDialog,
  type CreateEntityValues,
  toast,
  getErrorMessage,
} from '@mochi/common'
import { Rss } from 'lucide-react'
import feedsApi from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'

type CreateFeedDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
}

export function CreateFeedDialog({
  open,
  onOpenChange,
  hideTrigger,
}: CreateFeedDialogProps) {
  const [isPending, setIsPending] = useState(false)
  const navigate = useNavigate()
  const refreshFeeds = useFeedsStore((state) => state.refresh)

  const handleSubmit = async (values: CreateEntityValues) => {
    setIsPending(true)
    try {
      const response = await feedsApi.create({
        name: values.name,
        privacy: values.privacy ?? 'public',
      })

      const fingerprint = response.data?.fingerprint
      void refreshFeeds()

      if (fingerprint) {
        toast.success('Feed created')
        void navigate({ to: '/$feedId', params: { feedId: fingerprint } })
      } else {
        toast.success('Feed created')
        void navigate({ to: '/' })
      }
    } catch (error) {
      console.error('[CreateFeedDialog] Failed to create feed', error)
      toast.error(getErrorMessage(error, 'Failed to create feed'))
      throw error
    } finally {
      setIsPending(false)
    }
  }

  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Rss}
      title="Create feed"
      entityLabel="Feed"
      showPrivacyToggle
      privacyLabel="Allow anyone to search for feed"
      onSubmit={handleSubmit}
      isPending={isPending}
      hideTrigger={hideTrigger}
    />
  )
}
