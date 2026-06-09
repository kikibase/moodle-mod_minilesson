define(
    ['jquery',
    'core/log'],
    function ($, log) {

        "use strict"; // jshint ;_;
        /*
        This file calls a custom Cree wav2vec2 ASR HTTP API and normalizes the
        response into the MS Speech compatible privPronJson format expected by fluency.js.

        The API accepts a WAV audio blob and returns an array of objects:
        [{phoneme: "...", word: "...", scoring: 0.0-1.0}, ...]
         */

        log.debug('Cree ASR: initialising');

        return {

            theapiurl: null,
            theapikey: '',
            thelanguage: null,
            thereferencetext: null,

            //for making multiple instances
            clone: function () {
                return $.extend(true, {}, this);
            },

            init: function (apiurl, apikey, language, referencetext) {
                this.theapiurl = apiurl;
                this.theapikey = apikey || '';
                this.thelanguage = language;
                this.thereferencetext = referencetext;
                log.debug('Cree ASR: init, apiurl=' + apiurl);
            },

            updateapiurl: function (url) {
                this.theapiurl = url;
            },

            set_reference_text: function (referencetext) {
                this.thereferencetext = referencetext;
            },

            recognize: function (blob, callback) {
                var that = this;

                var bodyFormData = new FormData();
                bodyFormData.append('audioFile', blob, 'audio.wav');
                bodyFormData.append('reference_text', that.thereferencetext || '');

                var oReq = new XMLHttpRequest();
                oReq.open("POST", that.theapiurl, true);

                if (that.theapikey && that.theapikey !== '') {
                    oReq.setRequestHeader('Authorization', 'Bearer ' + that.theapikey);
                }

                oReq.onload = function () {
                    if (oReq.status === 200) {
                        try {
                            var apiResponse = JSON.parse(oReq.response);
                            var normalized = that.normalizeResponse(apiResponse);
                            callback(normalized);
                        } catch (e) {
                            log.debug('Cree ASR: error parsing response - ' + e);
                            callback(null);
                        }
                    } else {
                        log.debug('Cree ASR: HTTP error ' + oReq.status);
                        callback(null);
                    }
                };

                oReq.onerror = function () {
                    log.debug('Cree ASR: XHR network error');
                    callback(null);
                };

                try {
                    oReq.send(bodyFormData);
                } catch (err) {
                    log.debug('Cree ASR: send error - ' + err);
                    callback(null);
                }
            },

            normalizeResponse: function (apiResponse) {
                var i, w, j;

                // Group phonemes by word, preserving order of first appearance
                var wordMap = {};
                var wordOrder = [];

                for (i = 0; i < apiResponse.length; i++) {
                    var item = apiResponse[i];
                    var word = item.word;
                    var rawScore = item.scoring;

                    // Normalize score: if <= 1.0 it is a fraction, multiply by 100; otherwise use as-is
                    var score = (rawScore <= 1.0) ? rawScore * 100 : rawScore;

                    if (!wordMap.hasOwnProperty(word)) {
                        wordMap[word] = [];
                        wordOrder.push(word);
                    }
                    wordMap[word].push({phoneme: item.phoneme, score: score});
                }

                // Build Words array with per-word and per-phoneme scores
                var words = [];
                var wordAccuracies = [];

                for (w = 0; w < wordOrder.length; w++) {
                    var wordStr = wordOrder[w];
                    var phonemes = wordMap[wordStr];

                    // Word accuracy = average of its phoneme scores
                    var totalPhonemeScore = 0;
                    for (j = 0; j < phonemes.length; j++) {
                        totalPhonemeScore += phonemes[j].score;
                    }
                    var wordAccuracy = phonemes.length > 0 ? totalPhonemeScore / phonemes.length : 0;
                    wordAccuracies.push(wordAccuracy);

                    var errorType = wordAccuracy < 50 ? "Mispronunciation" : "None";

                    // Build Phonemes array for this word
                    var phonemeObjects = [];
                    for (j = 0; j < phonemes.length; j++) {
                        phonemeObjects.push({
                            Phoneme: phonemes[j].phoneme,
                            PronunciationAssessment: {
                                AccuracyScore: Math.round(phonemes[j].score)
                            }
                        });
                    }

                    words.push({
                        Word: wordStr,
                        PronunciationAssessment: {
                            AccuracyScore: Math.round(wordAccuracy),
                            ErrorType: errorType
                        },
                        Phonemes: phonemeObjects
                    });
                }

                // Overall accuracy = average of word accuracy scores
                var overallAccuracy = 0;
                if (wordAccuracies.length > 0) {
                    var totalWordAccuracy = 0;
                    for (j = 0; j < wordAccuracies.length; j++) {
                        totalWordAccuracy += wordAccuracies[j];
                    }
                    overallAccuracy = totalWordAccuracy / wordAccuracies.length;
                }
                overallAccuracy = Math.round(overallAccuracy);

                return {
                    accuracyScore: overallAccuracy,
                    pronunciationScore: overallAccuracy,
                    completenessScore: 100,
                    fluencyScore: overallAccuracy,
                    prosodyScore: 0,
                    privPronJson: {
                        PronunciationAssessment: {
                            AccuracyScore: overallAccuracy,
                            FluencyScore: overallAccuracy,
                            CompletenessScore: 100,
                            PronScore: overallAccuracy
                        },
                        Words: words
                    }
                };
            },

        };

    }
);
