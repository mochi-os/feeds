import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Header, Main, Card, CardContent, CardHeader, CardTitle, Button, Input, Label, Switch, usePageTitle, getErrorMessage, toast, SubscribeDialog, requestHelpers } from '@mochi/common'
import feedsApi from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'
import { Check, Plus, Rss } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/new')({
  component: CreateFeedPage,
})

type CreateFeedFormState = {
  name: string
  allowSearch: boolean
}

function CreateFeedPage() {
  const navigate = useNavigate()
  const refreshFeeds = useFeedsStore((state) => state.refresh)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [createdFeedFingerprint, setCreatedFeedFingerprint] = useState<string | null>(null)
  const [form, setForm] = useState<CreateFeedFormState>({
    name: '',
    allowSearch: true,
  })

  // Check if user already has a subscription for feed notifications
  const { data: subscriptionData, refetch: refetchSubscription } = useQuery({
    queryKey: ['subscription-check', 'feeds'],
    queryFn: async () => {
      return await requestHelpers.get<{ exists: boolean }>(
        '/notifications/-/subscriptions/check?app=feeds'
      )
    },
    staleTime: Infinity,
  })

  // Set page title
  usePageTitle('New feed')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const response = await feedsApi.create({
        name: form.name.trim(),
        privacy: form.allowSearch ? 'public' : 'private',
      })

      const fingerprint = response.data?.fingerprint
      // Refresh sidebar feeds list
      void refreshFeeds()
      toast.success('Feed created')

      // Prompt for notifications if user hasn't subscribed yet
      if (!subscriptionData?.exists) {
        setCreatedFeedFingerprint(fingerprint ?? null)
        setSubscribeOpen(true)
      } else if (fingerprint) {
        void navigate({ to: '/$feedId', params: { feedId: fingerprint } })
      } else {
        void navigate({ to: '/' })
      }
    } catch (error) {
      console.error('[CreateFeed] Failed to create feed', error)
      toast.error(getErrorMessage(error, 'Failed to create feed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Plus className="size-5" />
          <h1 className="text-lg font-semibold">New feed</h1>
        </div>
      </Header>
      <Main>
        <div className="mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rss className="size-5" />
                New feed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="feed-name">Name</Label>
                  <Input
                    id="feed-name"
                    placeholder="Name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex items-center justify-between rounded-[8px] border px-4 py-3">
                  <Label htmlFor="feed-allow-search" className="text-sm font-medium">
                    Allow anyone to search for feed
                  </Label>
                  <Switch
                    id="feed-allow-search"
                    checked={form.allowSearch}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, allowSearch: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate({ to: '/' })}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!form.name.trim() || isSubmitting}>
                    <Check className="size-4" />
                    {isSubmitting ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </Main>

      <SubscribeDialog
        open={subscribeOpen}
        onOpenChange={(open) => {
          setSubscribeOpen(open)
          if (!open) {
            // Navigate to feed after dialog closes
            if (createdFeedFingerprint) {
              void navigate({ to: '/$feedId', params: { feedId: createdFeedFingerprint } })
            } else {
              void navigate({ to: '/' })
            }
          }
        }}
        app="feeds"
        label="Feed comments and reactions"
        appBase="/feeds"
        onResult={() => refetchSubscription()}
      />
    </>
  )
}
