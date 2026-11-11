# Drive ZIP download sources

- `StreamSaver.js`: upstream StreamSaver.js tag `2.0.6`, MIT; https://github.com/jimmywarting/StreamSaver.js/tree/2.0.6.
- `openlistZip.js`: OpenList Frontend's `src/utils/zip-stream.js`, MIT; https://github.com/OpenListTeam/OpenList-Frontend/blob/main/src/utils/zip-stream.js.

StreamSaver is adapted for ES modules and guards Blob-fallback cancellation. The ZIP writer is exported as an ES module and adds cancellation propagation and ZIP32 size/count checks. License notices are retained beside both sources. The saving bridge uses the existing Drive host's `/streamer/mitm.html` and worker, matching OpenList. No primary-site proxy or additional server route is needed.

- `uploadHashWorker.js`: a bundled inline worker using hash-wasm `4.12.0` (MIT, license in `hash-wasm.LICENSE`), matching OpenList's upload hashes. Its source is in `uploadHashWorker.source.txt`; regenerate by bundling it with `hash-wasm`'s `dist/index.esm.js` as `./hash-wasm.js`, esbuild `--bundle --minify --format=iife --platform=browser`, then JSON-encoding the result as an ES module default string export. It streams a File in the worker and exports MD5, SHA-1 and SHA-256, without external CDN requests.
