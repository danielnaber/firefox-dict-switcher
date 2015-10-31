// Automatic Dictionary Switcher Add-on for Firefox
// Copyright 2015 Daniel Naber
//
// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// http://mozilla.org/MPL/2.0/.

var currentTarget;

self.port.on("setSpellChecking", setSpellChecking);

function setSpellChecking(spellChecking) {
    if (!currentTarget) {
        // shouldn't happen
        console.log("currentTarget is not set");
        return;
    }
    // If spell checking was disabled by the page developer, we honor the setting and don't set the value of
    // the spellcheck attribute to true, but we still try to detect the language and keep the ordinary operation
    // of the addon because the user can manually enable spell checking from the context menu, and the spellcheck
    // attribute stays false.
    // I set the developerDisabledSpellChecking to indicate this case
    // (see how the firefoxDictSwitcherDisabledSpellCheck flag is set later)
    const developerDisabledSpellChecking = currentTarget.spellcheck === false &&
                                          !currentTarget.dataset.firefoxDictSwitcherDisabledSpellCheck;
    if (spellChecking) {
        if(!developerDisabledSpellChecking) {
            currentTarget.spellcheck = true;
        }
    } else {
        // Because we can't detect the language (yet), disable spell checking
        currentTarget.spellcheck = false;
        // And set a flag to indicate that it's our code who disabled spell checking not the page developer's
        // We do so only if the attribute wasn't already set to false be the page developer
        if(!developerDisabledSpellChecking) {
            currentTarget.dataset.firefoxDictSwitcherDisabledSpellCheck = "1";
        }
    }
}

function isEligible(element) {
    // The addon operates only on these elements:
    return element.tagName == "TEXTAREA" ||
           element.isContentEditable || 
           (element.tagName == "INPUT" && (element.getAttribute("type") == "text" || !element.getAttribute("type")));
}

document.documentElement.addEventListener("keydown", function (evt) {
    if(isEligible(evt.target)) {
        var key = evt.keyCode || evt.charCode;
        // check if user has finished entering a word
        if(key == 32/*space*/ || key == 188/*comma*/ || key == 190/*dot*/) {
            currentTarget = evt.target;
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
        currentTarget = evt.target;
        let text = evt.target.value || evt.target.textContent;
        self.port.emit("detectLanguage", text);
    }
}, true);

document.documentElement.addEventListener("paste", function (e) {
    if(isEligible(e.target)) {
        // We try to detect only if the pasted data is available in plain text format
        let text = e.clipboardData.getData("text/plain");
        if(text) {
            currentTarget = e.target;
            self.port.emit("detectLanguage", text);
        }
    }
});
