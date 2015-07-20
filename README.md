# Automatic Dictionary Switcher Add-on for Firefox

Based on the text entered in a textarea, this add-on automatically detects the language and sets the corresponding spell checking dictionary. You need to type at least 25 characters before the add-on will start. Before that limit is reached, it disables spell checking. A small icon in the lower right corner of the textarea will give you feedback about the language that has been detected. The icon will disappear a few seconds after a language has been detected.

Get more details at https://addons.mozilla.org/en-US/firefox/addon/automatic-dictionary-switcher/

This add-on is implemented using [cfx](https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Getting_started).

It uses the following files that are taken from other Open Source and Creative Commons sources:

* `data/js/franc.js` - language identification by Titus Wormer released under MIT license (https://github.com/wooorm/franc).
* `data/js/iso6393.js` - languages codes, based on JSON by Titus Wormer released under MIT license (https://github.com/wooorm/iso-639-3).
* `data/img/dictionary.png` - based on icon by Farhat Datta, released under a Creative Commons like license: Relax-Attribution / Share Alike / Semi-Noncommercial, see http://www.languageicon.org for details.
