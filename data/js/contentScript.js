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

// Note by Ashraf: I set this constant to 1 after it was 25 to enable continuous language guessing and try to
// provide best results to users
const minimum_character_length = 1;

// Variable to store user preferences
let userPreferences;

// A div that shows feedback of detected language:
let feedbackDiv;

// Listen to a message from the main script containing user preferences
self.port.on("config", function (prefs)
{
    // We require the presence of user preferences just to know the languages for which the user chosen "Don't
    // detect this language" option so that we disable spell checking if we encountered text in these languages
    userPreferences = prefs;
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
    let developerDisabledSpellChecking = targetElement.spellcheck === false &&
                                         !targetElement.dataset.firefoxDictSwitcherDisabledSpellCheck;

    // text is an optional parameter used when handling the paste event only. Otherwise, we read the text from
    // the element itself
    text = text || targetElement.value || targetElement.textContent;

    if (userPreferences['ignoreSignature']) {
        let signatureDelimiterPos = text.indexOf("-- \n");
        if (signatureDelimiterPos !== -1) {
            // cut off signature: it may be written in a different language than
            // the main text and would thus decrease language detection quality:
            text = text.substring(0, signatureDelimiterPos);
        }
    }

    // we are only going to check language if there is some amount of text available as
    // that will increase our chances of detecting language correctly.
    if(text.length > minimum_character_length)
    {
        //let startTime = performance.now();

        // Looks like we have enough text to reliably detect the language.
        guessLanguage.detect(text, function (language)
        {
            // The index of the dash character (-) in the language code (ex for en-US this will be 2)
            let dashIndex = language.indexOf("-"),
                languageOnlyCode = dashIndex < 0 ? language : language.substr(0, dashIndex);

            //console.log(`Detected language code is (${language}) in ${performance.now() - startTime} ms`);

            // If the language wasn't successfully identified, or the user chose to not detect the detected
            // language (see the configs in package.json)
            if(language == "unknown" || userPreferences[languageOnlyCode] == "-")
            {
                if(language == "unknown")
                {
                    showFeedback(targetElement, "...", "Need more characters to detect language");
                }
                else
                {
                    showFeedback(targetElement, "--", "Detected " + languageOnlyCode + " but it's disabled in configuration");
                }

                // Disable spell checking
                targetElement.spellcheck = false;

                // send null to indicate that to the main script
                self.port.emit("changeDictionary", null);

                // and set a flag to indicate that it's our code who disabled spell checking not the page developer's
                // We do so only if the attribute wasn't already set to false be the page developer
                if(!developerDisabledSpellChecking)
                    targetElement.dataset.firefoxDictSwitcherDisabledSpellCheck = "1";
            }
            else
            {
                // TODO: show language code including variant here:
                showFeedback(targetElement, language, "");
                
                // If the language was detected successfully enable spell checking and send its code to the main script
                if(!developerDisabledSpellChecking)
                {
                    // We enable spell checking only if the attribute wasn't already set to false be the page developer
                    targetElement.spellcheck = true;
                }

                self.port.emit("changeDictionary", language);
            }
        });
    }
    else
    {
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

function showFeedback(element, feedbackText, feedbackTitle)
{
    // TODO: this doesn't adapt its position when the textarea is resized
    if (feedbackDiv)
    {
        feedbackDiv.parentNode.removeChild(feedbackDiv);
    }
    let feedbackWidth = 20;
    let feedbackHeight = 12;
    let leftPos = element.offsetLeft + element.offsetWidth - feedbackWidth - 25;
    let topPos = element.offsetTop + element.offsetHeight - feedbackHeight - 12;
    let feedbackNode = document.createElement("div");
    feedbackNode.title = feedbackTitle;
    feedbackNode.style.cssText =
        "position:absolute; left: " + leftPos + "px; top:" + topPos + "px;" +
        "width:" + feedbackWidth + "px; height:" + feedbackHeight + "px;" +
        "background-color:#bcb1ff; color:white; opacity:0.9;" +
        "font-family:sans-serif; font-size:11px; font-weight:bold;" +
        "padding:4px; border-radius:4px";
    var textNode = document.createTextNode(feedbackText);
    feedbackNode.appendChild(textNode);
    element.parentNode.appendChild(feedbackNode);
    feedbackDiv = feedbackNode;
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

document.documentElement.addEventListener("paste", function (e)
{
    // We act only when data is pasted on a TEXTAREA element
    if(isEligible(e.target))
    {
        // We try to detect only if the pasted data is available in plain text format
        let text = e.clipboardData.getData("text/plain");

        if(text)
            detectAndSetLanguage(e.target, text);
    }
});