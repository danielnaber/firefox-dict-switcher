//   Simple guessLanguage.js and franc evaluation for short text.
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

// Result 2015-07-13 (evaluated on 5000 random sentences per language from tatoeba.org):
//   guessLanguage.js (100 languages):
//     For English: 23.8 chars, noCorrectGuessCount: 1042, runtime 52secs
//     For German: 24.9 chars, noCorrectGuessCount: 610, runtime 62secs
//   Franc 1.1.0 (175 languages):
//     For English: 25.4 chars, noCorrectGuessCount: 1710, runtime 66sec
//     For German: 20.4 chars, noCorrectGuessCount: 538, runtime 85sec

const inputFile = "/media/Data/tatoeba/tatoeba-en-sentences-only-subset.txt";
const expectedLang = "en";   // two-character for guessLanguage, three-character for franc
const mode = "guessLanguage";  // 'guessLanguage' or 'franc'

const guessLanguage = require('guesslanguage');
const franc = require('franc');
const fs = require('fs');

const buffer = fs.readFileSync(inputFile);
const lines = buffer.toString().split(/\n/);
var lineCount = 0;
var minCorrectCharsTotal = 0;
var minCorrectCharsCount = 0;
var noCorrectGuessCount = 0;
for (var line in lines) {
    var text = lines[line];
    console.log(lineCount + ". --------------------------------------");
    console.log("Input: '" + text + "'");
    var parts = text.split(/([ .,])/);
    var minCorrectChars = -1;
    var everCorrect = false;
    for (var i = parts.length; i >= 1; i--) {
        var shortened = parts.slice(0, i).join("");
        var prevCharLength = parts.slice(0, i+1).join("").length;
        if (mode === 'guessLanguage') {
            guessLanguage.guessLanguage.detect(shortened, function(language) {
                //console.log(i + " " + language + " <= '" + shortened + "'");
                if (language !== expectedLang && minCorrectChars < shortened.length) {
                    minCorrectChars = prevCharLength;
                    console.log("Wrong: '" + shortened + "'");
                }
                if (language === expectedLang) {
                    everCorrect = true;
                }
            });
        } else if (mode === 'franc') {
            var language = franc(shortened);
            if (language !== expectedLang && minCorrectChars < shortened.length) {
                minCorrectChars = prevCharLength;
                console.log("Wrong: '" + shortened + "'");
            }
            if (language === expectedLang) {
                everCorrect = true;
            }
        } else {
            throw "Unknown mode: " + mode;
        }
    }
    if (everCorrect) {
        console.log("minCorrectChars: " + minCorrectChars);
        minCorrectCharsTotal += minCorrectChars;
        minCorrectCharsCount++;
    } else {
        console.log("No correct guess");
        noCorrectGuessCount++;
    }
    lineCount++;
}

console.log("===========================");
console.log("minCorrectChars avg: " + (minCorrectCharsTotal/minCorrectCharsCount));
console.log("noCorrectGuessCount: " + noCorrectGuessCount);
