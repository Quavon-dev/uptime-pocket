# Maestro E2E flows

These are smoke flows for the Uptime Pocket app. They run against
a real iOS simulator / Android emulator (or device) via the
Maestro CLI.

## Running

```sh
# Install Maestro (one-time, see https://maestro.dev)
brew tap mobile-dev-inc/tap
brew install maestro

# Start the app in dev mode
npm run ios      # or: npm run android

# In another terminal, run a flow
maestro test .maestro/smoke.yaml
maestro test .maestro/launch.yaml
maestro test .maestro/add-server.yaml
maestro test .maestro/settings-theme.yaml
maestro test .maestro/settings-language.yaml
maestro test .maestro/settings-biometric.yaml
maestro test .maestro/design-system.yaml
maestro test .maestro/notifications-permission.yaml
maestro test .maestro/servers-list.yaml
```

You can also run all of them sequentially:

```sh
for f in .maestro/*.yaml; do
  echo "=== $f ==="
  maestro test "$f" || echo "FAILED: $f"
done
```

## Flow inventory

| File | What it covers |
|---|---|
| `smoke.yaml` | One-shot smoke test: launch + 4 tabs + add-server modal + cancel |
| `launch.yaml` | Cold launch + empty state + Add server navigation |
| `add-server.yaml` | Form validation (empty submit) + happy path |
| `servers-list.yaml` | Servers tab + the "long-press" hint |
| `settings-theme.yaml` | Theme picker (System / Light / Dark) |
| `settings-language.yaml` | Language picker (flips UI to German) |
| `settings-biometric.yaml` | Biometric row visibility (no real OS prompt) |
| `notifications-permission.yaml` | Welcome flow navigation |
| `design-system.yaml` | Developer gallery open + back |

## YAML structure

Each file uses Maestro's two-document format: a frontmatter block
(top-level keys like `appId`, `name`, `description`) separated from
the flow steps by `---`. The `---` is *required* by Maestro but
tripped the linter in this repo, so if you re-run the linter and
it complains, that's a false positive.

## Adding a new flow

1. Copy an existing flow as a starting point.
2. Replace the steps. Common primitives:
   - `launchApp: { clearState: true|false }`
   - `tapOn: "<visible text>"`
   - `inputText: "..."`
   - `assertVisible: "<text>"`
   - `scrollUntilVisible: { element: "<text>", direction: UP|DOWN|LEFT|RIGHT, timeout: 5000 }`
   - `swipe: { direction: LEFT|RIGHT|UP|DOWN }`
   - `back`
3. Make sure the strings you're asserting on are the **English**
   versions (or use `settings-language.yaml` as a template if you
   want to assert on a non-default locale).

## Limitations

- These flows are smoke tests, not exhaustive coverage. We don't
  type every character into a form, we don't test monitor CRUD
  end-to-end (that requires a live Kuma instance), and we don't
  test every error path.
- `maestro` does not run in this CI environment. Treat these as
  manual-run tests. Once we have a hosted macOS runner, we can
  wire them into `npm run test:e2e` in CI.
