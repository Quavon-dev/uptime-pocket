/**
 * Expo config plugin: `uptime-pocket-ios-widget`
 *
 * What this does at `expo prebuild` time (zero manual Xcode work):
 *
 *   1. Adds the Widget Extension target (`UptimePocketWidget`)
 *      to the Xcode project. This is a SEPARATE target with its
 *      own bundle ID (`<root>.UptimePocketWidget`).
 *   2. Adds the Swift files for the widget to the extension
 *      target's compile sources.
 *   3. Adds the App Group entitlement to BOTH the main app
 *      target AND the new widget extension. The App Group is
 *      `group.de.quavon.uptimepocket` — must be created in the
 *      Apple Developer Portal before signing will work.
 *   4. Embeds the widget extension into the main app so it
 *      ships in the .ipa.
 *   5. Adds the native App Group bridge module (Swift + ObjC)
 *      to the MAIN app target so JS can call
 *      `requireNativeModule('UptimePocketAppGroup')`. The
 *      bridge writes the widget snapshot to the App Group's
 *      shared container, where the widget extension reads it.
 *   6. Sets up the Swift→ObjC bridging header on the main app
 *      (Expo's default iOS template already includes the
 *      build setting, but we ensure the file exists).
 *   7. Copies all Swift sources, Info.plist, and entitlements
 *      from `plugins/ios-widget/{widget,app}/` into the iOS
 *      project.
 *
 * The plugin is idempotent — safe to re-run `expo prebuild`.
 *
 * Operator steps still required (cannot be automated because
 * they require the Apple Developer Portal):
 *
 *   - Create the App Group `group.de.quavon.uptimepocket` on
 *     https://developer.apple.com/account/resources/services/list
 *   - Add the App Group capability to BOTH the main app and
 *     the UptimePocketWidget extension in Xcode after
 *     `expo prebuild`, or add it via the `signing`
 *     entitlements file before opening Xcode.
 *   - Set up signing for the widget extension. After running
 *     `expo prebuild`, open `ios/<project>.xcworkspace` in
 *     Xcode, select the UptimePocketWidget target, and pick
 *     a Team + signing profile.
 *   - Run on a real device. WidgetKit doesn't work in the iOS
 *     simulator in all Xcode versions, and App Groups need
 *     real signing.
 */
import cp from '@expo/config-plugins';
const {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  withDangerousMod,
} = cp;
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** App Group identifier. Must be provisioned on the Apple
 *  Developer Portal before signing will work. Keep in sync
 *  with `appGroupIdentifier` in WidgetSnapshotReader.swift
 *  and UptimePocketAppGroup.swift. */
const APP_GROUP_ID = 'group.de.quavon.uptimepocket';

/** Name of the widget extension target as it appears in Xcode. */
const WIDGET_TARGET_NAME = 'UptimePocketWidget';

/** Bundle identifier suffix appended to the main app's
 *  bundle ID to form the widget's bundle ID. */
const WIDGET_BUNDLE_SUFFIX = '.UptimePocketWidget';

/** Bridging header path (relative to ios/ project root)
 *  shared between the main app and any Swift code added to
 *  it. Expo's default template already has this set, but
 *  we ensure the file exists for cases where the user
 *  customized their template. */
const BRIDGING_HEADER_PATH = 'UptimePocket-Bridging-Header.h';

const withIosWidget: ConfigPlugin = (config) => {
  // Resolve the main app's bundle ID so we can form the
  // widget's bundle ID. We read it from the existing config;
  // if it's missing the prebuild will fail elsewhere, so we
  // don't validate here.
  const mainBundleId: string =
    (config.ios?.bundleIdentifier as string | undefined) ??
    'de.quavon.uptimepocket';
  const widgetBundleId = mainBundleId + WIDGET_BUNDLE_SUFFIX;

  // 1. Add the App Group entitlement to the main app target.
  config = withEntitlementsPlist(config, (cfg) => {
    const ent = cfg.modResults;
    if (!Array.isArray(ent['com.apple.security.application-groups'])) {
      ent['com.apple.security.application-groups'] = [];
    }
    const groups = ent['com.apple.security.application-groups'] as string[];
    if (!groups.includes(APP_GROUP_ID)) {
      groups.push(APP_GROUP_ID);
    }
    return cfg;
  });

  // 2. Add the widget extension target + native bridge to
  //    the main app target in the Xcode project. This is the
  //    "zero manual Xcode work" step.
  config = withXcodeProject(config, (cfg) => {
    configureMainAppForSwift(cfg.modResults);
    addWidgetExtensionTarget(cfg.modResults, widgetBundleId);
    return cfg;
  });

  // 3. Copy the Swift sources + Info.plist + entitlements
  //    into the iOS project. This runs as a "dangerous mod"
  //    because we're writing files outside the config tree.
  //    `platformProjectRoot` is the path to `ios/`, NOT the
  //    React Native project root.
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      copyWidgetSources(cfg.modRequest.platformProjectRoot);
      return cfg;
    },
  ]);

  return config;
};

/**
 * Configure the main app target to support Swift code
 * (so the native bridge module can live in the main app).
 * Idempotent.
 */
function configureMainAppForSwift(project: any): void {
  // The Expo iOS template sets SWIFT_VERSION, SWIFT_OBJC_BRIDGING_HEADER,
  // and CLANG_ENABLE_MODULES on the main app target already. We
  // defensively ensure these are set in case the user customized
  // their template.
  //
  // The `xcode` package's `addBuildProperty` is idempotent — calling
  // it on a config that already has the value is a no-op. We only
  // set these on Debug + Release for the main app target. We don't
  // need to find the main app's target UUID here because
  // `addBuildProperty` sets the value on the project-level config
  // list, which the main app inherits.
  for (const configName of ['Debug', 'Release']) {
    project.addBuildProperty('SWIFT_VERSION', '5.0', configName);
    project.addBuildProperty(
      'SWIFT_OBJC_BRIDGING_HEADER',
      BRIDGING_HEADER_PATH,
      configName
    );
    project.addBuildProperty('CLANG_ENABLE_MODULES', 'YES', configName);
  }
}

/**
 * Add the widget extension target to the Xcode project.
 * Idempotent — does nothing if the target already exists.
 *
 * Also adds the native bridge module (`UptimePocketAppGroup.{swift,m}`)
 * to the MAIN app target so JS can write to the App Group.
 */
function addWidgetExtensionTarget(
  project: any,
  widgetBundleId: string
): void {
  // --- 1. Add the widget extension target ---

  // Skip if already added. The target name is the canonical id.
  const existing = project.pbxNativeTargetSection();
  for (const key of Object.keys(existing)) {
    if (existing[key]?.name === WIDGET_TARGET_NAME) return;
  }

  // The package's API for adding a target is `addTarget`. It
  // returns an object with the new target's uuid and product
  // uuid, which we need to wire up the build phases.
  const target = project.addTarget(
    WIDGET_TARGET_NAME,
    'app_extension',
    'UptimePocketWidget',
    widgetBundleId
  );
  if (!target) {
    throw new Error(
      `[uptime-pocket-ios-widget] failed to add target ${WIDGET_TARGET_NAME}`
    );
  }

  // Ensure a PBXGroup exists for the widget target so files
  // added to it are visible in the Xcode navigator. The
  // `xcode` package's `addTarget` doesn't create a group for
  // the target itself, so we add one explicitly.
  let widgetGroupKey = project.findPBXGroupKey({ name: WIDGET_TARGET_NAME });
  if (!widgetGroupKey) {
    const mainGroupKey = project.getFirstProject().firstProject.mainGroup;
    // addPbxGroup returns `{ uuid, pbxGroup }`, not just the
    // uuid. We need the string key.
    const created = project.addPbxGroup(
      [],
      WIDGET_TARGET_NAME,
      WIDGET_TARGET_NAME,
      '"<group>"'
    );
    widgetGroupKey = created?.uuid ?? created;
    // Wire the widget group into the main group so it shows
    // up under the project root in Xcode.
    const mainGroup = project.hash.project.objects.PBXGroup[mainGroupKey];
    if (mainGroup && Array.isArray(mainGroup.children) && widgetGroupKey) {
      mainGroup.children.push({
        value: widgetGroupKey,
        comment: WIDGET_TARGET_NAME,
      });
    }
  }

  // Add the Swift sources to the target's Sources build phase.
  // We use a custom helper instead of `addSourceFile` because the
  // `xcode` package's `addSourceFile` calls `addPluginFile` which
  // assumes a "Plugins" PBXGroup exists. For widget targets
  // there's no Plugins group — we add files to the target's own
  // group instead.
  const swiftFiles = [
    'UptimePocketWidget.swift',
    'WidgetSnapshot.swift',
    'WidgetSnapshotReader.swift',
  ];
  for (const file of swiftFiles) {
    addSwiftFileToTarget(
      project,
      `UptimePocketWidget/${file}`,
      target.uuid,
      widgetGroupKey
    );
  }

  // Add the Info.plist reference to the extension target.
  // We use a custom helper instead of `addResourceFile` for the
  // same reason as the Swift files: `addResourceFile` calls
  // `correctForResourcesPath` which assumes a "Resources"
  // PBXGroup exists. For widget targets there isn't one.
  //
  // The file is named `UptimePocketWidget-Info.plist` (not
  // `Info.plist`) because `addTarget` hard-codes the
  // INFOPLIST_FILE build setting to
  // `<subfolder>/<subfolder>-Info.plist`.
  addResourceFileToTarget(
    project,
    'UptimePocketWidget/UptimePocketWidget-Info.plist',
    target.uuid,
    widgetGroupKey
  );

  // Add the entitlements file. We don't use addResourceFile
  // because .entitlements isn't really a resource — it's a
  // build setting (CODE_SIGN_ENTITLEMENTS) that points to a
  // file. Use addFile to add the file reference to the
  // extension's group, then set the build property.
  project.addFile(
    'UptimePocketWidget/UptimePocketWidget.entitlements',
    widgetGroupKey
  );
  for (const configName of ['Debug', 'Release']) {
    project.addBuildProperty(
      'CODE_SIGN_ENTITLEMENTS',
      'UptimePocketWidget/UptimePocketWidget.entitlements',
      configName
    );
    // Widgets must be embedded with a specific destination.
    project.addBuildProperty('SKIP_INSTALL', 'YES', configName);
  }

  // Embed the extension in the main app. Without this, the
  // .appex never ships.
  const mainTarget = project.getFirstTarget();
  if (mainTarget) {
    project.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      'Embed App Extensions',
      mainTarget.uuid,
      'app_extension'
    );
  } else {
    return;
  }

  // --- 2. Add the native bridge module to the main app target ---

  // These files let JS call into Swift to write the widget
  // snapshot into the App Group's shared container. They live
  // in the main app target (not the widget extension) because
  // they're invoked by the running app process.
  const mainGroupKey = project.getFirstProject().firstProject.mainGroup;
  for (const file of [
    'UptimePocketAppGroup.swift',
    'UptimePocketAppGroup.m',
  ]) {
    addSwiftFileToTarget(project, file, mainTarget.uuid, mainGroupKey);
  }
}

/**
 * Add a file (Swift or ObjC) to a target's compile sources.
 *
 * The `xcode` package's `addSourceFile` calls `addPluginFile`,
 * which assumes the project has a "Plugins" PBXGroup. This
 * isn't true for fresh Expo iOS projects, so we hit a null
 * dereference in `correctForPluginsPath`. This helper does the
 * same job using the lower-level `addFile` API + manual build
 * phase membership.
 *
 * Idempotent: if a file with the same path is already in the
 * group, this is a no-op.
 */
function addSwiftFileToTarget(
  project: any,
  filePath: string,
  targetUuid: string,
  groupKey: string
): void {
  // addFile returns null if the file already exists.
  const file = project.addFile(filePath, groupKey);
  if (!file) return;
  file.target = targetUuid;
  project.addToPbxBuildFileSection(file);
  project.addToPbxSourcesBuildPhase(file);
}

/**
 * Add a file (Info.plist, .entitlements, etc.) to a target's
 * resources build phase. Like `addSwiftFileToTarget`, this
 * avoids the `xcode` package's `addResourceFile` because that
 * method requires a "Resources" PBXGroup to exist, which isn't
 * true for fresh widget targets.
 */
function addResourceFileToTarget(
  project: any,
  filePath: string,
  targetUuid: string,
  groupKey: string
): void {
  const file = project.addFile(filePath, groupKey);
  if (!file) return;
  file.target = targetUuid;
  project.addToPbxBuildFileSection(file);
  project.addToPbxResourcesBuildPhase(file);
}

/**
 * Copy the Swift sources + Info.plist + entitlements + bridge
 * files from `plugins/ios-widget/{widget,app}/` into the
 * iOS project.
 */
function copyWidgetSources(iosProjectRoot: string): void {
  if (!iosProjectRoot) return;

  // --- Widget extension sources ---
  const widgetPluginDir = resolve(__dirname, 'widget');
  if (!existsSync(widgetPluginDir)) {
    throw new Error(
      `[uptime-pocket-ios-widget] widget sources not found at ${widgetPluginDir}`
    );
  }
  const widgetTargetDir = join(iosProjectRoot, 'UptimePocketWidget');
  if (!existsSync(widgetTargetDir)) {
    mkdirSync(widgetTargetDir, { recursive: true });
  }
  for (const entry of [
    'UptimePocketWidget.swift',
    'WidgetSnapshot.swift',
    'WidgetSnapshotReader.swift',
    'UptimePocketWidget-Info.plist',
    'UptimePocketWidget.entitlements',
  ]) {
    const src = join(widgetPluginDir, entry);
    const dst = join(widgetTargetDir, entry);
    if (existsSync(src) && !existsSync(dst)) {
      writeFileSync(dst, readFileSync(src));
    }
  }

  // --- Main app native bridge module ---
  const appPluginDir = resolve(__dirname, 'app');
  if (!existsSync(appPluginDir)) {
    throw new Error(
      `[uptime-pocket-ios-widget] bridge sources not found at ${appPluginDir}`
    );
  }
  for (const entry of [
    'UptimePocketAppGroup.swift',
    'UptimePocketAppGroup.m',
  ]) {
    const src = join(appPluginDir, entry);
    const dst = join(iosProjectRoot, entry);
    if (existsSync(src) && !existsSync(dst)) {
      writeFileSync(dst, readFileSync(src));
    }
  }

  // --- Bridging header (in case the user customized their template) ---
  const bridgingHeaderPath = join(iosProjectRoot, BRIDGING_HEADER_PATH);
  if (!existsSync(bridgingHeaderPath)) {
    // The minimal bridging header just imports React. Swift
    // code in the main app uses this header to see ObjC symbols.
    writeFileSync(
      bridgingHeaderPath,
      '// Auto-generated by uptime-pocket-ios-widget plugin.\n' +
        '// This file is the Swift→ObjC bridging header for the\n' +
        "// main app target. Imports React so Swift can call\n" +
        '// back into the React Native bridge.\n' +
        '#import <React/RCTBridgeModule.h>\n'
    );
  }
}

export default withIosWidget;
