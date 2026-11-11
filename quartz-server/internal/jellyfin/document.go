package jellyfin

import (
	"encoding/json"
	"net/url"
)

func PlayerDocument(site string) string {
	parsed, _ := url.Parse(site)
	allowed, _ := json.Marshal(origin(parsed))
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;overflow:hidden}*{box-sizing:border-box}#preview{width:100%}</style></head><body><div id="preview"></div><script>
let initialized=false;
addEventListener('message',event=>{
 if(initialized||event.source!==parent||event.origin!==` + string(allowed) + `||event.data?.type!=='jellyfinInit')return;
 if(typeof event.data.script!=='string'||event.data.script.length>1000000||typeof event.data.config?.channel!=='string')return;
 initialized=true;window.__quartzJellyfinConfig=event.data.config;
 const script=document.createElement('script');script.textContent=event.data.script;document.body.append(script);
});
</script></body></html>`
}
