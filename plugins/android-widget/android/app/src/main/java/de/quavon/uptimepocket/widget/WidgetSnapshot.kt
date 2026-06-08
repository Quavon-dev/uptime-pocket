package de.quavon.uptimepocket.widget

/**
 * Snapshot of the app state, written by the React app to
 * `filesDir/widget_snapshot.json` and read by the Glance widget.
 *
 * The shape mirrors the TypeScript `WidgetSnapshot` in
 * `src/platform/widget/snapshot.ts`. Keep them in sync.
 *
 * Why a separate data class instead of reusing the React types?
 * The widget process can't share a runtime with the main app.
 * It has its own classloader and its own set of dependencies.
 * A standalone data class means no shared schema code and
 * no risk of an Android-only schema change breaking iOS.
 */
data class WidgetSnapshot(
    val generatedAt: Long,
    val version: Int,
    val servers: List<WidgetServer>
)

data class WidgetServer(
    val id: String,
    val name: String,
    val connected: Boolean,
    /** The worst status across the server's monitors. */
    val worstStatus: String,
    val monitors: List<WidgetMonitor>
)

data class WidgetMonitor(
    /** Composite id: `${serverId}::${monitorId}`. */
    val id: String,
    val name: String,
    val status: String,
    val lastCheckAt: Long?,
    val responseTime: Int?,
    val serverLabel: String
)

/** Status enum mirrored from TypeScript. Values must match. */
enum class MonitorStatus(val wire: String) {
    UP("up"),
    DOWN("down"),
    PENDING("pending"),
    MAINTENANCE("maintenance"),
    PAUSED("paused");

    companion object {
        fun fromWire(s: String?): MonitorStatus = when (s) {
            "up" -> UP
            "down" -> DOWN
            "pending" -> PENDING
            "maintenance" -> MAINTENANCE
            "paused" -> PAUSED
            else -> PENDING // unknown → safe default
        }
    }
}
