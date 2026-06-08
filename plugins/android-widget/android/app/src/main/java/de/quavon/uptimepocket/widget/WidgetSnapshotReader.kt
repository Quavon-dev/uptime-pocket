package de.quavon.uptimepocket.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Reads a `WidgetSnapshot` from the app's internal `filesDir`.
 *
 * Both the main app process and the widget process share the
 * same app UID, so they share `context.filesDir`. The main app
 * writes `widget_snapshot.json` there; we read it here.
 *
 * Missing file → null. The widget UI handles null by showing
 * "no data" rather than crashing.
 */
object WidgetSnapshotReader {

    private const val FILENAME = "widget_snapshot.json"

    /**
     * Read the snapshot from `filesDir/widget_snapshot.json`.
     *
     * @return the snapshot, or `null` if the file is missing,
     *         unreadable, or malformed.
     */
    fun read(context: Context): WidgetSnapshot? {
        val file = File(context.filesDir, FILENAME)
        if (!file.exists() || !file.canRead()) {
            return null
        }
        return try {
            val text = file.readText(Charsets.UTF_8)
            parse(text)
        } catch (e: Exception) {
            // Bad JSON shouldn't crash the widget. Log and bail.
            android.util.Log.w("WidgetSnapshotReader", "read failed: ${e.message}")
            null
        }
    }

    /** Exposed for tests. */
    internal fun parse(text: String): WidgetSnapshot? {
        return try {
            val root = JSONObject(text)
            val version = root.optInt("version", 0)
            if (version != 1) {
                // We only know how to parse version 1. Future
                // versions would need a migrator here.
                return null
            }
            val generatedAt = root.optLong("generatedAt", 0L)
            val serversArr = root.optJSONArray("servers") ?: JSONArray()
            val servers = (0 until serversArr.length()).map { i ->
                parseServer(serversArr.getJSONObject(i))
            }
            WidgetSnapshot(generatedAt, version, servers)
        } catch (e: Exception) {
            null
        }
    }

    private fun parseServer(o: JSONObject): WidgetServer {
        val monitorsArr = o.optJSONArray("monitors") ?: JSONArray()
        val monitors = (0 until monitorsArr.length()).map { i ->
            parseMonitor(monitorsArr.getJSONObject(i))
        }
        return WidgetServer(
            id = o.optString("id"),
            name = o.optString("name"),
            connected = o.optBoolean("connected", false),
            worstStatus = o.optString("worstStatus", "pending"),
            monitors = monitors
        )
    }

    private fun parseMonitor(o: JSONObject): WidgetMonitor {
        return WidgetMonitor(
            id = o.optString("id"),
            name = o.optString("name"),
            status = o.optString("status", "pending"),
            lastCheckAt = if (o.has("lastCheckAt") && !o.isNull("lastCheckAt")) {
                o.optLong("lastCheckAt")
            } else null,
            responseTime = if (o.has("responseTime") && !o.isNull("responseTime")) {
                o.optInt("responseTime")
            } else null,
            serverLabel = o.optString("serverLabel", "")
        )
    }
}
