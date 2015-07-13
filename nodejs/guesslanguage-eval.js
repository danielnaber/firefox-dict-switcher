//   Simple guessLanguage.js evaluation for short text.
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

// Result 205-07-13 (evaluated on 5000 random sentences per language from tatoeba.org):
//   For English: 23.8 chars, noCorrectGuessCount: 1042
//   For German: 24.9 chars, noCorrectGuessCount: 610

const expectedLang = "en";
const inputFile = "/media/Data/tatoeba/tatoeba-en-sentences-only-subset.txt";

const guessLanguage = require('guesslanguage');
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
