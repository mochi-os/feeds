package org.mochi.feeds.ui.feed

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import org.mochi.android.i18n.LocalFormat
import org.mochi.android.i18n.formatRelativeTime
import org.mochi.android.model.Comment
import org.mochi.android.model.Reaction
import org.mochi.android.model.ReactionCount
import org.mochi.android.model.ReactionType
import org.mochi.android.ui.components.HtmlContent
import org.mochi.android.ui.components.MediaGrid
import org.mochi.android.ui.components.ReactionBar
import org.mochi.feeds.R
import org.mochi.feeds.model.Post
import org.mochi.android.R as MochiR

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    onNavigateToPost: (String, String) -> Unit,
    onNavigateToCreatePost: (String) -> Unit,
    onNavigateToEditPost: (String, String) -> Unit,
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
    var pendingDelete by remember { mutableStateOf<Post?>(null) }
    val listState = rememberLazyListState()

    // Mark a post as read after its bottom edge has been continuously
    // visible for 1 second — i.e. the user actually scrolled past the
    // whole post. Per-post timers, not a debounced batch.
    LaunchedEffect(listState) {
        val timers = mutableMapOf<String, Job>()
        snapshotFlow {
            val knownIds = viewModel.posts.value.mapTo(HashSet()) { it.id }
            val viewportEnd = listState.layoutInfo.viewportEndOffset
            listState.layoutInfo.visibleItemsInfo
                .filter {
                    val key = it.key as? String ?: return@filter false
                    key in knownIds && (it.offset + it.size) <= viewportEnd
                }
                .mapNotNull { it.key as? String }
                .toSet()
        }
            .distinctUntilChanged()
            .collectLatest { bottomVisible ->
                (timers.keys - bottomVisible).forEach { id ->
                    timers.remove(id)?.cancel()
                }
                (bottomVisible - timers.keys).forEach { id ->
                    timers[id] = launch {
                        delay(1000)
                        viewModel.onPostBottomViewed(id)
                        timers.remove(id)
                    }
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
                        text = feedInfo?.name ?: stringResource(R.string.feeds_feed_title_default),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(MochiR.string.common_back))
                    }
                },
                actions = {
                    if (permissions.manage) {
                        IconButton(onClick = { onNavigateToCreatePost(viewModel.feedId) }) {
                            Icon(Icons.Default.Add, contentDescription = stringResource(R.string.feeds_new_post))
                        }
                    }
                    Box {
                        IconButton(onClick = { showOverflowMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = stringResource(MochiR.string.common_more_options))
                        }
                        DropdownMenu(
                            expanded = showOverflowMenu,
                            onDismissRequest = { showOverflowMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.feeds_mark_all_read)) },
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
                                    text = { Text(stringResource(R.string.feeds_settings)) },
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
                                Text(stringResource(MochiR.string.common_retry))
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
                                onUnreadOnlyChange = { viewModel.setUnreadOnly(it) },
                                onMarkAllRead = { viewModel.markAllRead() }
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
                                        text = stringResource(R.string.feeds_no_posts_yet),
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        itemsIndexed(posts, key = { _, post -> post.id }) { _, post ->
                            val routeFeedId = post.feedFingerprint.ifEmpty { viewModel.feedId }
                            PostCard(
                                post = post,
                                serverUrl = viewModel.serverUrl,
                                fallbackFeedId = viewModel.feedId,
                                canManage = permissions.manage,
                                onClick = { onNavigateToPost(routeFeedId, post.id) },
                                onReact = { reaction -> viewModel.reactToPost(post.id, reaction) },
                                onEdit = { onNavigateToEditPost(routeFeedId, post.id) },
                                onDelete = { pendingDelete = post }
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

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.feeds_delete_post)) },
            text = { Text(stringResource(R.string.feeds_delete_post_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deletePost(target.id)
                        pendingDelete = null
                    }
                ) {
                    Text(
                        stringResource(MochiR.string.common_delete),
                        color = MaterialTheme.colorScheme.error
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) {
                    Text(stringResource(MochiR.string.common_cancel))
                }
            }
        )
    }
}

@Composable
private fun SortDropdown(
    currentSort: String,
    onSortChange: (String) -> Unit,
    unreadOnly: Boolean,
    onUnreadOnlyChange: (Boolean) -> Unit,
    onMarkAllRead: () -> Unit
) {
    val sorts = listOf(
        "ai" to stringResource(R.string.feeds_sort_ai),
        "interests" to stringResource(R.string.feeds_sort_interests),
        "new" to stringResource(R.string.feeds_sort_new),
        "hot" to stringResource(R.string.feeds_sort_hot),
        "top" to stringResource(R.string.feeds_sort_top),
    )
    val currentLabel = sorts.firstOrNull { it.first == currentSort }?.second
        ?: stringResource(R.string.feeds_sort_interests)
    var sortExpanded by remember { mutableStateOf(false) }
    var readExpanded by remember { mutableStateOf(false) }
    val readLabel = stringResource(if (unreadOnly) R.string.feeds_unread else R.string.feeds_filter_all)

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
                onClick = { sortExpanded = true },
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
                expanded = sortExpanded,
                onDismissRequest = { sortExpanded = false }
            ) {
                sorts.forEach { (value, label) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = {
                            onSortChange(value)
                            sortExpanded = false
                        }
                    )
                }
            }
        }
        Box {
            FilterChip(
                selected = true,
                onClick = { readExpanded = true },
                label = { Text(readLabel) },
                trailingIcon = {
                    Icon(
                        Icons.Default.ArrowDropDown,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                }
            )
            DropdownMenu(
                expanded = readExpanded,
                onDismissRequest = { readExpanded = false }
            ) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.feeds_filter_all)) },
                    onClick = {
                        onUnreadOnlyChange(false)
                        readExpanded = false
                    }
                )
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.feeds_unread)) },
                    onClick = {
                        onUnreadOnlyChange(true)
                        readExpanded = false
                    }
                )
                HorizontalDivider()
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.feeds_mark_all_read)) },
                    onClick = {
                        onMarkAllRead()
                        readExpanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun PostCard(
    post: Post,
    serverUrl: String,
    fallbackFeedId: String,
    canManage: Boolean,
    onClick: () -> Unit,
    onReact: (String) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
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
            // Unread left border
            if (post.read == 0L) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(3.dp)
                        .background(MaterialTheme.colorScheme.primary)
                )
            }
        Column(modifier = Modifier.weight(1f).padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 16.dp)) {
            // Header: source/feed name + time + overflow menu
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val defaultAuthor = stringResource(R.string.feeds_post_default_author)
                val authorName = post.source?.name?.takeIf { it.isNotEmpty() }
                    ?: post.feedName.takeIf { it.isNotEmpty() }
                    ?: defaultAuthor
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
                    text = LocalFormat.current.formatRelativeTime(post.created),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Memory badge
            post.data?.memory?.let { memory ->
                if (memory.yearsAgo > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = pluralStringResource(R.plurals.feeds_memory_years_ago_today, memory.yearsAgo, memory.yearsAgo),
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
                        text = stringResource(R.string.feeds_location_at, checkin.name),
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
                        origin.isNotEmpty() && destination.isNotEmpty() ->
                            stringResource(R.string.feeds_travel_arrow, origin, destination)
                        origin.isNotEmpty() ->
                            stringResource(R.string.feeds_travel_from, origin)
                        else ->
                            stringResource(R.string.feeds_travel_to, destination)
                    }
                    Text(
                        text = text,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Post body (truncated). Taps open detail.
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
                val images = post.attachments.filter { it.isImage }
                val others = post.attachments.filter { !it.isImage }
                val attachmentFeed = post.feed.ifEmpty { fallbackFeedId }
                if (images.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    MediaGrid(
                        urls = images.map { att ->
                            att.url ?: "$serverUrl/feeds/$attachmentFeed/-/attachments/${att.id}"
                        },
                        thumbnailUrls = images.map { att ->
                            att.thumbnailUrl ?: "$serverUrl/feeds/$attachmentFeed/-/attachments/${att.id}/thumbnail"
                        },
                        contentDescriptions = images.map { it.name },
                        onClick = { onClick() }
                    )
                }
                if (others.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = pluralStringResource(R.plurals.feeds_attachment_count, others.size, others.size),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            // RSS preview image. Tapping opens detail.
            post.data?.rss?.image?.takeIf { it.isNotEmpty() }?.let { imageUrl ->
                Spacer(modifier = Modifier.height(8.dp))
                AsyncImage(
                    model = imageUrl,
                    contentDescription = stringResource(R.string.feeds_image_preview),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(onClick = onClick),
                    contentScale = ContentScale.FillWidth
                )
            }


            // Action row: reactions on the left, edit/delete icons on the
            // right when the user can manage. Mirrors the web layout where
            // these icons live inline at the bottom of each post card.
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ReactionBar(
                    reactions = toReactionCounts(post.reactions, post.myReaction),
                    onReact = onReact,
                    onRemoveReaction = { onReact(post.myReaction) },
                    modifier = Modifier.weight(1f)
                )
                if (canManage) {
                    IconButton(onClick = onEdit, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Default.Edit,
                            contentDescription = stringResource(MochiR.string.common_edit),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = stringResource(MochiR.string.common_delete),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Inline comments preview (top-level only, newest first)
            if (post.comments.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                val previewLimit = 3
                val previewed = post.comments.take(previewLimit)
                val remaining = post.comments.size - previewed.size
                val anonymous = stringResource(R.string.feeds_anonymous)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (comment in previewed) {
                        CommentPreviewLine(
                            comment = comment,
                            anonymous = anonymous
                        )
                    }
                    if (remaining > 0) {
                        Text(
                            text = pluralStringResource(R.plurals.feeds_view_more_comments, remaining, remaining),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.clickable(onClick = onClick)
                        )
                    }
                }
            }
        }
        }
    }
}

@Composable
private fun CommentPreviewLine(
    comment: Comment,
    anonymous: String
) {
    val displayName = comment.name.ifEmpty { anonymous }
    val plain = stripCommentHtml(comment.body)
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = displayName,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = plain,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = formatRelativeTime(comment.created),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}


private fun stripCommentHtml(html: String): String =
    html
        .replace(Regex("<br\\s*/?>"), " ")
        .replace(Regex("<[^>]*>"), "")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .replace(Regex("\\s+"), " ")
        .trim()

private fun toReactionCounts(reactions: List<Reaction>, myReaction: String): List<ReactionCount> =
    reactions.groupBy { it.reaction }.mapNotNull { (reaction, list) ->
        val type = ReactionType.fromString(reaction) ?: return@mapNotNull null
        ReactionCount(type, list.size, reaction.equals(myReaction, ignoreCase = true))
    }

@Composable
private fun formatRelativeTime(epochSeconds: Long): String {
    val now = System.currentTimeMillis() / 1000
    val diff = now - epochSeconds
    return when {
        diff < 60 -> stringResource(R.string.feeds_time_just_now)
        diff < 3600 -> stringResource(R.string.feeds_time_minutes_short, (diff / 60).toInt())
        diff < 86400 -> stringResource(R.string.feeds_time_hours_short, (diff / 3600).toInt())
        diff < 604800 -> stringResource(R.string.feeds_time_days_short, (diff / 86400).toInt())
        diff < 2592000 -> stringResource(R.string.feeds_time_weeks_short, (diff / 604800).toInt())
        diff < 31536000 -> stringResource(R.string.feeds_time_months_short, (diff / 2592000).toInt())
        else -> stringResource(R.string.feeds_time_years_short, (diff / 31536000).toInt())
    }
}
