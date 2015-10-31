// Automatic Dictionary Switcher Add-on for Firefox
// Copyright 2015 Daniel Naber
//
// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// http://mozilla.org/MPL/2.0/.

let userPreferences,
    // input element which the addon operates on currently (e.g. textarea):
    ignoreSignature;

var currentElement;

// Listen to a message from the main script containing user preferences
self.port.on("config", function (prefs) {
    // We require the presence of user preferences just to know the languages for which the user chose "Don't
    // detect this language" option so that we disable spell checking if we encountered text in these languages
    userPreferences = prefs;
    ignoreSignature = userPreferences["ignoreSignature"];
});

self.port.on("setLanguage", setLanguage);

function setLanguage(shortCode, langName) {
    // If spell checking was disabled by the page developer, we honor the setting and don't set the value of
    // the spellcheck attribute to true, but we still try to detect the language and keep the ordinary operation
    // of the addon because the user can manually enable spell checking from the context menu, and the spellcheck
    // attribute stays false.
    // I set the developerDisabledSpellChecking to indicate this case
    // (see how the firefoxDictSwitcherDisabledSpellCheck flag is set later)
    const developerDisabledSpellChecking = currentElement.spellcheck === false &&
                                          !currentElement.dataset.firefoxDictSwitcherDisabledSpellCheck;

    if (shortCode) {
        // If the language was detected successfully enable spell checking and send its code to the main script
        if(!developerDisabledSpellChecking) {
            // We enable spell checking only if the attribute wasn't already set to false by the page developer
            currentElement.spellcheck = true;
        }
    } else {
        // Because we can't detect the language, disable spell checking
        currentElement.spellcheck = false;
        // And set a flag to indicate that it's our code who disabled spell checking not the page developer's
        // We do so only if the attribute wasn't already set to false be the page developer
        if(!developerDisabledSpellChecking) {
            currentElement.dataset.firefoxDictSwitcherDisabledSpellCheck = "1";
        }
    }
}

function isEligible(element) {
    // The addon operates only on textarea elements or elements with the contentEditable attribute set.
    // If the body itself is contentEditable we have to give up, as that would mean we put our feedback
    // div in the editable area and that causes a mess (happened on languagetool.org, where the text
    // area is a contentEditable body inside an iframe):
    return element.tagName == "TEXTAREA" ||
          (element.isContentEditable && element.tagName != "BODY");
}

// Note from Ashraf: I commented the old code that initially iterates over all TEXTAREA elements and instead
// used event delegation by attaching event handlers only to the root element. This is better for performance
// and covers the elements that are later appended to the DOM
document.documentElement.addEventListener("keydown", function (evt) {
    if(isEligible(evt.target)) {
        var key = evt.keyCode || evt.charCode;
        // check if user has finished entering a word
        if(key == 32/*space*/ || key == 188/*comma*/ || key == 190/*dot*/) {
            currentElement = evt.target;
            let text = evt.target.value || evt.target.textContent;
            self.port.emit("detectLanguage", text);
        }
    }
});

// HACK: The focus event doesn't bubble, so I set the useCapture parameter of addEventListener to true.
// We should use the focusin event which bubbles but it's not supported on Firefox as of the date I wrote this.
// See the note on this article https://developer.mozilla.org/en-US/docs/Web/Events/focusin
document.documentElement.addEventListener("focus", function (evt) {
    // Set correct language when we set the focus to already filled textarea
    if(isEligible(evt.target)) {
        currentElement = evt.target;
        let text = evt.target.value || evt.target.textContent;
        self.port.emit("detectLanguage", text);
    }
}, true);

document.documentElement.addEventListener("paste", function (e) {
    // We act only when data is pasted on a TEXTAREA element
    if(isEligible(e.target)) {
        // We try to detect only if the pasted data is available in plain text format
        let text = e.clipboardData.getData("text/plain");
        if(text) {
            currentElement = e.target;
            self.port.emit("detectLanguage", text);
        }
    }
});
