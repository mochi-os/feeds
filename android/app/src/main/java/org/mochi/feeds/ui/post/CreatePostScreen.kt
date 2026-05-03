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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.mochi.android.model.PlaceData
import org.mochi.android.ui.components.MentionTextField
import org.mochi.android.ui.components.PlacePicker
import org.mochi.android.ui.components.TravellingPicker
import org.mochi.feeds.R
import org.mochi.feeds.model.Feed
import org.mochi.android.R as MochiR

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
                title = { Text(stringResource(if (isEditing) R.string.feeds_edit_post else R.string.feeds_new_post)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(MochiR.string.common_back))
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
                            Text(stringResource(if (isEditing) R.string.feeds_save_label else R.string.feeds_post_action))
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
                    val selectFeedDefault = stringResource(R.string.feeds_select_feed)
                    val selectedFeedName = availableFeeds
                        .find { it.fingerprint == selectedFeed || it.id == selectedFeed }
                        ?.name ?: selectFeedDefault

                    OutlinedTextField(
                        value = selectedFeedName,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.feeds_feed_label)) },
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
                                        Text(stringResource(R.string.feeds_loading_feeds))
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
                label = { Text(stringResource(R.string.feeds_whats_on_your_mind)) },
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
                    Text(stringResource(R.string.feeds_add_files))
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
                                    contentDescription = stringResource(if (isRemoved) R.string.feeds_restore else R.string.feeds_remove),
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
                                            Icon(Icons.Default.ExpandLess, contentDescription = stringResource(R.string.feeds_move_up), modifier = Modifier.size(14.dp))
                                        }
                                    }
                                    if (index < attachments.lastIndex) {
                                        IconButton(
                                            onClick = { viewModel.moveAttachment(uri, 1) },
                                            modifier = Modifier.size(20.dp)
                                        ) {
                                            Icon(Icons.Default.ExpandMore, contentDescription = stringResource(R.string.feeds_move_down), modifier = Modifier.size(14.dp))
                                        }
                                    }
                                }
                            }
                            val fileLabel = stringResource(R.string.feeds_file)
                            AssistChip(
                                onClick = { viewModel.removeAttachment(uri) },
                                label = {
                                    Text(
                                        uri.lastPathSegment?.takeLast(25) ?: fileLabel,
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                },
                                trailingIcon = {
                                    Icon(
                                        Icons.Default.Close,
                                        contentDescription = stringResource(R.string.feeds_remove),
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
                Text(stringResource(R.string.feeds_location))
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
    // Derive the initial mode from existing data so an edited post opens to
    // the correct picker. `remember` snapshots these values once.
    val initialMode = remember {
        when {
            checkin != null -> "checkin"
            travellingOrigin != null || travellingDestination != null -> "travelling"
            else -> "none"
        }
    }
    var locationMode by remember { mutableStateOf(initialMode) }

    Column(modifier = Modifier.padding(start = 16.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = locationMode == "checkin",
                onClick = {
                    val next = if (locationMode == "checkin") "none" else "checkin"
                    locationMode = next
                    if (next == "none") onClear()
                },
                label = { Text(stringResource(R.string.feeds_check_in)) }
            )
            FilterChip(
                selected = locationMode == "travelling",
                onClick = {
                    val next = if (locationMode == "travelling") "none" else "travelling"
                    locationMode = next
                    if (next == "none") onClear()
                },
                label = { Text(stringResource(R.string.feeds_travelling)) }
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        when (locationMode) {
            "checkin" -> {
                PlacePicker(
                    place = checkin,
                    onPlaceSelected = { onCheckinChange(it) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            "travelling" -> {
                TravellingPicker(
                    origin = travellingOrigin,
                    destination = travellingDestination,
                    onOriginSelected = { onTravellingOriginChange(it) },
                    onDestinationSelected = { onTravellingDestinationChange(it) },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
