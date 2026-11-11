# Local patch to ArtPlayer Danmuku 5.2.0 (MIT)

`emit()` creates a new entry already marked `wait`. Upstream then calls
`setState(entry, 'wait')`, which filters the entire waiting array before pushing
the new entry. Since that entry has never been inserted, the filter removes
nothing and makes a large initial load quadratic.

The initial insertion now pushes directly into `states.wait`; all subsequent
state transitions still use upstream `setState()`. This preserves entry shape,
ordering and rendering. The player also loads in bounded batches to let input,
network and media events run. The asset URL carries `quartz-queue1` to invalidate
previous browser caches.

Upstream: https://github.com/zhw2590582/ArtPlayer/tree/master/packages/artplayer-plugin-danmuku

`reset()` had the same quadratic removal/reinsertion loop. It now rebuilds the
four state lists once, marks entries waiting, and reuses `makeWait()` for DOM
cleanup. `makeWait()` avoids a redundant transition for an already waiting
entry. Visible node recycling, order and the reset event remain unchanged.
This matters on resize, fullscreen and source changes as well as initial load.
