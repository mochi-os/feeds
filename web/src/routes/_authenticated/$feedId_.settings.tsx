import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  Header,
  Main,
  usePageTitle,
} from '@mochi/common'
import { useFeeds, useSubscription } from '@/hooks'
import feedsApi from '@/api/feeds'
import { mapFeedsToSummaries } from '@/api/adapters'
import type { Feed, FeedSummary } from '@/types'
import { useFeedsStore } from '@/stores/feeds-store'
import { Loader2, Rss, Settings, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/$feedId_/settings')({
  component: FeedSettingsPage,
})

function FeedSettingsPage() {
  const { feedId } = Route.useParams()
  const navigate = useNavigate()
  const getCachedFeed = useFeedsStore((state) => state.getCachedFeed)
  const refreshSidebar = useFeedsStore((state) => state.refresh)
  const cachedFeed = getCachedFeed(feedId)

  const [remoteFeed, setRemoteFeed] = useState<FeedSummary | null>(cachedFeed ?? null)
  const [isLoadingRemote, setIsLoadingRemote] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const fetchedRemoteRef = useRef<string | null>(null)

  const {
    feeds,
    setFeeds,
    isLoadingFeeds,
    refreshFeedsFromApi,
    mountedRef,
  } = useFeeds({})

  const { toggleSubscription } = useSubscription({
    feeds,
    setFeeds,
    setErrorMessage: () => {},
    refreshFeedsFromApi,
    mountedRef,
  })

  const localFeed = useMemo(
    () => feeds.find((feed) => feed.id === feedId || feed.fingerprint === feedId) ?? null,
    [feeds, feedId]
  )

  const selectedFeed = localFeed ?? remoteFeed

  // Update page title when feed is loaded
  usePageTitle(selectedFeed?.name)

  // Fetch feed from remote if not found locally
  useEffect(() => {
    if (localFeed || isLoadingFeeds || fetchedRemoteRef.current === feedId) {
      return
    }

    fetchedRemoteRef.current = feedId
    setIsLoadingRemote(true)

    feedsApi.get(feedId, { server: cachedFeed?.server })
      .then((response) => {
        if (!mountedRef.current) return
        const feed = response.data?.feed
        if (feed && 'id' in feed && feed.id) {
          const mapped = mapFeedsToSummaries([feed as Feed], new Set())
          if (mapped[0]) {
            setRemoteFeed({ ...mapped[0], server: cachedFeed?.server })
          }
        }
      })
      .catch((error) => {
        if (error?.response?.status === 400 && cachedFeed) {
          setRemoteFeed(cachedFeed)
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsLoadingRemote(false)
        }
      })
  }, [feedId, localFeed, cachedFeed, isLoadingFeeds, mountedRef])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  const handleUnsubscribe = useCallback(async () => {
    if (!selectedFeed || isSubscribing) return

    setIsSubscribing(true)
    try {
      await toggleSubscription(selectedFeed.id)
      void refreshSidebar()
      toast.success('Unsubscribed')
      void navigate({ to: '/' })
    } catch (error) {
      console.error('[FeedSettingsPage] Failed to unsubscribe', error)
      toast.error('Failed to unsubscribe')
    } finally {
      setIsSubscribing(false)
    }
  }, [selectedFeed, isSubscribing, toggleSubscription, refreshSidebar, navigate])

  const handleDelete = useCallback(async () => {
    if (!selectedFeed || !selectedFeed.isOwner || isDeleting) return

    setIsDeleting(true)
    try {
      await feedsApi.delete(selectedFeed.id)
      void refreshSidebar()
      toast.success('Feed deleted')
      void navigate({ to: '/' })
    } catch (error) {
      console.error('[FeedSettingsPage] Failed to delete feed', error)
      toast.error('Failed to delete feed')
    } finally {
      setIsDeleting(false)
    }
  }, [selectedFeed, isDeleting, refreshSidebar, navigate])

  const canUnsubscribe = selectedFeed?.isSubscribed && !selectedFeed?.isOwner

  if ((isLoadingFeeds || isLoadingRemote) && !selectedFeed) {
    return (
      <>
        <Header>
          <div className="flex items-center gap-2">
            <Settings className="size-5" />
            <h1 className="text-lg font-semibold">Loading...</h1>
          </div>
        </Header>
        <Main>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </Main>
      </>
    )
  }

  if (!selectedFeed) {
    return (
      <>
        <Header>
          <div className="flex items-center gap-2">
            <Settings className="size-5" />
            <h1 className="text-lg font-semibold">Feed not found</h1>
          </div>
        </Header>
        <Main>
          <Card>
            <CardContent className="py-12 text-center">
              <Rss className="mx-auto mb-4 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Feed not found</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This feed may have been deleted or you don't have access to it.
              </p>
            </CardContent>
          </Card>
        </Main>
      </>
    )
  }

  return (
    <>
      <Header>
        <div className="flex items-center gap-2">
          <Settings className="size-5" />
          <h1 className="text-lg font-semibold">{selectedFeed.name}</h1>
        </div>
      </Header>
      <Main className="space-y-6">
        <Card className="py-0">
          <CardContent className="p-6">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
              <span className="text-muted-foreground">Name:</span>
              <span>{selectedFeed.name}</span>

              <span className="text-muted-foreground">Entity:</span>
              <span className="font-mono break-all">{selectedFeed.id}</span>

              {selectedFeed.fingerprint && (
                <>
                  <span className="text-muted-foreground">Fingerprint:</span>
                  <span className="font-mono break-all">{selectedFeed.fingerprint.match(/.{1,3}/g)?.join('-')}</span>
                </>
              )}

              {selectedFeed.server && (
                <>
                  <span className="text-muted-foreground">Server:</span>
                  <span className="font-mono break-all">{selectedFeed.server}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {(canUnsubscribe || selectedFeed.isOwner) && (
          <Card className="py-0">
            <CardContent className="p-6 space-y-4">
              {canUnsubscribe && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Unsubscribe from feed</p>
                    <p className="text-sm text-muted-foreground">
                      Remove this feed from your sidebar. You can resubscribe later.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleUnsubscribe}
                    disabled={isSubscribing}
                  >
                    {isSubscribing ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Unsubscribing...
                      </>
                    ) : (
                      'Unsubscribe'
                    )}
                  </Button>
                </div>
              )}

              {selectedFeed.isOwner && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Delete feed</p>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete this feed and all its posts. This cannot be undone.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="size-4" />
                    Delete feed
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete feed?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{selectedFeed.name}" and all its posts, comments, and reactions. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Main>
    </>
  )
}
