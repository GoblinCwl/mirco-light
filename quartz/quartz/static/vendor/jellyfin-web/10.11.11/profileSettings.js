// Adapter for Jellyfin Web default preferences. No media policy is implemented here.
import browser from './browser.js';
let renderPgs = false;
let burnIn;
export const setSubtitlePreferences = value => { renderPgs = value.renderPgs === true; burnIn = value.burnIn; };
export const allowedAudioChannels = () => '-1';
export const preferFmp4HlsContainer = () => !!(browser.safari || browser.firefox || browser.chrome || browser.edgeChromium);
export const limitSegmentLength = () => false;
export default {enableDts:()=>false,enableTrueHd:()=>false,enableHi10p:()=>false,disableVbrAudio:()=>false,alwaysRemuxFlac:()=>false,alwaysRemuxMp3:()=>false,get:key=>key==='subtitlerenderpgs'?String(renderPgs):key==='subtitleburnin'?burnIn:undefined};
