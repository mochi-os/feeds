package org.mochi.feeds.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun AiTab(
    viewModel: FeedSettingsViewModel
) {
    val aiMode by viewModel.aiMode.collectAsState()
    val aiPrompt by viewModel.aiPrompt.collectAsState()

    val modes = listOf(
        "none" to "None",
        "titles" to "Titles",
        "summarize" to "Summarize",
        "custom" to "Custom"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text(
            text = "AI processing mode",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))

        modes.forEach { (value, label) ->
            AiModeOption(
                label = label,
                description = when (value) {
                    "none" -> "No AI processing"
                    "titles" -> "AI generates titles for posts"
                    "summarize" -> "AI generates summaries for posts"
                    "custom" -> "Use a custom prompt"
                    else -> ""
                },
                selected = aiMode == value,
                onClick = { viewModel.setAiMode(value) }
            )
        }

        if (aiMode == "custom") {
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "Custom prompt",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = aiPrompt,
                onValueChange = { viewModel.setAiPromptText(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp),
                maxLines = 10,
                placeholder = { Text("Enter your custom AI prompt...") }
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(onClick = { viewModel.saveAiPrompt() }) {
                Text("Save prompt")
            }
        }
    }
}

@Composable
private fun AiModeOption(
    label: String,
    description: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = selected,
            onClick = onClick
        )
        Column(modifier = Modifier.padding(start = 8.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
