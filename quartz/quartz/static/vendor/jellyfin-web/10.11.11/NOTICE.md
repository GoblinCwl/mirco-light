# Jellyfin Web browser profile

Source: https://github.com/jellyfin/jellyfin-web/tree/v10.11.11/src/scripts
Files: browser.js, browserDeviceProfile.js. Upstream GPL-2.0 license included.
htmlHlsSupport.js contains the unmodified canPlayNativeHls,
enableHlsJsPlayerForCodecs and enableHlsJsPlayer functions extracted from
src/components/htmlMediaHelper.js in the same release, with only the browser
import path adapted. This preserves Chromium 141+ native-HLS workarounds.
Only imports are adapted to explicit .js paths and profileSettings.js.
profileSettings.js supplies upstream default preferences for the standalone player;
it does not read or change the administrator's Jellyfin Web local preferences.
Subtitle preferences are supplied by the site (PGS rendering defaults to disabled,
like Jellyfin Web). The upstream profile generator and browser detection are unchanged.
