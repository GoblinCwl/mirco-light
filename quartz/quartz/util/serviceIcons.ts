const paths: Record<string,string> = {
  Artalk:'M4 4h16v12H9l-5 4V4Zm4 5h8m-8 3h5',
  OpenList:'M3 7V5h7l2 2h9v13H3V7Zm4 5h10m-10 4h7',
  DanmuApi:'M3 5h18v13H8l-5 3V5Zm4 5h6m3 0h1M7 14h10',
  Jellyfin:'m12 3 9 17H3L12 3Zm-2 6v6l5-3-5-3Z',
  Fontinass:'m5 20 7-16 7 16M8 14h8M3 20h4m10 0h4',
  Syncthing:'M5 8a8 8 0 0 1 13-2l3 3m0-6v6h-6M19 16A8 8 0 0 1 6 18l-3-3m0 6v-6h6',
  Gitea:'M6 3v12a4 4 0 1 0 4-4H6m6-5h7v7M4 3h4m9 4 2-2 2 2',
  ActivityWatch:'M12 3a9 9 0 1 0 9 9M12 7v5l3 2m1-11 2 2 3-3',
  AstrBot:'M5 8h14v12H5V8Zm7-5v5M9 12v2m6-2v2m-6 3h6M2 11v6m20-6v6',
  NapCat:'M4 10 3 3l6 4a10 10 0 0 1 6 0l6-4-1 7v5a8 6 0 0 1-16 0v-5Zm4 3h.1m7.9 0h.1M10 17h4',
  Beszel:'M3 4h18v16H3V4Zm3 10 4-5 4 7 4-5',
 }
export function serviceIcon(name:string){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[({artalk:'Artalk',openlist:'OpenList',danmu:'DanmuApi',jellyfin:'Jellyfin',fontinass:'Fontinass',syncthing:'Syncthing',gitea:'Gitea',activitywatch:'ActivityWatch',astrbot:'AstrBot',napcat:'NapCat',beszel:'Beszel'} as Record<string,string>)[name]||name]||'M4 4h16v16H4V4Zm4 4h8m-8 4h8m-8 4h5'}"/></svg>`}
