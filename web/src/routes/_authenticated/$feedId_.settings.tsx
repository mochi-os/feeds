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
} from '@mochi/common'
import { useQuery } from '@tanstack/react-query'
import { useFeeds, useSubscription } from '@/hooks'
import feedsApi, { type AccessRule } from '@/api/feeds'
import { mapFeedsToSummaries } from '@/api/adapters'
import type { Feed, FeedSummary } from '@/types'
import { useFeedsStore } from '@/stores/feeds-store'
import { useSidebarContext } from '@/context/sidebar-context'
import {
  Loader2,
  Plus,
  Rss,
  Settings,
  Shield,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react'

// Characters disallowed in feed names (matches backend validation)
const DISALLOWED_NAME_CHARS = /[<>\r\n\\;"'`]/

type TabId = 'general' | 'access'

type SettingsSearch = {
  tab?: TabId
}

export const Route = createFileRoute('/_authenticated/$feedId_/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: (search.tab === 'general' || search.tab === 'access') ? search.tab : undefined,
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
  { id: 'access', label: 'Access', icon: <Shield className="h-4 w-4" /> },
]

function FeedSettingsPage() {
  const { feedId } = Route.useParams()
  const navigate = useNavigate()
  const navigateSettings = Route.useNavigate()
  const { tab } = Route.useSearch()
  const activeTab = tab ?? 'general'
  const getCachedFeed = useFeedsStore((state) => state.getCachedFeed)
  const refreshSidebar = useFeedsStore((state) => state.refresh)
  const cachedFeed = getCachedFeed(feedId)

  const setActiveTab = (newTab: TabId) => {
    void navigateSettings({ search: { tab: newTab }, replace: true })
  }
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
      await toggleSubscription(selectedFeed.id)
      void refreshSidebar()
      toast.success('Unsubscribed')
      void navigate({ to: '/' })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to unsubscribe'))
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
        <PageHeader title="Settings" icon={<Settings className="size-4 md:size-5" />} />
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
        <PageHeader title="Settings" icon={<Settings className="size-4 md:size-5" />} />
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
      <PageHeader title={selectedFeed.name ? `${selectedFeed.name} settings` : 'Settings'} />
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
    if (DISALLOWED_NAME_CHARS.test(name)) return 'Name cannot contain < > \\ ; " \' or ` characters'
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
            <DataChip value={feed.id} />
          </FieldRow>

          {feed.fingerprint && (
            <FieldRow label="Fingerprint">
              <DataChip value={feed.fingerprint} />
            </FieldRow>
          )}

          {feed.server && (
            <FieldRow label="Server">
              <DataChip value={feed.server} />
            </FieldRow>
          )}
        </div>
      </Section>

      {(canUnsubscribe || feed.isOwner) && (
        <Section
          title="Danger Zone"
          description="Irreversible actions for this feed"
          className="border-destructive/20"
        >
          <div className="space-y-6 py-2">
            {canUnsubscribe && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-medium">Unsubscribe from feed</p>
                  <p className="text-sm text-muted-foreground">
                    Remove this feed from your sidebar.
                  </p>
                </div>
                <Button
                  variant="warning"
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
              </div>
            )}

            {feed.isOwner && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-medium text-destructive">Delete feed</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this feed and all its content.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isDeleting}
                  size="sm"
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        </Section>
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
