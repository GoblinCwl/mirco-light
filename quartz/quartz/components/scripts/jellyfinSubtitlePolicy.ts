// Jellyfin Web's subtitle burn-in preference names and format groups.
/** Safari's system video compositor cannot include the webpage's ASS canvas.
 * Use one server-rendered subtitle for inline, fullscreen and PiP playback.
 * iOS browsers share that compositor even when branded Chrome or Firefox. */
export function subtitleBurnInForBrowser(mode = 'auto', browser: {safari?: boolean; iOS?: boolean} = {}): string {
  return browser.safari || browser.iOS ? 'all' : mode
}

export function subtitleNeedsBurn(type:string,mode='auto'):boolean {
  return mode==='all' || type==='pgs' && ['onlyimageformats','allcomplexformats'].includes(mode)
    || ['ass','ssa'].includes(type) && mode==='allcomplexformats'
}
