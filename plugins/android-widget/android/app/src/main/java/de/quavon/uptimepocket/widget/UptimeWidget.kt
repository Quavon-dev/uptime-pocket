package de.quavon.uptimepocket.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import de.quavon.uptimepocket.MainActivity
import de.quavon.uptimepocket.R

/**
 * The Glance widget. Renders the current monitor state from
 * the snapshot file written by the React app.
 *
 * Two visual modes:
 *   - List (4x2 cells): shows up to 6 monitors, sorted by
 *     status (DOWN first), with a colored status dot.
 *   - Compact (2x2 cells): shows the worst single monitor
 *     in large type for a glanceable lock-screen-friendly
 *     summary.
 *
 * Both modes share a single GlanceAppWidget so the OS picks
 * the appropriate layout based on the cell size.
 */
class UptimeWidget : GlanceAppWidget() {

    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetSnapshotReader.read(context)
        provideContent {
            GlanceTheme {
                WidgetContent(snapshot)
            }
        }
    }
}

/**
 * Dispatch on snapshot size: empty → placeholder, one monitor →
 * compact view, many → list view.
 */
@Composable
fun WidgetContent(snapshot: WidgetSnapshot?) {
    when {
        snapshot == null -> EmptyState(text = "Open Uptime Pocket to start")
        snapshot.servers.isEmpty() -> EmptyState(text = "No servers yet")
        else -> {
            // Flatten the per-server list to a single ordered list
            // (down first, then by lastCheckAt), capped at 6.
            val all = snapshot.servers
                .flatMap { it.monitors }
                .sortedWith(
                    compareByDescending<WidgetMonitor> { it.status == "down" }
                        .thenByDescending { it.lastCheckAt ?: 0L }
                )
                .take(6)
            ListView(snapshot, all)
        }
    }
}

@Composable
private fun EmptyState(text: String) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(GlanceTheme.colors.background)
            .padding(12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = TextStyle(
                color = GlanceTheme.colors.onBackground,
                fontSize = androidx.compose.ui.unit.TextUnit.Unspecified
            )
        )
    }
}

@Composable
private fun ListView(snapshot: WidgetSnapshot, monitors: List<WidgetMonitor>) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(GlanceTheme.colors.background)
            .padding(8.dp)
    ) {
        // Header: aggregate worst status + last update time
        HeaderRow(snapshot)
        Spacer(GlanceModifier.height(6.dp))
        if (monitors.isEmpty()) {
            Text(
                text = "All clear — no monitors configured",
                style = TextStyle(color = GlanceTheme.colors.onBackground)
            )
        } else {
            LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
                items(monitors) { monitor ->
                    MonitorRow(monitor)
                }
            }
        }
    }
}

@Composable
private fun HeaderRow(snapshot: WidgetSnapshot) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val anyDown = snapshot.servers.any { s ->
            s.monitors.any { it.status == "down" }
        }
        val dot = if (anyDown) R.drawable.widget_status_down else R.drawable.widget_status_up
        Image(
            provider = ImageProvider(dot),
            contentDescription = if (anyDown) "At least one monitor is down" else "All monitors up",
            modifier = GlanceModifier.size(12.dp)
        )
        Spacer(GlanceModifier.width(6.dp))
        Text(
            text = "Uptime Pocket",
            style = TextStyle(
                color = GlanceTheme.colors.onBackground,
                fontWeight = FontWeight.Bold,
                fontSize = androidx.compose.ui.unit.TextUnit.Unspecified
            )
        )
        Spacer(GlanceModifier.width(6.dp))
        val connected = snapshot.servers.count { it.connected }
        val total = snapshot.servers.size
        Text(
            text = "$connected/$total online",
            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant)
        )
    }
}

@Composable
private fun MonitorRow(monitor: WidgetMonitor) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val statusDrawable = statusDrawable(monitor.status)
        Image(
            provider = ImageProvider(statusDrawable),
            contentDescription = "Status: ${monitor.status}",
            modifier = GlanceModifier.size(14.dp)
        )
        Spacer(GlanceModifier.width(8.dp))
        Column(modifier = GlanceModifier.fillMaxWidth()) {
            // Truncate long names to keep the widget visually tidy
            val displayName = if (monitor.name.length > 22) {
                monitor.name.take(21) + "…"
            } else {
                monitor.name
            }
            Text(
                text = displayName,
                style = TextStyle(
                    color = GlanceTheme.colors.onBackground,
                    fontWeight = FontWeight.Medium
                ),
                maxLines = 1
            )
            val response = monitor.responseTime?.let { " · ${it}ms" } ?: ""
            val when_ = monitor.lastCheckAt?.let { " · " + relativeTime(it) } ?: ""
            Text(
                text = "${monitor.serverLabel}$response$when_",
                style = TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = androidx.compose.ui.unit.TextUnit.Unspecified
                ),
                maxLines = 1
            )
        }
    }
}

/**
 * Map our 5 status values to the 5 small status-indicator
 * drawables. The plugin copies these into the app's drawable
 * resources at prebuild time.
 */
private fun statusDrawable(status: String): Int = when (MonitorStatus.fromWire(status)) {
    MonitorStatus.UP -> R.drawable.widget_status_up
    MonitorStatus.DOWN -> R.drawable.widget_status_down
    MonitorStatus.PENDING -> R.drawable.widget_status_pending
    MonitorStatus.MAINTENANCE -> R.drawable.widget_status_maintenance
    MonitorStatus.PAUSED -> R.drawable.widget_status_paused
}

/**
 * "3m ago" / "just now" formatter. We do it in code rather than
 * pulling in java.time for the rare case the snapshot is hours
 * stale (e.g. user hasn't opened the app in a day).
 */
private fun relativeTime(epochMs: Long): String {
    val deltaMs = System.currentTimeMillis() - epochMs
    if (deltaMs < 0) return "soon"
    val sec = deltaMs / 1000
    if (sec < 30) return "just now"
    if (sec < 60) return "${sec}s ago"
    val min = sec / 60
    if (min < 60) return "${min}m ago"
    val hr = min / 60
    if (hr < 24) return "${hr}h ago"
    val day = hr / 24
    return "${day}d ago"
}

/**
 * The Android `AppWidgetReceiver` is the OS-facing entry point.
 * When the user adds the widget to their home screen, the OS
 * binds to this receiver; the receiver then forwards to the
 * Glance widget for actual rendering.
 *
 * The receiver also handles update intents (e.g. the OS
 * periodically re-rendering stale widgets).
 */
class UptimeWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = UptimeWidget()
}
