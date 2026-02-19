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
  PageHeader,
  Main,
  cn,
  usePageTitle,
  AccessDialog,
  AccessList,
  getErrorMessage,
  type AccessLevel,
  Input,
  EmptyState,
  Skeleton,
  Section,
  FieldRow,
  DataChip,
  toast,
  handlePermissionError,
  getCurrentAppId,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@mochi/common'
import { useQuery } from '@tanstack/react-query'
import { useFeeds, useSubscription } from '@/hooks'
import { feedsApi, type AccessRule } from '@/api/feeds'
import { mapFeedsToSummaries } from '@/api/adapters'
import type { Feed, FeedSummary } from '@/types'
import { useFeedsStore } from '@/stores/feeds-store'
import { useSidebarContext } from '@/context/sidebar-context'
import {
  Calendar,
  Loader2,
  Link2,
  Plus,
  RefreshCw,
  Rss,
  Settings,
  Shield,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import type { Source } from '@/types'
import { formatTimestamp } from '@mochi/common'

// Characters disallowed in feed names (matches backend validation)
const DISALLOWED_NAME_CHARS = /[<>\r\n]/

type TabId = 'general' | 'access' | 'sources'

type SettingsSearch = {
  tab?: TabId
  addUrl?: string
  addType?: 'rss' | 'feed/posts'
}

export const Route = createFileRoute('/_authenticated/$feedId_/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: (search.tab === 'general' || search.tab === 'access' || search.tab === 'sources') ? search.tab : undefined,
    addUrl: typeof search.addUrl === 'string' ? search.addUrl : undefined,
    addType: search.addType === 'rss' || search.addType === 'feed/posts' ? search.addType : undefined,
  }),
  component: FeedSettingsPage,
})

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  { id: 'general', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  { id: 'sources', label: 'Sources', icon: <Link2 className="h-4 w-4" /> },
  { id: 'access', label: 'Access', icon: <Shield className="h-4 w-4" /> },
]

function FeedSettingsPage() {
  const { feedId } = Route.useParams()
  const navigate = useNavigate()
  const navigateSettings = Route.useNavigate()
  const { tab, addUrl, addType } = Route.useSearch()
  const activeTab = tab ?? 'general'
  const getCachedFeed = useFeedsStore((state) => state.getCachedFeed)
  const refreshSidebar = useFeedsStore((state) => state.refresh)
  const cachedFeed = getCachedFeed(feedId)

  const setActiveTab = (newTab: TabId) => {
    void navigateSettings({ search: { tab: newTab }, replace: true })
  }
  const goBackToFeed = () => navigate({ to: '/$feedId', params: { feedId } })
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

  useSubscription({
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
  usePageTitle(selectedFeed?.name ? `${selectedFeed.name} settings` : 'Settings')

  // Register with sidebar context to keep feed expanded in sidebar
  const { setFeedId } = useSidebarContext()
  useEffect(() => {
    setFeedId(feedId)
    return () => setFeedId(null)
  }, [feedId, setFeedId])

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
      await feedsApi.unsubscribe(selectedFeed.id)
      void refreshSidebar()
      toast.success('Unsubscribed')
      void navigate({ to: '/' })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to unsubscribe'))
    } finally {
      setIsSubscribing(false)
    }
  }, [selectedFeed, isSubscribing, refreshSidebar, navigate])

  const handleDelete = useCallback(async () => {
    if (!selectedFeed || !selectedFeed.isOwner || isDeleting) return

    setIsDeleting(true)
    try {
      await feedsApi.delete(selectedFeed.id)
      void refreshSidebar()
      toast.success('Feed deleted')
      void navigate({ to: '/' })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete feed'))
    } finally {
      setIsDeleting(false)
    }
  }, [selectedFeed, isDeleting, refreshSidebar, navigate])

  const handleRename = useCallback(async (name: string) => {
    if (!selectedFeed || !selectedFeed.isOwner) return

    try {
      await feedsApi.rename(selectedFeed.id, name)
      void refreshSidebar()
      void refreshFeedsFromApi()
      toast.success('Feed renamed')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to rename feed'))
      throw error
    }
  }, [selectedFeed, refreshSidebar, refreshFeedsFromApi])

  const canUnsubscribe = selectedFeed?.isSubscribed && !selectedFeed?.isOwner

  if ((isLoadingFeeds || isLoadingRemote) && !selectedFeed) {
    return (
      <>
        <PageHeader
          title="Settings"
          icon={<Settings className="size-4 md:size-5" />}
          back={{ label: 'Back to feed', onFallback: goBackToFeed }}
        />
        <Main className="space-y-6">
          <div className="flex gap-1 border-b">
            <div className="flex items-center gap-2 px-4 py-2 border-b-2 border-transparent">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <div className="pt-2">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </Main>
      </>
    )
  }

  if (!selectedFeed) {
    return (
      <>
        <PageHeader
          title="Settings"
          icon={<Settings className="size-4 md:size-5" />}
          back={{ label: 'Back to feed', onFallback: goBackToFeed }}
        />
        <Main>
          <EmptyState
            icon={Rss}
            title="Feed not found"
            description="This feed may have been deleted or you don't have access to it."
          />
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={selectedFeed.name ? `${selectedFeed.name} settings` : 'Settings'}
        back={{ label: 'Back to feed', onFallback: goBackToFeed }}
      />
      <Main className="space-y-6">
        {/* Tabs - only show for owners */}
        {selectedFeed.isOwner && (
          <div className="flex gap-1 border-b">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                  'border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div className="pt-2">
          {activeTab === 'general' && (
            <GeneralTab
              feed={selectedFeed}
              canUnsubscribe={canUnsubscribe}
              isSubscribing={isSubscribing}
              isDeleting={isDeleting}
              showDeleteDialog={showDeleteDialog}
              setShowDeleteDialog={setShowDeleteDialog}
              onUnsubscribe={handleUnsubscribe}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          )}
          {activeTab === 'access' && selectedFeed.isOwner && (
            <AccessTab feedId={selectedFeed.id} />
          )}
          {activeTab === 'sources' && selectedFeed.isOwner && (
            <SourcesTab feedId={selectedFeed.id} addUrl={addUrl} addType={addType} />
          )}
        </div>
      </Main>
    </>
  )
}

interface GeneralTabProps {
  feed: FeedSummary
  canUnsubscribe: boolean | undefined
  isSubscribing: boolean
  isDeleting: boolean
  showDeleteDialog: boolean
  setShowDeleteDialog: (show: boolean) => void
  onUnsubscribe: () => void
  onDelete: () => void
  onRename: (name: string) => Promise<void>
}

function GeneralTab({
  feed,
  canUnsubscribe,
  isSubscribing,
  isDeleting,
  showDeleteDialog,
  setShowDeleteDialog,
  onUnsubscribe,
  onDelete,
  onRename,
}: GeneralTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(feed.name)
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const validateName = (name: string): string | null => {
    if (!name.trim()) return 'Feed name is required'
    if (name.length > 1000) return 'Name must be 1000 characters or less'
    if (DISALLOWED_NAME_CHARS.test(name)) return 'Name cannot contain < or > characters'
    return null
  }

  const handleStartEdit = () => {
    setEditName(feed.name)
    setNameError(null)
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditName(feed.name)
    setNameError(null)
  }

  const handleSaveEdit = async () => {
    const trimmedName = editName.trim()
    const error = validateName(trimmedName)
    if (error) {
      setNameError(error)
      return
    }
    if (trimmedName === feed.name) {
      setIsEditing(false)
      return
    }
    setIsRenaming(true)
    try {
      await onRename(trimmedName)
      setIsEditing(false)
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Identity"
        description="Core information about this feed"
      >
        <div className="divide-y-0">
          <FieldRow label="Name">
            {feed.isOwner && isEditing ? (
              <div className="flex flex-col gap-1 w-full max-w-md">
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value)
                      setNameError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveEdit()
                      if (e.key === 'Escape') handleCancelEdit()
                    }}
                    className="h-9"
                    disabled={isRenaming}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleSaveEdit()}
                    disabled={isRenaming}
                    className="h-9 w-9 p-0"
                  >
                    {isRenaming ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4 text-green-600" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEdit}
                    disabled={isRenaming}
                    className="h-9 w-9 p-0"
                  >
                    <X className="size-4 text-destructive" />
                  </Button>
                </div>
                {nameError && (
                  <span className="text-sm text-destructive">{nameError}</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">{feed.name}</span>
                {feed.isOwner && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleStartEdit}
                    className="h-6 w-6 p-0 hover:bg-muted"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            )}
          </FieldRow>

          <FieldRow label="Entity ID">
            <DataChip value={feed.id} truncate='middle' />
          </FieldRow>

          {feed.fingerprint && (
            <FieldRow label="Fingerprint">
              <DataChip value={feed.fingerprint} truncate='middle' />
            </FieldRow>
          )}

          {feed.server && (
            <FieldRow label="Server">
              <DataChip value={feed.server} />
            </FieldRow>
          )}
        </div>
      </Section>

      {canUnsubscribe && (
        <Section
          title="Unsubscribe from feed"
          description="Remove this feed from your sidebar."
          action={
            <Button
              variant="outline"
              onClick={onUnsubscribe}
              disabled={isSubscribing}
              size="sm"
            >
              {isSubscribing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                'Unsubscribe'
              )}
            </Button>
          }
        />
      )}

      {feed.isOwner && (
        <Section
          title="Delete feed"
          description="Permanently delete this feed and all its content."
          action={
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
              size="sm"
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </Button>
          }
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete feed?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{feed.name}" and all its posts, comments, and
              reactions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>Delete Feed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const FEEDS_ACCESS_LEVELS: AccessLevel[] = [
  { value: 'comment', label: 'Comment, react, and view' },
  { value: 'react', label: 'React and view' },
  { value: 'view', label: 'View only' },
  { value: 'none', label: 'No access' },
]

interface AccessTabProps {
  feedId: string
}

function AccessTab({ feedId }: AccessTabProps) {
  const [rules, setRules] = useState<AccessRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')

  const { data: userSearchData, isLoading: userSearchLoading } = useQuery({
    queryKey: ['users', 'search', userSearchQuery],
    queryFn: () => feedsApi.searchUsers(userSearchQuery),
    enabled: userSearchQuery.length >= 1,
  })

  const { data: groupsData } = useQuery({
    queryKey: ['groups', 'list'],
    queryFn: () => feedsApi.listGroups(),
  })

  const loadRules = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await feedsApi.getAccessRules(feedId)
      setRules(response.data?.rules ?? [])
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load access rules'))
    } finally {
      setIsLoading(false)
    }
  }, [feedId])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const handleAdd = async (subject: string, subjectName: string, level: string) => {
    try {
      await feedsApi.setAccessLevel(feedId, subject, level)
      toast.success(`Access set for ${subjectName}`)
      void loadRules()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to set access level'))
      throw err
    }
  }

  const handleRevoke = async (subject: string) => {
    try {
      await feedsApi.revokeAccess(feedId, subject)
      toast.success('Access removed')
      void loadRules()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove access'))
    }
  }

  const handleLevelChange = async (subject: string, newLevel: string) => {
    try {
      await feedsApi.setAccessLevel(feedId, subject, newLevel)
      toast.success('Access level updated')
      void loadRules()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update access level'))
    }
  }

  return (
    <Section
      title="Access Management"
      description="Control who can view and interact with this feed"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>

        <AccessDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onAdd={handleAdd}
          levels={FEEDS_ACCESS_LEVELS}
          defaultLevel="comment"
          userSearchResults={userSearchData?.results ?? []}
          userSearchLoading={userSearchLoading}
          onUserSearch={setUserSearchQuery}
          groups={groupsData?.groups ?? []}
        />

        <AccessList
          rules={rules}
          levels={FEEDS_ACCESS_LEVELS}
          onLevelChange={handleLevelChange}
          onRevoke={handleRevoke}
          isLoading={isLoading}
          error={error}
        />
      </div>
    </Section>
  )
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  if (seconds < 3600) { const m = Math.round(seconds / 60); return `${m} minute${m === 1 ? '' : 's'}` }
  if (seconds < 86400) { const h = Math.round(seconds / 3600); return `${h} hour${h === 1 ? '' : 's'}` }
  const d = Math.round(seconds / 86400); return `${d} day${d === 1 ? '' : 's'}`
}

interface SourcesTabProps {
  feedId: string
  addUrl?: string
  addType?: 'rss' | 'feed/posts'
}

function SourcesTab({ feedId, addUrl, addType }: SourcesTabProps) {
  const [sources, setSources] = useState<Source[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(!!addUrl)
  const [addSourceType, setAddSourceType] = useState<'rss' | 'feed/posts'>(addType ?? 'feed/posts')
  const [removeSource, setRemoveSource] = useState<Source | null>(null)

  const hasMemoriesSource = sources.some((s) => s.type === 'feed/memories')

  const handleAddMemories = async () => {
    try {
      await feedsApi.addSource(feedId, 'feed/memories', '')
      toast.success('Memories source added')
      void loadSources()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add memories source'))
    }
  }

  const loadSources = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await feedsApi.getSources(feedId)
      setSources(response.data?.sources ?? [])
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load sources'))
    } finally {
      setIsLoading(false)
    }
  }, [feedId])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  const handlePoll = async (sourceId?: string) => {
    try {
      const response = await feedsApi.pollSource(feedId, sourceId)
      const count = response.data?.fetched ?? 0
      toast.success(count > 0 ? `Fetched ${count} new posts` : 'No new posts')
      void loadSources()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to poll source'))
    }
  }

  return (
    <Section title="Sources" action={
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add source
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setAddSourceType('feed/posts'); setShowAddDialog(true) }}>
            <Link2 className="h-4 w-4 mr-2" />
            Mochi feed
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setAddSourceType('rss'); setShowAddDialog(true) }}>
            <Rss className="h-4 w-4 mr-2" />
            RSS feed
          </DropdownMenuItem>
          {!hasMemoriesSource && (
            <DropdownMenuItem onSelect={() => void handleAddMemories()}>
              <Calendar className="h-4 w-4 mr-2" />
              Memories
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    }>
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-[10px]" />
            <Skeleton className="h-16 w-full rounded-[10px]" />
          </div>
        ) : sources.length === 0 ? (
          <EmptyState
            icon={Rss}
            title="No sources"
          />
        ) : (
          <div className="divide-y">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {source.type === 'rss' ? (
                      <Rss className="h-4 w-4 shrink-0 text-orange-500" />
                    ) : source.type === 'feed/memories' ? (
                      <Calendar className="h-4 w-4 shrink-0 text-purple-500" />
                    ) : (
                      <Link2 className="h-4 w-4 shrink-0 text-blue-500" />
                    )}
                    <span className="truncate font-medium text-sm">{source.name}</span>
                  </div>
                  <div className="text-muted-foreground mt-1 truncate text-xs pl-6">
                    {source.url && <>{source.url} · </>}
                    <span>{source.type === 'rss' ? 'RSS' : source.type === 'feed/memories' ? 'Memories' : 'Mochi feed'}</span>
                    {source.fetched > 0 && (
                      <span> · Last checked {formatTimestamp(source.fetched)}</span>
                    )}
                    {source.type === 'rss' && source.interval > 0 && (
                      <span> · Polling every {formatInterval(source.interval)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {(source.type === 'rss' || source.type === 'feed/memories') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => void handlePoll(source.id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setRemoveSource(source)}
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
          onOpenChange={setShowAddDialog}
          feedId={feedId}
          onAdded={loadSources}
          initialUrl={addUrl}
          sourceType={addSourceType}
        />

        <RemoveSourceDialog
          source={removeSource}
          onOpenChange={(open) => { if (!open) setRemoveSource(null) }}
          feedId={feedId}
          onRemoved={loadSources}
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
  const [url, setUrl] = useState(initialUrl ?? '')
  const [name, setName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const autoSubmitted = useRef(false)

  // Reset form when dialog opens (unless returning from permission grant)
  useEffect(() => {
    if (open && !initialUrl) {
      setUrl('')
      setName('')
    }
  }, [open, initialUrl])

  // Auto-submit when returning from permission grant
  useEffect(() => {
    if (initialUrl && open && !autoSubmitted.current) {
      autoSubmitted.current = true
      void handleSubmit()
    }
  }, [initialUrl, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!url.trim()) return

    let sourceUrl = url.trim()
    if (sourceType === 'rss' && !sourceUrl.startsWith('http://') && !sourceUrl.startsWith('https://')) {
      sourceUrl = 'https://' + sourceUrl
    }

    // Build return URL with source details for permission redirect
    const returnUrl = `${window.location.pathname}?tab=sources&addUrl=${encodeURIComponent(sourceUrl)}&addType=${encodeURIComponent(sourceType)}`

    setIsAdding(true)
    try {
      const response = await feedsApi.addSource(feedId, sourceType, sourceUrl, name.trim() || undefined)
      const count = response.data?.ingested ?? 0
      const msg = count > 0 ? `Source added (${count} posts imported)` : 'Source added'
      toast.success(msg)
      setUrl('')
      setName('')
      onOpenChange(false)
      onAdded()
    } catch (err: unknown) {
      const responseData = (err as { response?: { data?: unknown } })?.response?.data
      if (!handlePermissionError(responseData, getCurrentAppId(), { returnUrl })) {
        toast.error(getErrorMessage(err, 'Failed to add source'))
      }
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add {sourceType === 'rss' ? 'RSS feed' : 'Mochi feed'}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={sourceType === 'rss' ? 'https://example.com/feed.xml' : 'Feed entity ID or fingerprint'}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
              autoFocus
            />
          </div>
          <div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleSubmit()} disabled={isAdding || !url.trim()}>
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add
          </AlertDialogAction>
        </AlertDialogFooter>
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
  const [deletePosts, setDeletePosts] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleRemove = async () => {
    if (!source) return

    setIsRemoving(true)
    try {
      await feedsApi.removeSource(feedId, source.id, deletePosts)
      toast.success('Source removed')
      setDeletePosts(false)
      onOpenChange(false)
      onRemoved()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove source'))
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <AlertDialog open={source !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove source?</AlertDialogTitle>
          <AlertDialogDescription>
            This will stop importing content from "{source?.name}".
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
            Also delete posts imported from this source
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDeletePosts(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void handleRemove()} disabled={isRemoving}>
            {isRemoving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
