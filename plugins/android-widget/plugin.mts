/**
 * Expo config plugin: `uptime-pocket-android-widget`
 *
 * What this does at `expo prebuild` time:
 *
 *   1. Adds the Glance + AppWidget + Compose dependencies to
 *      `android/app/build.gradle` and the project's `settings.gradle`.
 *   2. Copies the Kotlin widget code from
 *      `plugins/android-widget/android/app/src/main/...` into
 *      `android/app/src/main/...`.
 *   3. Copies the widget drawables, strings, and metadata XML.
 *   4. Adds the `<receiver>` entry to `AndroidManifest.xml` so
 *      the OS knows about our widget.
 *
 * The plugin is intentionally hand-written (not generated) so
 * you can grep the whole flow in 200 lines.
 *
 * Reference: https://docs.expo.dev/config-plugins/development-guide/
 */
import cp from '@expo/config-plugins';
const {
  ConfigPlugin,
  withAppBuildGradle,
  withAndroidManifest,
  withSettingsGradle,
} = cp;
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Glance + AppWidget versions. These are pinned so the build
 * is reproducible; bump deliberately when you want to upgrade.
 *
 * Compose BOM includes the matching Compose UI that Glance
 * compiles against. We pin both because Glance 1.1.x requires
 * Compose 1.7.x.
 */
const GLANCE_VERSION = '1.1.0';
const COMPOSE_BOM_VERSION = '2024.09.03';

const withAndroidWidget: ConfigPlugin = (config) => {
  // 1. Add the Glance + AppWidget runtime deps to app/build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults.contents;
    const depLines = [
      `// Glance (Android home-screen widgets, runtime)`,
      `implementation "androidx.glance:glance-appwidget:${GLANCE_VERSION}"`,
      `// Compose BOM for Glance's Compose-based UI`,
      `implementation platform("androidx.compose:compose-bom:${COMPOSE_BOM_VERSION}")`,
      `implementation "androidx.compose.ui:ui"`,
      `implementation "androidx.compose.ui:ui-tooling-preview"`,
      `implementation "androidx.compose.material3:material3"`,
    ].join('\n');
    if (!gradle.includes('androidx.glance:glance-appwidget')) {
      cfg.modResults.contents = gradle.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${depLines}`
      );
    }
    return cfg;
  });

  // 2. Enable viewBinding / buildFeatures.compose in app/build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('buildFeatures')) {
      gradle = gradle.replace(
        /android\s*\{/,
        `android {\n    buildFeatures {\n        compose true\n    }\n    composeOptions {\n        kotlinCompilerExtensionVersion = "1.5.14"\n    }`
      );
      cfg.modResults.contents = gradle;
    }
    return cfg;
  });

  // 3. Register the plugin in settings.gradle
  config = withSettingsGradle(config, (cfg) => {
    const settings = cfg.modResults.contents;
    if (!settings.includes('kotlin-android')) {
      const pluginLines = [
        `// Required for Compose / Glance`,
        `apply plugin: "org.jetbrains.kotlin.android"`,
        `apply plugin: "kotlin-compose"`,
      ].join('\n');
      cfg.modResults.contents = settings + '\n' + pluginLines;
    }
    return cfg;
  });

  // 4. Add the widget receiver to AndroidManifest.xml. We do this
  //    as raw string manipulation rather than the structured
  //    AndroidConfig.Manifest API because the structured API has
  //    changed shape across SDK versions and we want a plugin that
  //    works regardless. The AndroidManifest XML schema is stable.
  config = withAndroidManifest(config, (cfg) => {
    // modResults.contents is the raw XML string in this version.
    const manifest: any = cfg.modResults;
    const xml: string = manifest.contents ?? manifest;

    if (typeof xml === 'string' && xml.includes('UptimeWidgetReceiver')) {
      return cfg; // already added
    }

    const receiverXml = [
      `<receiver android:name="de.quavon.uptimepocket.widget.UptimeWidgetReceiver"`,
      `          android:exported="false"`,
      `          android:label="@string/widget_label">`,
      `  <intent-filter>`,
      `    <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />`,
      `  </intent-filter>`,
      `  <meta-data`,
      `      android:name="android.appwidget.provider"`,
      `      android:resource="@xml/uptime_widget_info" />`,
      `</receiver>`,
    ].join('\n      ');

    // Insert just before the closing </application> tag.
    if (typeof xml === 'string' && xml.includes('</application>')) {
      const updated = xml.replace(
        '</application>',
        `    ${receiverXml}\n    </application>`
      );
      if (typeof manifest.contents === 'string') {
        manifest.contents = updated;
      } else {
        // modResults is the manifest object — re-assign contents
        Object.assign(manifest, { contents: updated });
      }
    }
    return cfg;
  });

  // 5. Copy the widget source files into the Android project
  copyPluginAssets((config as any).modResults?.projectPath ?? '');

  return config;
};

function copyPluginAssets(androidProjectPath: string): void {
  // Resolve the plugin's bundled Android assets directory.
  // The plugin lives at <repo>/plugins/android-widget/, and
  // the assets at <repo>/plugins/android-widget/android/.
  const pluginAndroid = resolve(__dirname, 'android');
  if (!existsSync(pluginAndroid)) {
    throw new Error(
      `[uptime-pocket-android-widget] plugin assets not found at ${pluginAndroid}`
    );
  }

  // The Android project might not exist yet (first prebuild);
  // in that case we can't copy files now — they'll be copied
  // on the next prebuild. We still continue without throwing.
  if (!androidProjectPath) return;

  // Mirror: <plugin>/android/app/src/main → <project>/android/app/src/main
  const srcMain = join(pluginAndroid, 'app', 'src', 'main');
  const dstMain = join(androidProjectPath, 'app', 'src', 'main');
  if (!existsSync(dstMain)) {
    mkdirSync(dstMain, { recursive: true });
  }
  copyRecursive(srcMain, dstMain);
}

function copyRecursive(src: string, dst: string): void {
  if (!existsSync(src)) return;
  if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
  for (const entry of require('fs').readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else if (entry.isFile()) {
      if (!existsSync(d)) {
        writeFileSync(d, readFileSync(s));
      }
    }
  }
}

export default withAndroidWidget;
