import { useState, useEffect } from 'react'
import { User, UsersRound, Search, Globe, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import feedsApi, { type UserSearchResult, type Group } from '@/api/feeds'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@mochi/common'

// Access level labels
const LEVEL_LABELS: Record<string, string> = {
  comment: 'Comment, react, and view',
  react: 'React and view',
  view: 'View only',
  none: 'No access',
}

// Special subject options
const SPECIAL_SUBJECTS = [
  { id: '+', name: 'Authenticated users', description: 'Anyone who is logged in' },
  { id: '*', name: 'Anyone', description: 'Including anonymous users' },
]

interface AccessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (subject: string, subjectName: string, level: string) => Promise<void>
}

export function AccessDialog({ open, onOpenChange, onAdd }: AccessDialogProps) {
  const [userSearch, setUserSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [selectedSpecial, setSelectedSpecial] = useState<{ id: string; name: string } | null>(null)
  const [level, setLevel] = useState('comment')
  const [activeTab, setActiveTab] = useState<'user' | 'group' | 'special'>('user')
  const [isAdding, setIsAdding] = useState(false)

  // Search users query
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['users', 'search', userSearch],
    queryFn: () => feedsApi.searchUsers(userSearch),
    enabled: userSearch.length >= 1,
  })

  // List groups query
  const { data: groupsData } = useQuery({
    queryKey: ['groups', 'list'],
    queryFn: () => feedsApi.listGroups(),
  })

  const groups = groupsData?.groups ?? []

  // Reset selections when tab changes
  useEffect(() => {
    setSelectedUser(null)
    setSelectedGroup(null)
    setSelectedSpecial(null)
  }, [activeTab])

  const handleAdd = async () => {
    let subject: string
    let subjectName: string

    if (activeTab === 'user' && selectedUser) {
      subject = selectedUser.id
      subjectName = selectedUser.name
    } else if (activeTab === 'group' && selectedGroup) {
      subject = `@${selectedGroup.id}`
      subjectName = selectedGroup.name
    } else if (activeTab === 'special' && selectedSpecial) {
      subject = selectedSpecial.id
      subjectName = selectedSpecial.name
    } else {
      return
    }

    setIsAdding(true)
    try {
      await onAdd(subject, subjectName, level)
      resetAndClose()
    } finally {
      setIsAdding(false)
    }
  }

  const resetAndClose = () => {
    setUserSearch('')
    setSelectedUser(null)
    setSelectedGroup(null)
    setSelectedSpecial(null)
    setLevel('comment')
    onOpenChange(false)
  }

  const canAdd =
    (activeTab === 'user' && selectedUser) ||
    (activeTab === 'group' && selectedGroup) ||
    (activeTab === 'special' && selectedSpecial)

  const getSelectedName = () => {
    if (activeTab === 'user' && selectedUser) return selectedUser.name
    if (activeTab === 'group' && selectedGroup) return selectedGroup.name
    if (activeTab === 'special' && selectedSpecial) return selectedSpecial.name
    return null
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add access</DialogTitle>
          <DialogDescription>
            Select a user, group, or other rule to grant access.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="user">
              <User className="mr-2 h-4 w-4" />
              User
            </TabsTrigger>
            <TabsTrigger value="group">
              <UsersRound className="mr-2 h-4 w-4" />
              Group
            </TabsTrigger>
            <TabsTrigger value="special">
              <Globe className="mr-2 h-4 w-4" />
              Other
            </TabsTrigger>
          </TabsList>

          <TabsContent value="user" className="mt-4">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="user-search">Search users</Label>
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="user-search"
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value)
                      setSelectedUser(null)
                    }}
                    placeholder="Type to search..."
                    className="pl-10"
                  />
                </div>
              </div>

              {userSearch.length < 1 ? (
                <p className="text-muted-foreground text-center text-sm">
                  Type to search users
                </p>
              ) : searchLoading ? (
                <p className="text-muted-foreground text-center text-sm">
                  Searching...
                </p>
              ) : !searchResults?.results?.length ? (
                <p className="text-muted-foreground text-center text-sm">
                  No users found
                </p>
              ) : (
                <div className="space-y-2">
                  {searchResults.results.map((user) => (
                    <Card
                      key={user.id}
                      className={`cursor-pointer transition-colors ${
                        selectedUser?.id === user.id
                          ? 'border-primary'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedUser(user)}
                    >
                      <CardContent className="flex items-center gap-2 p-3">
                        <User className="h-4 w-4" />
                        <span className="font-medium">{user.name}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="group" className="mt-4">
            <div className="space-y-4">
              <Label>Select group</Label>
              {groups.length === 0 ? (
                <p className="text-muted-foreground text-center text-sm">
                  No groups available
                </p>
              ) : (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <Card
                      key={group.id}
                      className={`cursor-pointer transition-colors ${
                        selectedGroup?.id === group.id
                          ? 'border-primary'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedGroup(group)}
                    >
                      <CardContent className="flex items-center gap-2 p-3">
                        <UsersRound className="h-4 w-4" />
                        <div>
                          <span className="font-medium">{group.name}</span>
                          {group.description && (
                            <p className="text-muted-foreground text-xs">
                              {group.description}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="special" className="mt-4">
            <div className="space-y-4">
              <Label>Select access rule</Label>
              <div className="space-y-2">
                {SPECIAL_SUBJECTS.map((special) => (
                  <Card
                    key={special.id}
                    className={`cursor-pointer transition-colors ${
                      selectedSpecial?.id === special.id
                        ? 'border-primary'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedSpecial(special)}
                  >
                    <CardContent className="flex items-center gap-2 p-3">
                      {special.id === '*' ? (
                        <Globe className="h-4 w-4" />
                      ) : (
                        <Users className="h-4 w-4" />
                      )}
                      <div>
                        <span className="font-medium">{special.name}</span>
                        <p className="text-muted-foreground text-xs">
                          {special.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Access level selector - shown when something is selected */}
        {canAdd && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <p className="text-sm">
              Selected: <span className="font-medium">{getSelectedName()}</span>
            </p>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comment">{LEVEL_LABELS.comment}</SelectItem>
                <SelectItem value="react">{LEVEL_LABELS.react}</SelectItem>
                <SelectItem value="view">{LEVEL_LABELS.view}</SelectItem>
                <SelectItem value="none">{LEVEL_LABELS.none}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!canAdd || isAdding}>
            {isAdding ? 'Adding...' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
