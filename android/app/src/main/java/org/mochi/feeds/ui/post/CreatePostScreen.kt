package org.mochi.feeds.ui.post

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.mochi.android.model.PlaceData
import org.mochi.android.ui.components.MentionTextField
import org.mochi.feeds.model.Feed

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CreatePostScreen(
    onNavigateBack: () -> Unit,
    viewModel: CreatePostViewModel = hiltViewModel()
) {
    val availableFeeds by viewModel.availableFeeds.collectAsState()
    val selectedFeed by viewModel.selectedFeed.collectAsState()
    val body by viewModel.body.collectAsState()
    val attachments by viewModel.attachments.collectAsState()
    val existingAttachments by viewModel.existingAttachments.collectAsState()
    val removedExistingIds by viewModel.removedExistingIds.collectAsState()
    val checkin by viewModel.checkin.collectAsState()
    val travellingOrigin by viewModel.travellingOrigin.collectAsState()
    val travellingDestination by viewModel.travellingDestination.collectAsState()
    val isPosting by viewModel.isPosting.collectAsState()
    val isLoadingFeeds by viewModel.isLoadingFeeds.collectAsState()
    val error by viewModel.error.collectAsState()
    val postSuccess by viewModel.postSuccess.collectAsState()
    val isEditing = viewModel.isEditing

    var showLocationSection by remember { mutableStateOf(false) }
    var feedDropdownExpanded by remember { mutableStateOf(false) }

    val snackbarHostState = remember { SnackbarHostState() }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        viewModel.addAttachments(uris)
    }

    LaunchedEffect(postSuccess) {
        if (postSuccess) {
            onNavigateBack()
        }
    }

    LaunchedEffect(error) {
        error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(if (isEditing) "Edit post" else "New post") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(
                        onClick = { viewModel.createPost() },
                        enabled = !isPosting
                    ) {
                        if (isPosting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(if (isEditing) "Save" else "Post")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Feed selector (hidden in edit mode — can't change feed of existing post)
            if (!isEditing && (selectedFeed.isEmpty() || availableFeeds.size > 1)) {
                ExposedDropdownMenuBox(
                    expanded = feedDropdownExpanded,
                    onExpandedChange = { feedDropdownExpanded = it }
                ) {
                    val selectedFeedName = availableFeeds
                        .find { it.fingerprint == selectedFeed || it.id == selectedFeed }
                        ?.name ?: "Select a feed"

                    OutlinedTextField(
                        value = selectedFeedName,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Feed") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = feedDropdownExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    )

                    ExposedDropdownMenu(
                        expanded = feedDropdownExpanded,
                        onDismissRequest = { feedDropdownExpanded = false }
                    ) {
                        if (isLoadingFeeds) {
                            DropdownMenuItem(
                                text = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Loading feeds...")
                                    }
                                },
                                onClick = {}
                            )
                        } else {
                            availableFeeds.forEach { feed ->
                                DropdownMenuItem(
                                    text = { Text(feed.name) },
                                    onClick = {
                                        viewModel.setSelectedFeed(feed.fingerprint.ifEmpty { feed.id })
                                        feedDropdownExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            // Body text area
            MentionTextField(
                value = body,
                onValueChange = { viewModel.setBody(it) },
                onSearch = { viewModel.searchMembers(it) },
                label = { Text("What's on your mind?") },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
                maxLines = 20
            )
            Spacer(modifier = Modifier.height(16.dp))

            // Attachments
            Row(verticalAlignment = Alignment.CenterVertically) {
                Button(
                    onClick = { filePickerLauncher.launch("*/*") },
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Add files")
                }
            }

            if (existingAttachments.isNotEmpty() || attachments.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    existingAttachments.forEach { attachment ->
                        val isRemoved = attachment.id in removedExistingIds
                        FilterChip(
                            selected = !isRemoved,
                            onClick = { viewModel.toggleRemoveExistingAttachment(attachment.id) },
                            label = {
                                Text(
                                    attachment.name.takeLast(25),
                                    style = MaterialTheme.typography.labelSmall
                                )
                            },
                            trailingIcon = {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = if (isRemoved) "Restore" else "Remove",
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        )
                    }
                    attachments.forEachIndexed { index, uri ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (attachments.size > 1) {
                                Column {
                                    if (index > 0) {
                                        IconButton(
                                            onClick = { viewModel.moveAttachment(uri, -1) },
                                            modifier = Modifier.size(20.dp)
                                        ) {
                                            Icon(Icons.Default.ExpandLess, contentDescription = "Move up", modifier = Modifier.size(14.dp))
                                        }
                                    }
                                    if (index < attachments.lastIndex) {
                                        IconButton(
                                            onClick = { viewModel.moveAttachment(uri, 1) },
                                            modifier = Modifier.size(20.dp)
                                        ) {
                                            Icon(Icons.Default.ExpandMore, contentDescription = "Move down", modifier = Modifier.size(14.dp))
                                        }
                                    }
                                }
                            }
                            AssistChip(
                                onClick = { viewModel.removeAttachment(uri) },
                                label = {
                                    Text(
                                        uri.lastPathSegment?.takeLast(25) ?: "File",
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
            }

            // Location section
            Spacer(modifier = Modifier.height(16.dp))
            TextButton(
                onClick = { showLocationSection = !showLocationSection }
            ) {
                Icon(
                    Icons.Default.LocationOn,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text("Location")
                Spacer(modifier = Modifier.width(4.dp))
                Icon(
                    if (showLocationSection) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
            }

            if (showLocationSection) {
                LocationSection(
                    checkin = checkin,
                    travellingOrigin = travellingOrigin,
                    travellingDestination = travellingDestination,
                    onCheckinChange = { viewModel.setCheckin(it) },
                    onTravellingOriginChange = { viewModel.setTravellingOrigin(it) },
                    onTravellingDestinationChange = { viewModel.setTravellingDestination(it) },
                    onClear = { viewModel.clearLocation() }
                )
            }
        }
    }
}

@Composable
private fun LocationSection(
    checkin: PlaceData?,
    travellingOrigin: PlaceData?,
    travellingDestination: PlaceData?,
    onCheckinChange: (PlaceData?) -> Unit,
    onTravellingOriginChange: (PlaceData?) -> Unit,
    onTravellingDestinationChange: (PlaceData?) -> Unit,
    onClear: () -> Unit
) {
    var locationMode by remember { mutableStateOf("none") }
    var checkinName by remember { mutableStateOf(checkin?.name ?: "") }
    var originName by remember { mutableStateOf(travellingOrigin?.name ?: "") }
    var destinationName by remember { mutableStateOf(travellingDestination?.name ?: "") }

    Column(modifier = Modifier.padding(start = 16.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = locationMode == "checkin",
                onClick = {
                    locationMode = if (locationMode == "checkin") "none" else "checkin"
                    if (locationMode == "none") onClear()
                },
                label = { Text("Check in") }
            )
            FilterChip(
                selected = locationMode == "travelling",
                onClick = {
                    locationMode = if (locationMode == "travelling") "none" else "travelling"
                    if (locationMode == "none") onClear()
                },
                label = { Text("Travelling") }
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        when (locationMode) {
            "checkin" -> {
                OutlinedTextField(
                    value = checkinName,
                    onValueChange = {
                        checkinName = it
                        if (it.isNotBlank()) {
                            onCheckinChange(PlaceData(name = it))
                        } else {
                            onCheckinChange(null)
                        }
                    },
                    label = { Text("Place name") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
            "travelling" -> {
                OutlinedTextField(
                    value = originName,
                    onValueChange = {
                        originName = it
                        if (it.isNotBlank()) {
                            onTravellingOriginChange(PlaceData(name = it))
                        } else {
                            onTravellingOriginChange(null)
                        }
                    },
                    label = { Text("Origin") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = destinationName,
                    onValueChange = {
                        destinationName = it
                        if (it.isNotBlank()) {
                            onTravellingDestinationChange(PlaceData(name = it))
                        } else {
                            onTravellingDestinationChange(null)
                        }
                    },
                    label = { Text("Destination") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
        }
    }
}
