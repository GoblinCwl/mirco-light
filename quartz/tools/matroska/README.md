# MKV subtitle reader

This is a build package, not a server. `npm ci && npm run build` produces the
local, lazy-loaded `/static/vendor/matroska/reader.js` and its versioned URL.
Run `npm test` after building. The MIT dependency is pinned to 1.0.1 and its
license ships with the generated reader.

`openSubtitles(url, { size, signal })` reads the file header and track metadata.
It returns names, languages, default flags and a `readWindow(track, seconds,
signal)` method. The player adds the tracks to its menu immediately after this
metadata step; it does not wait for subtitle blocks throughout the movie.

On selection, `readWindow` loads the Cues index, locates blocks from 15 seconds
before to 75 seconds after the playback position, and reads those byte ranges.
CueDuration retains overlapping long cues; a preceding cue supports indexes
without durations. During dialogue-free gaps the next cue is prefetched. Fonts
are loaded once, only if an ASS/SSA track is selected. Parsed subtitle blocks
remain cached for this video, and an 8 MiB range cache avoids repeated requests.
Failed index/font requests are not cached, so a later window read can recover
from a temporary network error without reloading the page.

Playback refills the window before its end. Seeking cancels the old read and
locates the new position through Cues. Selecting Off/external subtitles cancels
window reads; leaving the page releases the session, worker and font/blob URLs.
The player preserves an external/default subtitle and explicit user selections.

Supported codecs are ASS, SSA, SubRip and WebVTT; bitmap PGS/VobSub tracks are
not offered as text subtitles. The same OpenList-authorized media URL is used
with anonymous Range requests. CORS-hidden Content-Range can use the file size
already supplied by OpenList. No server extraction or video rewrite is involved.
Full-file download and unindexed whole-movie scan fallbacks are disabled.

`patch-reader.mjs` exports the pinned package's parsing primitives, preserves
track default flags and CueDuration, filters unsupported codecs, and fixes its
assumption that all Cluster headers have the same VINT width. Cluster headers
are read in parallel without unnecessary 32 KiB read-ahead. Patches fail the
build if the pinned source changes unexpectedly.
