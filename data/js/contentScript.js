//          Copyright 2015 Daniel Naber
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.

const minimum_character_length = 25;

// Variable to store user preferences
let userPreferences,
// A div that shows feedback of detected language:
    feedbackDiv = document.createElement("div"),
    // In this variable we keep a reference to the input element which the addon operates on currently
    currentInputElement,
    ignoreSignature;

// Initialize the feedback div. It has our unique id
feedbackDiv.id = "danielnaber-firefox-dict-switcher-tooltip";

// Listen to a message from the main script containing user preferences
self.port.on("config", function (prefs)
{
    // We require the presence of user preferences just to know the languages for which the user chosen "Don't
    // detect this language" option so that we disable spell checking if we encountered text in these languages
    userPreferences = prefs;
    ignoreSignature = userPreferences["ignoreSignature"];
});

// The main script sends this message after it receives the detected language code, and found the language dialect
// (ie. the dictionary) that will be used, or found that there's no dictionary for the detected language
// See the changeDictionary function in main.js
self.port.on("feedback", function (feedback)
{
    showFeedback(currentInputElement, feedback.language, feedback.message, feedback.isWarning);
});

function detectAndSetLanguage(targetElement, text)
{
    // If spell checking was disabled by the page developer, we honor the setting and don't set the value of
    // the spellcheck attribute to true, but we still try to detect the language and keep the ordinary operation
    // of the addon because the user can manually enable spell checking from the context menu, and the spellcheck
    // attribute stays false.
    // I set the developerDisabledSpellChecking to indicate this case
    // (see how the firefoxDictSwitcherDisabledSpellCheck flag is set later)
    // I use === because I'm not sure if this attribute accepts only booleans
    const developerDisabledSpellChecking = targetElement.spellcheck === false &&
                                         !targetElement.dataset.firefoxDictSwitcherDisabledSpellCheck;

    // text is an optional parameter used when handling the paste event only. Otherwise, we read the text from
    // the element itself
    text = text || targetElement.value || targetElement.textContent;

    if(ignoreSignature)
    {
        let signatureDelimiterPos = text.indexOf("-- \n");

        if(signatureDelimiterPos >= 0)
        {
            // cut off signature: it may be written in a different language than
            // the main text and would thus decrease language detection quality:
            text = text.substring(0, signatureDelimiterPos);
        }
    }

    // we are only going to check language if there is some amount of text available as
    // that will increase our chances of detecting language correctly.
    if(text.length > minimum_character_length)
    {
        //const startTime = performance.now();

        // Looks like we have enough text to reliably detect the language.
        guessLanguage.detect(text, function (language)
        {
            // The index of the dash character (-) in the language code (ex for en-US this will be 2)
            const dashIndex = language.indexOf("-"),
                languageOnlyCode = dashIndex < 0 ? language : language.substr(0, dashIndex);

            //console.log(`Detected language code is (${language}) in ${performance.now() - startTime} ms`);

            // If the language wasn't successfully identified
            if(language == "unknown")
                showFeedback(targetElement, "...", "Need more characters to detect language");
            // If the user chose to ignore the detected language (see the configs in package.json)
            else if(userPreferences[languageOnlyCode] == "-")
                showFeedback(targetElement, "--", "Detected " + languageOnlyCode + " but it's disabled in configuration");
            else
            {
                // We won't show the feedback tooltip until the main script sends us the language dialect that
                // will be used, and whether or not it found a dictionary for this dialect, so, keep a reference
                // for the input element the user currently edits so that we can show the feedback tooltip on it
                // later.
                // Notice that we are either passed targetElement as a parameter or use the current activeElement
                // (in case of paste events only)
                currentInputElement = targetElement || document.activeElement;

                // If the language was detected successfully enable spell checking and send its code to the main script
                if(!developerDisabledSpellChecking)
                {
                    // We enable spell checking only if the attribute wasn't already set to false be the page developer
                    targetElement.spellcheck = true;
                }

                self.port.emit("changeDictionary", language);

                return;
            }

            // Disable spell checking...
            targetElement.spellcheck = false;

            // ...send null to indicate to the main script that either we failed to detect or the language is disabled...
            //self.port.emit("changeDictionary", null);

            // ...and set a flag to indicate that it's our code who disabled spell checking not the page developer's
            // We do so only if the attribute wasn't already set to false be the page developer
            if(!developerDisabledSpellChecking)
                targetElement.dataset.firefoxDictSwitcherDisabledSpellCheck = "1";
        });
    }
    else
    {
        showFeedback(targetElement, "...", "Need more characters to detect language");
        
        // Because we can't detect the language, disable spell checking
        targetElement.spellcheck = false;

        // Sending null to the main script also indicates that the input text is too short to detect the language
        self.port.emit("changeDictionary", null);

        // And set a flag to indicate that it's our code who disabled spell checking not the page developer's
        // We do so only if the attribute wasn't already set to false be the page developer
        if(!developerDisabledSpellChecking)
            targetElement.dataset.firefoxDictSwitcherDisabledSpellCheck = "1";
    }
}

function showFeedback(element, feedbackText, feedbackTitle, isWarning)
{
    // Detach the feedback div from the document if it were previously attached
    if(feedbackDiv.parentElement)
        feedbackDiv.parentElement.removeChild(feedbackDiv);

    const parentElement = element.offsetParent;

    // offsetParent is null if the element itself is hidden. If the element is hidden we exit as, of course,
    // we won't show feedback on a hidden element
    if(!parentElement)
        return;

    currentInputElement = element;

    feedbackDiv.title = feedbackTitle;
    feedbackDiv.textContent = feedbackText;

    if(isWarning)
        feedbackDiv.classList.add("warning");
    else
        feedbackDiv.classList.remove("warning");
    
    parentElement.appendChild(feedbackDiv);

    // Initialize the positioning loop
    requestAnimationFrame(positionFeedbackDiv);
}

// This function keeps the feedback div always positioned properly relative to 
function positionFeedbackDiv()
{
    const parentElement = feedbackDiv.parentElement;

    if(!parentElement)
        return;

    const leftPos = currentInputElement.offsetLeft + currentInputElement.offsetWidth - 43,
          topPos = currentInputElement.offsetTop + currentInputElement.offsetHeight - 20;

    feedbackDiv.style.left = leftPos + "px";
    feedbackDiv.style.top = topPos + "px";

    // Keep the loop going
    requestAnimationFrame(positionFeedbackDiv);
}

function isEligible(element)
{
    // The addon operates only on textarea elements or elements with the contenteditable attribute set
    return element.tagName == "TEXTAREA" ||
           element.contentEditable === 'true';   // TODO: this can be 'inherit', we need the real value
}

// Note from Ashraf: I commented the old code that initially iterates over all TEXTAREA elements and instead
// used event delegation by attaching event handlers only to the root element. This is better for performance
// and covers the elements that are later appended to the DOM
document.documentElement.addEventListener("keydown", function (evt)
{
    if(isEligible(evt.target))
    {
        var key = evt.keyCode || evt.charCode;

        // check if user has finished entering a word
        if(key == 32/*space*/ || key == 188/*comma*/ || key == 190/*dot*/)
        {
            detectAndSetLanguage(evt.target);
        }
    }
});

// HACK: The focus event doesn't bubble, so I set the useCapture parameter of addEventListener to true.
// We should use the focusin event which bubbles but it's not supported on Firefox as of the date I wrote this.
// See the note on this article https://developer.mozilla.org/en-US/docs/Web/Events/focusin
document.documentElement.addEventListener("focus", function (evt)
{
    // Set correct language when we set the focus to already filled textarea
    if(isEligible(evt.target))
        detectAndSetLanguage(evt.target);
}, true);

// HACK: The blur event doesn't bubble, so I set the useCapture parameter of addEventListener to true.
// We should use the focusout event which bubbles but it's not supported on Firefox as of the date I wrote this.
// See the note on this article https://developer.mozilla.org/en-US/docs/Web/Events/focusout
document.documentElement.addEventListener("blur", function (evt)
{
    // When the focus gets out of an element, detach the feedback div from the document
    if(feedbackDiv.parentElement)
        feedbackDiv.parentElement.removeChild(feedbackDiv);
}, true);

document.documentElement.addEventListener("paste", function (e)
{
    // We act only when data is pasted on a TEXTAREA element
    if(isEligible(e.target))
    {
        // We try to detect only if the pasted data is available in plain text format
        const text = e.clipboardData.getData("text/plain");

        if(text)
            detectAndSetLanguage(e.target, text);
    }
});