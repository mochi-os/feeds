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
  CardHeader,
  CardTitle,
  Header,
  Main,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  usePageTitle,
} from '@mochi/common'
import { useFeeds, useSubscription } from '@/hooks'
import feedsApi, { type AccessRule } from '@/api/feeds'
import { mapFeedsToSummaries } from '@/api/adapters'
import type { Feed, FeedSummary } from '@/types'
import { useFeedsStore } from '@/stores/feeds-store'
import { AccessDialog } from '@/features/feeds/components/access-dialog'
import {
  Loader2,
  Plus,
  Rss,
  Settings,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authenticated/$feedId_/settings')({
  component: FeedSettingsPage,
})

type TabId = 'general' | 'access'

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
  const getCachedFeed = useFeedsStore((state) => state.getCachedFeed)
  const refreshSidebar = useFeedsStore((state) => state.refresh)
  const cachedFeed = getCachedFeed(feedId)

  const [activeTab, setActiveTab] = useState<TabId>('general')
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
  usePageTitle(selectedFeed?.name ?? 'Settings')

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
}: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <span className="text-muted-foreground">Name:</span>
            <span>{feed.name}</span>

            <span className="text-muted-foreground">Entity:</span>
            <span className="font-mono break-all text-xs">{feed.id}</span>

            {feed.fingerprint && (
              <>
                <span className="text-muted-foreground">Fingerprint:</span>
                <span className="font-mono break-all text-xs">
                  {feed.fingerprint.match(/.{1,3}/g)?.join('-')}
                </span>
              </>
            )}

            {feed.server && (
              <>
                <span className="text-muted-foreground">Server:</span>
                <span className="font-mono break-all text-xs">{feed.server}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {(canUnsubscribe || feed.isOwner) && (
        <Card>
          <CardContent className="pt-6 space-y-4">
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
                  onClick={onUnsubscribe}
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

            {feed.isOwner && (
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
              This will permanently delete "{feed.name}" and all its posts, comments, and
              reactions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Subject type labels for display
const SUBJECT_LABELS: Record<string, string> = {
  '*': 'Anyone (including anonymous)',
  '+': 'Authenticated users',
  '#user': 'All users with a role',
  '#administrator': 'Administrators',
}

// Access level labels (hierarchical: comment > react > view > none)
const LEVEL_LABELS: Record<string, string> = {
  comment: 'Comment, react, and view',
  react: 'React and view',
  view: 'View only',
  none: 'No access',
}

function formatSubject(subject: string, name?: string): string {
  if (SUBJECT_LABELS[subject]) {
    return SUBJECT_LABELS[subject]
  }
  if (subject.startsWith('@')) {
    return `Group: ${subject.slice(1)}`
  }
  if (name) {
    return name
  }
  if (subject.length > 20) {
    return `${subject.slice(0, 8)}...${subject.slice(-8)}`
  }
  return subject
}

interface AccessTabProps {
  feedId: string
}

function AccessTab({ feedId }: AccessTabProps) {
  const [rules, setRules] = useState<AccessRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [removingSubject, setRemovingSubject] = useState<string | null>(null)

  const loadRules = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await feedsApi.getAccessRules(feedId)
      setRules(response.data?.rules ?? [])
    } catch (err) {
      console.error('[AccessTab] Failed to load rules', err)
      setError('Failed to load access rules')
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
      console.error('[AccessTab] Failed to set access level', err)
      toast.error('Failed to set access level')
      throw err // Re-throw so the dialog knows it failed
    }
  }

  const handleRevoke = async (subject: string) => {
    setRemovingSubject(subject)
    try {
      await feedsApi.revokeAccess(feedId, subject)
      toast.success('Access removed')
      void loadRules()
    } catch (err) {
      console.error('[AccessTab] Failed to revoke access', err)
      toast.error('Failed to remove access')
    } finally {
      setRemovingSubject(null)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Add access button - right aligned */}
        <div className="flex justify-end">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>

        <AccessDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onAdd={handleAdd}
        />

        {/* Access levels table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : rules.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Access level</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                // Group rules by subject to determine effective level
                const subjectMap = new Map<string, { name?: string; level: string; isOwner: boolean }>()
                for (const rule of rules) {
                  const existing = subjectMap.get(rule.subject)
                  // Owner has "*" or "manage" operation
                  const isOwner = rule.operation === '*' || rule.operation === 'manage'
                  if (!existing) {
                    // First rule for this subject
                    subjectMap.set(rule.subject, {
                      name: rule.name,
                      level: rule.grant === 0 ? 'none' : rule.operation,
                      isOwner,
                    })
                  } else {
                    if (rule.grant === 0) {
                      // Any deny rule means "none" level
                      existing.level = 'none'
                    }
                    if (isOwner) {
                      existing.isOwner = true
                    }
                  }
                }

                // Sort and render
                return [...subjectMap.entries()]
                  .sort(([a, aData], [b, bData]) => {
                    // Owner always first
                    if (aData.isOwner && !bData.isOwner) return -1
                    if (!aData.isOwner && bData.isOwner) return 1
                    // Then: specific users, @groups, +, *
                    const priority = (s: string) => {
                      if (s === '*') return 3
                      if (s === '+') return 2
                      if (s.startsWith('@') || s.startsWith('#')) return 1
                      return 0
                    }
                    return priority(a) - priority(b)
                  })
                  .map(([subject, { name, level, isOwner }]) => (
                    <TableRow key={subject}>
                      <TableCell className="font-mono text-sm">
                        {formatSubject(subject, name)}
                        {isOwner && (
                          <span className="ml-2 text-xs text-muted-foreground">(owner)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isOwner ? (
                          <span className="text-sm">Full access</span>
                        ) : (
                          <span className="text-sm">{LEVEL_LABELS[level] || level}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!isOwner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleRevoke(subject)}
                            disabled={removingSubject === subject}
                          >
                            {removingSubject === subject ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
              })()}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm">
            No access rules configured. Add rules to control who can access this feed.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
