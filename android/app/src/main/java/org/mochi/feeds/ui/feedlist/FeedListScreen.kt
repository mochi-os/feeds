package org.mochi.feeds.ui.feedlist

import android.content.Intent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.hilt.navigation.compose.hiltViewModel
import org.mochi.feeds.MainActivity
import org.mochi.feeds.R
import org.mochi.feeds.model.Feed
import org.mochi.android.R as MochiR

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedListScreen(
    onNavigateToFeed: (String) -> Unit,
    onNavigateToCreatePost: () -> Unit,
    onNavigateToFindFeeds: () -> Unit,
    viewModel: FeedListViewModel = hiltViewModel()
) {
    val feeds by viewModel.feeds.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val isRefreshing by viewModel.isRefreshing.collectAsState()
    val error by viewModel.error.collectAsState()
    val showCreateDialog by viewModel.showCreateDialog.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.feeds_title)) },
                actions = {
                    IconButton(onClick = onNavigateToFindFeeds) {
                        Icon(Icons.Default.Search, contentDescription = stringResource(R.string.feeds_find_feeds))
                    }
                    IconButton(onClick = { viewModel.showCreateDialog() }) {
                        Icon(Icons.Default.Add, contentDescription = stringResource(R.string.feeds_create_feed))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToCreatePost) {
                Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.feeds_new_post))
            }
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
                isLoading && feeds.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                error != null && feeds.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = error ?: "An error occurred",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            TextButton(onClick = { viewModel.loadFeeds() }) {
                                Text(stringResource(MochiR.string.common_retry))
                            }
                        }
                    }
                }
                feeds.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = stringResource(R.string.feeds_no_feeds_yet),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            TextButton(onClick = onNavigateToFindFeeds) {
                                Text(stringResource(R.string.feeds_find_feeds_to_subscribe))
                            }
                        }
                    }
                }
                else -> {
                    val totalUnread = feeds.sumOf { it.unread }
                    val allFeedsList = listOf(
                        Feed(id = "__all__", name = stringResource(R.string.feeds_all_feeds), unread = totalUnread, updated = feeds.maxOfOrNull { it.updated } ?: 0)
                    ) + feeds

                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(allFeedsList, key = { it.fingerprint.ifEmpty { it.id } }) { feed ->
                            FeedCard(
                                feed = feed,
                                onClick = {
                                    val id = feed.fingerprint.ifEmpty { feed.id }
                                    if (id.isNotEmpty()) onNavigateToFeed(id)
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateFeedDialog(
            onDismiss = { viewModel.hideCreateDialog() },
            onCreate = { name, privacy, memories -> viewModel.createFeed(name, privacy, memories) },
            viewModel = viewModel
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FeedCard(
    feed: Feed,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    var showMenu by remember { mutableStateOf(false) }
    val feedId = feed.fingerprint.ifEmpty { feed.id }

    Box {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = { showMenu = true }
                ),
            shape = RoundedCornerShape(10.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = feed.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (feed.updated > 0) {
                        Text(
                            text = formatRelativeTime(epochSeconds = feed.updated),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                if (feed.unread > 0) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Badge(
                        containerColor = MaterialTheme.colorScheme.primary
                    ) {
                        Text(
                            text = feed.unread.toString(),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
        }
        DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false }
        ) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.feeds_add_to_home_screen)) },
                onClick = {
                    showMenu = false
                    val intent = Intent(context, MainActivity::class.java).apply {
                        action = Intent.ACTION_VIEW
                        putExtra("entityId", feedId)
                    }
                    val shortcut = ShortcutInfoCompat.Builder(context, "feed_$feedId")
                        .setShortLabel(feed.name)
                        .setLongLabel(feed.name)
                        .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                        .setIntent(intent)
                        .build()
                    ShortcutManagerCompat.requestPinShortcut(context, shortcut, null)
                }
            )
        }
    }
}

@Composable
private fun CreateFeedDialog(
    onDismiss: () -> Unit,
    onCreate: (String, String, Boolean) -> Unit,
    viewModel: FeedListViewModel
) {
    var name by remember { mutableStateOf("") }
    var isPrivate by remember { mutableStateOf(true) }
    var memoriesEnabled by remember { mutableStateOf(false) }
    val isCreating by viewModel.isCreating.collectAsState()
    val createError by viewModel.createError.collectAsState()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feeds_create_feed)) },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.feeds_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(stringResource(R.string.feeds_private))
                    Switch(
                        checked = isPrivate,
                        onCheckedChange = { isPrivate = it }
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(stringResource(R.string.feeds_memories))
                    Switch(
                        checked = memoriesEnabled,
                        onCheckedChange = { memoriesEnabled = it }
                    )
                }
                if (createError != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = createError!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val privacy = if (isPrivate) "private" else "public"
                    onCreate(name, privacy, memoriesEnabled)
                },
                enabled = name.isNotBlank() && !isCreating
            ) {
                if (isCreating) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    Text(stringResource(R.string.feeds_create))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(MochiR.string.common_cancel))
            }
        }
    )
}

@Composable
private fun formatRelativeTime(epochSeconds: Long): String {
    val now = System.currentTimeMillis() / 1000
    val diff = now - epochSeconds
    return when {
        diff < 60 -> stringResource(R.string.feeds_time_just_now)
        diff < 3600 -> stringResource(R.string.feeds_time_minutes_ago, (diff / 60).toInt())
        diff < 86400 -> stringResource(R.string.feeds_time_hours_ago, (diff / 3600).toInt())
        diff < 604800 -> stringResource(R.string.feeds_time_days_ago, (diff / 86400).toInt())
        diff < 2592000 -> stringResource(R.string.feeds_time_weeks_ago, (diff / 604800).toInt())
        diff < 31536000 -> stringResource(R.string.feeds_time_months_ago, (diff / 2592000).toInt())
        else -> stringResource(R.string.feeds_time_years_ago, (diff / 31536000).toInt())
    }
}
