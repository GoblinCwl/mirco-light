// Shared visual skin retained from the existing site player.
export const playerStyles = `
        .art-video-player.quartz-player{--art-theme:var(--accent);--art-padding:16px;--art-control-height:48px;--art-control-icon-size:21px;--art-control-icon-scale:1;--art-progress-height:4px;--art-progress-indicator-size:11px;--art-border-radius:10px;--q-surface:var(--background);--q-text:var(--foreground);--q-muted:color-mix(in srgb,var(--foreground) 70%,var(--background));--q-bottom:rgba(248,249,250,.97);--q-fade:rgba(248,249,250,.65);--art-font-color:var(--q-text);--art-widget-background:var(--q-surface);--art-tip-background:var(--q-surface);--art-hover-color:transparent;--art-transition-duration:0s;--art-scrollbar-size:5px;border-radius:10px;isolation:isolate;font-family:"Microsoft YaHei",system-ui,sans-serif}
        [data-preview-theme="dark"] .quartz-player{--q-bottom:rgba(14,21,29,.96);--q-fade:rgba(14,21,29,.55)}
        .quartz-player .art-bottom{background-image:linear-gradient(to top,var(--q-bottom),var(--q-fade) 55%,transparent);background-size:100% 112px;overflow:visible}
        .quartz-player .art-poster{inset:0!important;width:100%!important;height:100%!important;max-width:none;max-height:none;background-size:cover!important;background-position:center center!important;background-repeat:no-repeat;transform:none!important;border-radius:inherit}
        .quartz-player .art-controls-left,.quartz-player .art-controls-right{align-items:center;min-width:0;gap:3px}
        .quartz-player .art-control{border-radius:7px;color:var(--q-text);transition:none;flex-shrink:0}
        .quartz-player .art-control:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}
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
        .quartz-player .art-notice{top:12px!important;left:12px!important;right:auto!important;bottom:auto!important;width:max-content;max-width:calc(100% - 24px);padding:0!important;pointer-events:none;z-index:45}.quartz-player .art-notice-inner{background:var(--background);color:var(--foreground);border:0;border-radius:4px;padding:4px 8px;font-size:12px;line-height:1.5;text-shadow:none}.quartz-player .art-setting-item-left-icon .quartz-setting-icon{display:block;flex-shrink:0}
        .quartz-player .art-loading{pointer-events:none;color:var(--q-text)}
        .quartz-player.is-playback-loading .art-loading{display:flex!important}
        .quartz-player.is-playback-loading .art-state{display:none!important}
        .quartz-player .quartz-buffering{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:transparent;border:0}
        .quartz-player .quartz-buffering svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;animation:none}
        .quartz-player .quartz-buffering-track{opacity:.16}
        @keyframes quartz-buffering-spin{to{transform:rotate(360deg)}}
        .quartz-player.is-subtitle-pending :is(.art-control-playAndPause,.art-state,.art-setting-item[data-name="subtitles"]){pointer-events:none;opacity:.45}
        .quartz-player .art-state{--art-state-size:46px;--art-state-opacity:1;border-radius:50%;background:transparent;border:0;backdrop-filter:none;box-sizing:border-box;transform:none!important;transition:opacity 160ms ease}
        .quartz-player .art-state svg{width:28px;height:28px;transform:translateX(1px)}
        .quartz-player .art-control-playAndPause svg{width:22px;height:22px}
        @media(prefers-reduced-motion:reduce){.quartz-player .quartz-buffering svg{animation:none}.quartz-player .art-state{transition:none}}
        .quartz-player .art-subtitle{color:#fff;font-family:"Microsoft YaHei","PingFang SC",sans-serif;font-size:clamp(16px,3vw,28px);font-weight:500;line-height:1.45;letter-spacing:.02em;text-shadow:0 1px 2px #000,1px 0 1px #000,-1px 0 1px #000,0 -1px 1px #000}
        .art-video-player.quartz-player .art-subtitle,.art-video-player.quartz-player.art-control-show .art-subtitle{bottom:var(--art-subtitle-bottom);transition:none}
        .quartz-player .art-subtitle-line{background:transparent;overflow-wrap:anywhere}
        .quartz-player .quartz-subtitle-style-row{display:flex!important;align-items:center;gap:10px;padding:12px!important;cursor:default!important}
        .quartz-subtitle-style-row label{display:flex;align-items:center;gap:10px;flex:1;min-width:0;white-space:nowrap}
        .quartz-subtitle-style-row input{flex:1;min-width:0;width:70px;accent-color:var(--accent);cursor:pointer}
        .quartz-subtitle-style-row output{min-width:42px;text-align:right;font-variant-numeric:tabular-nums;color:var(--q-text)}
        .quartz-subtitle-style-row input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}

        .quartz-player:not(.quartz-player-compact) .art-setting-item[data-name^="quartzCompact"]{display:none}
        .quartz-player{ -webkit-tap-highlight-color:transparent }
        .quartz-player-compact{--art-padding:8px!important;--art-control-height:44px!important;--art-control-icon-size:20px!important;--quartz-control-width:clamp(24px,8vw,30px)}
        .quartz-player-compact .apd-toggle,.quartz-player-compact .apd-config-icon{display:none!important}
        .quartz-player-compact .art-bottom{background-size:100% 100px}
        .quartz-player-compact .art-controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;height:44px}
        .quartz-player-compact .art-controls-left{flex:1 1 auto;min-width:0}
        .quartz-player-compact .art-controls-center{display:flex!important;flex:0 0 0!important;width:0;min-width:0;padding:0}
        .quartz-player-compact .art-controls-right{flex:0 0 auto}
        .quartz-player-compact .artplayer-plugin-danmuku{gap:14px!important;justify-content:flex-start!important}
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
        .quartz-player .apd-config .apd-config-panel{opacity:0!important;pointer-events:none!important;transition:none!important;padding:0;left:var(--quartz-danmuku-left,0px)!important;right:auto!important;bottom:var(--quartz-danmuku-bottom,0px)!important;max-height:var(--quartz-danmuku-height,300px)}
        .quartz-player .apd-config.quartz-danmuku-open .apd-config-panel{opacity:1!important;pointer-events:auto!important}
        .quartz-player :is(.apd-config,.apd-config *,.art-setting-item[data-name="quartzCompactDanmukuSettings"]):focus{outline:none!important}
        .quartz-player .apd-config-panel-inner{box-sizing:border-box;max-height:var(--quartz-danmuku-height,300px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--q-muted) transparent;background:var(--q-surface)!important;color:var(--q-text);border:1px solid var(--border);border-radius:8px!important}
        .quartz-player .quartz-danmuku-heading{display:flex;justify-content:space-between;align-items:center;position:sticky;top:-10px;z-index:1;background:var(--q-surface);color:var(--q-text);min-height:32px;margin-bottom:10px;border-bottom:1px solid var(--border)}
        .quartz-player .quartz-danmuku-heading button{border:0;padding:0;width:30px;height:30px;background:transparent;color:var(--q-text);font-size:22px}
        .quartz-player .quartz-danmuku-source{padding:8px 0 12px;margin-bottom:12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--q-text)}
        .quartz-player .quartz-danmuku-source[hidden],.quartz-player .quartz-danmuku-source [hidden]{display:none!important}
        .quartz-player .quartz-danmuku-source label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
        .quartz-player .quartz-danmuku-source select,.quartz-player .quartz-danmuku-source input{box-sizing:border-box;min-width:0;max-width:100%;height:32px;line-height:normal;padding:6px 8px;border:1px solid var(--border);border-radius:5px;background:var(--q-surface);color:var(--q-text);font:inherit;box-shadow:none}
        .quartz-player .quartz-danmuku-source select{flex:1;max-width:150px;white-space:nowrap}
        .quartz-player .quartz-danmuku-source input{width:100%}
        .quartz-player .quartz-danmuku-source :is(input,select,button):focus{outline:none;box-shadow:none}
        .quartz-player .quartz-danmuku-source :is(input,select,button):focus-visible{outline:1px solid var(--q-muted);outline-offset:1px}
        .quartz-player .quartz-danmuku-source button{color:var(--q-text);font:inherit;border:0;border-radius:0;background:transparent;cursor:pointer;padding:4px 0;text-align:left;box-shadow:none;line-height:1.5}
        .quartz-player .quartz-danmuku-source button:hover:not(:disabled){text-decoration:underline;text-underline-offset:3px;background:transparent}
        .quartz-player .quartz-danmuku-source button:disabled{opacity:.45;cursor:default}
        .quartz-player .quartz-danmuku-source p{margin:6px 0;line-height:1.6;overflow-wrap:anywhere;color:var(--q-muted)}
        .quartz-player .quartz-danmuku-source .quartz-danmuku-source-status{color:var(--q-text)}
        .quartz-player .quartz-danmuku-source .quartz-danmuku-keyword{font-size:11px;white-space:normal}
        .quartz-player .quartz-danmuku-search{margin-top:8px}
        .quartz-player .quartz-danmuku-search form{display:flex;gap:10px;align-items:center}
        .quartz-player .quartz-danmuku-search form input{flex:1;width:0}
        .quartz-player .quartz-danmuku-search form button{flex-shrink:0}
        .quartz-player .quartz-danmuku-search-navigation{display:grid;gap:7px;margin-top:8px}
        .quartz-player .quartz-danmuku-results{display:grid;gap:0}
        .quartz-player .quartz-danmuku-source .quartz-danmuku-result{display:block;width:100%;padding:9px 0;border-bottom:1px solid var(--border);white-space:normal;overflow-wrap:anywhere}
        .quartz-player .quartz-danmuku-result span,.quartz-player .quartz-danmuku-result small{display:block;white-space:normal}
        .quartz-player .quartz-danmuku-result small{font-size:11px;color:var(--q-muted);margin-top:3px}
        .quartz-player .quartz-danmuku-more{display:block;height:12px}
        @media(prefers-reduced-motion:reduce){.quartz-player *{transition:none!important}}

 .quartz-player .quartz-status-stack>.art-notice{position:static!important;inset:auto!important;width:auto;max-width:100%;padding:0!important;}
 .quartz-player .quartz-status-stack .art-notice-inner{max-width:100%;overflow-wrap:anywhere;line-height:1.5;}
 .quartz-player .art-controls svg.quartz-setting-icon{display:block;width:100%;height:100%;}.quartz-player .art-controls svg.quartz-setting-icon,.quartz-player .art-controls svg.quartz-setting-icon *{fill:none!important;stroke:currentColor;}

 .quartz-player .art-settings{padding:6px!important;border-radius:8px!important;box-shadow:0 8px 24px #0003;}
 .quartz-player:not(.quartz-player-compact) .art-settings{width:288px!important;}
 .quartz-player .art-setting-panel{width:100%!important;}
 .quartz-player .art-settings .art-setting-item{min-height:40px;padding:7px 9px;border-bottom:0;border-radius:5px;gap:8px;box-sizing:border-box;}
 .quartz-player .art-settings .art-setting-item:hover{background:color-mix(in srgb,var(--accent) 10%,var(--q-surface))!important;}
 .quartz-player .art-settings .art-setting-item.art-current{color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--q-surface));}
 .quartz-player .art-setting-item-left{flex:1 1 auto;justify-content:flex-start!important;gap:8px!important;}
 .quartz-player .art-setting-item-right{flex:0 0 auto;max-width:55%;}
 .quartz-player .art-setting-item-right-icon{min-width:20px!important;color:var(--q-muted);}
 .quartz-player .quartz-settings-heading{display:flex!important;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:2;box-sizing:border-box;height:36px;min-height:36px;margin:0 0 3px;padding:0 9px;color:var(--q-muted);background:var(--q-surface);font-size:12px;}
 .quartz-player .quartz-settings-heading button{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--q-muted);cursor:pointer;}
 .quartz-player .quartz-settings-heading button:hover{color:var(--q-text);background:color-mix(in srgb,var(--accent) 10%,var(--q-surface));}
 .quartz-player .quartz-settings-heading button svg{display:block;width:17px;height:17px;fill:none!important;stroke:currentColor;}
 .quartz-player .art-setting-item-back{top:36px;z-index:1;}
 .quartz-player-compact .art-settings .art-setting-item{min-height:44px;}

 .quartz-player :is(.art-controls,.art-state) svg.quartz-transport-icon,.quartz-player :is(.art-controls,.art-state) svg.quartz-transport-icon *{fill:none!important;stroke:currentColor;}
 .quartz-player .quartz-buffering-orbit{transform-origin:20px 20px;animation:quartz-buffering-spin 1s linear infinite;stroke:var(--accent);}
 .quartz-player .quartz-buffering-star{stroke:var(--accent);stroke-width:1.4;}
 .quartz-player .apd-config-panel-inner{padding:6px!important;border-radius:8px!important;box-shadow:0 8px 24px #0003;}
 .quartz-player .quartz-danmuku-heading{top:0;min-height:36px;margin:0 0 3px;padding:0 9px;border:0;font-size:12px;color:var(--q-muted);}
 .quartz-player .quartz-danmuku-heading button{display:grid;place-items:center;width:28px;height:28px;border-radius:5px;color:var(--q-muted);}
 .quartz-player .quartz-danmuku-heading button:hover{background:color-mix(in srgb,var(--accent) 10%,var(--q-surface));color:var(--q-text);}
 .quartz-player .quartz-danmuku-source{margin:0;padding:8px 9px 12px;}
 @media(prefers-reduced-motion:reduce){.quartz-player .quartz-buffering-orbit{animation:none;}}

 .art-video-player.quartz-player{overflow:visible;}
 .quartz-player .art-layers{overflow:hidden;}
 html:has(.quartz-player),body:has(.quartz-player){background:transparent!important;}

 .quartz-player :is(.apd-config-mode,.apd-config-slider,.apd-config-other){padding:8px 9px;margin:0!important;font-size:12px;color:var(--q-text);}
 .quartz-player .apd-modes{gap:6px;margin-top:6px;}
 .quartz-player .apd-modes .apd-mode{flex:1;padding:6px 8px;border-radius:5px;}
 .quartz-player .apd-modes .apd-mode:hover,.quartz-player .apd-config-other .apd-other:hover{background:color-mix(in srgb,var(--accent) 10%,var(--q-surface));color:var(--accent);}
 .quartz-player .apd-config-other{gap:12px;flex-wrap:wrap;}
 .quartz-player .apd-config-other .apd-other{gap:5px;border-radius:5px;padding:4px;}
 .quartz-player .apd-slider-progress,.quartz-player .apd-slider-dot{background:var(--accent)!important;}

 .quartz-player .apd-config-panel-inner{padding:6px!important;}
 .quartz-player .apd-config-mode{display:grid;grid-template-columns:1fr;gap:6px;padding:8px 9px!important;}
 .quartz-player .apd-modes{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px!important;margin:0!important;}
 .quartz-player .apd-modes .apd-mode{display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;min-width:0;background:color-mix(in srgb,var(--q-text) 4%,transparent);}
 .quartz-player .apd-modes .apd-mode .apd-icon{width:18px;height:18px;}
 .quartz-player .apd-config-other{display:grid!important;grid-template-columns:1fr;gap:2px!important;padding:6px 9px!important;}
 .quartz-player .apd-config-other .apd-other{min-height:30px;padding:3px 0;}
 .quartz-player .apd-config-slider{display:grid!important;grid-template-columns:66px minmax(0,1fr) 42px;align-items:center;gap:10px;padding:10px 9px!important;}
 .quartz-player .apd-config-slider .apd-slider{margin:0!important;width:100%!important;}
 .quartz-player .apd-config-slider .apd-value{position:static!important;min-width:0;text-align:right;white-space:nowrap;font-size:11px;color:var(--q-muted);}
 .quartz-player .quartz-danmuku-heading button svg{width:17px;height:17px;fill:none;stroke:currentColor;}

 .quartz-player .quartz-danmuku-search{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;margin-top:10px;}
 .quartz-player .quartz-danmuku-search input{width:100%;min-width:0;}
 .quartz-player .quartz-danmuku-search button{padding:6px 8px;border:1px solid var(--border);border-radius:5px;text-decoration:none!important;}
 .quartz-player .quartz-danmuku-source p:empty{display:none;}
 .quartz-player :is(.art-state,.quartz-buffering){filter:drop-shadow(0 1px 3px #0008);}
 .quartz-player .quartz-danmuku-settings-trigger{display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}
 .quartz-player-compact .quartz-danmuku-settings-trigger{display:none;}
 .quartz-player .art-mask .art-state{display:flex!important;--art-state-size:var(--quartz-state-size,42px);transform:scale(.88)!important;transition:opacity 160ms ease,transform 160ms ease;}
 .quartz-player.art-mask-show:not(.art-loading-show):not(.is-playback-loading) .art-state{transform:scale(1)!important;}
 .quartz-player:is(.art-loading-show,.is-playback-loading) .art-state{opacity:0!important;pointer-events:none;}
 .quartz-player .art-state svg{width:64%;height:64%;}
 .quartz-player .quartz-buffering{width:var(--quartz-state-size,42px);height:var(--quartz-state-size,42px);}
 .quartz-player .quartz-buffering svg{width:76%;height:76%;}
 .quartz-player .art-loading{display:flex!important;opacity:0;visibility:hidden;transition:opacity 160ms ease,visibility 0s linear 160ms;}
 .quartz-player:is(.art-loading-show,.is-playback-loading) .art-loading{opacity:1;visibility:visible;transition-delay:0s;}
 @media(prefers-reduced-motion:reduce){.quartz-player .art-mask .art-state,.quartz-player .art-loading{transition:none;}}
`
