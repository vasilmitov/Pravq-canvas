# Pravq Go Chrome Extension — Development Guidelines

This document outlines the architecture, constraints, and development guidelines for the **pravq go** Infinite Canvas Chrome Extension. Future agents working on this project must follow these rules and patterns.

---

## 1. Project Architecture

The codebase is shared between a Next.js web application and a Manifest V3 Chrome Extension:
* **Shared React Components (`src/`)**: The core canvas logic (`Canvas.tsx`), custom nodes (`src/components/workspace/nodes/`), and the state store (`src/store/useCanvasStore.ts`) are shared directly.
* **Extension Specifics (`extension/`)**: 
  * `manifest.json`: Defines MV3 rules, permissions (`storage`, `sidePanel`, `alarms`), and surfaces.
  * `background.js`: Extension service worker managing local storage state persistence, side panel lifecycles, and automated local/remote backups.
  * `entry.jsx`: Entry point for compiling the canvas React tree into `extension/content/canvas-bundle.js`. It **patches** the Zustand store actions on runtime to redirect fetch requests to `chrome.storage`.
  * `lib/storage.js`: Adapter managing message passing to the background worker (`SAVE_STATE`, `GET_STATE`) with a `localStorage` fallback for non-extension environments.

---

## 2. Compilation & Build Commands

Always run the Vite compilation command after modifying files in `src/` or `extension/` to rebuild the extension assets:
```bash
npx vite build -c vite.extension.config.js
```
This builds:
* `extension/content/canvas-bundle.js` (Compiled React code)
* `extension/content/styles.css` (Tailwind & custom globals CSS)

To load/update the extension in Chrome:
1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` directory.
4. If code modifications are made, run the build command above and click the **circular refresh button** on the extension card in Chrome.

---

## 3. Important Development Patterns & Gotchas

### Stacking Context & Grid Patterns
* The canvas grid (`Background` component from `@xyflow/react`) is rendered at `z-index: -1` inside the canvas wrapper. 
* To prevent the grid from being covered by parent backgrounds, the `.react-flow` container must enforce a stacking context using `isolation: isolate;`. 
* **Never** set a solid background on `.react-flow__background` or `.react-flow__renderer` as this will block the grid SVG pattern.
* **Calibrated Opacity Multipliers**: Due to visual weight differences (lines and crosses cover more screen pixels than dots), we scale their opacity in `Canvas.tsx`:
  * Dots: `1.0x` opacity.
  * Crosses: `0.4x` opacity (size `6`).
  * Lines: `0.2x` opacity (size `1`).

### Store Persistence & Autosave
* The Zustand store (`useCanvasStore.ts`) uses `initAutoSave` to track changes in `nodes`, `edges`, and `settings` (such as background colors and grid options). 
* To ensure instant persistence of personalization choices without waiting for the 2-second edit debounce, the `updateSettings` action clears and sets a fast `500ms` debounce timer before calling `save()`.

### Click-Outside Event Toggles
* When using a click-outside detection hook/event (like closing the `PersonalizationPanel` on click-outside), always ignore clicks targeting the toggle button itself (e.g. `target.closest('[title="Personalization"]')`). Otherwise, clicking the button closes the panel via click-outside, and then immediately toggles it back open, causing a glitch where the panel refuses to close on button clicks.

### TypeScript Generic Constraints (React Flow v12)
* Custom node data (`WorkspaceNodeData`) must be defined as a TypeScript `type` rather than an `interface` to implicitly satisfy xyflow's generic `Record<string, unknown>` constraint without requiring index signature boilerplate.
* To avoid DOM naming conflicts with global standard browser classes, cast DOM elements using `as globalThis.Node` rather than `as Node` (which conflicts with xyflow's custom `Node` definition).

---

## 4. Google Drive AppData Sync Pattern

When implementing cross-device synchronization:
* **Storage Limits**: Direct sync via `chrome.storage.sync` has strict quotas (100 KB total, 8 KB per item). Canvas JSON states easily exceed this.
* **Google Drive appDataFolder**: The standard solution is to sync to the user's hidden, app-specific Google Drive folder.
  * **Permissions**: Require `"identity"` in `manifest.json` permissions, plus the `"oauth2"` config block with scopes:
    - `"https://www.googleapis.com/auth/drive.appdata"` (access is strictly isolated to the app folder; the extension cannot see other user files).
    - `"https://www.googleapis.com/auth/userinfo.email"` (to fetch and display the user's connected account in Settings).
  * **OAuth Client ID Binding**: During development, the OAuth client ID in the Google Cloud Console must be set as a **Chrome Extension** application type and bound to your local unpacked Extension ID.

---

## 5. Service Worker Ephemerality & Alarms Optimization

* **Variable State Loss**: Manifest V3 Service Workers terminate after ~30s of inactivity. **Never** store state in global memory variables. Persist state to `chrome.storage`.
* **Timers**: Use `chrome.alarms` instead of `setInterval` or `setTimeout` (which are cleared when the worker terminates).
* **Alarms Optimization**: 
  * Chrome alarms are persistent across service worker restarts and browser boots.
  * **Do not** run `chrome.alarms.clearAll()` or `chrome.alarms.create()` at the top-level of the script on every service worker activation (wakeup), as this triggers unnecessary writes.
  * Register alarms during `chrome.runtime.onInstalled.addListener`.
  * Listen to `chrome.storage.onChanged` to dynamically adjust intervals when settings update.
  * Use a lightweight `chrome.alarms.getAll` check at top-level startup to verify alarms exist without recreating them.

---

## 6. Testing Extensions with Chrome DevTools MCP

* **Surface Identification**: Use `list_pages` to locate the extension's target pages (e.g. `sidepanel.html`, `newtab.html`, `options.html`).
* **Interactive Testing**: Use `select_page` to focus on the target tab, then `take_snapshot` to extract element `uid`s. Use `click`, `fill`, and `type_text` to verify canvas behavior.
* **Network & Log Auditing**: Use `list_network_requests` and `list_console_messages` against the background service worker page to verify auto-saves, alarm triggers, and remote API push status.

---

## 7. Developer & Local Test Environment

* **Developer Profile**: The project creator is currently learning Chrome Extension development. This is their first browser extension project. All future agents must provide exceptionally clear, detailed, and step-by-step guidance.
* **Test Account**: `vasilmitov@gmail.com`
* **OAuth Consent Status**: The Google Cloud OAuth consent screen is in "Testing" mode. Any test account (like `vasilmitov@gmail.com`) must be explicitly whitelisted under the **Test Users** section of the Google Cloud Console for the OAuth authentication flow to succeed.

---

## 8. Path to Chrome Web Store Publishing

To publish the extension publicly:
1. **OAuth Status Change**: In the Google Cloud Console OAuth Consent screen, click **Publish App** to transition the app from "Testing" to "In production". This allows all public users to connect their Drive.
2. **First Upload**: Zip the `extension/` directory (excluding `.git`, `node_modules`, etc.) and upload it to the Chrome Developer Dashboard. This registers the extension and assigns it its official, permanent **Web Store Extension ID**.
3. **Re-bind OAuth Client ID**: Create a new OAuth Client ID of type "Chrome Extension" in the Google Cloud Console, and bind it to the new **official Web Store Extension ID**.
4. **Update Manifest**: Replace the client ID in [manifest.json](file:///c:/Users/vasil/Documents/Pravq-go-canvas-extension/extension/manifest.json) with this new Web Store Client ID and upload a new version.
5. **OAuth Verification**: Submit the OAuth consent screen for verification to Google. Since the extension requests the `drive.appdata` scope, Google requires a privacy policy URL and a short YouTube explanation video demonstrating how the extension uses their Google Drive files.
