//   Automatic Dictionary Switcher Add-on for Firefox
//   Copyright 2015 Daniel Naber
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

const chromeModule  = require("chrome"),
      classes       = chromeModule.Cc,
      interfaces    = chromeModule.Ci,
      utilities     = chromeModule.Cu,
      pageMod       = require("sdk/page-mod"),
      data          = require("sdk/self").data,
      simplePrefs   = require("sdk/simple-prefs"),
      spellchecker  = classes["@mozilla.org/spellchecker/engine;1"].getService(interfaces.mozISpellCheckingEngine),
      tabs          = require("sdk/tabs");

let parsedDictionaries,
    preferenceList,
    availableDictionaries,
    appLocale;

utilities.import("resource://gre/modules/Services.jsm");

// TODO: There should be a better way to get the app locale
appLocale = Services.locale.getApplicationLocale().getCategory("NSILOCALE_MESSAGES");

function LanguageElement(code, isPreferred)
{
    this.code        = code;
    this.isPreferred = isPreferred;
}

function getPreferences()
{
    // See https://developer.mozilla.org/en-US/Add-ons/SDK/High-Level_APIs/simple-prefs#prefs
    // See package.json
    // The preferences object has a property name for each language with the value set to the dialect
    // selected by the user, or a dash (-) if the user doesn't want to detect the language. Example object may be
    // { "en": "en-NZ", "de": "de-LU", "ar": "-" }
    return simplePrefs.prefs;
}

// this function will parse the available dictionaries and will categorise them on the basis of the language names.
function parseAvailableDictionaries()
{
    const userPreferences = getPreferences();
    const dictionaries = {};

    for(let i = 0; i < availableDictionaries.length; i++)
    {
        // This is the code of the dictionary as is returned from the Mozilla spell checking service. Example codes are:
        // en, fr-FR, ja, de-LU
        const dialect = availableDictionaries[i];

        // This is the language code only. If we have a dictionary code of -for example- de-LU, we split it and store the
        // language code de in this variable:
        let language,
            // The index of the dash character (-) in the language code (ex for en-US this will be 2)
            dashIndex;

        // This is the case when we have a generic language with no country code (dialect) specified. For example:
        // en, fr, js, etc.
        if((dashIndex = dialect.indexOf("-")) < 0)
            language = dialect;
        else
        {
            // This is the case when we have both language and country codes, such as en-GB, de-LU
            // We split the language code into the language variable
            language = dialect.substr(0, dashIndex);
        }

        if(!dictionaries[language])
            dictionaries[language] = [];

        dictionaries[language].push(new LanguageElement(dialect, userPreferences[language] == dialect));
    }

    return dictionaries;
}

function initializeDictPreference()
{
    const dictArrayContainer       = {},
          dictArrayLengthContainer = {};
    
    spellchecker.getDictionaryList(dictArrayContainer, dictArrayLengthContainer);

    availableDictionaries = dictArrayContainer.value;

    parsedDictionaries = parseAvailableDictionaries();
}

// This function will be responsible for setting up the dictionary
function changeDictionary(language)
{
    // Exit if the script failed to detect the language, or the user chose to not detect the language
    if(!language)
        return;

    const languageData = parsedDictionaries[language];

    // If the language detection library detected a language for which the user has no dictionary (because of a
    // fault of the library or because the user input some gibberish in some foreign language) we set spell checking
    // language to an empty string and let Firefox select the default dictionary
    let dictionary;
    if(!languageData)
        dictionary = "";
    else
    {
        const preferredDictionary = languageData.find(function (dict)
        {
            return dict.isPreferred;
        });

        // If we find a preferred dictionary (as per what the user configured) use it, otherwise, use the first
        // dictionary in the list for this language
        if(preferredDictionary)
            dictionary = preferredDictionary.code;
        else
            dictionary = languageData[0].code;  // TODO: we need a better default that works for most people
    }

    spellchecker.dictionary = dictionary;

    const feedbackData = {
        language: null,
        message: null,
        isWarning: false
    };

    // TODO: Use friendly languages names
    if(dictionary)
    {
        feedbackData.language = dictionary;
        feedbackData.message = "Detected " + dictionary;
    }
    else
    {
        feedbackData.language = language;
        feedbackData.message = "Detected " + language + " but didn't find suitable dictionary";
        feedbackData.isWarning = true;
    }

    // Inform the content script about our findings so that it shows the proper message to user
    this.emit("feedback", feedbackData);
}

function initialize(options)
{
    // add the script to all pages that will be responsible for detecting the language
    pageMod.PageMod({
        include: [
            "http://*",
            "https://*",
            "file://*"
        ],
        contentScriptWhen: "end",
        contentStyleFile: [
            data.url("ui/content.css")
        ],
        contentScriptFile: [
            data.url("js/franc-most.js"),
            data.url("js/iso6393.js"),
            data.url("js/contentScript.js")
        ],
        onAttach: function (worker)
        {
            // The changeDictionary message will be sent to the main script when the user interaction with a page
            // element triggers language detection which in turn requests setting the dictionary name
            worker.port.on("changeDictionary", changeDictionary);

            function refreshSettings()
            {
                // Send the user preferences to the content script. Read the comment about the subject in contentScript.js
                worker.port.emit("config", getPreferences());
            }

            refreshSettings();
            
            // Every time the settings are modified, send a fresh copy of them to the current content script, so
            // that settings are never stale and the user needn't refresh the page for them to be current.
            simplePrefs.on("", refreshSettings);

            // When the tab is closed, remove the previously added event handlers from the simplePrefs module's
            // list so that dead handlers are cleaned up
            worker.tab.on("close", function ()
            {
                simplePrefs.off("", refreshSettings);
            });
        }
    });

    initializeDictPreference();

    // Every time the user changes a configuration, re-read the configurations and refresh the parsedDictionaries
    // object with what the user chose
    simplePrefs.on("", function ()
    {
        const userPreferences = getPreferences();

        for(let i in userPreferences)
        {
            if(parsedDictionaries[i])
            {
                parsedDictionaries[i].forEach(function (dictElement)
                {
                    /// <param name="dictElement" type="LanguageElement"></param>
                    dictElement.isPreferred = dictElement.code == userPreferences[i];
                });
            }
        }
    });
}

exports.main = function (options, callbacks)
{
    // First run of the addon
    if(options.loadReason == "install")
    {
        // The index of the dash character (-) in the language code (ex for en-US this will be 2)
        const dashIndex = appLocale.indexOf("-"); 
        const appLanguage = dashIndex >= 0 ? appLocale.substr(0, dashIndex) : appLocale;

        // If the user's browser isn't running with one of the default languages we support, set
        // the language it uses as an additional language so it gets detected without
        // the user visiting configuration:
        var longCode;
        switch (appLanguage) {
            // TODO: support all but the first 20 languages from https://github.com/wooorm/franc/blob/master/Supported-Languages.md
            // How to use iso6393.js here?
            case "ur": longCode = "urd"; break;
            case "gu": longCode = "guj"; break;
            case "pl": longCode = "pol"; break;
            case "uk": longCode = "ukr"; break;
            case "ml": longCode = "mal"; break;
            case "nl": longCode = "nld"; break;
        }
        if (longCode) {
            simplePrefs.prefs["additionalLanguage1"] = longCode;
        }

        // if the user's browser is running in e.g. en-GB, we assume they
        // want en-GB as their language (and not e.g. en-US):
        if(simplePrefs.prefs[appLanguage])
            simplePrefs.prefs[appLanguage] = appLocale;
    }

    initialize(options);
};

// exported for tests:
exports.initializeDictPreference = initializeDictPreference;
exports.parseAvailableDictionaries = parseAvailableDictionaries;
