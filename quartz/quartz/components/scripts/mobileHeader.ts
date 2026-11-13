// Pin the whole mobile toolbar, rather than pinning its menu button separately.
export function setupMobileHeader(){
 const header=document.querySelector<HTMLElement>('#quartz-body > .sidebar.left:has(.explorer)')
 if(!header)return
 const controller=new AbortController(),signal=controller.signal,mobile=matchMedia('(max-width:800px)')
 const update=()=>{if(mobile.matches&&document.body.classList.contains('jit-fullscreen-host'))return;if(mobile.matches)document.documentElement.style.setProperty('--mobile-header-height',document.querySelector('[data-reading-page]')?'0px':`${Math.ceil(header.getBoundingClientRect().height)}px`);else document.documentElement.style.removeProperty('--mobile-header-height')}
 const observer=new ResizeObserver(update);observer.observe(header);mobile.addEventListener('change',update,{signal});update()
 window.addCleanup(()=>{controller.abort();observer.disconnect();document.documentElement.style.removeProperty('--mobile-header-height')})
}
