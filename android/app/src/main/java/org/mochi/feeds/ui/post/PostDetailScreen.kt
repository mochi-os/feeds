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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import androidx.hilt.navigation.compose.hiltViewModel
import org.mochi.android.model.Attachment
import org.mochi.android.model.Comment
import org.mochi.android.model.Reaction
import org.mochi.android.model.ReactionCount
import org.mochi.android.model.ReactionType
import org.mochi.android.ui.components.HtmlContent
import org.mochi.android.ui.components.LocationMapView
import org.mochi.android.ui.components.VideoEmbed
import org.mochi.android.ui.components.extractVideos
import org.mochi.android.ui.components.MentionSuggestion
import org.mochi.android.ui.components.MentionTextField
import org.mochi.android.ui.components.ReactionBar
import org.mochi.feeds.model.Permissions
import org.mochi.feeds.model.Post
import org.mochi.feeds.model.Tag

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
                title = { Text("Post", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (permissions.manage) {
                        Box {
                            IconButton(onClick = { showOverflowMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "More options")
                            }
                            DropdownMenu(
                                expanded = showOverflowMenu,
                                onDismissRequest = { showOverflowMenu = false }
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Edit") },
                                    leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) },
                                    onClick = {
                                        showOverflowMenu = false
                                        onEditPost(viewModel.feedId, viewModel.postId)
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("Delete") },
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
                            Text("Retry")
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
                                text = "Comments",
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
            title = { Text("Delete post") },
            text = { Text("Are you sure you want to delete this post? This cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.deletePost { onNavigateBack() }
                    }
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Delete comment dialog
    showDeleteCommentDialog?.let { commentId ->
        AlertDialog(
            onDismissRequest = { showDeleteCommentDialog = null },
            title = { Text("Delete comment") },
            text = { Text("Are you sure you want to delete this comment?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteCommentDialog = null
                        viewModel.deleteComment(commentId)
                    }
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteCommentDialog = null }) {
                    Text("Cancel")
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
            val authorName = post.source?.name?.takeIf { it.isNotEmpty() }
                ?: post.feedName.takeIf { it.isNotEmpty() }
                ?: "Post"
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
                    text = "${memory.yearsAgo} year${if (memory.yearsAgo != 1) "s" else ""} ago today",
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
                    text = "at ${checkin.name}",
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
                        text = "${origin.name} \u2192 ${destination.name}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else if (origin != null) {
                    Text(
                        text = "From ${origin.name}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else if (destination != null) {
                    Text(
                        text = "To ${destination.name}",
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

        // Post body
        if (post.body.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            HtmlContent(
                html = post.body,
                modifier = Modifier.fillMaxWidth()
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
            AttachmentSection(attachments = post.attachments)
        }

        // RSS preview image
        post.data?.rss?.image?.takeIf { it.isNotEmpty() }?.let { imageUrl ->
            Spacer(modifier = Modifier.height(12.dp))
            AsyncImage(
                model = imageUrl,
                contentDescription = "Preview",
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 240.dp)
                    .clip(RoundedCornerShape(8.dp)),
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

        // Tags
        Spacer(modifier = Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Tags",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            if (permissions.manage) {
                IconButton(
                    onClick = onAddTag,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = "Add tag",
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
        if (tags.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                tags.forEach { tag ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        AssistChip(
                            onClick = {
                                if (permissions.manage) onRemoveTag(tag.id)
                            },
                            label = { Text(tag.label, style = MaterialTheme.typography.labelSmall) },
                            trailingIcon = if (permissions.manage) {
                                {
                                    Icon(
                                        Icons.Default.Close,
                                        contentDescription = "Remove",
                                        modifier = Modifier.size(14.dp)
                                    )
                                }
                            } else null
                        )
                        IconButton(
                            onClick = { onAdjustInterest(tag, "up") },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                Icons.Default.ThumbUp,
                                contentDescription = "More like this",
                                modifier = Modifier.size(14.dp)
                            )
                        }
                        IconButton(
                            onClick = { onAdjustInterest(tag, "down") },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                Icons.Default.ThumbDown,
                                contentDescription = "Less like this",
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }
        } else {
            Text(
                text = "No tags",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Spacer(modifier = Modifier.height(8.dp))
        HorizontalDivider()
    }
}

@Composable
private fun AttachmentSection(attachments: List<Attachment>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        attachments.forEach { attachment ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.AttachFile,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = attachment.name,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = formatFileSize(attachment.size),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
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
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = comment.name.ifEmpty { "Anonymous" },
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
                    text = "(edited)",
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
                    Text("Cancel")
                }
                TextButton(onClick = onSaveEdit) {
                    Text("Save")
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
                    text = "${comment.attachments.size} attachment${if (comment.attachments.size != 1) "s" else ""}",
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
                    Text("Reply", style = MaterialTheme.typography.labelSmall)
                }
                if (canManage) {
                    TextButton(onClick = onEdit, modifier = Modifier.height(32.dp)) {
                        Text("Edit", style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(onClick = onDelete, modifier = Modifier.height(32.dp)) {
                        Text(
                            "Delete",
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
                        text = "Replying to comment",
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
                            contentDescription = "Cancel reply",
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            if (attachments.isNotEmpty()) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(attachments) { uri ->
                        AssistChip(
                            onClick = { onRemoveAttachment(uri) },
                            label = {
                                Text(
                                    uri.lastPathSegment?.takeLast(20) ?: "File",
                                    style = MaterialTheme.typography.labelSmall
                                )
                            },
                            trailingIcon = {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = "Remove",
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
                    Icon(Icons.Default.AttachFile, contentDescription = "Attach file")
                }
                MentionTextField(
                    value = text,
                    onValueChange = onTextChange,
                    onSearch = onSearchMembers,
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 4.dp),
                    placeholder = { Text("Write a comment...") },
                    maxLines = 4
                )
                IconButton(
                    onClick = onSend,
                    enabled = text.isNotBlank() && !isSending
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
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
        title = { Text("Add tag") },
        text = {
            OutlinedTextField(
                value = label,
                onValueChange = { label = it },
                label = { Text("Tag label") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(label, null) },
                enabled = label.isNotBlank()
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
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

private fun formatRelativeTime(epochSeconds: Long): String {
    val now = System.currentTimeMillis() / 1000
    val diff = now - epochSeconds
    return when {
        diff < 60 -> "Just now"
        diff < 3600 -> "${diff / 60}m ago"
        diff < 86400 -> "${diff / 3600}h ago"
        diff < 604800 -> "${diff / 86400}d ago"
        else -> formatPostTime(epochSeconds)
    }
}

private fun formatPostTime(epochSeconds: Long): String {
    val date = java.util.Date(epochSeconds * 1000)
    val format = java.text.SimpleDateFormat("d MMM yyyy, HH:mm", java.util.Locale.getDefault())
    return format.format(date)
}

private fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        bytes < 1024 * 1024 * 1024 -> "${"%.1f".format(bytes.toDouble() / (1024 * 1024))} MB"
        else -> "${"%.1f".format(bytes.toDouble() / (1024 * 1024 * 1024))} GB"
    }
}
