// Shared visual skin retained from the existing site player.
export const playerStyles = `
        .art-video-player.quartz-player{--art-theme:var(--accent);--art-padding:16px;--art-control-height:48px;--art-control-icon-size:21px;--art-control-icon-scale:1;--art-progress-height:4px;--art-progress-indicator-size:11px;--art-border-radius:10px;--q-surface:var(--background);--q-text:var(--foreground);--q-muted:color-mix(in srgb,var(--foreground) 70%,var(--background));--q-bottom:rgba(248,249,250,.97);--q-fade:rgba(248,249,250,.65);--art-font-color:var(--q-text);--art-widget-background:var(--q-surface);--art-tip-background:var(--q-surface);--art-hover-color:transparent;--art-transition-duration:0s;--art-scrollbar-size:5px;border-radius:10px;isolation:isolate;font-family:"Microsoft YaHei",system-ui,sans-serif}
        [data-preview-theme="dark"] .quartz-player{--q-bottom:rgba(14,21,29,.96);--q-fade:rgba(14,21,29,.55)}
        .quartz-player .art-bottom{background-image:linear-gradient(to top,var(--q-bottom),var(--q-fade) 55%,transparent);background-size:100% 112px;overflow:visible}
        .quartz-player .art-poster{inset:0!important;width:100%!important;height:100%!important;max-width:none;max-height:none;background-size:cover!important;background-position:center center!important;background-repeat:no-repeat;transform:none!important;border-radius:inherit}
        .quartz-player .art-controls-left,.quartz-player .art-controls-right{align-items:center;min-width:0;gap:3px}
        .quartz-player .art-control{border-radius:7px;color:var(--q-text);transition:none;flex-shrink:0}
        .quartz-player .art-control:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}
        .quartz-player .art-controls :is(.art-control-previous,.art-control-playAndPause,.art-control-next,.apd-toggle,.art-control-setting,.art-control-fullscreenWeb,.art-control-fullscreen){box-sizing:border-box;height:var(--art-control-height);min-height:var(--art-control-height);align-self:center}
        .quartz-player .art-controls .apd-toggle{position:relative;align-items:center;justify-content:center}
        .quartz-player .art-controls .apd-toggle{display:flex}
        .quartz-player{--q-hint-bg:var(--q-surface);--q-hint-text:var(--q-text)}
        .quartz-player .art-controls [class*="hint--"]::after{box-sizing:border-box;height:28px;padding:0 9px;background:var(--q-hint-bg);color:var(--q-hint-text);line-height:28px}
        .quartz-player .art-controls [class*="hint--"]::after,
        .quartz-player :is(.art-notice-inner,.quartz-status-chip){font-family:inherit;font-size:12px;font-weight:400;text-shadow:0 0 2px var(--art-text-shadow-color)}
        .quartz-player .art-controls :is(.hint--top,.hint--top-left,.hint--top-right)::before{border-top-color:var(--q-hint-bg)}
        .quartz-player .art-controls [class*="hint--"]::before,.quartz-player .art-controls [class*="hint--"]::after{transition:opacity 110ms ease-out,visibility 110ms ease-out,transform 110ms ease-out}
        .quartz-player .art-controls [class*="hint--"]:hover::before,.quartz-player .art-controls [class*="hint--"]:hover::after{transition-delay:40ms}
        .quartz-player .art-control-playAndPause [class*="hint--"]::before,.quartz-player .art-control-playAndPause [class*="hint--"]::after{display:none!important}
        .quartz-player .art-control:hover{background:transparent!important;color:var(--q-text)!important}
        .quartz-player .art-controls svg,.quartz-player .art-settings svg,.quartz-player .art-state svg,.quartz-player .artplayer-plugin-danmuku .apd-icon{fill:currentColor}
        .quartz-player .artplayer-plugin-danmuku svg,.quartz-player .artplayer-plugin-danmuku svg [fill]{fill:var(--q-text)!important}
        .quartz-player .artplayer-plugin-danmuku,.quartz-player .artplayer-plugin-danmuku :is(.apd-toggle,.apd-icon){color:var(--q-text)!important}
        .quartz-player .art-controls,.quartz-player .art-settings,.quartz-player .art-state{color:var(--q-text);text-shadow:none}
        .quartz-player .art-settings,.quartz-player .art-setting-panel,.quartz-player .art-setting-item,.quartz-player .art-selector-list{transition:none!important;animation:none!important}
        .quartz-player .art-settings{height:auto!important}
        .art-video-player.quartz-player{--art-control-opacity:1}
        .art-video-player.quartz-player .art-settings,.art-video-player.quartz-player .art-selector-list,.art-video-player.quartz-player .art-volume-inner,.art-video-player.quartz-player .art-contextmenus{background:var(--q-surface)!important;color:var(--q-text);backdrop-filter:none!important;-webkit-backdrop-filter:none!important;scrollbar-color:var(--q-muted) transparent}
        .quartz-player .art-control-volume .art-volume-panel{left:calc(50% - 32px);right:auto;width:64px;height:164px;padding:0;box-sizing:border-box}
        .quartz-player .art-control-volume:focus-within .art-volume-panel{opacity:1;transform:translateY(0);pointer-events:auto}
        .quartz-player .art-control-volume .art-volume-inner{display:grid;grid-template-rows:18px minmax(0,1fr);justify-items:center;align-items:stretch;gap:8px;width:100%;height:100%;padding:12px 8px!important;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;line-height:normal}
        .quartz-player .quartz-volume-value{display:block;width:100%;height:18px;margin:0;padding:0;text-align:center;font-size:12px;font-weight:500;line-height:18px;white-space:nowrap;color:var(--q-text);font-variant-numeric:tabular-nums}
        .quartz-player .quartz-volume-slider{display:block;writing-mode:vertical-lr;direction:rtl;appearance:auto;box-sizing:border-box;width:20px;height:100%;min-height:0;max-height:100%;margin:0;padding:0;accent-color:var(--accent);cursor:pointer;align-self:stretch}
        .quartz-player .art-control-time{font-size:12px;font-variant-numeric:tabular-nums;letter-spacing:.2px;white-space:nowrap;color:var(--q-muted);padding:0 8px}
        .quartz-player .art-control-progress-inner{border-radius:8px;overflow:visible}
        .quartz-player .art-progress-loaded{background:color-mix(in srgb,var(--q-text) 25%,transparent)}
        .quartz-player .art-progress-played{background:color-mix(in srgb,var(--accent) 55%,#9bc5d7);border-radius:8px}
        .quartz-player .art-progress-indicator{background:#dfedf4;box-shadow:0 0 0 3px rgba(164,199,216,.18)}
        .quartz-player .quartz-timeline{position:absolute;inset:50% 0 auto;height:6px;transform:translateY(-50%);pointer-events:none;z-index:1}
        .quartz-player .quartz-timeline-segment{position:absolute;top:0;height:100%;min-width:2px;border-radius:2px;background:#8aa6b5;opacity:.85;box-sizing:border-box;border-inline:1px solid color-mix(in srgb,var(--q-surface) 35%,transparent)}
        .quartz-player .quartz-timeline-segment[data-type="Outro"]{background:#b19ac3}
        .quartz-player .quartz-timeline-segment[data-type="Recap"]{background:#c3aa76}
        .quartz-player .quartz-timeline-segment[data-type="Preview"]{background:#87ab9d}
        .quartz-player .quartz-timeline-segment[data-type="Commercial"]{background:#c78f82}
        .quartz-player .quartz-timeline-chapter{position:absolute;top:-1px;width:2px;height:8px;transform:translateX(-50%);border-radius:1px;background:var(--q-text);opacity:.8}
        .quartz-player .art-progress-indicator{z-index:2}
        .quartz-player .art-progress-tip{z-index:3;max-width:calc(100% - 8px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .quartz-player .art-settings{background:var(--q-surface)!important;border:1px solid var(--border);box-shadow:none;backdrop-filter:none;max-width:calc(100% - 24px);max-height:calc(100% - 72px)!important;bottom:60px!important;left:auto!important;right:12px!important;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--q-muted) transparent}
        .quartz-player .art-setting-panel{max-width:100%;min-width:0;flex-shrink:0}
        .quartz-player .art-setting-item{min-height:42px;color:var(--q-text);padding:0 12px;border-bottom:1px solid var(--border);font-size:13px}
        .quartz-player .art-settings .art-setting-item:hover,.quartz-player .art-selector-item:hover{background:transparent!important}
        .quartz-player .art-setting-item.art-current{background:transparent;color:var(--accent)}
        .quartz-player .art-setting-item-left,.quartz-player .art-setting-item-left-text,.quartz-player .art-setting-item-right{min-width:0}
        .quartz-player .art-setting-item-left-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .quartz-player .art-setting-item-right-tooltip{color:var(--q-muted)!important;max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .quartz-player .is-track-scrolling{text-overflow:clip!important;scroll-behavior:auto}
        .quartz-player .quartz-track-item .art-setting-item-left{flex:1 1 0;overflow:hidden;justify-content:flex-start!important}
        .quartz-player .quartz-track-item .art-setting-item-right{flex:0 0 auto}
        .quartz-player .art-setting-item-left-icon{opacity:.9;transform:none}
        .quartz-player .art-settings .quartz-setting-icon,.quartz-player .art-settings .quartz-setting-icon *{fill:none!important;stroke:currentColor}
        .quartz-player .art-setting-item-left-icon .quartz-setting-icon{width:20px;height:20px}
        .quartz-player .artplayer-plugin-danmuku svg.quartz-danmuku-icon,.quartz-player .artplayer-plugin-danmuku svg.quartz-danmuku-icon *{fill:none!important;stroke:var(--q-text)!important}


        .quartz-player .art-setting-item-back{position:sticky;top:0;background:var(--q-surface);z-index:1}
        .quartz-player .quartz-settings-heading{display:none}
        .quartz-player .art-notice{top:12px!important;left:12px!important;right:auto!important;bottom:auto!important;width:max-content;max-width:calc(100% - 24px);padding:0!important;pointer-events:none;z-index:45}.quartz-player .art-notice-inner{background:var(--background);color:var(--foreground);border:0;border-radius:4px;padding:4px 8px;line-height:1.5}.quartz-player .art-setting-item-left-icon .quartz-setting-icon{display:block;flex-shrink:0}
        .quartz-player .art-loading{pointer-events:none;color:var(--q-text)}
        .quartz-player.is-playback-loading .art-loading{display:flex!important}
        .quartz-player.is-playback-loading .art-state{display:none!important}
        .quartz-player .quartz-buffering{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:transparent;border:0}
        .quartz-player .quartz-buffering svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;animation:none}
        .quartz-player .quartz-buffering-track{opacity:.16}
        @keyframes quartz-buffering-spin{to{transform:rotate(360deg)}}
        .quartz-player.is-subtitle-pending :is(.art-control-playAndPause,.art-state,.art-setting-item[data-name="subtitles"]){pointer-events:none;opacity:.45}
        .quartz-player .art-control-playAndPause svg{width:22px;height:22px}
        .quartz-player .art-subtitle{color:#fff;font-family:"Microsoft YaHei","PingFang SC",sans-serif;font-size:clamp(16px,3vw,28px);font-weight:500;line-height:1.45;letter-spacing:.02em;text-shadow:0 1px 2px #000,1px 0 1px #000,-1px 0 1px #000,0 -1px 1px #000}
        .art-video-player.quartz-player .art-subtitle,.art-video-player.quartz-player.art-control-show .art-subtitle{bottom:var(--art-subtitle-bottom);transition:none}
        .quartz-player .art-subtitle-line{background:transparent;overflow-wrap:anywhere}
        .quartz-player .quartz-subtitle-style-row{display:flex!important;align-items:center;gap:10px;padding:12px!important;cursor:default!important}
        .quartz-subtitle-style-row label{display:flex;align-items:center;gap:10px;flex:1;min-width:0;white-space:nowrap}
        .quartz-subtitle-style-row input{flex:1;min-width:0;width:70px;accent-color:var(--accent);cursor:pointer}
        .quartz-subtitle-style-row output{min-width:42px;text-align:right;font-variant-numeric:tabular-nums;color:var(--q-text)}
        .quartz-subtitle-style-row input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}

        .quartz-player{ -webkit-tap-highlight-color:transparent }
        .quartz-player-compact{--art-padding:8px!important;--art-control-height:44px!important;--art-control-icon-size:20px!important;--quartz-control-width:clamp(24px,8vw,30px)}
        .quartz-player-compact .art-bottom{background-size:100% 100px}
        .quartz-player-compact .art-controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;height:44px}
        .quartz-player-compact .art-controls-left{flex:1 1 auto;min-width:0}
        .quartz-player-compact .art-controls-center{display:flex!important;flex:0 0 0!important;width:0;min-width:0;padding:0}
        .quartz-player-compact .art-controls-right{flex:0 0 auto}
        .quartz-player-compact .art-controls-left,.quartz-player-compact .art-controls-right{gap:0;flex-wrap:nowrap}
        .quartz-player-compact .art-controls .art-control:not(.art-control-time){width:var(--quartz-control-width)!important;min-width:var(--quartz-control-width)!important;padding:0!important}
        .quartz-player-compact .art-control-time{font-size:11px;padding:0 3px;letter-spacing:0;white-space:nowrap}
        .quartz-player-compact .art-settings{bottom:8px!important;right:8px!important;width:calc(100% - 16px)!important;height:auto!important;max-width:none;max-height:calc(100% - 16px)!important}
        .quartz-player-compact .quartz-settings-heading{display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:3;min-height:36px;padding:0 8px 0 13px;background:var(--q-surface);color:var(--q-text);font-size:12px;letter-spacing:.5px;border-bottom:1px solid var(--border)}
        .quartz-player-compact .quartz-settings-heading button{border:0;padding:0;width:32px;height:32px;background:transparent;color:var(--q-text);font-size:23px;line-height:1;cursor:pointer}
        .quartz-player-compact .art-setting-panel{width:100%!important;flex-shrink:0}
        .quartz-player-compact .art-setting-item-back{top:36px}
        .quartz-player-compact .art-setting-item{min-height:44px}
        .quartz-player-compact .art-setting-item[data-name="subtitles"]{order:-3}
        .quartz-player-compact .art-setting-item[data-name="jellyfinQuality"]{order:-2}
        .quartz-player-compact .art-setting-item[data-name="jellyfinAudio"]{order:-1}
        .quartz-player-compact .art-setting-item-right-tooltip{max-width:112px}

        .quartz-player.quartz-danmaku-in-settings .artplayer-plugin-danmuku{display:none!important}
        .quartz-player .artplayer-plugin-danmuku .apd-config{display:none!important}
        .quartz-player .quartz-danmuku-source{padding:8px 0 12px;margin-bottom:12px;font-size:12px;color:var(--q-text)}
        .quartz-player .quartz-danmuku-source[hidden],.quartz-player .quartz-danmuku-source [hidden]{display:none!important}
        .quartz-player .quartz-danmuku-source label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
        .quartz-player .quartz-danmuku-source select,.quartz-player .quartz-danmuku-search input{box-sizing:border-box;min-width:0;max-width:100%;height:32px;line-height:normal;padding:6px 8px;border:1px solid var(--border);border-radius:5px;background:var(--q-surface);color:var(--q-text);font:inherit;box-shadow:none}
        .quartz-player .quartz-danmuku-source select{flex:1;max-width:150px;white-space:nowrap}
        .quartz-player .quartz-danmuku-source input{width:100%}
        .quartz-player .quartz-danmuku-source :is(input,select,button):focus{outline:none;box-shadow:none}
        .quartz-player .quartz-danmuku-source :is(input,select,button):focus-visible{outline:1px solid var(--q-muted);outline-offset:1px}
        .quartz-player .quartz-danmuku-source button{color:var(--q-text);font:inherit;border:0;border-radius:0;background:transparent;cursor:pointer;padding:4px 0;text-align:left;box-shadow:none;line-height:1.5}
        .quartz-player .quartz-danmuku-source button:disabled{opacity:.45;cursor:default}
        .quartz-player .quartz-danmuku-source p{margin:6px 0;line-height:1.6;overflow-wrap:anywhere;color:var(--q-muted)}
        .quartz-player .quartz-danmuku-source .quartz-danmuku-source-status{color:var(--q-text)}
        .quartz-player .quartz-danmuku-source .quartz-danmuku-keyword{font-size:11px;white-space:normal}
        .quartz-player .quartz-danmuku-search-navigation{display:grid;gap:7px;margin-top:8px}
        .quartz-player .quartz-danmuku-results{display:grid;gap:0}
        .quartz-player .quartz-danmuku-search-panel .quartz-danmuku-result{display:block;width:100%;padding:9px 0;border-bottom:1px solid var(--border);white-space:normal;overflow-wrap:anywhere}
        .quartz-player .quartz-danmuku-result span,.quartz-player .quartz-danmuku-result small{display:block;white-space:normal}
        .quartz-player .quartz-danmuku-result small{font-size:11px;color:var(--q-muted);margin-top:3px}
        .quartz-player .quartz-danmuku-more{display:block;height:12px}
        @media(prefers-reduced-motion:reduce){.quartz-player *,.quartz-player .art-controls [class*="hint--"]::before,.quartz-player .art-controls [class*="hint--"]::after{transition:none!important}}

 .quartz-player .quartz-status-stack>.art-notice{position:static!important;inset:auto!important;width:auto;max-width:100%;padding:0!important;}
 .quartz-player .quartz-status-stack :is(.art-notice-inner,.quartz-status-chip){box-sizing:border-box;max-width:100%;min-height:28px;padding:5px 9px;border:0;border-radius:4px;background:var(--q-hint-bg);color:var(--q-hint-text);line-height:18px;overflow-wrap:anywhere;}
 .quartz-player :is(.art-notice-inner,.quartz-status-chip){box-shadow:0 2px 8px #0004;animation:quartz-player-status-enter 230ms ease-out both;}
 .quartz-player .art-controls svg.quartz-setting-icon{display:block;width:100%;height:100%;}.quartz-player .art-controls svg.quartz-setting-icon,.quartz-player .art-controls svg.quartz-setting-icon *{fill:none!important;stroke:currentColor;}

 @keyframes quartz-player-status-enter {
   from { opacity:0; translate:0 var(--quartz-status-offset,-8px); }
   to { opacity:1; translate:0 0; }
 }
 @media (prefers-reduced-motion:reduce) {
   .quartz-player :is(.art-notice-inner,.quartz-status-chip){--quartz-status-offset:0px;}
 }
 @keyframes quartz-player-panel-enter {
   from { opacity:0; translate:0 5px; }
   to { opacity:1; translate:0 0; }
 }
 @media (prefers-reduced-motion:no-preference) {
   .quartz-player.art-setting-show .art-settings,
   .quartz-player .art-control-volume:is(:hover,:focus-within) .art-volume-inner {
     animation:quartz-player-panel-enter 105ms ease-out both!important;
   }
 }
 .quartz-player .art-settings{padding:6px!important;border-radius:8px!important;box-shadow:0 8px 24px #0003;}
 .quartz-player:not(.quartz-player-compact) .art-settings{width:288px!important;}
 .quartz-player .art-setting-panel{width:100%!important;}
 .quartz-player .art-settings .art-setting-item{min-height:40px;padding:7px 9px;border-bottom:0;border-radius:5px;gap:8px;box-sizing:border-box;}
 .quartz-player :is(.art-settings .art-setting-item:not([data-name^="quartzDanmaku"][data-name$="Content"]),.quartz-danmuku-setting-row,.apd-mode,.apd-other,.quartz-danmuku-result,.quartz-danmuku-search button):hover:not(:disabled){text-decoration:none;background:color-mix(in srgb,var(--q-text) var(--settings-hover-strength,9%),var(--q-surface))!important;}
 .quartz-player .art-settings .art-setting-item.art-current{color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--q-surface));}
 .quartz-player .art-setting-item-left{flex:1 1 auto;justify-content:flex-start!important;gap:8px!important;}
 .quartz-player .art-setting-item-right{flex:0 0 auto;max-width:55%;}
 .quartz-player .art-setting-item-right-icon{min-width:20px!important;color:var(--q-muted);}
 .quartz-player .quartz-settings-heading{display:flex!important;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:2;box-sizing:border-box;height:36px;min-height:36px;margin:0 0 3px;padding:0 9px;color:var(--q-muted);background:var(--q-surface);font-size:12px;}
 .quartz-player .quartz-settings-heading button{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--q-muted);cursor:pointer;}
 .quartz-player .quartz-settings-heading button:hover{color:var(--q-text);background:color-mix(in srgb,var(--q-text) 9%,var(--q-surface));}
 .quartz-player .quartz-settings-heading .quartz-settings-close svg{display:block!important;width:17px!important;height:17px!important;fill:none!important;stroke:currentColor!important;}
 .quartz-player .art-settings:has(> .quartz-settings-heading-with-back) .art-setting-panel > .art-setting-item-back{display:none!important;}
 .quartz-player .quartz-settings-heading-title{display:flex;align-items:center;gap:4px;min-width:0;font:inherit;}
 .quartz-player .quartz-settings-heading-title span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
 .quartz-player .quartz-settings-heading .quartz-settings-back{display:flex;align-items:center;gap:4px;width:auto;min-width:0;padding:0 6px 0 4px;margin-inline-start:-4px;font:inherit;text-align:left;}
 .quartz-player .quartz-settings-heading .quartz-settings-back[hidden]{display:none!important;}
 .quartz-player .quartz-settings-heading .quartz-settings-back svg{display:block;flex:none;width:20px;height:20px;fill:currentColor;}
 .quartz-player .art-setting-item-back{top:36px;z-index:1;}
 .quartz-player-compact .art-settings .art-setting-item{min-height:44px;}

 .quartz-player .art-controls svg.quartz-transport-icon,.quartz-player .art-controls svg.quartz-transport-icon *{fill:none!important;stroke:currentColor;}
 .quartz-player .quartz-buffering-orbit{transform-origin:20px 20px;animation:quartz-buffering-spin 1s linear infinite;stroke:var(--accent);}
 .quartz-player .quartz-buffering-star{stroke:var(--accent);stroke-width:1.4;}
 @media(prefers-reduced-motion:reduce){.quartz-player .quartz-buffering-orbit{animation:none;}}

 .art-video-player.quartz-player{overflow:visible;}
 .quartz-player .art-layers{overflow:hidden;}
 html:has(.quartz-player),body:has(.quartz-player){background:transparent!important;}

 .quartz-player .art-settings{overflow:hidden;}
 .quartz-player .art-settings .art-setting-panel.art-current{min-height:0;flex-shrink:1;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;}
 .quartz-player .art-settings .art-setting-panel.art-current > .art-setting-item{flex-shrink:0;}
 .quartz-player .art-settings .art-setting-panel.art-current > .art-setting-item-back{top:0;}
 .quartz-player .quartz-danmuku-display,.quartz-player .quartz-danmuku-display .quartz-danmuku-setting-row{min-width:0;}
 .quartz-player .art-settings .art-setting-item[data-name^="quartzDanmaku"][data-name$="Content"]{display:block!important;height:auto!important;min-height:0;padding:0!important;background:transparent!important;color:var(--q-text)!important;cursor:default!important;}
 .quartz-player .art-settings .art-setting-item[data-name^="quartzDanmaku"][data-name$="Content"] > .art-setting-item-right,
 .quartz-player .art-settings .art-setting-item[data-name^="quartzDanmaku"][data-name$="Content"] > .art-setting-item-left > .art-setting-item-left-icon{display:none;}
 .quartz-player .art-settings .art-setting-item[data-name^="quartzDanmaku"][data-name$="Content"] > .art-setting-item-left{display:block;width:100%;}
 .quartz-player .art-settings .art-setting-item[data-name^="quartzDanmaku"][data-name$="Content"] .art-setting-item-left-text{overflow:visible;white-space:normal;}
 .quartz-player :is(.quartz-danmuku-matching,.quartz-danmuku-display){--danmaku-label:76px;--danmaku-gap:10px;font:400 13px/1.45 system-ui,sans-serif;}
 .quartz-player .quartz-danmuku-display .apd-mode svg [fill]{fill:currentColor;}
 .quartz-player .quartz-danmuku-source{padding:8px 9px;margin:0;font-size:13px;}
 .quartz-player .quartz-danmuku-source :is(label,.quartz-danmuku-field){display:grid;grid-template-columns:var(--danmaku-label) minmax(0,1fr);align-items:center;gap:var(--danmaku-gap);margin:0;}
 .quartz-player :is(.quartz-danmuku-source,.quartz-danmuku-search-panel) :is(select,input){width:100%;max-width:none;height:34px;border-radius:6px;background:color-mix(in srgb,var(--q-text) 5%,var(--q-surface));}
 .quartz-player .quartz-danmuku-search{position:relative;min-width:0;margin:0;}
 .quartz-player .quartz-danmuku-search input{padding-inline:9px 38px;}
 .quartz-player .quartz-danmuku-search button{position:absolute;inset-inline-end:3px;top:3px;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:5px;}
 .quartz-player .quartz-danmuku-search button svg{display:block;width:18px;height:18px;fill:none!important;stroke:currentColor;}
 .quartz-player .quartz-danmuku-source p:empty{display:none;}
 .quartz-player :is(.apd-config-mode,.apd-config-slider,.apd-config-other){margin:0!important;padding:6px 12px!important;min-height:36px;box-sizing:border-box;color:var(--q-text);}
 .quartz-player .apd-config-mode{display:block;padding-block:8px!important;}
 .quartz-player .apd-modes{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:0!important;margin:0!important;padding:0;border-radius:5px;overflow:hidden;}
 .quartz-player :is(.apd-modes .apd-mode,.apd-config-other .apd-other){display:flex;align-items:center;justify-content:center;gap:5px!important;min-width:0;min-height:30px;padding:2px;border:0;border-radius:0;box-sizing:border-box;background:transparent;color:var(--q-muted);font-size:12px;white-space:nowrap;cursor:pointer;}
 .quartz-player .apd-modes .apd-mode:hover{color:var(--danmaku-mode-color,var(--q-muted))!important;}
 .quartz-player .quartz-danmuku-visibility{padding:6px 12px 0;}
 .quartz-player .quartz-danmuku-visibility .apd-modes{grid-template-columns:minmax(0,1fr);}
 .quartz-player .quartz-danmuku-visibility button{font-family:inherit;cursor:pointer;}
 .quartz-player .quartz-danmuku-visibility .quartz-setting-icon{width:14px;height:14px;}
 .quartz-player .apd-modes .apd-mode .apd-icon{width:14px;height:14px;}
 .quartz-player :is([data-danmuku-mode0="true"] .apd-mode[data-mode="0"],[data-danmuku-mode1="true"] .apd-mode[data-mode="1"],[data-danmuku-mode2="true"] .apd-mode[data-mode="2"],.quartz-danmuku-visibility button[aria-pressed="true"]){background:color-mix(in srgb,var(--q-text) 14%,var(--q-surface));--settings-hover-strength:19%;--danmaku-mode-color:var(--q-text);color:var(--danmaku-mode-color);}
 .quartz-player .apd-config-other{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:0!important;padding-block:0 4px!important;}
 .quartz-player .apd-config-other .apd-other:first-child{border-radius:5px 0 0 5px;}
 .quartz-player .apd-config-other .apd-other:last-child{border-radius:0 5px 5px 0;}
 .quartz-player :is([data-danmuku-anti-overlap="true"] .apd-anti-overlap,[data-danmuku-sync-video="true"] .apd-sync-video){background:color-mix(in srgb,var(--q-text) 14%,var(--q-surface));--settings-hover-strength:19%;--danmaku-option-color:var(--q-text);color:var(--danmaku-option-color);}
 .quartz-player .apd-config-other .apd-other:hover{color:var(--danmaku-option-color,var(--q-muted))!important;}
 .quartz-player .quartz-danmuku-field{margin-top:6px!important;}
 .quartz-player .quartz-danmuku-source select:hover{background-color:color-mix(in srgb,var(--q-text) 9%,var(--q-surface));}
 .quartz-player .quartz-danmuku-source select{appearance:none;padding-inline:9px 28px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none' stroke='%238b929b' stroke-width='1.7'%3E%3Cpath d='m3 5 4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;}
 .quartz-player .quartz-danmuku-source option{background:var(--q-surface);color:var(--q-text);}
 @supports(appearance:base-select){
   .quartz-player .quartz-danmuku-source select,.quartz-player .quartz-danmuku-source select::picker(select){appearance:base-select;}
   .quartz-player .quartz-danmuku-source select{background-image:none;padding-inline:9px;}
   .quartz-player .quartz-danmuku-source select::picker(select){padding:4px;border:1px solid var(--border);border-radius:6px;background:var(--q-surface);color:var(--q-text);}
   .quartz-player .quartz-danmuku-source option{padding:6px 8px;border-radius:4px;}
   .quartz-player .quartz-danmuku-source option:is(:hover,:checked){background:color-mix(in srgb,var(--q-text) 9%,var(--q-surface));}
 }
 .quartz-player .quartz-danmuku-match{margin:0 0 8px;padding:4px 0 8px;}
 .quartz-player .quartz-danmuku-match:not(:has(dd:not(:empty))),.quartz-player .quartz-danmuku-match div:has(dd:empty){display:none;}
 .quartz-player .quartz-danmuku-match div{display:grid;grid-template-columns:var(--danmaku-label) minmax(0,1fr);align-items:start;gap:var(--danmaku-gap);padding-block:2px;font-size:12px;}
 .quartz-player .quartz-danmuku-match dt{color:var(--q-muted);}
 .quartz-player .quartz-danmuku-match dd{margin:0;overflow-wrap:anywhere;}
 .quartz-player .quartz-danmuku-search-panel .quartz-danmuku-result{padding:7px 9px;border:1px solid var(--border);border-radius:6px;margin-top:5px;}
 .quartz-player .apd-config-other :is(.apd-check-on,.apd-check-off){flex:none;width:16px;height:16px;}
 .quartz-player .apd-config-other .apd-check-on{color:var(--q-text);fill:currentColor;}
 .quartz-player .apd-config-other .apd-check-off{color:var(--q-muted);fill:currentColor;}
 .quartz-player .apd-config-slider[hidden]{display:none!important;}
 .quartz-player .quartz-danmuku-setting-row{margin:0 3px;padding:5px 12px!important;border-radius:5px;}
 .quartz-player .quartz-danmuku-match dd{-webkit-user-select:text;user-select:text;cursor:text;}
 .quartz-player .quartz-danmuku-search-panel[hidden]{display:none!important;}
 .quartz-player .quartz-danmuku-search-panel{display:grid;gap:6px;padding:4px 12px 8px;color:var(--q-text);}
 .quartz-player .quartz-danmuku-search-panel .quartz-danmuku-results{height:180px;display:block;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-gutter:stable;padding-inline-end:4px;}
 .quartz-player .quartz-danmuku-search-panel button{font:inherit;color:var(--q-text);background:transparent;cursor:pointer;}
 .quartz-player :is(.quartz-danmuku-search-panel,.quartz-danmuku-source):focus{outline:none!important;}
 .quartz-player .quartz-danmuku-search input:focus{outline:none!important;box-shadow:none!important;border-color:var(--q-muted);}
 .quartz-player .art-state::before,.quartz-player .quartz-buffering{filter:drop-shadow(0 1px 3px #0008);}
 .quartz-player .art-mask .art-state{position:relative;display:flex!important;--art-state-size:var(--quartz-state-size,42px);--art-state-opacity:1;--quartz-state-bg:#202022;border-radius:50%;border:0;color:#fff;backdrop-filter:none;box-sizing:border-box;transform:none;transition:opacity 160ms ease;}
 .quartz-player .art-state::before{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--quartz-state-bg);pointer-events:none;}
 [data-preview-theme="light"] .quartz-player .art-mask .art-state{--quartz-state-bg:#fff;color:#202022;}
 .quartz-player:is(.art-loading-show,.is-playback-loading) .art-state{opacity:0!important;pointer-events:none;}
 .quartz-player .art-state > .art-icon{position:relative;width:100%;height:100%;}
 .quartz-player .art-state svg{display:block;width:64%;height:64%;}
 .quartz-player .quartz-buffering{width:var(--quartz-state-size,42px);height:var(--quartz-state-size,42px);}
 .quartz-player .quartz-buffering svg{width:76%;height:76%;}
 .quartz-player .art-loading{display:flex!important;opacity:0;visibility:hidden;transition:opacity 160ms ease,visibility 0s linear 160ms;}
 .quartz-player:is(.art-loading-show,.is-playback-loading) .art-loading{opacity:1;visibility:visible;transition-delay:0s;}
 @media(prefers-reduced-motion:reduce){.quartz-player .art-mask .art-state,.quartz-player .art-loading{transition:none;}}
`
