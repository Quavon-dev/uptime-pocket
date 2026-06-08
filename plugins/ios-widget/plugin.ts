/**
 * Expo config plugin: `uptime-pocket-ios-widget`
 *
 * What this does at `expo prebuild` time:
 *
 *   1. Adds the Widget Extension target to the Xcode project
 *      (`UptimePocketWidget` extension). This is a SEPARATE
 *      target with its own bundle ID (`<root>.UptimePocketWidget`).
 *   2. Adds the App Group entitlement to BOTH the main app
 *      target AND the new widget extension. The App Group is
 *      `group.de.quavon.uptimepocket` — must be created in the
 *      Apple Developer Portal before signing will work.
 *   3. Embeds the widget extension into the main app so it ships
 *      in the .ipa.
 *   4. Copies the Swift sources, Info.plist, and entitlements
 *      from `plugins/ios-widget/widget/` into the iOS project.
 *
 * What this does NOT do (operator steps required):
 *
 *   - Create the App Group on the Apple Developer Portal.
 *     Go to https://developer.apple.com/account/resources/
 *     services/list and add `group.de.quavon.uptimepocket`.
 *   - Set up signing for the widget extension. After running
 *     `expo prebuild`, open `ios/<project>.xcworkspace` in
 *     Xcode, select the UptimePocketWidget target, and pick
 *     a Team + signing profile.
 *   - Run on a real device. WidgetKit doesn't work in the iOS
 *     simulator in all Xcode versions, and App Groups need
 *     real signing.
 *
 * The plugin is intentionally hand-written (not generated) so
 * you can grep the whole flow in 300 lines. See `xcode` npm
 * package docs for the XcodeProject mutation API.
 */
import {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
  withDangerousMod,
} from 'expo/config-plugins';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** App Group identifier. Must be provisioned on the Apple
 *  Developer Portal before signing will work. Keep in sync
 *  with `appGroupIdentifier` in WidgetSnapshotReader.swift. */
const APP_GROUP_ID = 'group.de.quavon.uptimepocket';

/** Name of the widget extension target as it appears in Xcode. */
const WIDGET_TARGET_NAME = 'UptimePocketWidget';

/** Bundle identifier suffix appended to the main app's
 *  bundle ID to form the widget's bundle ID. */
const WIDGET_BUNDLE_SUFFIX = '.UptimePocketWidget';

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

  // 2. Add the widget extension target to the Xcode project.
  config = withXcodeProject(config, (cfg) => {
    addWidgetExtensionTarget(cfg.modResults, widgetBundleId);
    return cfg;
  });

  // 3. Copy the Swift sources + Info.plist + entitlements
  //    into the iOS project. This runs as a "dangerous mod"
  //    because we're writing files outside the config tree.
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      copyWidgetSources(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

  return config;
};

/**
 * Add the widget extension target to the Xcode project. Idempotent
 * — does nothing if the target already exists.
 *
 * Steps:
 *  1. Create the PBXNativeTarget for the extension.
 *  2. Add a build phase (Sources) that compiles our Swift files.
 *  3. Add a CopyFiles build phase to the main app that embeds
 *     the extension's .appex product.
 *  4. Add the App Group entitlement to the extension's target.
 *  5. Set up the target's Info.plist reference.
 *
 * The `xcode` package is a thin wrapper over the pbxproj file
 * format. Most operations are mutation-by-mutation, so we do
 * a lot of manual UUID work.
 */
function addWidgetExtensionTarget(
  project: any,
  widgetBundleId: string
): void {
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

  // Add the Swift sources to the target's Sources build phase.
  const swiftFiles = [
    'UptimePocketWidget.swift',
    'WidgetSnapshot.swift',
    'WidgetSnapshotReader.swift',
  ];
  for (const file of swiftFiles) {
    project.addSourceFile(`UptimePocketWidget/${file}`, {
      target: target.uuid,
    });
  }

  // Add the Info.plist reference. We don't need to call
  // `addFile` with the full path — just the relative path
  // within the project; the plugin's copyWidgetSources step
  // puts the file there.
  const plistGroup = project.addResourceFile(
    'UptimePocketWidget/Info.plist',
    { target: target.uuid }
  );

  // Add the entitlements file. The xcode package treats
  // .entitlements like a resource by default, but we want
  // it to set CODE_SIGN_ENTITLEMENTS for the target. The
  // way to do that is `addBuildProperty` on the target's
  // build configuration.
  project.addFile(
    'UptimePocketWidget/UptimePocketWidget.entitlements',
    project.findPBXGroupKey({ name: WIDGET_TARGET_NAME }) ?? project.getFirstProject().firstProject.mainGroup
  );
  const configs = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configs)) {
    const config = configs[key];
    if (config?.productName === `"${WIDGET_TARGET_NAME}"`) {
      config.buildSettings = config.buildSettings ?? {};
      config.buildSettings.CODE_SIGN_ENTITLEMENTS =
        `UptimePocketWidget/UptimePocketWidget.entitlements`;
      // Widgets must be embedded with a specific destination.
      config.buildSettings.SKIP_INSTALL = 'YES';
    }
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
  }

  // We don't actually use the plistGroup var, but we need to
  // create the resource reference. (Calling addResourceFile
  // returns the file ref uuid; we discard it because the
  // target's build phase picks it up automatically.)
  void plistGroup;
}

/**
 * Copy the Swift sources + Info.plist + entitlements from
 * `plugins/ios-widget/widget/` into `ios/UptimePocketWidget/`
 * inside the user's iOS project.
 */
function copyWidgetSources(iosProjectRoot: string): void {
  if (!iosProjectRoot) return;
  const pluginDir = resolve(__dirname, 'widget');
  if (!existsSync(pluginDir)) {
    throw new Error(
      `[uptime-pocket-ios-widget] plugin sources not found at ${pluginDir}`
    );
  }
  const targetDir = join(iosProjectRoot, 'UptimePocketWidget');
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  for (const entry of ['UptimePocketWidget.swift', 'WidgetSnapshot.swift', 'WidgetSnapshotReader.swift', 'Info.plist', 'UptimePocketWidget.entitlements']) {
    const src = join(pluginDir, entry);
    const dst = join(targetDir, entry);
    if (existsSync(src) && !existsSync(dst)) {
      writeFileSync(dst, readFileSync(src));
    }
  }

  // The native bridge module lives in the MAIN app target
  // (not the widget extension). We copy the Swift + ObjC
  // files into the iOS project's root; the user (or their
  // CI) adds them to the Xcode target on first prebuild.
  // (We could add them via withXcodeProject, but that adds
  // .swift + .m to the main target which the user might
  // have customized — copy + manual add is the safer
  // default.)
  const appPluginDir = resolve(__dirname, 'app');
  if (existsSync(appPluginDir)) {
    for (const entry of ['UptimePocketAppGroup.swift', 'UptimePocketAppGroup.m']) {
      const src = join(appPluginDir, entry);
      const dst = join(iosProjectRoot, entry);
      if (existsSync(src) && !existsSync(dst)) {
        writeFileSync(dst, readFileSync(src));
      }
    }
  }
}

export default withIosWidget;
