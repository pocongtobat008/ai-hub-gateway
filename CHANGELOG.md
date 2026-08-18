# Changelog

## Unreleased

## 1.8.0 - 2026-07-28

+ [New] Added configurable default upstream model name and default thinking effort, editable from the settings page and overridable via the `-standard`, `-extended`, `-max` suffixes on model names.
+ [Fix] Added a setting to remove local conversations even when no image is produced, hiding the conversation record asynchronously when image generation fails, times out, or only returns text.
+ [Fix] `/v1/models` now aggregates the official model list across account types; text requests pick accounts based on model permissions.
+ [Fix] Filter out hidden, non-final, and internal-tool-bound assistant messages so search instructions and reasoning content never leak into API output.
+ [Fix] Fixed output sanitization accidentally stripping spaces before punctuation in code and commands.
+ [Fix] Added a configurable hard timeout cap for image generation SSE streams to avoid long-hanging upstream connections.
+ [Improve] Database storage now syncs incrementally, only adding, updating, or deleting changed records and preserving IDs of unchanged ones.

## 1.7.0 - 2026-07-05

+ [Remove] Removed registration and anti-abuse mechanisms that caused GitHub account bans.

## 1.6.0 - 2026-07-04

+ [Fix] Fixed sub2api import issues.
+ [Fix] Fixed frontend 404/405 issues.
+ [New] Added "delete conversation after generating image" feature.
+ [Adjust] Pro accounts no longer treated as unlimited; roughly 1000 images per day.

## 1.5.0 - 2026-06-13

+ [New] Added WARP / Privoxy / FlareSolverr clearance solutions; when registration hits Cloudflare blocks, clearance can be refreshed and retried.
+ [New] Added `outlook_token` mailbox pool with Outlook/Hotmail registration verification code reading.
+ [New] Added web search compatibility endpoint, image edit masks, and image task capabilities.
+ [Improve] Updated sentinel/PoW acquisition for better upstream request compatibility.
+ [Improve] Adjusted proxy priority and registration request retry logic.

## 1.4.1 - 2026-06-03

+ [New] Account refresh is now asynchronous with frontend polling for refresh/re-login progress.
+ [New] Added re-login feature on the account pool page to recover abnormal accounts via password login.
+ [New] Auto re-login of abnormal accounts after refresh (toggleable in settings).
+ [New] Parallel image generation using separate threads and accounts for multiple images.
+ [New] Image polling timeout automatically switches accounts and retries (up to 4 times); connection timeouts retry on the same account with increasing waits.
+ [New] Image second-confirmation mechanism with configurable check-before-hit; can be disabled to return results directly.
+ [New] Image task progress tracking showing current generation step (upload/preheat/token fetch/generating etc.).
+ [New] Continued polling after image timeout with a "Keep waiting" button in the frontend.
+ [New] New settings for image second-confirmation, timeout wait time, and auto re-login.
+ [Improve] Optimized image page scrolling/loading performance, lazy image loading, and scroll position save/restore when switching conversations.

## 1.4.0 - 2026-05-31

+ [New] Added AI-generated editable PSD file reverse engineering.
+ [New] Added AI-generated editable PPT file reverse engineering.

## 1.3.1 - 2026-05-30

+ [New] Added ChatGPT search debugging and Skills.

## 1.3.0 - 2026-05-30

+ [New] Added ChatGPT search endpoint reverse engineering.

## 1.2.4 - 2026-05-30

+ [New] Added chat completion cache and duplicate request merging.
+ [New] Added one-click jump to the infinite canvas.

## 1.2.3 - 2026-05-29

+ [New] Added per-account proxies.
+ [Fix] Fixed 503 error messages and email line breaks in the frontend.

## 1.2.2 - 2026-05-29

+ [New] Added Codex-chain image generation with 2k/4k support.
+ [New] Support refreshing account info via refresh token.

## 1.2.0 - 2026-05-28

+ [New] Current version baseline: web panel, image generation, account pool management, registration, image management, log management, and settings.
+ [New] Click the frontend version number to open the version update dialog showing current version, latest version, and changelog.
+ [Improve] Improved registration efficiency with much higher success rate.
+ [Improve] Improved image page configuration options.
