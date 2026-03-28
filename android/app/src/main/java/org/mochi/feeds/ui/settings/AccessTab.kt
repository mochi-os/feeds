package org.mochi.feeds.ui.settings

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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.mochi.android.model.AccessRule

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccessTab(
    viewModel: FeedSettingsViewModel
) {
    val accessRules by viewModel.accessRules.collectAsState()
    val isLoading by viewModel.isLoadingAccess.collectAsState()

    var showAddDialog by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add rule")
            }
        }
    ) { innerPadding ->
        when {
            isLoading && accessRules.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            accessRules.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No access rules",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.padding(innerPadding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(accessRules, key = { it.id }) { rule ->
                        AccessRuleCard(
                            rule = rule,
                            onRevoke = { viewModel.revokeAccess(rule.id) }
                        )
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddAccessDialog(
            viewModel = viewModel,
            onDismiss = { showAddDialog = false },
            onAdd = { subject, operation ->
                viewModel.setAccess(subject, operation)
                showAddDialog = false
            }
        )
    }
}

@Composable
private fun AccessRuleCard(
    rule: AccessRule,
    onRevoke: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Person,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = rule.name ?: rule.subject,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = rule.operation,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            if (!rule.isOwner) {
                IconButton(
                    onClick = onRevoke,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Revoke",
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddAccessDialog(
    viewModel: FeedSettingsViewModel,
    onDismiss: () -> Unit,
    onAdd: (String, String) -> Unit
) {
    var userQuery by remember { mutableStateOf("") }
    var selectedSubject by remember { mutableStateOf("") }
    var selectedName by remember { mutableStateOf("") }
    var operation by remember { mutableStateOf("view") }
    var operationExpanded by remember { mutableStateOf(false) }
    val searchResults by viewModel.userSearchResults.collectAsState()

    val operations = listOf("view", "react", "comment", "manage")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add access rule") },
        text = {
            Column {
                OutlinedTextField(
                    value = if (selectedName.isNotEmpty()) selectedName else userQuery,
                    onValueChange = {
                        userQuery = it
                        selectedSubject = ""
                        selectedName = ""
                        if (it.length >= 2) {
                            viewModel.searchUsers(it)
                        }
                    },
                    label = { Text("User") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                if (searchResults.isNotEmpty() && selectedSubject.isEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Column {
                            searchResults.take(5).forEach { user ->
                                TextButton(
                                    onClick = {
                                        selectedSubject = user.fingerprint ?: user.id.toString()
                                        selectedName = user.name
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = user.name,
                                        modifier = Modifier.fillMaxWidth()
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                ExposedDropdownMenuBox(
                    expanded = operationExpanded,
                    onExpandedChange = { operationExpanded = it }
                ) {
                    OutlinedTextField(
                        value = operation.replaceFirstChar { it.uppercase() },
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Permission") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = operationExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    )
                    ExposedDropdownMenu(
                        expanded = operationExpanded,
                        onDismissRequest = { operationExpanded = false }
                    ) {
                        operations.forEach { op ->
                            DropdownMenuItem(
                                text = { Text(op.replaceFirstChar { it.uppercase() }) },
                                onClick = {
                                    operation = op
                                    operationExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(selectedSubject, operation) },
                enabled = selectedSubject.isNotEmpty()
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
