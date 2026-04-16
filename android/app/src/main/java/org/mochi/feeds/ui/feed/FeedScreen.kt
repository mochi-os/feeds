package org.mochi.feeds.ui.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import org.mochi.android.model.Comment
import org.mochi.android.model.Reaction
import org.mochi.android.model.ReactionCount
import org.mochi.android.model.ReactionType
import org.mochi.android.ui.components.HtmlContent
import org.mochi.android.ui.components.ReactionBar
import org.mochi.feeds.model.Post

@OptIn(ExperimentalMaterial3Api::class)
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
    // Track visible post items for mark-as-read (using keys, not indices)
    val postIdSet = remember(posts) { posts.map { it.id }.toSet() }
    LaunchedEffect(listState) {
        snapshotFlow {
            listState.layoutInfo.visibleItemsInfo.mapNotNull { itemInfo ->
                (itemInfo.key as? String)?.takeIf { it in postIdSet }
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
                        // Sort dropdown
                        item(key = "sort_row") {
                            SortDropdown(
                                currentSort = currentSort,
                                onSortChange = { viewModel.setSort(it) },
                                unreadOnly = unreadOnly,
                                onUnreadOnlyChange = { viewModel.setUnreadOnly(it) }
                            )
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
                                onClick = { onNavigateToPost(post.feedFingerprint.ifEmpty { viewModel.feedId }, post.id) },
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
private fun SortDropdown(
    currentSort: String,
    onSortChange: (String) -> Unit,
    unreadOnly: Boolean,
    onUnreadOnlyChange: (Boolean) -> Unit
) {
    val sorts = listOf("interests" to "Interests", "new" to "New", "old" to "Old", "recent" to "Recent")
    val currentLabel = sorts.firstOrNull { it.first == currentSort }?.second ?: "Interests"
    var expanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Box {
            FilterChip(
                selected = true,
                onClick = { expanded = true },
                label = { Text(currentLabel) },
                trailingIcon = {
                    Icon(
                        Icons.Default.ArrowDropDown,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                }
            )
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                sorts.forEach { (value, label) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = {
                            onSortChange(value)
                            expanded = false
                        }
                    )
                }
            }
        }
        FilterChip(
            selected = unreadOnly,
            onClick = { onUnreadOnlyChange(!unreadOnly) },
            label = { Text("Unread") }
        )
    }
}

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
            containerColor = MaterialTheme.colorScheme.surfaceContainer
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(modifier = Modifier.height(IntrinsicSize.Min)) {
        Column(modifier = Modifier.weight(1f).padding(16.dp)) {
            // Header: source/feed name + time
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
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
                HtmlContent(
                    html = post.body,
                    maxLines = 6,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = onClick
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

            // RSS preview image
            post.data?.rss?.image?.takeIf { it.isNotEmpty() }?.let { imageUrl ->
                Spacer(modifier = Modifier.height(8.dp))
                AsyncImage(
                    model = imageUrl,
                    contentDescription = "Preview",
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.FillWidth
                )
            }


            // Reactions
            if (post.reactions.isNotEmpty() || post.myReaction.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                ReactionBar(
                    reactions = toReactionCounts(post.reactions, post.myReaction),
                    onReact = onReact,
                    onRemoveReaction = { onReact(post.myReaction) }
                )
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
            // Unread right border
            if (post.read == 0L) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(3.dp)
                        .background(MaterialTheme.colorScheme.primary)
                )
            }
        }
    }
}

private fun toReactionCounts(reactions: List<Reaction>, myReaction: String): List<ReactionCount> =
    reactions.groupBy { it.reaction }.mapNotNull { (reaction, list) ->
        val type = ReactionType.fromString(reaction) ?: return@mapNotNull null
        ReactionCount(type, list.size, reaction.equals(myReaction, ignoreCase = true))
    }

private fun countComments(comments: List<org.mochi.android.model.Comment>): Int {
    var count = 0
    for (comment in comments) {
        count++
        count += countComments(comment.children)
    }
    return count
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
