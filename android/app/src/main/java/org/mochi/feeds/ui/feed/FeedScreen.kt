package org.mochi.feeds.ui.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import org.mochi.android.model.Comment
import org.mochi.android.model.Reaction
import org.mochi.android.model.ReactionType
import org.mochi.feeds.model.Post
import org.mochi.feeds.model.Tag

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FeedScreen(
    onNavigateToPost: (String, String) -> Unit,
    onNavigateToCreatePost: (String) -> Unit,
    onNavigateToSettings: (String) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: FeedViewModel = hiltViewModel()
) {
    val posts by viewModel.posts.collectAsState()
    val feedInfo by viewModel.feedInfo.collectAsState()
    val permissions by viewModel.permissions.collectAsState()
    val tags by viewModel.tags.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val isRefreshing by viewModel.isRefreshing.collectAsState()
    val isLoadingMore by viewModel.isLoadingMore.collectAsState()
    val hasMore by viewModel.hasMore.collectAsState()
    val error by viewModel.error.collectAsState()
    val currentSort by viewModel.currentSort.collectAsState()
    val currentTag by viewModel.currentTag.collectAsState()
    val unreadOnly by viewModel.unreadOnly.collectAsState()

    var showOverflowMenu by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    // Track visible items for mark-as-read
    LaunchedEffect(listState) {
        snapshotFlow {
            val layoutInfo = listState.layoutInfo
            layoutInfo.visibleItemsInfo.mapNotNull { itemInfo ->
                if (itemInfo.index >= 0 && itemInfo.index < posts.size) {
                    posts[itemInfo.index].id
                } else null
            }.toSet()
        }
            .distinctUntilChanged()
            .collectLatest { visibleIds ->
                if (visibleIds.isNotEmpty()) {
                    viewModel.onPostsVisible(visibleIds)
                }
            }
    }

    // Load more when near the end
    val shouldLoadMore by remember {
        derivedStateOf {
            val layoutInfo = listState.layoutInfo
            val totalItems = layoutInfo.totalItemsCount
            val lastVisibleItem = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisibleItem >= totalItems - 3 && hasMore && !isLoadingMore
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) {
            viewModel.loadMore()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = feedInfo?.name ?: "Feed",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (permissions.manage) {
                        IconButton(onClick = { onNavigateToCreatePost(viewModel.feedId) }) {
                            Icon(Icons.Default.Add, contentDescription = "New post")
                        }
                    }
                    Box {
                        IconButton(onClick = { showOverflowMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "More options")
                        }
                        DropdownMenu(
                            expanded = showOverflowMenu,
                            onDismissRequest = { showOverflowMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Mark all read") },
                                leadingIcon = {
                                    Icon(Icons.Default.DoneAll, contentDescription = null)
                                },
                                onClick = {
                                    viewModel.markAllRead()
                                    showOverflowMenu = false
                                }
                            )
                            if (permissions.manage) {
                                DropdownMenuItem(
                                    text = { Text("Settings") },
                                    leadingIcon = {
                                        Icon(Icons.Default.Settings, contentDescription = null)
                                    },
                                    onClick = {
                                        onNavigateToSettings(viewModel.feedId)
                                        showOverflowMenu = false
                                    }
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                isLoading && posts.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                error != null && posts.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = error!!,
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            TextButton(onClick = { viewModel.loadFeed() }) {
                                Text("Retry")
                            }
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(bottom = 16.dp)
                    ) {
                        // Sort chips
                        item(key = "sort_chips") {
                            SortChips(
                                currentSort = currentSort,
                                onSortChange = { viewModel.setSort(it) },
                                unreadOnly = unreadOnly,
                                onUnreadOnlyChange = { viewModel.setUnreadOnly(it) }
                            )
                        }

                        // Tag filter chips
                        if (tags.isNotEmpty()) {
                            item(key = "tag_chips") {
                                TagFilterChips(
                                    tags = tags,
                                    currentTag = currentTag,
                                    onTagChange = { viewModel.setTagFilter(it) }
                                )
                            }
                        }

                        if (posts.isEmpty() && !isLoading) {
                            item(key = "empty") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(48.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "No posts yet",
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        itemsIndexed(posts, key = { _, post -> post.id }) { _, post ->
                            PostCard(
                                post = post,
                                onClick = { onNavigateToPost(viewModel.feedId, post.id) },
                                onReact = { reaction -> viewModel.reactToPost(post.id, reaction) }
                            )
                        }

                        if (isLoadingMore) {
                            item(key = "loading_more") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SortChips(
    currentSort: String,
    onSortChange: (String) -> Unit,
    unreadOnly: Boolean,
    onUnreadOnlyChange: (Boolean) -> Unit
) {
    val sorts = listOf("interests" to "Interests", "new" to "New", "old" to "Old", "recent" to "Recent")

    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(sorts) { (value, label) ->
            FilterChip(
                selected = currentSort == value,
                onClick = { onSortChange(value) },
                label = { Text(label) }
            )
        }
        item {
            FilterChip(
                selected = unreadOnly,
                onClick = { onUnreadOnlyChange(!unreadOnly) },
                label = { Text("Unread") }
            )
        }
    }
}

@Composable
private fun TagFilterChips(
    tags: List<org.mochi.feeds.model.Tag>,
    currentTag: String?,
    onTagChange: (String?) -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item {
            FilterChip(
                selected = currentTag == null,
                onClick = { onTagChange(null) },
                label = { Text("All") }
            )
        }
        items(tags.take(20)) { tag ->
            FilterChip(
                selected = currentTag == tag.label,
                onClick = {
                    onTagChange(if (currentTag == tag.label) null else tag.label)
                },
                label = { Text(tag.label) }
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostCard(
    post: Post,
    onClick: () -> Unit,
    onReact: (String) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header: source/feed name + time + unread dot
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (post.read == 0L) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                val authorName = post.source?.name?.takeIf { it.isNotEmpty() }
                    ?: post.feedName.takeIf { it.isNotEmpty() }
                    ?: "Post"
                Text(
                    text = authorName,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = formatRelativeTime(post.created),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Memory badge
            post.data?.memory?.let { memory ->
                if (memory.yearsAgo > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "${memory.yearsAgo} year${if (memory.yearsAgo != 1) "s" else ""} ago today",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            // Location info
            post.data?.checkin?.let { checkin ->
                if (checkin.name.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "at ${checkin.name}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            post.data?.travelling?.let { travelling ->
                val origin = travelling.origin?.name ?: ""
                val destination = travelling.destination?.name ?: ""
                if (origin.isNotEmpty() || destination.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    val text = when {
                        origin.isNotEmpty() && destination.isNotEmpty() -> "$origin \u2192 $destination"
                        origin.isNotEmpty() -> "From $origin"
                        else -> "To $destination"
                    }
                    Text(
                        text = text,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Post body (truncated)
            if (post.body.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stripHtml(post.body),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 6,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Attachment preview
            if (post.attachments.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                val imageCount = post.attachments.count { it.isImage }
                val totalCount = post.attachments.size
                val label = when {
                    imageCount == totalCount && imageCount == 1 -> "1 image"
                    imageCount == totalCount -> "$imageCount images"
                    totalCount == 1 -> "1 attachment"
                    else -> "$totalCount attachments"
                }
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            // Source link
            post.source?.let { source ->
                if (source.url.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = source.url.removePrefix("https://").removePrefix("http://").take(50),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // Reactions
            if (post.reactions.isNotEmpty() || post.myReaction.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                ReactionBar(
                    reactions = post.reactions,
                    myReaction = post.myReaction,
                    onReact = onReact
                )
            }

            // Tags
            if (post.tags.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    post.tags.forEach { tag ->
                        AssistChip(
                            onClick = { },
                            label = {
                                Text(
                                    text = tag.label,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                        )
                    }
                }
            }

            // Comment count
            if (post.comments.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                val commentCount = countComments(post.comments)
                Text(
                    text = "$commentCount comment${if (commentCount != 1) "s" else ""}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun ReactionBar(
    reactions: List<org.mochi.android.model.Reaction>,
    myReaction: String,
    onReact: (String) -> Unit
) {
    val counts = reactions
        .groupBy { it.reaction }
        .mapNotNull { (reaction, list) ->
            val type = ReactionType.fromString(reaction) ?: return@mapNotNull null
            Triple(type, list.size, reaction.equals(myReaction, ignoreCase = true))
        }

    LazyRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        items(counts) { (type, count, isMine) ->
            FilterChip(
                selected = isMine,
                onClick = { onReact(type.name.lowercase()) },
                label = {
                    Text("${type.emoji} $count")
                }
            )
        }
    }
}

private fun countComments(comments: List<org.mochi.android.model.Comment>): Int {
    var count = 0
    for (comment in comments) {
        count++
        count += countComments(comment.children)
    }
    return count
}

private fun stripHtml(html: String): String {
    return html
        .replace(Regex("<br\\s*/?>"), "\n")
        .replace(Regex("<[^>]*>"), "")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
}

private fun formatRelativeTime(epochSeconds: Long): String {
    val now = System.currentTimeMillis() / 1000
    val diff = now - epochSeconds
    return when {
        diff < 60 -> "Just now"
        diff < 3600 -> "${diff / 60}m"
        diff < 86400 -> "${diff / 3600}h"
        diff < 604800 -> "${diff / 86400}d"
        diff < 2592000 -> "${diff / 604800}w"
        diff < 31536000 -> "${diff / 2592000}mo"
        else -> "${diff / 31536000}y"
    }
}
