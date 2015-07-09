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
    let prefs = simplePrefs.prefs,
        userPreferences = {};

    // The preferences object has a property name for each language with the value set to the dialect
    // selected by the user, or a dash (-) if the user doesn't want to detect the language. Example object may be
    // { "en": "en-NZ", "de": "de-LU", "ar": "-" }
    // IMPORTANT: Every time a language is added to package.json, it must be added to the object below too
    //return {
    //    en: prefs.english,
    //    de: prefs.german,
    //    pt: prefs.portuguese
    //};
    for(let i in prefs)
        userPreferences[i] = prefs[i];

    return userPreferences;
}

// this function will parse the available dictionaries and will categorise them on the basis of the language names.
function parseAvailableDictionaries()
{
    let userPreferences = getPreferences();

    parsedDictionaries = {};

    for(let i = 0; i < availableDictionaries.length; i++)
    {
        // The code of the dictionary as is returned from the Mozilla spell checking service. Example codes are:
        // en, fr-FR, ja, de-LU
        let dialect = availableDictionaries[i],
            // The language code only. If we have a dictionary code of -for example- de-LU, we split it and store the
            // language code de in this variable
            language,
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

        if(!parsedDictionaries[language])
            parsedDictionaries[language] = [];

        parsedDictionaries[language].push(new LanguageElement(dialect, userPreferences[language] == dialect));
    }
}

function initializeDictPreference()
{
    let dictArrayContainer       = {},
        dictArrayLengthContainer = {};
    
    spellchecker.getDictionaryList(dictArrayContainer, dictArrayLengthContainer);

    availableDictionaries = dictArrayContainer.value;

    parseAvailableDictionaries();
}

// This function will be responsible for setting up the dictionary
function changeDictionary(language)
{
    // Exit if the script failed to detect the language
    if(!language)
        return;

    let dictionary = "",
        // The index of the dash character (-) in the language code (ex for en-US this will be 2)
        dashIndex = language.indexOf("-");

    // Check if we are able to detect both language and dialect. If yes do we have a dictionary for it
    if(dashIndex >= 0 && availableDictionaries.indexOf(language) != -1)
        dictionary = language;
    else
    {
        // If the language has a dialect part, remove it because our parsedDictionaries object has only languages
        // names as property names
        if(dashIndex >= 0)
            language = language.substr(0, dashIndex);

        let languageData = parsedDictionaries[language];

        // If the language detection library detected a language for which the user has no dictionary (because of a
        // fault of the library or because the user input some gibberish in some foreign language) we set spell checking
        // language to an empty string and let Firefox select the default dictionary
        if(!languageData)
            spellchecker.dictionary = "";
        else
        {
            let preferredDictionary = languageData.find(function (dict)
            {
                return dict.isPreferred;
            });

            // If we find a preferred dictionary (as per what the user configured) use it, otherwise, use the first
            // dictionary in the list for this language
            if(preferredDictionary)
                spellchecker.dictionary = preferredDictionary.code;
            else
                spellchecker.dictionary = languageData[0].code;  // TODO: we need a better default that works for most people
        }
    }
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
        contentScriptFile: [
            data.url("js/_languageData.js"),
            data.url("js/guessLanguage.js"),
            data.url("js/contentScript.js")
        ],
        onAttach: function (worker)
        {
            // The changeDictionary message will be sent to the main script when the user interaction with a page
            // element triggers language detection which in turn requests setting the dictionary name
            worker.port.on("changeDictionary", changeDictionary);

            // Send the user preferences to the content script. Read the comment about the subject in contentScript.js
            worker.port.emit("config", getPreferences());
        }
    });

    initializeDictPreference();

    // Every time the user changes a configuration, re-read the configurations and refresh the parsedDictionaries
    // object with what the user chose
    simplePrefs.on("", function ()
    {
        let userPreferences = getPreferences();

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
        let dashIndex = appLocale.indexOf("-"),
            appLanguage;

        appLanguage = dashIndex >= 0 ? appLocale.substr(0, dashIndex) : appLocale;

        if(simplePrefs.prefs[appLanguage])
            simplePrefs.prefs[appLanguage] = appLocale;
    }

    initialize(options);
};