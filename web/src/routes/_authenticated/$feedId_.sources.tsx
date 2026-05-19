import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
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
  PageHeader,
  Main,
  usePageTitle,
  getErrorMessage,
  Input,
  EmptyState,
  GeneralError,
  Skeleton,
  Section,
  toast,
  isPermissionError,
  isInShell,
  shellRequestPermission,
  getCurrentAppId,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Slider,
  Textarea,
  useFormat,
  naturalCompare,
} from '@mochi/web'
import { useQuery } from '@tanstack/react-query'
import { useFeeds } from '@/hooks'
import { feedsApi } from '@/api/feeds'
import { mapFeedsToSummaries } from '@/api/adapters'
import type { Feed, FeedSummary, Source } from '@/types'
import { useFeedsStore } from '@/stores/feeds-store'
import { useSidebarContext } from '@/context/sidebar-context'
import {
  Calendar,
  Loader2,
  Link2,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  Pencil,
} from 'lucide-react'

function toError(error: unknown, fallback: string): Error {
  return new Error(getErrorMessage(error, fallback))
}

type SourcesSearch = {
  addUrl?: string
  addType?: 'rss' | 'feed/posts'
}

export const Route = createFileRoute('/_authenticated/$feedId_/sources')({
  validateSearch: (search: Record<string, unknown>): SourcesSearch => ({
    addUrl: typeof search.addUrl === 'string' ? search.addUrl : undefined,
    addType: search.addType === 'rss' || search.addType === 'feed/posts' ? search.addType : undefined,
  }),
  component: FeedSourcesPage,
})

function FeedSourcesPage() {
  const { t } = useLingui()
  const { feedId } = Route.useParams()
  const navigate = useNavigate()
  const { addUrl, addType } = Route.useSearch()
  const getCachedFeed = useFeedsStore((state) => state.getCachedFeed)
  const cachedFeed = getCachedFeed(feedId)

  const goBackToFeed = () => navigate({ to: '/$feedId', params: { feedId } })
  const [remoteFeed, setRemoteFeed] = useState<FeedSummary | null>(cachedFeed ?? null)
  const [isLoadingRemote, setIsLoadingRemote] = useState(false)
  const [remoteFeedError, setRemoteFeedError] = useState<Error | null>(null)
  const [remoteFeedNotFound, setRemoteFeedNotFound] = useState(false)
  const fetchedRemoteRef = useRef<string | null>(null)
  const [remoteRetryCount, setRemoteRetryCount] = useState(0)

  const { feeds, isLoadingFeeds, refreshFeedsFromApi, mountedRef } = useFeeds({})

  const localFeed = useMemo(
    () => feeds.find((feed) => feed.id === feedId || feed.fingerprint === feedId) ?? null,
    [feeds, feedId]
  )

  const selectedFeed = localFeed ?? remoteFeed

  usePageTitle(selectedFeed?.name ? t`${selectedFeed.name} sources` : t`Sources`)

  const { setFeedId } = useSidebarContext()
  useEffect(() => {
    setFeedId(feedId)
    return () => setFeedId(null)
  }, [feedId, setFeedId])

  useEffect(() => {
    if (localFeed) {
      setRemoteFeedError(null)
      setRemoteFeedNotFound(false)
      return
    }
    if (isLoadingFeeds || fetchedRemoteRef.current === feedId) {
      return
    }

    fetchedRemoteRef.current = feedId
    setIsLoadingRemote(true)
    setRemoteFeedError(null)
    setRemoteFeedNotFound(false)

    feedsApi.get(feedId, { server: cachedFeed?.server })
      .then((response) => {
        if (!mountedRef.current) return
        const feed = response.data?.feed
        if (feed && 'id' in feed && feed.id) {
          const mapped = mapFeedsToSummaries([feed as Feed], new Set())
          if (mapped[0]) {
            setRemoteFeed({ ...mapped[0], server: cachedFeed?.server })
            return
          }
        }
        setRemoteFeed(null)
        setRemoteFeedNotFound(true)
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) return
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status === 400 && cachedFeed) {
          setRemoteFeed(cachedFeed)
          return
        }
        if (status === 403 || status === 404) {
          setRemoteFeed(null)
          setRemoteFeedNotFound(true)
          return
        }
        setRemoteFeedError(toError(error, t`Failed to load feed sources`))
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsLoadingRemote(false)
        }
      })
  }, [feedId, localFeed, cachedFeed, isLoadingFeeds, mountedRef, remoteRetryCount, t])

  const retryRemoteFeedLookup = useCallback(() => {
    fetchedRemoteRef.current = null
    setRemoteFeed(cachedFeed ?? null)
    setRemoteFeedError(null)
    setRemoteFeedNotFound(false)
    setRemoteRetryCount((c) => c + 1)
  }, [cachedFeed])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  if ((isLoadingFeeds || isLoadingRemote) && !selectedFeed) {
    return (
      <>
        <PageHeader
          title={t`Sources`}
          icon={<Link2 className="size-4 md:size-5" />}
          back={{ label: t`Back to feed`, onFallback: goBackToFeed }}
        />
        <Main>
          <Skeleton className="h-64 w-full rounded-xl" />
        </Main>
      </>
    )
  }

  if (!selectedFeed) {
    return (
      <>
        <PageHeader
          title={t`Sources`}
          icon={<Link2 className="size-4 md:size-5" />}
          back={{ label: t`Back to feed`, onFallback: goBackToFeed }}
        />
        <Main>
          {remoteFeedError ? (
            <GeneralError
              error={remoteFeedError}
              minimal
              mode='inline'
              reset={retryRemoteFeedLookup}
            />
          ) : (
            <EmptyState
              icon={Rss}
              title={remoteFeedNotFound ? t`Feed not found` : t`Feed unavailable`}
              description={
                remoteFeedNotFound
                  ? t`This feed may have been deleted or you don't have access to it.`
                  : t`This feed could not be loaded right now.`
              }
            />
          )}
        </Main>
      </>
    )
  }

  if (!selectedFeed.isOwner) {
    return (
      <>
        <PageHeader
          title={t`Sources`}
          icon={<Link2 className="size-4 md:size-5" />}
          back={{ label: t`Back to feed`, onFallback: goBackToFeed }}
        />
        <Main>
          <EmptyState
            icon={Link2}
            title={t`Sources are managed by the feed owner`}
          />
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={selectedFeed.name ? t`${selectedFeed.name} sources` : t`Sources`}
        back={{ label: t`Back to feed`, onFallback: goBackToFeed }}
      />
      <Main>
        <SourcesPanel feedId={selectedFeed.id} addUrl={addUrl} addType={addType} />
      </Main>
    </>
  )
}

function credibilityHue(credibility: number): number {
  return (credibility / 100) * 120
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return plural(seconds, { one: '1 second', other: '# seconds' })
  if (seconds < 3600) { const m = Math.round(seconds / 60); return plural(m, { one: '1 minute', other: '# minutes' }) }
  if (seconds < 86400) { const h = Math.round(seconds / 3600); return plural(h, { one: '1 hour', other: '# hours' }) }
  const d = Math.round(seconds / 86400); return plural(d, { one: '1 day', other: '# days' })
}

interface SourcesPanelProps {
  feedId: string
  addUrl?: string
  addType?: 'rss' | 'feed/posts'
}

function SourcesPanel({ feedId, addUrl, addType }: SourcesPanelProps) {
  const { t } = useLingui()
  const { formatTimestamp } = useFormat()
  const navigateRoute = Route.useNavigate()
  const [showAddDialog, setShowAddDialog] = useState(!!addUrl)
  const [addSourceType, setAddSourceType] = useState<'rss' | 'feed/posts'>(addType ?? 'feed/posts')
  const [removeSource, setRemoveSource] = useState<Source | null>(null)
  const [editingSource, setEditingSource] = useState<Source | null>(null)
  const {
    data: sourcesData,
    isLoading,
    error: sourcesErrorRaw,
    refetch: refetchSources,
  } = useQuery({
    queryKey: ['feeds', 'sources', feedId],
    queryFn: () => feedsApi.getSources(feedId),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const sources = sourcesData?.data?.sources ?? []
  const sourcesError = sourcesErrorRaw
    ? toError(sourcesErrorRaw, t`Failed to load sources`)
    : null

  const hasMemoriesSource = sources.some((s) => s.type === 'feed/memories')

  const handleAddMemories = async () => {
    try {
      await feedsApi.addSource(feedId, 'feed/memories', '')
      toast.success(t`Memories source added`)
      await refetchSources()
    } catch (err) {
      toast.error(getErrorMessage(err, t`Failed to add memories source`))
    }
  }

  const handlePoll = async (sourceId?: string) => {
    try {
      const response = await feedsApi.pollSource(feedId, sourceId)
      const count = response.data?.fetched ?? 0
      toast.success(count > 0 ? t`Fetched ${count} new posts` : t`No new posts`)
      await refetchSources()
    } catch (err) {
      toast.error(getErrorMessage(err, t`Failed to poll source`))
    }
  }

  return (
    <Section title={t`Sources`} action={
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus className="h-4 w-4 me-2" />
            <Trans>Add source</Trans>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setAddSourceType('feed/posts'); setShowAddDialog(true) }}>
            <Link2 className="h-4 w-4 me-2" />
            <Trans>Mochi feed</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setAddSourceType('rss'); setShowAddDialog(true) }}>
            <Rss className="h-4 w-4 me-2" />
            <Trans>RSS feed</Trans>
          </DropdownMenuItem>
          {!hasMemoriesSource && (
            <DropdownMenuItem onSelect={() => void handleAddMemories()}>
              <Calendar className="h-4 w-4 me-2" />
              <Trans>Memories</Trans>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    }>
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : sourcesError ? (
          <GeneralError
            error={sourcesError}
            minimal
            mode='inline'
            reset={() => {
              void refetchSources()
            }}
          />
        ) : sources.length === 0 ? (
          <EmptyState
            icon={Rss}
            title={t`No sources`}
          />
        ) : (
          <div className="divide-y">
            {[...sources].sort((a, b) => naturalCompare((a.name || ''), b.name || '')).map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {source.type === 'rss' ? (
                      <Rss className="h-4 w-4 shrink-0 text-orange-500" />
                    ) : source.type === 'feed/memories' ? (
                      <Calendar className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Link2 className="h-4 w-4 shrink-0 text-primary" />
                    )}
                    <span className="truncate font-medium text-sm">{source.name}</span>
                    {source.type === 'rss' && (
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `hsl(${credibilityHue(source.credibility)}, 80%, 92%)`,
                          color: `hsl(${credibilityHue(source.credibility)}, 80%, 35%)`,
                        }}
                      >
                        {source.credibility}
                      </span>
                    )}
                    {source.transform && (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
                        <Trans>AI transform</Trans>
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-1 truncate text-xs ps-6">
                    {source.url && <>{source.url} · </>}
                    <span>{source.type === 'rss' ? <Trans>RSS</Trans> : source.type === 'feed/memories' ? <Trans>Memories</Trans> : <Trans>Mochi feed</Trans>}</span>
                    {source.fetched > 0 && (
                      <span> · <Trans>Last checked {formatTimestamp(source.fetched)}</Trans></span>
                    )}
                    {source.type === 'rss' && source.interval > 0 && (
                      <span> · <Trans>Polling every {formatInterval(source.interval)}</Trans></span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ms-2">
                  {(source.type === 'rss' || source.type === 'feed/memories') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => void handlePoll(source.id)}
                      aria-label={t`Refresh source`}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setEditingSource(source)}
                    aria-label={t`Edit source`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setRemoveSource(source)}
                    aria-label={t`Remove source`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AddSourceDialog
          open={showAddDialog}
          onOpenChange={(open) => {
            setShowAddDialog(open)
            if (!open && addUrl) {
              void navigateRoute({ search: {}, replace: true })
            }
          }}
          feedId={feedId}
          onAdded={() => {
            void refetchSources()
          }}
          initialUrl={addUrl}
          sourceType={addSourceType}
        />

        <RemoveSourceDialog
          source={removeSource}
          onOpenChange={(open) => { if (!open) setRemoveSource(null) }}
          feedId={feedId}
          onRemoved={() => {
            void refetchSources()
          }}
        />

        <EditSourceDialog
          source={editingSource}
          onOpenChange={(open) => { if (!open) setEditingSource(null) }}
          feedId={feedId}
          onSaved={() => {
            void refetchSources()
          }}
        />
      </div>
    </Section>
  )
}

interface AddSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feedId: string
  onAdded: () => void
  initialUrl?: string
  sourceType: 'rss' | 'feed/posts'
}

function AddSourceDialog({ open, onOpenChange, feedId, onAdded, initialUrl, sourceType }: AddSourceDialogProps) {
  const { t } = useLingui()
  const [url, setUrl] = useState(initialUrl ?? '')
  const [isAdding, setIsAdding] = useState(false)
  const [permissionDomain, setPermissionDomain] = useState<string | null>(null)

  const [credStep, setCredStep] = useState<{ sourceId: string; suggested: number; current: number } | null>(null)
  const [isSavingCred, setIsSavingCred] = useState(false)

  useEffect(() => {
    if (open) {
      if (!initialUrl) {
        setUrl('')
      }
      setCredStep(null)
      setPermissionDomain(null)
    }
  }, [open, initialUrl])

  const addSource = async (sourceUrl: string): Promise<boolean> => {
    try {
      const response = await feedsApi.addSource(feedId, sourceType, sourceUrl)
      const count = response.data?.ingested ?? 0
      const suggested = response.data?.suggested_credibility
      const msg = count > 0
        ? plural(count, { one: 'Source added (1 post imported)', other: 'Source added (# posts imported)' })
        : t`Source added`
      toast.success(msg)

      if (suggested !== undefined && suggested !== null && response.data?.source?.id) {
        setCredStep({ sourceId: response.data.source.id, suggested, current: suggested })
      } else {
        setUrl('')
        onOpenChange(false)
      }
      onAdded()
      return true
    } catch (err: unknown) {
      const permError = isPermissionError((err as { response?: { data?: unknown } })?.response?.data)
      if (permError && !permError.restricted && isInShell()) {
        const domain = permError.permission.startsWith('url:') ? permError.permission.slice(4) : ''
        setPermissionDomain(domain)

        const result = await shellRequestPermission(
          permError.app || getCurrentAppId(),
          permError.permission,
          false
        )
        setPermissionDomain(null)

        if (result === 'granted') {
          return addSource(sourceUrl)
        }
        return false
      }
      toast.error(getErrorMessage(err, t`Failed to add source`))
      return false
    }
  }

  const handleSubmit = async () => {
    if (!url.trim()) return

    let sourceUrl = url.trim()
    if (sourceType === 'rss' && !sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://')) {
      sourceUrl = 'https://' + sourceUrl
    }

    setIsAdding(true)
    await addSource(sourceUrl)
    setIsAdding(false)
  }

  const handleCredConfirm = async () => {
    if (!credStep) return
    if (credStep.current !== credStep.suggested) {
      setIsSavingCred(true)
      try {
        await feedsApi.editSource(feedId, credStep.sourceId, { credibility: credStep.current })
      } catch (err) {
        toast.error(getErrorMessage(err, t`Failed to update credibility`))
      } finally {
        setIsSavingCred(false)
      }
      onAdded()
    }
    setCredStep(null)
    setUrl('')
    onOpenChange(false)
  }

  const credValid = credStep ? credStep.current >= 0 && credStep.current <= 100 : false

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {credStep ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle><Trans>AI credibility suggestion</Trans></AlertDialogTitle>
              <AlertDialogDescription>
                <Trans>The AI suggested a credibility score for this source. You can adjust it or accept the suggestion.</Trans>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <label className="text-sm font-medium"><Trans>Credibility</Trans></label>
              <div className="flex items-center gap-3 mt-1">
                <Slider
                  min={0}
                  max={100}
                  value={credStep.current}
                  onChange={(e) => setCredStep({ ...credStep, current: parseInt(e.target.value, 10) || 0 })}
                  className="w-64 shrink-0"
                />
                {credValid && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `hsl(${credibilityHue(credStep.current)}, 80%, 92%)`,
                      color: `hsl(${credibilityHue(credStep.current)}, 80%, 35%)`,
                    }}
                  >
                    {credStep.current}
                  </span>
                )}
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => void handleCredConfirm()} disabled={isSavingCred || !credValid}>
                {isSavingCred ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
                <Trans>Confirm</Trans>
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{sourceType === 'rss' ? <Trans>Add RSS feed</Trans> : <Trans>Add Mochi feed</Trans>}</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={sourceType === 'rss' ? 'https://example.com/feed.xml' : t`Feed entity ID or fingerprint`}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
                  disabled={isAdding}
                  autoFocus
                />
              </div>
              {permissionDomain && (
                <p className="text-sm text-muted-foreground">
                  <Trans>Requesting access to {permissionDomain}...</Trans>
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isAdding}><Trans>Cancel</Trans></AlertDialogCancel>
              <Button onClick={() => void handleSubmit()} disabled={isAdding || !url.trim()}>
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Plus className="h-4 w-4 me-2" />}
                <Trans>Add</Trans>
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface RemoveSourceDialogProps {
  source: Source | null
  onOpenChange: (open: boolean) => void
  feedId: string
  onRemoved: () => void
}

function RemoveSourceDialog({ source, onOpenChange, feedId, onRemoved }: RemoveSourceDialogProps) {
  const { t } = useLingui()
  const [deletePosts, setDeletePosts] = useState(true)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleRemove = async () => {
    if (!source) return

    setIsRemoving(true)
    try {
      await feedsApi.removeSource(feedId, source.id, deletePosts)
      toast.success(t`Source removed`)
      onOpenChange(false)
      onRemoved()
    } catch (err) {
      toast.error(getErrorMessage(err, t`Failed to remove source`))
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <AlertDialog open={source !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle><Trans>Remove source?</Trans></AlertDialogTitle>
          <AlertDialogDescription className="break-all">
            <Trans>This will stop importing content from "{source?.name}".</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={deletePosts}
              onChange={(e) => setDeletePosts(e.target.checked)}
              className="rounded"
            />
            <Trans>Also delete posts imported from this source</Trans>
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel><Trans>Cancel</Trans></AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void handleRemove()} disabled={isRemoving}>
            {isRemoving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            <Trans>Remove</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface EditSourceDialogProps {
  source: Source | null
  onOpenChange: (open: boolean) => void
  feedId: string
  onSaved: () => void
}

function EditSourceDialog({ source, onOpenChange, feedId, onSaved }: EditSourceDialogProps) {
  const { t } = useLingui()
  const [name, setName] = useState('')
  const [credibility, setCredibility] = useState('')
  const [transform, setTransform] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (source) {
      setName(source.name)
      setCredibility(String(source.credibility))
      setTransform(source.transform ?? '')
    }
  }, [source])

  const credNum = parseInt(credibility, 10)
  const credValid = !isNaN(credNum) && credNum >= 0 && credNum <= 100

  const handleSave = async () => {
    if (!source) return
    setIsSaving(true)
    try {
      const fields: { name?: string; credibility?: number; transform?: string } = {}
      if (name !== source.name) fields.name = name
      if (credValid && credNum !== source.credibility) fields.credibility = credNum
      if (transform !== (source.transform ?? '')) fields.transform = transform
      if (Object.keys(fields).length > 0) {
        await feedsApi.editSource(feedId, source.id, fields)
      }
      toast.success(t`Source updated`)
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(getErrorMessage(err, t`Failed to update source`))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AlertDialog open={source !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle><Trans>Edit source</Trans></AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium"><Trans>Name</Trans></label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          {source?.type === 'rss' && (
            <div>
              <label className="text-sm font-medium"><Trans>Credibility</Trans></label>
              <div className="flex items-center gap-3 mt-1">
                <Slider
                  min={0}
                  max={100}
                  value={credValid ? credNum : 50}
                  onChange={(e) => setCredibility(e.target.value)}
                  className="w-64 shrink-0"
                />
                {credValid && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `hsl(${credibilityHue(credNum)}, 80%, 92%)`,
                      color: `hsl(${credibilityHue(credNum)}, 80%, 35%)`,
                    }}
                  >
                    {credNum}
                  </span>
                )}
              </div>
            </div>
          )}
          {source?.type !== 'feed/memories' && (
            <div>
              <label className="text-sm font-medium"><Trans>AI transform</Trans></label>
              <Textarea
                value={transform}
                onChange={(e) => setTransform(e.target.value)}
                placeholder={t`Translate to English, and show as bullet points.`}
                rows={3}
                className="mt-1"
              />
              <p className="text-muted-foreground text-xs mt-1">
                <Trans>Leave empty to disable.</Trans>
              </p>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel><Trans>Cancel</Trans></AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleSave()} disabled={isSaving || !credValid}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            <Trans>Save</Trans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
