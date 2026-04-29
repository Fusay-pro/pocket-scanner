# Pocket Scanner — React Native Port Design

**Goal:** Rebuild the Pocket Scanner web app as a bare React Native app that runs natively in the Xcode iOS simulator, keeping all business logic and backend unchanged.

**Architecture:** New bare RN project (`pocket-scanner-rn`) beside the existing web repo. Utility files (`storage.ts`, `aiChat.ts`, `barcodeApi.ts`, `types.ts`, `i18n.ts`, `SettingsContext`) are copied over with minimal changes (AsyncStorage replaces IndexedDB). Every screen is a straight port — same state, same handlers, new JSX using RN primitives instead of HTML.

**Tech Stack:** React Native 0.79 (bare), TypeScript, React Navigation 7, react-native-vision-camera v4, lucide-react-native, @react-native-async-storage/async-storage, @supabase/supabase-js, react-native-image-picker, react-native-svg.

---

## Project Location

```
~/pocket-scanner-rn/          ← new bare RN project (sibling to pocket-scanner/)
├── src/
│   ├── screens/              ← one file per screen
│   ├── components/           ← shared UI components
│   ├── utils/                ← copied from web app, AsyncStorage swap
│   ├── contexts/             ← SettingsContext (identical)
│   ├── i18n.ts               ← identical copy
│   ├── types.ts              ← identical copy
│   └── theme.ts              ← color/spacing tokens (replaces App.css variables)
├── ios/                      ← Xcode project (open to run in simulator)
└── android/                  ← generated, not used
```

---

## Navigation Structure

React Navigation native stack + bottom tabs, matching the web app's routing:

```
<NavigationContainer>
  ├── LoginScreen                     (shown when unauthenticated)
  └── <BottomTabs>
        ├── Stores tab
        │   <NativeStack>
        │     StoreListScreen         /
        │     StoreScreen             /store/:storeId
        │     ProductScreen           /store/:storeId/product/:productId
        │     ScanScreen              /store/:storeId/scan
        │     SellScreen              /store/:storeId/sell
        ├── Overview tab → OverviewScreen
        ├── Analytics tab → AnalyticsScreen
        └── Settings tab → SettingsScreen
```

---

## Screen Inventory

| Web page | RN screen | Notes |
|---|---|---|
| StoreList.tsx | StoreListScreen | List + add store |
| StorePage.tsx | StoreScreen | Product list, expiry badges, search |
| ScanPage.tsx | ScanScreen | Camera via vision-camera, add/receive modes |
| SellPage.tsx | SellScreen | Cart, vision-camera scan, checkout |
| ProductPage.tsx | ProductScreen | Edit product, photo upload |
| AnalyticsPage.tsx | AnalyticsScreen | Sales history, revenue |
| OverviewPage.tsx | OverviewScreen | Cross-store summary |
| SettingsPage.tsx | SettingsScreen | Lang, currency, thresholds |
| LoginPage.tsx | LoginScreen | Supabase email auth |

---

## Data Layer

All utility files copied from the web app and adapted:

- **`storage.ts`** — swap `localforage` / IndexedDB calls to `AsyncStorage`. All function signatures stay identical (`getProducts`, `saveProduct`, `updateProduct`, `deleteProduct`, `recordSale`, `receiveStock`, etc.).
- **`supabase.ts`** — `@supabase/supabase-js` works identically in RN; swap `localStorage` session storage to `AsyncStorage` via the Supabase `auth.storage` option.
- **`aiChat.ts`** — identical; calls the same `/api/ai-chat` endpoint.
- **`barcodeApi.ts`** — identical.
- **`types.ts`** — identical.
- **`i18n.ts`** — identical.
- **`SettingsContext`** — identical logic; `AsyncStorage` for persistence instead of `localStorage`.

---

## Native Features

### Barcode Scanning
`react-native-vision-camera` v4 with `vision-camera-code-scanner` plugin. Replaces `html5-qrcode`. Camera permission requested at runtime via RN permissions API. Used in both ScanScreen and SellScreen.

### Photo Capture / Upload
`react-native-image-picker` for picking/capturing photos. Image resized on-device using `react-native-image-picker`'s built-in `maxWidth`/`maxHeight`/`quality` options (800px max, quality 0.82). Uploaded to Supabase Storage identically.

### Icons
`lucide-react-native` — same icon names as the web app (`ArrowLeft`, `Camera`, `ShoppingCart`, etc.). Requires `react-native-svg`.

---

## Styling

`StyleSheet.create()` everywhere. A `theme.ts` file exports the same design tokens as the current CSS variables:

```ts
export const colors = {
  primary: '#00b4d8',
  bg: '#0a0f1e',
  surface: '#111827',
  // ...
};
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 };
export const radius = { sm: 8, md: 12, lg: 16 };
```

No CSS-in-JS library needed — plain StyleSheet keeps it fast.

---

## Out of Scope

- Android build (ios only for now)
- Any new features beyond the current web app
- CI/CD pipeline
