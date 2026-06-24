// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
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
  Tabs,
  TabsList,
  TabsTrigger,
  usePageTitle,
  AccessDialog,
  AccessList,
  coerceObjectArray,
  getErrorMessage,
  type AccessLevel,
  EmptyState,
  GeneralError,
  Skeleton,
  Section,
  FieldRow,
  EditableFieldRow,
  DataChip,
  toast,
  toastAction,
  getAppPath,
  useAccounts,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  naturalCompare,
} from '@mochi/web'
import { useQuery } from '@tanstack/react-query'
import { useFeeds, useSubscription } from '@/hooks'
import { feedsApi, type AccessRule } from '@/api/feeds'
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
  Check,
} from 'lucide-react'

// Characters disallowed in feed names (matches backend validation)
const DISALLOWED_NAME_CHARS = /[<>\r\n]/

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error
  return new Error(fallback)
}

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

function FeedSettingsPage() {
  const { t } = useLingui()
  const tabs: Tab[] = [
    { id: 'general', label: t`Settings`, icon: <Settings className="h-4 w-4" /> },
    { id: 'access', label: t`Access`, icon: <Shield className="h-4 w-4" /> },
  ]
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
  const goBackToFeed = () => navigate({ to: '/$feedId', params: { feedId } })
  const [remoteFeed, setRemoteFeed] = useState<FeedSummary | null>(cachedFeed ?? null)
  const [isLoadingRemote, setIsLoadingRemote] = useState(false)
  const [remoteFeedError, setRemoteFeedError] = useState<Error | null>(null)
  const [remoteFeedNotFound, setRemoteFeedNotFound] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showUnsubscribeDialog, setShowUnsubscribeDialog] = useState(false)
  const fetchedRemoteRef = useRef<string | null>(null)
  const [remoteRetryCount, setRemoteRetryCount] = useState(0)

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
    setErrorMessage: () => { },
    refreshFeedsFromApi,
    mountedRef,
  })

  const localFeed = useMemo(
    () => feeds.find((feed) => feed.id === feedId || feed.fingerprint === feedId) ?? null,
    [feeds, feedId]
  )

  const selectedFeed = localFeed ?? remoteFeed

  // Update page title when feed is loaded
  usePageTitle(selectedFeed?.name ? t`${selectedFeed.name} settings` : t`Settings`)

  // Register with sidebar context to keep feed expanded in sidebar
  const { setFeedId } = useSidebarContext()
  useEffect(() => {
    setFeedId(feedId)
    return () => setFeedId(null)
  }, [feedId, setFeedId])

  // Fetch feed from remote if not found locally
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
        setRemoteFeedError(toError(error, t`Failed to load feed settings`))
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

  const handleUnsubscribe = useCallback(async () => {
    if (!selectedFeed || isSubscribing) return

    setIsSubscribing(true)
    try {
      await toastAction(feedsApi.unsubscribe(selectedFeed.id), {
        loading: t`Unsubscribing...`,
        success: t`Unsubscribed`,
        error: (e) => getErrorMessage(e, t`Failed to unsubscribe`),
      })
      void refreshSidebar()
      void navigate({ to: '/' })
    } catch {
      // toast already shown
    } finally {
      setIsSubscribing(false)
    }
  }, [t, selectedFeed, isSubscribing, refreshSidebar, navigate])

  const handleDelete = useCallback(async () => {
    if (!selectedFeed || !selectedFeed.isOwner || isDeleting) return

    setIsDeleting(true)
    try {
      await toastAction(feedsApi.delete(selectedFeed.id), {
        loading: t`Deleting feed...`,
        success: t`Feed deleted`,
        error: (e) => getErrorMessage(e, t`Failed to delete feed`),
      })
      void refreshSidebar()
      void navigate({ to: '/' })
    } catch {
      // toast already shown
    } finally {
      setIsDeleting(false)
    }
  }, [t, selectedFeed, isDeleting, refreshSidebar, navigate])

  const handleRename = useCallback(async (name: string) => {
    if (!selectedFeed || !selectedFeed.isOwner) return

    try {
      await toastAction(feedsApi.rename(selectedFeed.id, name), {
        loading: t`Renaming feed...`,
        success: t`Feed renamed`,
        error: (e) => getErrorMessage(e, t`Failed to rename feed`),
      })
      void refreshSidebar()
      void refreshFeedsFromApi()
    } catch (error) {
      throw error
    }
  }, [t, selectedFeed, refreshSidebar, refreshFeedsFromApi])

  const canUnsubscribe = selectedFeed?.isSubscribed && !selectedFeed?.isOwner

  if ((isLoadingFeeds || isLoadingRemote) && !selectedFeed) {
    return (
      <>
        <PageHeader
          title={t`Settings`}
          icon={<Settings className="size-4 md:size-5" />}
          back={{ label: t`Back to feed`, onFallback: goBackToFeed }}
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
          title={t`Settings`}
          icon={<Settings className="size-4 md:size-5" />}
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

  return (
    <>
      <PageHeader
        title={selectedFeed.name ? t`${selectedFeed.name} settings` : t`Settings`}
        back={{ label: t`Back to feed`, onFallback: goBackToFeed }}
      />
      <Main className="space-y-6">
        {/* Tabs - only show for owners */}
        {selectedFeed.isOwner && (
          <Tabs
            variant="underline"
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as TabId)}
          >
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                  {tab.icon}
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
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
              showUnsubscribeDialog={showUnsubscribeDialog}
              setShowUnsubscribeDialog={setShowUnsubscribeDialog}
              onUnsubscribe={handleUnsubscribe}
              onDelete={handleDelete}
              onRename={handleRename}
              setFeeds={setFeeds}
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
  showUnsubscribeDialog: boolean
  setShowUnsubscribeDialog: (show: boolean) => void
  onUnsubscribe: () => void
  onDelete: () => void
  onRename: (name: string) => Promise<void>
  setFeeds: React.Dispatch<React.SetStateAction<FeedSummary[]>>
}

function GeneralTab({
  feed,
  canUnsubscribe,
  isSubscribing,
  isDeleting,
  showDeleteDialog,
  setShowDeleteDialog,
  showUnsubscribeDialog,
  setShowUnsubscribeDialog,
  onUnsubscribe,
  onDelete,
  onRename,
  setFeeds,
}: GeneralTabProps) {
  const { t } = useLingui()

  const validateName = (name: string): string | null => {
    if (!name.trim()) return t`Feed name is required`
    if (name.length > 1000) return t`Name must be 1000 characters or less`
    if (DISALLOWED_NAME_CHARS.test(name)) return t`Name cannot contain < or > characters`
    return null
  }

  return (
    <div className="space-y-6">
      <Section title={t`Identity`}>
        <div className="divide-y-0">
          <EditableFieldRow
            label={t`Name`}
            value={feed.name}
            canEdit={feed.isOwner}
            onSave={onRename}
            validate={validateName}
            emphasize
          />

          <FieldRow label={t`Entity ID`}>
            <DataChip value={feed.id} truncate='middle' />
          </FieldRow>

          {feed.fingerprint && (
            <FieldRow label={t`Fingerprint`}>
              <DataChip value={feed.fingerprint} truncate='middle' />
            </FieldRow>
          )}

          {feed.server && (
            <FieldRow label={t`Server`}>
              <DataChip value={feed.server} />
            </FieldRow>
          )}
        </div>
      </Section>

      {feed.isOwner && (
        <BannerSection feedId={feed.id} />
      )}

      {feed.isOwner ? (
        <AiSettingsSection feedId={feed.id} aiMode={feed.ai_mode ?? ''} aiAccount={feed.ai_account ?? 0} onSave={(mode, account) => {
          setFeeds(prev => prev.map(f => f.id === feed.id ? { ...f, ai_mode: mode, ai_account: account } : f))
        }} />
      ) : feed.isSubscribed ? (
        <SubscriberAiSection feedId={feed.id} aiAccount={feed.ai_account ?? 0} />
      ) : null}

      {canUnsubscribe && (
        <Section
          title={t`Unsubscribe from feed`}
          action={
            <Button
              variant="outline"
              onClick={() => setShowUnsubscribeDialog(true)}
              disabled={isSubscribing}
              size="sm"
            >
              {isSubscribing ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Trans>Unsubscribe</Trans>
              )}
            </Button>
          }
        />
      )}

      <AlertDialog open={showUnsubscribeDialog} onOpenChange={setShowUnsubscribeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><Trans>Unsubscribe from feed?</Trans></AlertDialogTitle>
            <AlertDialogDescription>
              {t`You will no longer receive updates from "${feed.name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><Trans>Cancel</Trans></AlertDialogCancel>
            <AlertDialogAction variant={'destructive'} onClick={onUnsubscribe}><Trans>Unsubscribe</Trans></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {feed.isOwner && (
        <Section
          title={t`Delete feed`}
          description={t`Permanently delete this feed and all its content.`}
          action={
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
              size="sm"
            >
              <Trash2 className="size-4 me-2" />
              <Trans><Trans>Delete</Trans></Trans>
            </Button>
          }
        />
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><Trans><Trans>Delete feed?</Trans></Trans></AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>This will permanently delete "{feed.name}" and all its posts, comments, and reactions. This action cannot be undone.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><Trans><Trans>Cancel</Trans></Trans></AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}><Trans><Trans>Delete Feed</Trans></Trans></AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function useFeedsAccessLevels(): AccessLevel[] {
  const { t } = useLingui()
  return [
    { value: 'comment', label: t`Comment, react, and view` },
    { value: 'react', label: t`React and view` },
    { value: 'view', label: t`View only` },
    { value: 'none', label: t`No access` },
  ]
}

function BannerSection({ feedId }: { feedId: string }) {
  const { t } = useLingui()
  const [banner, setBannerText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const savedRef = useRef('')

  useEffect(() => {
    feedsApi.getBanner(feedId).then((res) => {
      const text = res.data.banner ?? ''
      setBannerText(text)
      savedRef.current = text
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [feedId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await feedsApi.setBanner(feedId, banner)
      savedRef.current = banner
      setDirty(false)
      toast.success(banner ? t`Banner updated` : t`Banner removed`)
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to update banner`))
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  return (
    <Section title={t`Banner`} description={t`Optional markdown banner shown at the top of your feed.`}>
      <div className="space-y-3 max-w-lg">
        <Textarea
          value={banner}
          onChange={(e) => { setBannerText(e.target.value); setDirty(e.target.value !== savedRef.current) }}
          placeholder={t`Enter banner text (markdown supported)...`}
          rows={3}
          className="font-mono text-sm"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
          >
            {saving && <Loader2 className="me-2 size-4 animate-spin" />}
            <Trans><Trans>Save</Trans></Trans>
          </Button>
          {banner && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setBannerText(''); setDirty('' !== savedRef.current) }}
              disabled={saving}
            >
              <Trans><Trans>Clear</Trans></Trans>
            </Button>
          )}
        </div>
      </div>
    </Section>
  )
}

function AiSettingsSection({ feedId, aiMode, aiAccount, onSave }: { feedId: string; aiMode: string; aiAccount: number; onSave: (mode: string, account: number) => void }) {
  const { t } = useLingui()
  // Map legacy values
  const normalizeMode = (m: string) => {
    if (m === 'score') return 'tag'
    if (m === 'score+deduplicate') return 'tag+deduplicate'
    return m || 'off'
  }
  const [mode, setMode] = useState(normalizeMode(aiMode))
  const [account, setAccount] = useState(aiAccount)
  const { accounts, isLoading } = useAccounts(getAppPath(), 'ai')

  if (!isLoading && accounts.length === 0) return null

  const handleModeChange = async (val: string) => {
    const apiMode = val === 'off' ? '' : val
    try {
      await feedsApi.setAiSettings(feedId, apiMode, account)
      setMode(val)
      onSave(apiMode, account)
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to update AI settings`))
    }
  }

  const handleAccountChange = async (val: string) => {
    const newAccount = parseInt(val, 10)
    const apiMode = mode === 'off' ? '' : mode
    try {
      await feedsApi.setAiSettings(feedId, apiMode, newAccount)
      setAccount(newAccount)
      onSave(apiMode, newAccount)
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to update AI settings`))
    }
  }

  // Which prompts to show per mode
  const showTag = mode !== 'off'
  const showScore = mode !== 'off'
  const showCredibility = mode !== 'off'

  return (
    <Section title={t`AI`}>
      <FieldRow label={t`AI actions on posts`}>
        <Select value={mode} onValueChange={handleModeChange} disabled={isLoading}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off"><Trans>Disabled</Trans></SelectItem>
            <SelectItem value="tag"><Trans>Tag</Trans></SelectItem>
            <SelectItem value="tag+deduplicate"><Trans>Tag + deduplicate</Trans></SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      {mode !== 'off' && (
        <FieldRow label={t`Account`}>
          <Select value={account.toString()} onValueChange={handleAccountChange} disabled={isLoading}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0"><Trans>Default account</Trans></SelectItem>
              {[...accounts].sort((a, b) => naturalCompare((a.label || a.identifier), b.label || b.identifier)).map((acc) => (
                <SelectItem key={acc.id} value={acc.id.toString()}>
                  {acc.label || acc.identifier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      )}
      {mode !== 'off' && (
        <AiPromptsEditor
          feedId={feedId}
          showTag={showTag}
          showScore={showScore}
          showCredibility={showCredibility}
        />
      )}
    </Section>
  )
}

function SubscriberAiSection({ feedId, aiAccount }: { feedId: string; aiAccount: number }) {
  const { t } = useLingui()
  const [account, setAccount] = useState(aiAccount)
  const { accounts, isLoading } = useAccounts(getAppPath(), 'ai')

  if (!isLoading && accounts.length === 0) return null

  const handleAccountChange = async (val: string) => {
    const newAccount = parseInt(val, 10)
    try {
      await feedsApi.setAiSettings(feedId, '', newAccount)
      setAccount(newAccount)
    } catch (error) {
      toast.error(getErrorMessage(error, t`Failed to update AI settings`))
    }
  }

  return (
    <Section title={t`AI`}>
      <FieldRow label={t`Account`}>
        <Select value={account.toString()} onValueChange={handleAccountChange} disabled={isLoading}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0"><Trans>Default account</Trans></SelectItem>
            {[...accounts].sort((a, b) => naturalCompare((a.label || a.identifier), b.label || b.identifier)).map((acc) => (
              <SelectItem key={acc.id} value={acc.id.toString()}>
                {acc.label || acc.identifier}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <AiPromptsEditor
        feedId={feedId}
        showTag={false}
        showScore={true}
        showCredibility={false}
      />
    </Section>
  )
}

const PROMPT_VARIABLES: Record<string, string> = {
  tag: '{{posts}}',
  // eslint-disable-next-line lingui/no-unlocalized-strings -- template placeholders
  score: '{{interests}}, {{posts}}',
  // eslint-disable-next-line lingui/no-unlocalized-strings -- template placeholders
  credibility: '{{source}}, {{domain}}',
}

function usePromptLabels(): Record<string, string> {
  const { t } = useLingui()
  return {
    tag: t`Tag prompt`,
    score: t`Score prompt`,
    credibility: t`Credibility prompt`,
  }
}

function AiPromptsEditor({ feedId, showTag, showScore, showCredibility }: { feedId: string; showTag: boolean; showScore: boolean; showCredibility: boolean }) {
  const PROMPT_LABELS = usePromptLabels()
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [defaults, setDefaults] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    feedsApi.getAiPrompts(feedId).then((data) => {
      setPrompts(data.prompts || {})
      setDefaults(data.defaults || {})
      setLoaded(true)
    }).catch(() => {
      setLoaded(true)
    })
  }, [feedId])

  if (!loaded) return null

  const types: string[] = []
  if (showTag) types.push('tag')
  if (showScore) types.push('score')
  if (showCredibility) types.push('credibility')

  return (
    <>
      {types.map((type) => (
        <PromptEditor
          key={type}
          feedId={feedId}
          type={type}
          label={PROMPT_LABELS[type]}
          variables={PROMPT_VARIABLES[type]}
          customPrompt={prompts[type] || ''}
          defaultPrompt={defaults[type] || ''}
          onSave={(text) => setPrompts((prev) => {
            const next = { ...prev }
            if (text) {
              next[type] = text
            } else {
              delete next[type]
            }
            return next
          })}
        />
      ))}
    </>
  )
}

function PromptEditor({ feedId, type, label, variables, customPrompt, defaultPrompt, onSave }: {
  feedId: string
  type: string
  label: string
  variables: string
  customPrompt: string
  defaultPrompt: string
  onSave: (text: string) => void
}) {
  const { t } = useLingui()
  const isCustom = customPrompt !== ''
  const [custom, setCustom] = useState(isCustom)
  const [text, setText] = useState(customPrompt || defaultPrompt)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleToggle = (val: string) => {
    if (val === 'default' && custom) {
      // Reset to default
      setSaving(true)
      feedsApi.setAiPrompt(feedId, type, '').then(() => {
        setCustom(false)
        setText(defaultPrompt)
        onSave('')
      }).catch((error) => {
        toast.error(getErrorMessage(error, t`Failed to reset prompt`))
      }).finally(() => setSaving(false))
    } else if (val === 'custom' && !custom) {
      setCustom(true)
      setText(customPrompt || defaultPrompt)
    }
  }

  const handleSave = () => {
    setSaving(true)
    feedsApi.setAiPrompt(feedId, type, text).then(() => {
      onSave(text)
      toast.success(t`Prompt saved`)
    }).catch((error) => {
      toast.error(getErrorMessage(error, t`Failed to save prompt`))
    }).finally(() => setSaving(false))
  }

  return (
    <FieldRow label={label} className="sm:items-start">
      <div className="w-full space-y-2">
        <Select value={custom ? 'custom' : 'default'} onValueChange={handleToggle} disabled={saving}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default"><Trans>Default</Trans></SelectItem>
            <SelectItem value="custom"><Trans>Custom</Trans></SelectItem>
          </SelectContent>
        </Select>
        {custom && (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              className="w-full min-h-[240px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={saving}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {saving ? <Trans><Trans>Saving...</Trans></Trans> : <Trans><Trans>Save</Trans></Trans>}
              </Button>
              <span className="text-xs text-muted-foreground">
                <Trans>Variables: {variables}</Trans>
              </span>
            </div>
          </div>
        )}
      </div>
    </FieldRow>
  )
}

interface AccessTabProps {
  feedId: string
}

function AccessTab({ feedId }: AccessTabProps) {
  const { t } = useLingui()
  const FEEDS_ACCESS_LEVELS = useFeedsAccessLevels()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')

  const {
    data: rulesData,
    isLoading: isLoadingRules,
    error: rulesErrorRaw,
    refetch: refetchRules,
  } = useQuery({
    queryKey: ['feeds', 'access-rules', feedId],
    queryFn: () => feedsApi.getAccessRules(feedId),
    retry: false,
    refetchOnWindowFocus: false,
  })

  const {
    data: userSearchData,
    isLoading: userSearchLoading,
    error: userSearchErrorRaw,
    refetch: refetchUserSearch,
  } = useQuery({
    queryKey: ['users', 'search', userSearchQuery],
    queryFn: () => feedsApi.searchUsers(userSearchQuery),
    enabled: userSearchQuery.length >= 1,
    retry: false,
  })

  const {
    data: groupsData,
    error: groupsErrorRaw,
    refetch: refetchGroups,
  } = useQuery({
    queryKey: ['groups', 'list'],
    queryFn: () => feedsApi.listGroups(),
    retry: false,
    refetchOnWindowFocus: false,
  })

  const rules = useMemo<AccessRule[]>(
    () => coerceObjectArray<AccessRule>(rulesData?.data?.rules),
    [rulesData]
  )
  const rulesError = rulesErrorRaw
    ? toError(rulesErrorRaw, t`Failed to load access rules`)
    : null
  const userSearchError = userSearchQuery.length >= 1 && userSearchErrorRaw
    ? toError(userSearchErrorRaw, t`Failed to search users`)
    : null
  const groupsError = groupsErrorRaw
    ? toError(groupsErrorRaw, t`Failed to load groups`)
    : null
  const canManageRules = !rulesError
  const userSearchResults = coerceObjectArray<{ id: string; name: string }>(
    userSearchData?.results,
  )
  const groups = coerceObjectArray<{ id: string; name: string; description?: string }>(
    groupsData?.groups,
  )

  const handleAdd = async (subject: string, subjectName: string, level: string) => {
    try {
      await feedsApi.setAccessLevel(feedId, subject, level)
      toast.success(t`Access set for ${subjectName}`)
      await refetchRules()
    } catch (err) {
      toast.error(getErrorMessage(err, t`Failed to set access level`))
      throw err
    }
  }

  const handleRevoke = async (subject: string) => {
    try {
      await feedsApi.revokeAccess(feedId, subject)
      toast.success(t`Access removed`)
      await refetchRules()
    } catch (err) {
      toast.error(getErrorMessage(err, t`Failed to remove access`))
    }
  }

  const handleLevelChange = async (subject: string, newLevel: string) => {
    try {
      await feedsApi.setAccessLevel(feedId, subject, newLevel)
      toast.success(t`Access level updated`)
      await refetchRules()
    } catch (err) {
      toast.error(getErrorMessage(err, t`Failed to update access level`))
    }
  }

  return (
    <Section
      title={t`Access Management`}
      description={t`Control who can view and interact with this feed`}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setDialogOpen(true)} size="sm" disabled={!canManageRules}>
            <Plus className="h-4 w-4 me-2" />
            <Trans>Add rule</Trans>
          </Button>
        </div>

        <AccessDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onAdd={handleAdd}
          levels={FEEDS_ACCESS_LEVELS}
          defaultLevel="comment"
          userSearchResults={userSearchResults}
          userSearchLoading={userSearchLoading}
          userSearchError={userSearchError}
          onRetryUserSearch={() => {
            void refetchUserSearch()
          }}
          onUserSearch={setUserSearchQuery}
          groups={groups}
          groupsError={groupsError}
          onRetryGroups={() => {
            void refetchGroups()
          }}
        />

        {rulesError ? (
          <GeneralError
            error={rulesError}
            minimal
            mode='inline'
            reset={() => {
              void refetchRules()
            }}
          />
        ) : (
          <AccessList
            rules={rules}
            levels={FEEDS_ACCESS_LEVELS}
            onLevelChange={handleLevelChange}
            onRevoke={handleRevoke}
            isLoading={isLoadingRules}
            error={null}
          />
        )}
      </div>
    </Section>
  )
}
