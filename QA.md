# Local validation — 2026-11-17

- 18 Node tests passed: pagination beyond short pages, false-completeness guards,
  optional ratings, unknown price/time, independent portions, discounted food-only
  price, request allowlist, stop/resume, transient menu retry, address invalidation,
  429 retry deadline and concurrent-start fencing.
- All JavaScript syntax and Manifest V3 resource paths validated.
- ZIP CRC and exact correspondence of packaged runtime files to source verified.
- Browser UI: default sample criteria return 9 results. 250,000–350,000 Toman,
  maximum 25 minutes, minimum restaurant rating 4.5 return exactly 2 sample meals:
  salad 295,000 / 20 minutes / 4.8; rice 342,000 / 25 minutes / 4.6.
- Browser UI: price sorting, stop and resume to the same 9 results verified.
- Screenshot: demo-preview.jpg. Demo tab deliberately retained for the user.
- Preview server: 127.0.0.1:18770, standalone, no external serving interface.
- Chrome installation was reported completed by the user. This browser-control
  session exposes only the in-app browser, which cannot load unpacked extensions.
  Live Snappfood search result is awaiting user feedback; no end-to-end live-API
  success is claimed. Demo content is prominently labeled as sample data.
- No account secrets, cookies or site storage are read or persisted by extension
  code. Browser cookies attach normally to the two allowlisted same-origin GET
  endpoints. Only non-sensitive filter preferences use chrome.storage.local.

## Menu HTTP 400 correction — 0.1.1

User supplied a live screenshot: 106 menus rejected with HTTP 400 while vendor
listing succeeded. Fresh page-resource inventory from the actual Snappfood menu
showed apigw.snappfood.ir/menu-read-model/0gg74q, vendor-details, vendor-review
and vendor-rewards calls. The extension had called the legacy same-origin
/mobile/v2/restaurant/details/dynamic endpoint from an older reference.

Version 0.1.1 now targets only the current public menu route on the gateway
through the Snappfood tab, retains the original limited extension permissions,
forwards only public client/menu flags and does not read account credentials.
The normalizer supports category/product/variation wrappers, discount.amount,
separate portions and known price fields. Unknown contracts pause explicitly.
Three consecutive HTTP 400 menu failures stop the scan instead of hammering
all remaining vendors. Service error body is not echoed; only safe validation
field names and a service code are returned. UI version label identifies a
successfully reloaded extension.

29 offline tests passed including the serialized browser request function,
current gateway target, context flags, forbidden routes, error redaction, body
limits, 429 deadlines and repeated-400 circuit breaker. JS syntax, ZIP contents
and 0.1.1 manifest version verified. Direct runtime HTTP is blocked with 403,
so the live menu payload and complete corrected Chrome flow still await the
user's Reload-and-test feedback; no live-success claim is made.

## Native food links — 0.1.2

The user confirmed successful live food collection with 0.1.1. The new request
was to open the food itself, rather than only its restaurant. Clicking the
actual Snappfood food title revealed the native /product/{title}-pp:{parentId}/
route with product_id containing variation IDs. The exact URL produced by
foodLink(0gg74q, 180, 7075157, آش رشته), including the bare vendor-code menu base,
was then opened and verified to show the food detail page and its portion prices.
The native site still displayed all portions; no Add button was clicked.

Parent IDs and portion IDs are now retained independently. Missing parent IDs
fall back to an explicit menu-position link; a narrowly scoped content helper
scrolls/highlights the numeric DOM ID without clicking any purchase control.
Actual DOM IDs 180 and 7075157 were verified on the source menu. The fallback
helper has an offline DOM-behavior test; its installed-Chrome integration remains
user-side. Native direct food URLs were verified live in the controlled browser.

36 tests passed. Version, syntax and package checks are completed below.

## Branding, delivery quotes and count audit — 0.1.3

Renamed all current user-facing entry points to غذام کو؟. Courier quotes are
carried from the existing vendor response to each food option and displayed
separately. Active discounts, free delivery, missing and invalid quotes are
handled distinctly; courier cost does not change the food-price filter.

The count now explicitly distinguishes eligible restaurants from matched
food/portion options. Per-menu audit totals are replaced on resume, not added
twice. A collapsed breakdown explains parsing exclusions and first-failing
filters; optional query and extras filters are visible in the result scope.

43 offline tests passed, including 105 eligible restaurants yielding three
matching options, duplicate menu rails, missing prices, quote propagation and
resume accounting. The shared demo UI was checked in the controlled browser:
new name/version, paid/free/unknown/discounted delivery, 11 menu options with
two price exclusions and nine matches; query پیتزا yielded two matches and
seven query exclusions. Screenshot: ghazamkoo-preview-v0.1.3.jpg.

This UI verification used prominently labeled sample data. It does not audit
the exact historical 105/3 live Chrome run or claim exhaustive Snappfood
coverage. The user had already confirmed live fetching and food links in
earlier versions; the installed extension needs Reload for this version.

## Brand launcher — 0.1.4

Shared fork/question glyph replaces the knife; four PNG sizes registered for
extension and action icons, included and byte-verified in the ZIP. Source syntax
checks and all 43 existing tests pass. Local browser preview verified collapsed
icon and expanded keyboard-focus label. Hover uses the same expansion rule;
reduced-motion preference disables transitions. Installed Chrome reload remains
user-side. Screenshot: brand-preview-v0.1.4.png.

## Launcher correction — 0.1.5

Natural content width replaces the fixed 160px expanded width. RTL flex places
icon on the right and bold (800) label on its left; 7px label spacing and a 26px
radius produce a compact pill. Local browser preview confirmed the expanded
layout. Hover and keyboard focus share the expansion rule.

The previous PNGs contained zero light glyph pixels at 128px: ImageMagick SVG
conversion had dropped the stroked path. Re-rendered through librsvg/Cairo;
visually inspected 128px PNG and checked >10% light glyph pixels at all four
sizes (16/32/48/128). 43 existing tests passed. No permission changes.

## Lazy-menu fallback — 0.1.6

Replaced passive-only 25s DOM observation with bounded, overlapping page scrolls
(up to 45s, with stable-bottom and step limits). Exact variation ID is still the
only highlight target. No category, add-to-cart or order control is clicked.
User wheel/touch/pointer/navigation keys cancel seeking; navigation, hidden tab
and teardown also stop it. Four new fake-timer tests cover lazy mounting after
three steps, user cancellation, navigation and cleanup. Full suite: 47 passed.
Live installed-Chrome lazy scrolling remains user-side. No changes to native
product-detail URLs or Pro price calculations; Pro source contract is unverified.

## Pro account and pricing — 0.1.7

Inspected the user's logged-in IAB homepage: explicit membership link present.
On Saaghe (94x4jy), the DOM showed 799000 list price, 25% vendor plus 15% Pro,
509362.5 raw / 509363 displayed final; coupon details stated a 200000 minimum,
35000 delivery reduction, 15% basket reduction, and one-coupon-per-order rule.
No basket or order controls were used. Price data attributes and coupon modal
were inspected through rendered DOM; no account credentials were read.

Added temporary inactive-homepage account inspection with bounded lifetime and
finally cleanup. Unknown is distinct from signed-out and confirmed Pro. Only
status/time are cached per source tab, cleared on tab removal; each search
refreshes status. Unknown status never activates Pro. Rewards is now a third
narrow allowlisted read route. Conditional offers require explicit eligibility,
known type/minimum/cap; cashbacks, unknown and order-count conditions are not
applied. Item Pro and basket Pro are not double-applied. Native source mapping
uses known reference field contracts; installed-Chrome end-to-end JSON decoding
has not yet been verified against the user's Pro session.

62 tests passed including source example arithmetic, no double discount,
unknown account, 5% vs 15%, caps/minimums, one coupon, rejected conditions,
DOM account labels, temporary tab cleanup and lower offer deduplication.
Shared demo UI verified confirmed-Pro status, 15% badge and 267750 food price
from 350000 with 10% ordinary then 15% Pro. Demo is prominently sample data;
it is not proof of live extension/API integration. Screenshot:
pro-preview-v0.1.7.png.

## Rendered menu prices and nested scrolling — 0.1.8

User reported both previous approaches failed. Removed account.js, pro.js,
account UI/cache, temporary homepage probes and direct rewards calls. Restored
two-endpoint API allowlist. Pro math tests were retired with that subsystem.

Live Saaghe DOM inspection identified SECTION#main-container with overflow:auto,
835px viewport and 18838px content. Window scrolling had targeted the wrong
surface. Main result anchors previously used native product detail routes,
which bypassed the menu-only focus helper; now they use the exact variation
menu hash. Helper now scrolls nested main-container, ignores zero-size matches
and waits for foreground visibility rather than abandoning background opens.
A real browser fixture using the production helper found a target added only
after the fourth lazy section: nested scrollTop 1554, target top 452.8px.
Screenshot: focus-preview-v0.1.8.png. This fixture is explicitly test data.

Price verification now renders each vendor menu in one inactive temporary tab,
reads only public card attributes and advances its actual scroll container.
Captures actual final price; no account gate or percentage inference. Live
Saaghe variation 27475147 yielded raw 509362.5, displayed 509363 toman, Pro
attribute 15. This confirms the DOM extraction contract, not installed-Chrome
end-to-end execution of the temporary-tab worker. That integration remains to
be confirmed after Reload. Stop and exceptions close temporary tabs. Redirected
non-menu pages are ignored; empty/partial reads are not reported complete.
Missing prices are excluded and partial menus remain retryable. A retry replaces
that vendor's previous filtered results. Only observed price quotes feed filters.

Full automated suite and package verification completed for this version.

## Opt-in rendered verification — 0.1.9

User reported temporary tabs and slow search. Made the rendered-menu worker
strictly opt-in via verifyPrices === true; default is false and saved preferences
cannot silently re-enable it on panel load. Compact collapsed UI explains that
verification opens one temporary tab per vendor and is slower. Mode participates
in checkpoint identity. Fast mode retains API-discounted prices and menu-focus
links; conditional basket coupons remain an explicit accuracy limitation.

59 tests passed. Added a regression test proving a default scan never invokes
the rendering worker, returns API discounted price and finishes successfully.
Existing explicit-verification tests now opt in. No live throughput benchmark
is claimed; removal of the rendering calls is verified deterministically.

## Service and food-category selection — 0.2.0

Observed the site's own homepage service links and live resource URLs through
browser asset inventory on 2026-11-22. Native scoped listing path was
/search/api/v4/restaurant/vendors-list for all eight supported services, with
sp_alias changing per service. Clicking Fast Food produced category=7 in the
page URL and category={"value":7,"sub":[]} in the native list request. Other
restaurant category IDs were read from rendered data-category-id attributes.
No identifiers were guessed from category names. Address/account/device IDs
from native traffic were not copied into the implementation or QA fixtures.

Added compact service/type selects, with type and restaurant-extras controls
hidden outside restaurants. Filter preferences persist; category is part of
checkpoint identity and every listing-page request. Default all-restaurants
keeps its existing v1 path; scoped searches use the observed native v4 route.
Merchant links, hash focus and optional rendered-price verification preserve
service paths; known merchant metadata can override collection service for
mixed listings. Supermarket/Express is excluded and host permissions are
unchanged. Fast mode remains default and opens no extra tabs.

70 automated tests passed: exact upstream category encoding, service scoping,
legacy preferences, scope changes/resume isolation, safe links/focus, native
v4 route allowlist, optional renderer routing and non-restaurant drink handling.
Browser sample-data checks: fast-food demo limited to two vendors and four
matching options; cafe selection hides food type and extras controls. Source
URL contracts were observed live; installed-Chrome category-search results
still require user Reload-and-test. Demo is not live result coverage proof.

Final visual check caught and corrected a CSS class-name collision between the
new food-type field and existing card badges. The selector now has its own
sf-food-type-field class. Both controls align side-by-side in the sidebar;
changing to cafe expands the service select to full width. Reload restored the
saved restaurant/fast-food choice. Screenshot: categories-preview-v0.2.0.png.


## Native v4 listing regression — 0.2.1

User screenshot showed the empty/repeated-vendor warning immediately on search.
Reproduced the underlying parser failure against public Snappfood v4 responses:
merchant cards are still type VENDOR, but data uses vendorCode and isOpen instead
of v1 code/is_open. 0.2.0 discarded every v4 merchant before generating its page
signature. This was an adapter regression in the category implementation.

Fetched the observed public listing endpoints with synthetic test coordinates,
no user cookies, tokens, account identifiers or browser storage. Native public
_app code confirms vendorCode||code and count_details pagination. Added support
for both schemas, uppercase service aliases and the current numeric service
field. Rating prefers the normalized 10-point source; the rate fallback is
already 5-point. Courier quotes retain the existing discount flag semantics.

v4 requests now carry the response's separate vendor_index/item_index cursors,
validated as bounded nonnegative integers, and preserve them across interrupted
listing retries. Banner/text-only pages advance; repeated pages and the hard cap
remain partial coverage. Unreadable vendor IDs fail explicitly instead of being
silently discarded. No endpoint, permission, request concurrency, auth access or
rendering-default expansion.

76 automated tests passed, including a sanitized synthetic fixture reflecting
the live v4 schema. Additional checks against fetched real responses recognized
all 30/30 legacy cards, 10/10 fast-food cards, 10/10 cafe cards and 10/10 cards on
the second scoped page. Second-page native cursor advanced 10/13 to 20/23 with
zero overlapping direct vendor cards. No real merchant bodies or user location
were added to fixtures. Installed Chrome extension still needs user Reload and
fresh search; this validation does not claim Chrome end-to-end execution.


## Unified product groups — 0.3.0

Added local product grouping across every supported service: main food, drinks,
salads, starters/sides, desserts/sweets, and other. These are extension display
groups, not official universal source tags. The classifier prefers an ordinary
menu section, falls back to the product name for ambiguous/promotional sections,
and keeps unknown products visible in Other. Persian/Arabic letters, diacritics,
word boundaries and common mixed-menu labels are normalized. Descriptions are
not used, so incidental ingredient mentions there do not drive classification.

Menu category provenance is gathered independently of pricing for each unique
variation. It supports native menuCategoryID/menuCategoryTitle and the existing
parent-section fields. A normal menu section survives a cheaper duplicate in
Popular/Discounted rails, including when its original occurrence lacks a price.
Native parent/variation links, minimum valid price and audit deduplication remain
unchanged. Every row carries category/categoryId and productCategory.

Replaced the old extras-removal checkbox in the UI with compact local result
filters. All products meeting price/time/rating/query remain in memory. Old
hideExtras preferences cannot discard them in this UI. Main food is the initial
restaurant view; non-restaurant and explicit keyword searches start at All.
Counts and `showing X of Y` distinguish the current category from all matches.
Zero-count groups are disabled, unknowns remain accessible, switching category
resets display pagination but does not call the transport or renderer. Category
buttons keep focus and expose aria-pressed. Existing sorting works on the subset.
Fast mode and network permissions are unchanged. Added the new shared module to
web-accessible resources for extension imports.

84 automated tests passed. Coverage includes original-category preservation at
lower promotional prices, native per-product category metadata, conservative
unknown handling, rating/price/link regressions, and all eight services retaining
products while local group switches make no network calls.

Browser QA used explicitly labelled sample data in /demo/: Iranian restaurant
returned eight matches (three mains, one drink, one salad, one starter, one
dessert and one unknown); each local filter showed its expected subset. Cafe
started at All with food and salad preserved. A restaurant keyword search for
latte started at All and displayed its drink. Legacy saved extras preferences
did not remove drinks. Corrected the selected-button hover contrast and disabled
cursor styles; final selected background rgb(36,92,74), no document horizontal
overflow. Screenshot: product-categories-preview-v0.3.0.png. The browser demo
shares production app/scanner code, but is not installed-Chrome live API proof;
user must Reload extension/tab and start a fresh search.


## Native helper auto updates — 0.4.0 (2026-11-23)

Added a standard-library Python Native Messaging helper and one-time user-scoped
installer. Git is not required and no permanent daemon/localhost listener runs.
The browser checks every six hours, on startup, and via a compact manual-check
control. Distribution injects a public manifest key so the managed installation
has stable extension ID fidnjhkdhocccfmojfnkfheopfbpileh. The source manifest keeps
its development path ID; existing development preferences are not migrated to
this new ID. Later managed updates retain Chrome storage under the stable ID.

The only update source is the public HTTPS GitHub Releases API for
The-Foxy/WheresMyFood, with exact asset name snappfood-assistant.zip. Drafts,
prereleases and non-increasing versions are not installed. Asset size and GitHub
API SHA-256 digest must match; this is repository/HTTPS trust, not an independent
publisher signature. The helper rejects arbitrary message actions, URLs, shell
commands or destination paths. It checks archive paths, duplicates, symlinks,
expanded size, mandatory files, manifest identity, permitted hosts/permissions
and entrypoints before applying anything. A staged archive is verified again at
commit. One-use tokens and a cross-process lock protect the transaction.

Native prepare does not change active files. The coordinator gates new transport
reads and locks every open Snappfood tab, refusing to apply if any scan/request
or render job is active or a tab's status is unknown. Deferred checks avoid
repeated GitHub calls while a scan remains busy and cache the validated archive.
Once idle, the directory swap retains one previous version; a failed swap rolls
back and a later helper start recovers a crash between renames. A lost commit
acknowledgement triggers a status read rather than a blind retry; unconfirmed
state stays locked until reconciled. Reload reattaches the content UI to open
Snappfood tabs without reloading the site's page. Result/checkpoint memory can
reset after update; this is documented. No account/site storage is read.

Added alarms/nativeMessaging permissions only; HTTP host access remains limited
to Snappfood. Native-host registration allows only the fixed distribution ID.
The helper never self-updates. Installer scripts cover Chrome, Chromium, Edge
and Brave paths; actual browser execution on Windows/macOS is not yet claimed.
A CI matrix and tag-triggered draft/upload/publish workflow are prepared locally.
No source, tag or Release has been pushed/published in this task.

Validation: 95 JavaScript tests + 15 Python tests passed (110 total), including
native framing, authorized/unauthorized origin subprocesses, concurrent helper
exclusion, tampered archive, permission changes, rollback/recovery, busy-tab and
unknown-tab deferral, duplicate browser checks, lost acknowledgements and native
error classification. Both release ZIPs passed CRC/source/manifest checks.

Installed the helper for the current Linux user under
~/.local/share/WheresMyFood and registered its current-user Chrome native host.
Direct launcher/framing checks passed. The first Chrome attempt used the old
development ID and was correctly refused. After the user disabled that copy and
loaded the managed extension folder, they confirmed the `no_release` message.
The helper's own bounded status-only log independently recorded host_started
and no_release from that browser check. This confirms the installed browser to
native-helper to GitHub path. A real different-version Release-to-Chrome update
has not yet run because the repository has no Release; staged update/reload
paths are covered by deterministic tests, not presented as live distribution.

Browser demo UI: update status/manual button worked with explicitly synthetic
up-to-date status and the same app/scanner still completed the Iranian sample
search (8 matches, 3 main-food cards). Demo does not call the native host or
GitHub. Screenshot auto-update-preview-v0.4.0.png shows this sample UI.


## Release 1.0.0 — Simplified setup and flexible package validation (2026-11-24)

- Promoted extension, package and core version constants to `1.0.0`.
- Fixed malformed closing/opening `<option value="3">` tag in `src/app.js` so `۳ به بالا` renders in `minRating`.
- Relaxed `updater/updater.py` file-path allowlist to accept safe nested web-extension assets (`.js`, `.mjs`, `.css`, `.html`, `.json`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.otf`, `.txt`, `.md`, `.wasm`), wildcard patterns in `web_accessible_resources`, `*.snappfood.ir` host patterns and non-intrusive extension UI permissions while still blocking executables, scripts, dotfiles, symlinks, zip-slip and non-Snappfood host escalation.
- Simplified `updater/install.py` and `dist/wheresmyfood-setup.zip`: default registration across Chrome, Edge, Brave and Chromium (`--browser all`), idempotent repair without downgrading an already-newer installed extension, automatic clipboard copy, local RTL `setup-guide.html`, and root double-click launchers (`Install-Windows.bat`, `Install-macOS.command`, `install-linux.sh`).
- Validation: 96 JavaScript tests + 16 Python updater tests (112 total) and package verification passed.


## Release 1.1.0 — Header version update popover and fast-only pricing (2026-11-24)

- Removed `"داخل مرورگر خودت"` from the header badge, enlarged `v1.1.0` pill, and merged `"به‌روزرسانی ابزار"` + `"بررسی نسخهٔ جدید"` into an accessible header popover anchored to the version button (with outside-click and Escape-first dismissal).
- Completely removed the unused rendered-menu price verification subsystem (`src/rendered-menu.js`, `tests/rendered-menu.test.js`, `SF_RENDER`, `verifyPrices` UI/filter option and styles).
