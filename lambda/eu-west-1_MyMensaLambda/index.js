const Alexa = require('ask-sdk-core');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
const {
    DynamoDbPersistenceAdapter
} = require('ask-sdk-dynamodb-persistence-adapter');
const stringSimilarity = require('string-similarity');
const axios = require('axios');

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const speechText = requestAttributes.t('LAUNCH') + " " + requestAttributes.t('DEFAULT_REPROMPT');

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
            .getResponse();
    },
};

const GetCityIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'GetCityIntent';
    },
    async handle(handlerInput) {
        const {
            requestEnvelope,
            serviceClientFactory,
            responseBuilder
        } = handlerInput;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        //TODO Auch mit Ja und Nein und string-similarity
        let citySlot = requestEnvelope.request.intent.slots.city.value;

        let response;
        if (citySlot[citySlot.length - 1] == '.' || citySlot[citySlot.length - 1] == '!' || citySlot[citySlot.length - 1] == '?') {
            citySlot = citySlot.slice(0, -1);
        }
        await mensaInCity(citySlot).then((res) => {
            if (res.length == 0) {
                response = `Ich habe leider keine Mensa in ${citySlot} gefunden.`;
            } else {
                let allMensas = "";
                for (let i = 0; i < res.length; i++) {
                    if (i == res.length - 1) {
                        allMensas = allMensas + res[i].name.replace(/\,/g, "");
                    } else {
                        allMensas = allMensas + res[i].name.replace(/\,/g, "") + ", ";
                    }
                }
                if (res.length > 5) {
                    //TODO CARD TO ALEXA
                    response = "Ich habe " + res.length + " Mensen für deine Stadt gefunden. Ich habe Sie an deine Alexa App gesendet. Du kannst deine Mensa festlegen indem du sagst: Alexa, sage My Mensa meine Mensa heißt <break time='100ms'/> und dann deine Mensa nennst";
                } else {
                    response = "Ich konnte folgende Mensen finden: " + allMensas + ". Sag meine Mensa heißt <break time='100ms'/> und dann deine Mensa um sie festzulegen. <break time='300ms'/> Wie heißt deine Mensa?";
                }
            }
        }).catch((err) => {
            //TODO LOGS + NAchricht
            response = "Es ist ein Fehler aufgetreten!";
        });



        return responseBuilder
            .speak(response)
            .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
            .getResponse();
    }
};

const GetMensaIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'GetMensaIntent';
    },
    async handle(handlerInput) {
        const {
            requestEnvelope,
            serviceClientFactory,
            responseBuilder
        } = handlerInput;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        let mensaNameSlot = requestEnvelope.request.intent.slots.mensaName.value;

        let response;
        await getMensaID(mensaNameSlot).then((res) => { //TODO ERROR HANDLING
            handlerInput.attributesManager.setSessionAttributes({
                'mensaID': res.id
            });
            response = requestAttributes.t('CONFIRMATION_1') + res.name + requestAttributes.t('CONFIRMATION_2');
        }).catch((err) => {
            response = err;
        });

        return responseBuilder
            .speak(response)
            .reprompt(response)
            .getResponse();
    }
};

const GetMenuIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'GetMenuIntent';
    },
    async handle(handlerInput) {
        const {
            requestEnvelope,
            responseBuilder,
            attributesManager
        } = handlerInput;
        const requestAttributes = attributesManager.getRequestAttributes();
        let dateSlot = requestEnvelope.request.intent.slots.date.value;

        today = new Date().toLocaleDateString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        if (!dateSlot) {
            dateSlot = today;
        }
        let response;
        let attributes = await attributesManager.getPersistentAttributes();

        if (attributes.mensaID && attributes.mensaID > 0) {
            await getMensaMeals(attributes.mensaID, dateSlot, requestAttributes).then((res) => { //TODO ERROR CATCH
                if (today == dateSlot) {
                    response = requestAttributes.t('TODAY_MEAL') + res;
                } else {
                    response = requestAttributes.t('DAY_MEAL_1') + weekday(dateSlot) + requestAttributes.t('DAY_MEAL_2') + res;
                }
            }).catch((err) => {
                response = err;
            });
        } else {
            response = requestAttributes.t('MENSA_NOT_SET')
            return responseBuilder
            .speak(response)
            .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
            .getResponse();
        }

        return responseBuilder
            .speak(response)
            .getResponse();
    }
};

const YesIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
        let {
            attributesManager
        } = handlerInput;
        const requestAttributes = attributesManager.getRequestAttributes();
        let response;
        let session = attributesManager.getSessionAttributes();
        if (session.mensaID) {
            attributesManager.setPersistentAttributes({
                'mensaID': session.mensaID
            });
            await attributesManager.savePersistentAttributes();
            attributesManager.setSessionAttributes();
            response = requestAttributes.t('MENSA_SAVE_SUCCESS');
        } else {
            response = requestAttributes.t('ERROR_MESSAGE');
        }

        return handlerInput.responseBuilder
            .speak(response)
            .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
            .getResponse();
    },
};

const NoIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.NoIntent';
    },
    async handle(handlerInput) {
        let {
            attributesManager
        } = handlerInput;
        const requestAttributes = attributesManager.getRequestAttributes();
        let response;
        let session = attributesManager.getSessionAttributes();
        if (session.mensaID) {
            attributesManager.setSessionAttributes();
            response = requestAttributes.t('MENSA_DECLINED');
        } else {
            response = requestAttributes.t('ERROR_MESSAGE');
        }

        return handlerInput.responseBuilder
            .speak(response)
            .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
            .getResponse();
    },
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const speechText = requestAttributes.t('HELP_MESSAGE');

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
            .getResponse();
    },
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && (request.intent.name === 'AMAZON.CancelIntent' || request.intent.name === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const speechText = requestAttributes.t('STOP_MESSAGE');

        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    },
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
        console.log(`Handler Input: ${handlerInput}`);

        return handlerInput.responseBuilder.getResponse();
    },
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        console.log(`Error handled: ${error.message}`);

        return handlerInput.responseBuilder
            .speak(requestAttributes.t('ERROR_MESSAGE'))
            .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
            .getResponse();
    },
};

const LocalizationInterceptor = {
    process(handlerInput) {
        const localizationClient = i18n.use(sprintf).init({
            lng: handlerInput.requestEnvelope.request.locale,
            resources: languageStrings,
        });
        localizationClient.localize = function localize() {
            const args = arguments;
            const values = [];
            for (let i = 1; i < args.length; i += 1) {
                values.push(args[i]);
            }
            const value = i18n.t(args[0], {
                returnObjects: true,
                postProcess: 'sprintf',
                sprintf: values,
            });
            if (Array.isArray(value)) {
                return value[Math.floor(Math.random() * value.length)];
            }
            return value;
        };
        const attributes = handlerInput.attributesManager.getRequestAttributes();
        attributes.t = function translate(...args) {
            return localizationClient.localize(...args);
        };
    },
};

const skillBuilder = Alexa.SkillBuilders.custom();

const deData = {
    translation: {
        LAUNCH: 'Willkommen bei MyMensa. Hier bekommst du den aktuellen Speiseplan für deine Mensa.',
        DEFAULT_REPROMPT: 'Wie kann ich dir helfen?',
        HELP_MESSAGE: 'Du kannst sagen, „Wie ist der UV Index“, oder du kannst „Beenden“ sagen... Wie kann ich dir helfen?',
        ERROR_MESSAGE: 'Das habe ich leider nicht verstanden. Bitte versuche es noch einmal.',
        STOP_MESSAGE: 'Bis zum nächsten mal!',
        MENSA_NOT_SET: 'Du hast noch nicht deine Mensa ausgewählt. Du kannst deine Mensa auswählen indem du sagst: Meine Mensa liegt in <break time="100ms"/> und dann deine Stadt nennst. <break time="300ms"/> Wo liegt deine Mensa?',
        TODAY_MEAL: 'Heute gibt es: ',
        DAY_MEAL_1: 'Am ',
        DAY_MEAL_2: ' gibt es: ',
        CONFIRMATION_1: 'Der Name deiner Mensa ist also: ',
        CONFIRMATION_2: '. Ist das richtig?',
        MENSA_SAVE_SUCCESS: 'Deine Mensa wurde gespeichert. Du kannst jetzt nach deinem aktuellen Speiseplan fragen.',
        MENSA_DECLINED: 'Mensa nicht gespeichert.',
        NO_MENSA_FOUND1: '',
        NO_MENSA_FOUND2: '',
        NO_MEALS_ON_DATE: 'Leider liegen mir für diesen Tag keine Angebote vor.',
        ERROR_HARD: 'Es ist ein Fehler aufgetreten.'
    },
};

const dedeData = {
    translation: {
        SKILL_NAME: 'UV-Index auf Deutsch',
    },
};

const languageStrings = {
    'de': deData,
    'de-DE': dedeData
};

exports.handler = skillBuilder
    .addRequestHandlers(
        LaunchRequestHandler,
        GetCityIntentHandler,
        GetMensaIntentHandler,
        GetMenuIntentHandler,
        YesIntentHandler,
        NoIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler
    )
    .addRequestInterceptors(LocalizationInterceptor)
    .addErrorHandlers(ErrorHandler)
    .withApiClient(new Alexa.DefaultApiClient())
    .withPersistenceAdapter(new DynamoDbPersistenceAdapter({
        tableName: 'MyMensaDB',
        partitionKeyName: 'userId',
        createTable: true
    }))
    .lambda();

function getMensaMeals(id, date, requestAttributes) {
    return new Promise((resolve, reject) => {
        axios.get(`https://openmensa.org/api/v2/canteens/${id}/days/${date}/meals`).then((response) => {
            let mealNames = response.data.map(function (item) {
                return item['name'];
            });
            //TODO better solution
            for (let i = 0; i < mealNames.length; i++) {
                let mealName = mealNames[i];
                mealName = mealName.replace(/\,/g, "");
                
                if (i == 0) {
                    mealsString = mealName;
                } else {
                    mealsString = mealsString + ", " + mealName;
                }
                if (i + 1 == mealNames.length) {
                    mealsString = mealsString + ".";
                }
            }
            resolve(mealsString);
        }).catch((error) => {
            console.log("ERROR in getMensaMeals: ", error);
            console.log("ID: " + id + " date: " + date);
            if (error.response.status == "404") {
                reject(requestAttributes.t('NO_MEALS_ON_DATE'));
            } else {
                reject(requestAttributes.t('ERROR_HARD'));
            }
        });
    })
}

async function mensaInCity(city) {
    try {
        let stillResults = true;
        let counter = 1;
        let allResults = [];
        while (stillResults) {
            let response = await axios.get(`http://openmensa.org/api/v2/canteens?page=${counter}`);
            counter++;
            allResults = allResults.concat(response.data)
            if (response.data.length == 0) {
                stillResults = false;
            }
        }
        allResults = allResults.filter((mensa) => {
            city = city.toLowerCase();
            return (mensa.name.toLowerCase().includes(city) || mensa.address.toLowerCase().includes(city) || mensa.city.toLowerCase().includes(city));
        });
        return (allResults);
    } catch (error) {
        console.error(error);
        return Promise.reject(new Error("Es ist ein Fehler aufgetreten."));
    }
}

async function getMensaID(mensaName) {
    try {
        let stillResults = true;
        let counter = 1;
        let allResults = [];
        while (stillResults) {
            let response = await axios.get(`http://openmensa.org/api/v2/canteens?page=${counter}`);
            counter++;
            allResults = allResults.concat(response.data)
            if (response.data.length == 0) {
                stillResults = false;
            }
        }

        var mensaNames = allResults.map(function (item) {
            return item['name'];
        });

        let matches = stringSimilarity.findBestMatch(mensaName, mensaNames);
        console.log();
        for (let i = 0; i < allResults.length; i++) {
            if (allResults[i].name == matches.bestMatch.target) {
                return allResults[i];
            }
        }
    } catch (error) {
        console.error(error);
        if (error.response.status == "404") {
            return ("Leider liegen mir für diesen Tag keine Angebote vor."); //TODO
        } else {
            return ("Es ist ein Fehler aufgetreten."); //TODO
        }
    }
}

function weekday(date) {
    var weekday = new Date(date).getDay();

    if (weekday == 0) return ("Sonntag");
    if (weekday == 1) return ("Montag");
    if (weekday == 2) return ("Dienstag");
    if (weekday == 3) return ("Mittwoch");
    if (weekday == 4) return ("Donnerstag");
    if (weekday == 5) return ("Freitag");
    if (weekday == 6) return ("Samstag");
}

function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}