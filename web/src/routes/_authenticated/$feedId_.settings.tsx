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
  CardDescription,
  CardHeader,
  CardTitle,
  Header,
  Input,
  Label,
  Main,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  cn,
  usePageTitle,
} from '@mochi/common'
import { useFeeds, useSubscription } from '@/hooks'
import feedsApi, { type AccessRule } from '@/api/feeds'
import { mapFeedsToSummaries } from '@/api/adapters'
import type { Feed, FeedSummary } from '@/types'
import { useFeedsStore } from '@/stores/feeds-store'
import {
  Loader2,
  Plus,
  Rss,
  Settings,
  Shield,
  ShieldCheck,
  ShieldX,
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

// Operation labels
const OPERATION_LABELS: Record<string, string> = {
  view: 'View',
  post: 'Post',
  comment: 'Comment',
  manage: 'Manage',
  '*': 'All operations',
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

  const [newSubject, setNewSubject] = useState('')
  const [newOperation, setNewOperation] = useState('view')
  const [newType, setNewType] = useState<'allow' | 'deny'>('allow')
  const [isAdding, setIsAdding] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)

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

  const handleAdd = async () => {
    if (!newSubject.trim()) {
      toast.error('Subject is required')
      return
    }

    setIsAdding(true)
    try {
      if (newType === 'allow') {
        await feedsApi.grantAccess(feedId, newSubject.trim(), newOperation)
      } else {
        await feedsApi.denyAccess(feedId, newSubject.trim(), newOperation)
      }
      toast.success('Access rule added')
      setNewSubject('')
      void loadRules()
    } catch (err) {
      console.error('[AccessTab] Failed to add rule', err)
      toast.error('Failed to add access rule')
    } finally {
      setIsAdding(false)
    }
  }

  const handleRevoke = async (rule: AccessRule) => {
    setRemovingId(rule.id)
    try {
      await feedsApi.revokeAccess(feedId, rule.subject, rule.operation)
      toast.success('Access rule removed')
      void loadRules()
    } catch (err) {
      console.error('[AccessTab] Failed to revoke rule', err)
      toast.error('Failed to remove access rule')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access Control</CardTitle>
        <CardDescription>
          Control who can view, post, comment, and manage this feed. Enter a user
          identity, <code className="text-xs">@group</code> for a group name,{' '}
          <code className="text-xs">+</code> for authenticated users, or{' '}
          <code className="text-xs">*</code> for anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new rule */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Entity ID, @group, +, or *"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleAdd()
                }
              }}
            />
          </div>
          <div className="w-32 space-y-1.5">
            <Label htmlFor="operation">Operation</Label>
            <Select value={newOperation} onValueChange={setNewOperation}>
              <SelectTrigger id="operation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="post">Post</SelectItem>
                <SelectItem value="comment">Comment</SelectItem>
                <SelectItem value="manage">Manage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-28 space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <Select value={newType} onValueChange={(v) => setNewType(v as 'allow' | 'deny')}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void handleAdd()} disabled={isAdding}>
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </>
            )}
          </Button>
        </div>

        <Separator />

        {/* Rules table */}
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
                <TableHead>Operation</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rules]
                .sort((a, b) => {
                  // Sort order: specific users, @groups, +, *
                  const priority = (s: string) => {
                    if (s === '*') return 3
                    if (s === '+') return 2
                    if (s.startsWith('@') || s.startsWith('#')) return 1
                    return 0
                  }
                  return priority(a.subject) - priority(b.subject)
                })
                .map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono text-sm">
                      {formatSubject(rule.subject, rule.name)}
                    </TableCell>
                    <TableCell>
                      {OPERATION_LABELS[rule.operation] || rule.operation}
                    </TableCell>
                    <TableCell>
                      {rule.grant === 1 ? (
                        <Badge variant="default" className="bg-green-600">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Allow
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <ShieldX className="h-3 w-3 mr-1" />
                          Deny
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleRevoke(rule)}
                        disabled={removingId === rule.id}
                      >
                        {removingId === rule.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
