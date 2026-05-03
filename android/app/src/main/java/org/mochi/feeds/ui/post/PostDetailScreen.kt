package org.mochi.feeds.ui.post

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import androidx.hilt.navigation.compose.hiltViewModel
import org.mochi.android.model.Comment
import org.mochi.android.model.Reaction
import org.mochi.android.model.ReactionCount
import org.mochi.android.model.ReactionType
import org.mochi.android.ui.components.AttachmentGallery
import org.mochi.android.ui.components.EntityAvatar
import org.mochi.android.ui.components.HtmlContent
import org.mochi.android.ui.components.LocationMapView
import org.mochi.android.ui.components.VideoEmbed
import org.mochi.android.ui.components.extractVideos
import org.mochi.android.ui.components.MentionSuggestion
import org.mochi.android.ui.components.MentionTextField
import org.mochi.android.ui.components.ReactionBar
import org.mochi.feeds.R
import org.mochi.feeds.model.Permissions
import org.mochi.feeds.model.Post
import org.mochi.feeds.model.Tag
import org.mochi.android.R as MochiR

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PostDetailScreen(
    onNavigateBack: () -> Unit,
    onEditPost: (feedId: String, postId: String) -> Unit,
    viewModel: PostDetailViewModel = hiltViewModel()
) {
    val post by viewModel.post.collectAsState()
    val permissions by viewModel.permissions.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()
    val commentText by viewModel.commentText.collectAsState()
    val commentAttachments by viewModel.commentAttachments.collectAsState()
    val isSendingComment by viewModel.isSendingComment.collectAsState()
    val replyingTo by viewModel.replyingTo.collectAsState()
    val editingCommentId by viewModel.editingCommentId.collectAsState()
    val editCommentText by viewModel.editCommentText.collectAsState()
    val tags by viewModel.tags.collectAsState()
    val actionError by viewModel.actionError.collectAsState()

    var showOverflowMenu by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showDeleteCommentDialog by remember { mutableStateOf<String?>(null) }
    var showAddTagDialog by remember { mutableStateOf(false) }

    val snackbarHostState = remember { SnackbarHostState() }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        uris.forEach { viewModel.addCommentAttachment(it) }
    }

    LaunchedEffect(actionError) {
        actionError?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearActionError()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.feeds_post), maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(MochiR.string.common_back))
                    }
                },
                actions = {
                    if (permissions.manage) {
                        Box {
                            IconButton(onClick = { showOverflowMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = stringResource(MochiR.string.common_more_options))
                            }
                            DropdownMenu(
                                expanded = showOverflowMenu,
                                onDismissRequest = { showOverflowMenu = false }
                            ) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(MochiR.string.common_edit)) },
                                    leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) },
                                    onClick = {
                                        showOverflowMenu = false
                                        onEditPost(viewModel.feedId, viewModel.postId)
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(stringResource(MochiR.string.common_delete)) },
                                    leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null) },
                                    onClick = {
                                        showOverflowMenu = false
                                        showDeleteDialog = true
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
        },
        bottomBar = {
            if (permissions.comment) {
                CommentInputBar(
                    text = commentText,
                    onTextChange = { viewModel.setCommentText(it) },
                    attachments = commentAttachments,
                    onAddAttachment = { filePickerLauncher.launch("*/*") },
                    onRemoveAttachment = { viewModel.removeCommentAttachment(it) },
                    onSend = { viewModel.sendComment() },
                    isSending = isSendingComment,
                    replyingTo = replyingTo,
                    onCancelReply = { viewModel.setReplyingTo(null) },
                    onSearchMembers = { viewModel.searchMembers(it) }
                )
            }
        }
    ) { paddingValues ->
        when {
            isLoading && post == null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            error != null && post == null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = error!!,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        TextButton(onClick = { viewModel.loadPost() }) {
                            Text(stringResource(MochiR.string.common_retry))
                        }
                    }
                }
            }
            post != null -> {
                val currentPost = post!!

                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentPadding = PaddingValues(bottom = 16.dp)
                ) {
                    // Post content
                    item(key = "post_content") {
                        PostContent(
                            post = currentPost,
                            tags = tags,
                            permissions = permissions,
                            serverUrl = viewModel.serverUrl,
                            feedId = viewModel.feedId,
                            onReact = { viewModel.reactToPost(it) },
                            onAddTag = { showAddTagDialog = true },
                            onRemoveTag = { viewModel.removeTag(it) },
                            onAdjustInterest = { tag, direction -> viewModel.adjustInterest(tag, direction) }
                        )
                    }

                    // Comments section
                    if (currentPost.comments.isNotEmpty()) {
                        item(key = "comments_header") {
                            Text(
                                text = stringResource(R.string.feeds_comments),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
                            )
                        }

                        val flatComments = flattenComments(currentPost.comments, 0)
                        items(flatComments.size, key = { flatComments[it].first.id }) { index ->
                            val (comment, depth) = flatComments[index]
                            CommentItem(
                                comment = comment,
                                depth = depth,
                                avatarUrl = "${viewModel.serverUrl}/feeds/${viewModel.feedId}/-/${viewModel.postId}/${comment.id}/asset/avatar",
                                isEditing = editingCommentId == comment.id,
                                editText = if (editingCommentId == comment.id) editCommentText else "",
                                onEditTextChange = { viewModel.setEditCommentText(it) },
                                onSaveEdit = { viewModel.saveEditComment() },
                                onCancelEdit = { viewModel.cancelEditComment() },
                                onReply = { viewModel.setReplyingTo(comment.id) },
                                onEdit = { viewModel.startEditComment(comment.id, stripHtml(comment.body)) },
                                onDelete = { showDeleteCommentDialog = comment.id },
                                onReact = { reaction -> viewModel.reactToComment(comment.id, reaction) },
                                canManage = permissions.manage
                            )
                        }
                    }
                }
            }
        }
    }

    // Delete post dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.feeds_delete_post)) },
            text = { Text(stringResource(R.string.feeds_delete_post_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.deletePost { onNavigateBack() }
                    }
                ) {
                    Text(stringResource(MochiR.string.common_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(MochiR.string.common_cancel))
                }
            }
        )
    }

    // Delete comment dialog
    showDeleteCommentDialog?.let { commentId ->
        AlertDialog(
            onDismissRequest = { showDeleteCommentDialog = null },
            title = { Text(stringResource(R.string.feeds_delete_comment)) },
            text = { Text(stringResource(R.string.feeds_delete_comment_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteCommentDialog = null
                        viewModel.deleteComment(commentId)
                    }
                ) {
                    Text(stringResource(MochiR.string.common_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteCommentDialog = null }) {
                    Text(stringResource(MochiR.string.common_cancel))
                }
            }
        )
    }

    // Add tag dialog
    if (showAddTagDialog) {
        AddTagDialog(
            onDismiss = { showAddTagDialog = false },
            onAdd = { label, qid ->
                viewModel.addTag(label, qid)
                showAddTagDialog = false
            }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PostContent(
    post: Post,
    tags: List<Tag>,
    permissions: Permissions,
    serverUrl: String,
    feedId: String,
    onReact: (String) -> Unit,
    onAddTag: () -> Unit,
    onRemoveTag: (String) -> Unit,
    onAdjustInterest: (Tag, String) -> Unit
) {
    val context = LocalContext.current

    Column(modifier = Modifier.padding(16.dp)) {
        // Author/source + time
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
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = formatPostTime(post.created),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // Memory badge
        post.data?.memory?.let { memory ->
            if (memory.yearsAgo > 0) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = pluralStringResource(R.plurals.feeds_memory_years_ago_today, memory.yearsAgo, memory.yearsAgo),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        // Location
        post.data?.checkin?.let { checkin ->
            if (checkin.name.isNotEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = stringResource(R.string.feeds_location_at, checkin.name),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (checkin.city.isNotEmpty() || checkin.country.isNotEmpty()) {
                    Text(
                        text = listOfNotNull(
                            checkin.city.takeIf { it.isNotEmpty() },
                            checkin.state.takeIf { it.isNotEmpty() },
                            checkin.country.takeIf { it.isNotEmpty() }
                        ).joinToString(", "),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        post.data?.travelling?.let { travelling ->
            val origin = travelling.origin
            val destination = travelling.destination
            if (origin != null || destination != null) {
                Spacer(modifier = Modifier.height(4.dp))
                if (origin != null && destination != null) {
                    Text(
                        text = stringResource(R.string.feeds_travel_arrow, origin.name, destination.name),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else if (origin != null) {
                    Text(
                        text = stringResource(R.string.feeds_travel_from, origin.name),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else if (destination != null) {
                    Text(
                        text = stringResource(R.string.feeds_travel_to, destination.name),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Location map
        val checkinWithCoords = post.data?.checkin?.takeIf { it.lat != 0.0 || it.lon != 0.0 }
        val travellingWithCoords = post.data?.travelling?.takeIf {
            (it.origin?.lat != 0.0 || it.origin?.lon != 0.0) &&
                (it.destination?.lat != 0.0 || it.destination?.lon != 0.0)
        }
        if (checkinWithCoords != null || travellingWithCoords != null) {
            Spacer(modifier = Modifier.height(8.dp))
            LocationMapView(
                checkin = checkinWithCoords,
                origin = travellingWithCoords?.origin,
                destination = travellingWithCoords?.destination
            )
        }

        // Post body. For RSS-source posts, taps open the original article.
        val sourceArticleUrl = post.data?.rss?.link?.takeIf { it.isNotEmpty() }
        val onBodyClick: (() -> Unit)? = sourceArticleUrl?.let { url ->
            {
                try {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                } catch (_: Exception) { /* invalid URL */ }
            }
        }
        if (post.body.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            HtmlContent(
                html = post.body,
                modifier = Modifier.fillMaxWidth(),
                onClick = onBodyClick
            )
        }

        // Embedded videos
        val videos = remember(post.body) { extractVideos(post.body) }
        videos.forEach { video ->
            Spacer(modifier = Modifier.height(8.dp))
            VideoEmbed(video = video)
        }

        // Attachments
        if (post.attachments.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            val attachmentFeed = post.feed.ifEmpty { feedId }
            AttachmentGallery(
                attachments = post.attachments,
                urlBuilder = { att ->
                    att.url ?: "$serverUrl/feeds/$attachmentFeed/-/attachments/${att.id}"
                },
                thumbnailUrlBuilder = { att ->
                    att.thumbnailUrl ?: "$serverUrl/feeds/$attachmentFeed/-/attachments/${att.id}/thumbnail"
                }
            )
        }

        // RSS preview image. Tapping opens the source article when present.
        post.data?.rss?.image?.takeIf { it.isNotEmpty() }?.let { imageUrl ->
            Spacer(modifier = Modifier.height(12.dp))
            AsyncImage(
                model = imageUrl,
                contentDescription = stringResource(R.string.feeds_image_preview),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 240.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .let { mod -> if (onBodyClick != null) mod.clickable(onClick = onBodyClick) else mod },
                contentScale = ContentScale.Crop
            )
        }

        // Source link
        post.source?.let { source ->
            if (source.url.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = source.url,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable {
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(source.url))
                            context.startActivity(intent)
                        } catch (_: Exception) {
                            // Invalid URL
                        }
                    }
                )
            }
        }

        // Reactions
        Spacer(modifier = Modifier.height(12.dp))
        ReactionBar(
            reactions = toReactionCounts(post.reactions, post.myReaction),
            onReact = onReact,
            onRemoveReaction = { onReact(post.myReaction) }
        )

        Spacer(modifier = Modifier.height(8.dp))
        HorizontalDivider()
    }
}

private fun toReactionCounts(reactions: List<Reaction>, myReaction: String): List<ReactionCount> =
    reactions.groupBy { it.reaction }.mapNotNull { (reaction, list) ->
        val type = ReactionType.fromString(reaction) ?: return@mapNotNull null
        ReactionCount(type, list.size, reaction.equals(myReaction, ignoreCase = true))
    }

@Composable
private fun CommentItem(
    comment: Comment,
    depth: Int,
    avatarUrl: String,
    isEditing: Boolean,
    editText: String,
    onEditTextChange: (String) -> Unit,
    onSaveEdit: () -> Unit,
    onCancelEdit: () -> Unit,
    onReply: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onReact: (String) -> Unit,
    canManage: Boolean
) {
    val startPadding = (16 + depth * 24).coerceAtMost(96).dp

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = startPadding, end = 16.dp, top = 8.dp, bottom = 8.dp)
    ) {
        // Comment header
        val anonymous = stringResource(R.string.feeds_anonymous)
        Row(verticalAlignment = Alignment.CenterVertically) {
            EntityAvatar(
                name = comment.name.ifEmpty { anonymous },
                src = avatarUrl,
                seed = comment.author,
                size = 20.dp,
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = comment.name.ifEmpty { anonymous },
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = formatRelativeTime(comment.created),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (comment.edited > 0) {
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = stringResource(MochiR.string.comment_edited),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(4.dp))

        if (isEditing) {
            OutlinedTextField(
                value = editText,
                onValueChange = onEditTextChange,
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                TextButton(onClick = onCancelEdit) {
                    Text(stringResource(MochiR.string.common_cancel))
                }
                TextButton(onClick = onSaveEdit) {
                    Text(stringResource(MochiR.string.common_save))
                }
            }
        } else {
            // Comment body
            HtmlContent(
                html = comment.body,
                modifier = Modifier.fillMaxWidth()
            )

            // Comment attachments
            if (comment.attachments.isNotEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = pluralStringResource(R.plurals.feeds_attachment_count, comment.attachments.size, comment.attachments.size),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            // Reactions on comment
            if (comment.reactions.isNotEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                ReactionBar(
                    reactions = toReactionCounts(comment.reactions, comment.myReaction),
                    onReact = onReact,
                    onRemoveReaction = { onReact(comment.myReaction) }
                )
            }

            // Comment actions
            Row {
                TextButton(onClick = onReply, modifier = Modifier.height(32.dp)) {
                    Text(stringResource(MochiR.string.comment_reply), style = MaterialTheme.typography.labelSmall)
                }
                if (canManage) {
                    TextButton(onClick = onEdit, modifier = Modifier.height(32.dp)) {
                        Text(stringResource(MochiR.string.common_edit), style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(onClick = onDelete, modifier = Modifier.height(32.dp)) {
                        Text(
                            stringResource(MochiR.string.common_delete),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CommentInputBar(
    text: String,
    onTextChange: (String) -> Unit,
    attachments: List<Uri>,
    onAddAttachment: () -> Unit,
    onRemoveAttachment: (Uri) -> Unit,
    onSend: () -> Unit,
    isSending: Boolean,
    replyingTo: String?,
    onCancelReply: () -> Unit,
    onSearchMembers: suspend (String) -> List<MentionSuggestion>
) {
    Surface(
        shadowElevation = 8.dp,
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
        ) {
            if (replyingTo != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.feeds_replying_to_comment),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(
                        onClick = onCancelReply,
                        modifier = Modifier.size(24.dp)
                    ) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = stringResource(R.string.feeds_cancel_reply),
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            if (attachments.isNotEmpty()) {
                val fileLabel = stringResource(R.string.feeds_file)
                val removeLabel = stringResource(R.string.feeds_remove)
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(attachments) { uri ->
                        AssistChip(
                            onClick = { onRemoveAttachment(uri) },
                            label = {
                                Text(
                                    uri.lastPathSegment?.takeLast(20) ?: fileLabel,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            },
                            trailingIcon = {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = removeLabel,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        )
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                IconButton(onClick = onAddAttachment) {
                    Icon(Icons.Default.AttachFile, contentDescription = stringResource(R.string.feeds_attach_file))
                }
                MentionTextField(
                    value = text,
                    onValueChange = onTextChange,
                    onSearch = onSearchMembers,
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 4.dp),
                    placeholder = { Text(stringResource(R.string.feeds_write_a_comment)) },
                    maxLines = 4
                )
                IconButton(
                    onClick = onSend,
                    enabled = text.isNotBlank() && !isSending
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.feeds_send))
                    }
                }
            }
        }
    }
}

@Composable
private fun AddTagDialog(
    onDismiss: () -> Unit,
    onAdd: (String, String?) -> Unit
) {
    var label by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feeds_add_tag)) },
        text = {
            OutlinedTextField(
                value = label,
                onValueChange = { label = it },
                label = { Text(stringResource(R.string.feeds_tag_label)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(label, null) },
                enabled = label.isNotBlank()
            ) {
                Text(stringResource(MochiR.string.common_add))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(MochiR.string.common_cancel))
            }
        }
    )
}

private fun flattenComments(comments: List<Comment>, depth: Int): List<Pair<Comment, Int>> {
    val result = mutableListOf<Pair<Comment, Int>>()
    for (comment in comments) {
        result.add(comment to depth)
        result.addAll(flattenComments(comment.children, depth + 1))
    }
    return result
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

@Composable
private fun formatRelativeTime(epochSeconds: Long): String {
    val now = System.currentTimeMillis() / 1000
    val diff = now - epochSeconds
    return when {
        diff < 60 -> stringResource(R.string.feeds_time_just_now)
        diff < 3600 -> stringResource(R.string.feeds_time_minutes_ago, (diff / 60).toInt())
        diff < 86400 -> stringResource(R.string.feeds_time_hours_ago, (diff / 3600).toInt())
        diff < 604800 -> stringResource(R.string.feeds_time_days_ago, (diff / 86400).toInt())
        else -> formatPostTime(epochSeconds)
    }
}

private fun formatPostTime(epochSeconds: Long): String {
    val date = java.util.Date(epochSeconds * 1000)
    val format = java.text.SimpleDateFormat("d MMM yyyy, HH:mm", java.util.Locale.getDefault())
    return format.format(date)
}
