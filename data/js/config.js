
// open the add-ons configuration (see https://developer.mozilla.org/en-US/Add-ons/Inline_Options):
Components.utils.import('resource://gre/modules/Services.jsm');
Services.wm.getMostRecentWindow('navigator:browser').BrowserOpenAddonsMgr('addons://detail/firefox-dict-switcher@danielnaber.de/preferences');
