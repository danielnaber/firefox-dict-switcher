// Automatic Dictionary Switcher Add-on for Firefox
// Copyright 2015 Daniel Naber
//
// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
// If a copy of the MPL was not distributed with this file, You can obtain one at
// http://mozilla.org/MPL/2.0/.

const chromeModule       = require("chrome"),
      classes            = chromeModule.Cc,
      interfaces         = chromeModule.Ci,
      utilities          = chromeModule.Cu,
      franc              = require("franc-most.js"),
      iso6393            = require("iso6393.js"),
      pageMod            = require("sdk/page-mod"),
      data               = require("sdk/self").data,
      simplePrefs        = require("sdk/simple-prefs"),
      MatchPattern       = require("sdk/util/match-pattern").MatchPattern,
      spellchecker       = classes["@mozilla.org/spellchecker/engine;1"].getService(interfaces.mozISpellCheckingEngine),
      tabs               = require("sdk/tabs"),
      {ActionButton}     = require("sdk/ui/button/action"),
      {id}               = require('sdk/self'),
      contentStyleFile   = data.url("ui/content.css"),
      minimumTextLength  = 25,
      filterRegEx        = /(http|https|ftp)\:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(:[a-zA-Z0-9]*)?\/?([a-zA-Z0-9\-\._\?\,\'/\\\+&amp;%\$#\=~])*/gi,
      defaultBadgeColor  = "#6161ff",
      warningBadgeColor  = "#FF0000",
      contentScriptFiles = [
            data.url("js/contentScript.js")
        ];

let parsedDictionaries,
    preferenceList,
    availableDictionaries,
    appLocale,
    dictSwitcherButton;

utilities.import("resource://gre/modules/Services.jsm");

// TODO: There should be a better way to get the app locale
appLocale = Services.locale.getApplicationLocale().getCategory("NSILOCALE_MESSAGES");

function LanguageElement(code, isPreferred) {
    this.code        = code;
    this.isPreferred = isPreferred;
}

function getPreferences() {
    // See https://developer.mozilla.org/en-US/Add-ons/SDK/High-Level_APIs/simple-prefs#prefs
    // See package.json
    // The preferences object has a property name for each language with the value set to the dialect
    // selected by the user, or a dash (-) if the user doesn't want to detect the language. Example object may be
    // { "en": "en-NZ", "de": "de-LU", "ar": "-" }
    return simplePrefs.prefs;
}

// this function will parse the available dictionaries and will categorise them on the basis of the language names.
function parseAvailableDictionaries() {
    const userPreferences = getPreferences();
    const dictionaries = {};

    for(let i = 0; i < availableDictionaries.length; i++) {
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
        if((dashIndex = dialect.indexOf("-")) < 0) {
            language = dialect;
        } else {
            // This is the case when we have both language and country codes, such as en-GB, de-LU
            // We split the language code into the language variable
            language = dialect.substr(0, dashIndex);
        }
        if(!dictionaries[language]) {
            dictionaries[language] = [];
        }
        dictionaries[language].push(new LanguageElement(dialect, userPreferences[language] == dialect));
    }
    return dictionaries;
}

function initializeDictPreference() {
    const dictArrayContainer       = {},
          dictArrayLengthContainer = {};
    spellchecker.getDictionaryList(dictArrayContainer, dictArrayLengthContainer);
    availableDictionaries = dictArrayContainer.value;
    parsedDictionaries = parseAvailableDictionaries();
}

// This function will be responsible for setting up the dictionary
function changeDictionary(langCode, langName) {
    const languageData = parsedDictionaries[langCode];

    // If the language detection library detected a language for which the user has no dictionary (because of a
    // fault of the library or because the user input some gibberish in some foreign language) we set spell checking
    // language to an empty string and let Firefox select the default dictionary
    let dictionary;
    if(!languageData) {
        dictionary = "";
    } else {
        const preferredDictionary = languageData.find(function (dict) {
            return dict.isPreferred;
        });

        // If we find a preferred dictionary (as per what the user configured) use it, otherwise, use the first
        // dictionary in the list for this language
        if(preferredDictionary) {
            dictionary = preferredDictionary.code;
        } else {
            dictionary = languageData[0].code;  // TODO: we need a better default that works for most people
        }
    }

    // focus into textarea after page load sometimes doesn't set the spell dictionary
    // properly (even though detection works), this helps but doesn't fix it completely (issue #7):
    var setTimeout = require("sdk/timers").setTimeout;
    setTimeout(function() {spellchecker.dictionary = dictionary;}, 10);

    if(dictionary) {
        showFeedbackInToolbar(langCode, "Detected " + langName + " (" + dictionary + ")", false);
    } else {
        showFeedbackInToolbar(langCode, "Detected " + langName + " (" + langCode + ") but didn't find suitable dictionary", true);
    }
}

function detectLanguage(text) {
    const userPreferences = getPreferences();
    if(userPreferences["ignoreSignature"]) {
        let signatureDelimiterPos = text.indexOf("-- \n");
        if(signatureDelimiterPos >= 0) {
            // cut off signature: it may be written in a different language than
            // the main text and would thus decrease language detection quality:
            text = text.substring(0, signatureDelimiterPos);
        }
    }

    // Remove URLs from text (issue #15):
    text = text.replace(filterRegEx, "");

    // we are only going to check language if there is some amount of text available as
    // that will increase our chances of detecting language correctly.
    if(text.length >= minimumTextLength) {
        // Looks like we have enough text to reliably detect the language.
        var francLangCode;
        try {
            francLangCode = franc(text, { whitelist: getDetectableLanguages() });
        } catch (e) {
            showFeedbackInToolbar("?", "Error: " + e.toString(), false);
            return;
        }
        if(francLangCode === "und") {  // franc's code for 'unknown'
            showFeedbackInToolbar("?", "Could not detect language", false);
            return;
        } else {
            var languageInfo = iso6393.iso6393[francLangCode];
            if(!languageInfo) {
                showFeedbackInToolbar("?", "Could not find language for code " + francLangCode, false);
                return;
            }
            shortCode = languageInfo.iso6391;
            langName = languageInfo.name;
        }
        changeDictionary(shortCode, langName);
    } else {
        // Sending null to the main script also indicates that the input text is too short to detect the language
        showFeedbackInToolbar("...", "Need at least " + minimumTextLength + " characters to detect language", false);
    }

    //TODO: emit result?
    //this.emit("setLanguage", "en", "FAKE");
}

function getDetectableLanguages() {
    let detectableLanguages = ['eng', 'spa', 'por', 'deu'];  // the four languages with variants that have a drop-down in our settings
    addAdditionalLanguages(detectableLanguages);
    removeDisabledLanguages(detectableLanguages);
    return detectableLanguages;
}

function addAdditionalLanguages(detectableLanguages) {
    const userPreferences = getPreferences();
    for (var i = 1; i <= 3; i++) {
        let additionalLanguage = userPreferences["additionalLanguage"+i];
        if (additionalLanguage && additionalLanguage !== '-') {
            detectableLanguages.push(additionalLanguage);
        }
    }
}

function removeDisabledLanguages(detectableLanguages) {
    const potentiallyDisabledLanguages = [
        { short: 'en', long: 'eng' },
        { short: 'es', long: 'spa' },
        { short: 'de', long: 'deu' },
        { short: 'pt', long: 'por' } ];  // these have variants and a "Don't detect this language" option in the settings
    const userPreferences = getPreferences();
    for (var idx in potentiallyDisabledLanguages) {
        let shortCode = potentiallyDisabledLanguages[idx].short;
        if (userPreferences[shortCode] === '-') {
            let longCode = potentiallyDisabledLanguages[idx].long;
            let pos = detectableLanguages.indexOf(longCode);
            if (pos > -1) {
                detectableLanguages.splice(pos, 1);
            }
        }
    }
}

function showFeedbackInToolbar(badgeText, tooltip, isWarning) {
    dictSwitcherButton.badge = badgeText;
    dictSwitcherButton.label = tooltip;
    if (isWarning) {
        dictSwitcherButton.badgeColor = warningBadgeColor;
    } else {
        dictSwitcherButton.badgeColor = defaultBadgeColor;
    }
}

function onScriptAttachedToTab(worker)
{
    // Ashraf: I don't know why and when this condition happens. Maybe while initially iterating over the open tabs
    // when the browser is initially opened or when the addon is installed. But anyway, I can't deal with the case
    // where the port or tab don't exist
    if(!worker.port || !worker.tab) {
        return;
    }

    // The changeDictionary message will be sent to the main script when the user interaction with a page
    // element triggers language detection which in turn requests setting the dictionary name
    worker.port.on("changeDictionary", changeDictionary);
    
    worker.port.on("showFeedbackInToolbar", showFeedbackInToolbar);
    
    worker.port.on("detectLanguage", detectLanguage);

    function refreshSettings() {
        // Send the user preferences to the content script. Read the comment about the subject in contentScript.js
        worker.port.emit("config", getPreferences());
    }

    refreshSettings();
            
    // Every time the settings are modified, send a fresh copy of them to the current content script, so
    // that settings are never stale and the user needn't refresh the page for them to be current.
    simplePrefs.on("", refreshSettings);

    // When the tab is closed, remove the previously added event handlers from the simplePrefs module's
    // list so that dead handlers are cleaned up
    worker.tab.on("close", function () {
        simplePrefs.off("", refreshSettings);
    });
}

function initialize(options) {
    let selfId = this.id;
    dictSwitcherButton = ActionButton({
        id: "automatic-dictionary-switcher",
        label: "Shows the currently detected language",
        badge: "...",
        badgeColor: defaultBadgeColor,
        icon: {
            "16": "./img/dictionary16.png",
            "32": "./img/dictionary32.png"
        },
        onClick: function(state) {
            // there's no real useful action, so open config (source: http://stackoverflow.com/questions/22593454/):
            tabs.open({
                url: 'about:addons',
                onReady: function(tab) {
                    tab.attach({
                        contentScriptWhen: 'end',
                        contentScript: 'AddonManager.getAddonByID("' + selfId + '", function(aAddon) {\n' +
                          'unsafeWindow.gViewController.commands.cmd_showItemDetails.doCommand(aAddon, true);\n' +
                          '});\n'
                    });
                }
            });
        }
    });

    const urlPatterns = [
            "http://*",
            "https://*",
            "file://*"
          ],
          urlPatternMatchers = [
              new MatchPattern(urlPatterns[0]),
              new MatchPattern(urlPatterns[1]),
              new MatchPattern(urlPatterns[2])
          ],
          tabAttachmentOptions = {
              include: urlPatterns,
              contentScriptWhen: "end",
              contentStyleFile: contentStyleFile,
              contentScriptFile: contentScriptFiles,
              onAttach: onScriptAttachedToTab
          };

    // Attach the script to all future tabs that match our URL criteria.
    // That will be responsible for detecting the language ddfdf 
    pageMod.PageMod(tabAttachmentOptions);

    initializeDictPreference();

    // Every time the user changes a configuration, re-read the configurations and refresh the parsedDictionaries
    // object with what the user chose
    simplePrefs.on("", function () {
        const userPreferences = getPreferences();
        for(let i in userPreferences) {
            if(parsedDictionaries[i]) {
                parsedDictionaries[i].forEach(function (dictElement) {
                    /// <param name="dictElement" type="LanguageElement"></param>
                    dictElement.isPreferred = dictElement.code == userPreferences[i];
                });
            }
        }
    });

    // Attach the script to the tabs currently existing when the browser was open, or when the addon was installed.
    LOOP:
    for(let tab of tabs) {
        // Attach the script only if the tab URL matches any of our URL criteria
        for(let ptrn of urlPatternMatchers) {
            if(ptrn.test(tab.url)) {
                onScriptAttachedToTab(tab.attach(tabAttachmentOptions));
                continue LOOP;
            }
        }   
    }
}


exports.main = function (options, callbacks) {
    // First run of the addon
    if(options.loadReason == "install") {
        // The index of the dash character (-) in the language code (ex for en-US this will be 2)
        const dashIndex = appLocale.indexOf("-"); 
        const appLanguage = dashIndex >= 0 ? appLocale.substr(0, dashIndex) : appLocale;

        // If the user's browser isn't running with one of the default languages we support, set
        // the language it uses as an additional language so it gets detected without
        // the user visiting configuration:
        var longCode;
        switch (appLanguage) {
            // TODO: How to use iso6393.js here?
            case "aa": longCode = "aar"; break;
            case "ab": longCode = "abk"; break;
            case "af": longCode = "afr"; break;
            case "ak": longCode = "aka"; break;
            case "am": longCode = "amh"; break;
            case "ar": longCode = "ara"; break;
            case "an": longCode = "arg"; break;
            case "as": longCode = "asm"; break;
            case "av": longCode = "ava"; break;
            case "ae": longCode = "ave"; break;
            case "ay": longCode = "aym"; break;
            case "az": longCode = "aze"; break;
            case "ba": longCode = "bak"; break;
            case "bm": longCode = "bam"; break;
            case "be": longCode = "bel"; break;
            case "bn": longCode = "ben"; break;
            case "bi": longCode = "bis"; break;
            case "bo": longCode = "bod"; break;
            case "bs": longCode = "bos"; break;
            case "br": longCode = "bre"; break;
            case "bg": longCode = "bul"; break;
            case "ca": longCode = "cat"; break;
            case "cs": longCode = "ces"; break;
            case "ch": longCode = "cha"; break;
            case "ce": longCode = "che"; break;
            case "cu": longCode = "chu"; break;
            case "cv": longCode = "chv"; break;
            case "kw": longCode = "cor"; break;
            case "co": longCode = "cos"; break;
            case "cr": longCode = "cre"; break;
            case "cy": longCode = "cym"; break;
            case "da": longCode = "dan"; break;
            case "dv": longCode = "div"; break;
            case "dz": longCode = "dzo"; break;
            case "el": longCode = "ell"; break;
            case "eo": longCode = "epo"; break;
            case "et": longCode = "est"; break;
            case "eu": longCode = "eus"; break;
            case "ee": longCode = "ewe"; break;
            case "fo": longCode = "fao"; break;
            case "fa": longCode = "fas"; break;
            case "fj": longCode = "fij"; break;
            case "fi": longCode = "fin"; break;
            case "fr": longCode = "fra"; break;
            case "fy": longCode = "fry"; break;
            case "ff": longCode = "ful"; break;
            case "gd": longCode = "gla"; break;
            case "ga": longCode = "gle"; break;
            case "gl": longCode = "glg"; break;
            case "gv": longCode = "glv"; break;
            case "gn": longCode = "grn"; break;
            case "gu": longCode = "guj"; break;
            case "ht": longCode = "hat"; break;
            case "ha": longCode = "hau"; break;
            case "sh": longCode = "hbs"; break;
            case "he": longCode = "heb"; break;
            case "hz": longCode = "her"; break;
            case "hi": longCode = "hin"; break;
            case "ho": longCode = "hmo"; break;
            case "hr": longCode = "hrv"; break;
            case "hu": longCode = "hun"; break;
            case "hy": longCode = "hye"; break;
            case "ig": longCode = "ibo"; break;
            case "io": longCode = "ido"; break;
            case "ii": longCode = "iii"; break;
            case "iu": longCode = "iku"; break;
            case "ie": longCode = "ile"; break;
            case "ia": longCode = "ina"; break;
            case "id": longCode = "ind"; break;
            case "ik": longCode = "ipk"; break;
            case "is": longCode = "isl"; break;
            case "it": longCode = "ita"; break;
            case "jv": longCode = "jav"; break;
            case "ja": longCode = "jpn"; break;
            case "kl": longCode = "kal"; break;
            case "kn": longCode = "kan"; break;
            case "ks": longCode = "kas"; break;
            case "ka": longCode = "kat"; break;
            case "kr": longCode = "kau"; break;
            case "kk": longCode = "kaz"; break;
            case "km": longCode = "khm"; break;
            case "ki": longCode = "kik"; break;
            case "rw": longCode = "kin"; break;
            case "ky": longCode = "kir"; break;
            case "kv": longCode = "kom"; break;
            case "kg": longCode = "kon"; break;
            case "ko": longCode = "kor"; break;
            case "kj": longCode = "kua"; break;
            case "ku": longCode = "kur"; break;
            case "lo": longCode = "lao"; break;
            case "la": longCode = "lat"; break;
            case "lv": longCode = "lav"; break;
            case "li": longCode = "lim"; break;
            case "ln": longCode = "lin"; break;
            case "lt": longCode = "lit"; break;
            case "lb": longCode = "ltz"; break;
            case "lu": longCode = "lub"; break;
            case "lg": longCode = "lug"; break;
            case "mh": longCode = "mah"; break;
            case "ml": longCode = "mal"; break;
            case "mr": longCode = "mar"; break;
            case "mk": longCode = "mkd"; break;
            case "mg": longCode = "mlg"; break;
            case "mt": longCode = "mlt"; break;
            case "mn": longCode = "mon"; break;
            case "mi": longCode = "mri"; break;
            case "ms": longCode = "msa"; break;
            case "my": longCode = "mya"; break;
            case "na": longCode = "nau"; break;
            case "nv": longCode = "nav"; break;
            case "nr": longCode = "nbl"; break;
            case "nd": longCode = "nde"; break;
            case "ng": longCode = "ndo"; break;
            case "ne": longCode = "nep"; break;
            case "nl": longCode = "nld"; break;
            case "nn": longCode = "nno"; break;
            case "nb": longCode = "nob"; break;
            case "no": longCode = "nor"; break;
            case "ny": longCode = "nya"; break;
            case "oc": longCode = "oci"; break;
            case "oj": longCode = "oji"; break;
            case "or": longCode = "ori"; break;
            case "om": longCode = "orm"; break;
            case "os": longCode = "oss"; break;
            case "pa": longCode = "pan"; break;
            case "pi": longCode = "pli"; break;
            case "pl": longCode = "pol"; break;
            case "ps": longCode = "pus"; break;
            case "qu": longCode = "que"; break;
            case "rm": longCode = "roh"; break;
            case "ro": longCode = "ron"; break;
            case "rn": longCode = "run"; break;
            case "ru": longCode = "rus"; break;
            case "sg": longCode = "sag"; break;
            case "sa": longCode = "san"; break;
            case "si": longCode = "sin"; break;
            case "sk": longCode = "slk"; break;
            case "sl": longCode = "slv"; break;
            case "se": longCode = "sme"; break;
            case "sm": longCode = "smo"; break;
            case "sn": longCode = "sna"; break;
            case "sd": longCode = "snd"; break;
            case "so": longCode = "som"; break;
            case "st": longCode = "sot"; break;
            case "sq": longCode = "sqi"; break;
            case "sc": longCode = "srd"; break;
            case "sr": longCode = "srp"; break;
            case "ss": longCode = "ssw"; break;
            case "su": longCode = "sun"; break;
            case "sw": longCode = "swa"; break;
            case "sv": longCode = "swe"; break;
            case "ty": longCode = "tah"; break;
            case "ta": longCode = "tam"; break;
            case "tt": longCode = "tat"; break;
            case "te": longCode = "tel"; break;
            case "tg": longCode = "tgk"; break;
            case "tl": longCode = "tgl"; break;
            case "th": longCode = "tha"; break;
            case "ti": longCode = "tir"; break;
            case "to": longCode = "ton"; break;
            case "tn": longCode = "tsn"; break;
            case "ts": longCode = "tso"; break;
            case "tk": longCode = "tuk"; break;
            case "tr": longCode = "tur"; break;
            case "tw": longCode = "twi"; break;
            case "ug": longCode = "uig"; break;
            case "uk": longCode = "ukr"; break;
            case "ur": longCode = "urd"; break;
            case "uz": longCode = "uzb"; break;
            case "ve": longCode = "ven"; break;
            case "vi": longCode = "vie"; break;
            case "vo": longCode = "vol"; break;
            case "wa": longCode = "wln"; break;
            case "wo": longCode = "wol"; break;
            case "xh": longCode = "xho"; break;
            case "yi": longCode = "yid"; break;
            case "yo": longCode = "yor"; break;
            case "za": longCode = "zha"; break;
            case "zh": longCode = "zho"; break;
            case "zu": longCode = "zul"; break;
        }
        if (longCode) {
            simplePrefs.prefs["additionalLanguage1"] = longCode;
        }

        // if the user's browser is running in e.g. en-GB, we assume they
        // want en-GB as their language (and not e.g. en-US):
        if(simplePrefs.prefs[appLanguage]) {
            simplePrefs.prefs[appLanguage] = appLocale;
        }
    }

    initialize(options);
};

// exported for tests:
exports.initializeDictPreference = initializeDictPreference;
exports.parseAvailableDictionaries = parseAvailableDictionaries;
