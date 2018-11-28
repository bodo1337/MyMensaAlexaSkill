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
        logEvent(handlerInput);
        const {
            requestEnvelope,
            responseBuilder
        } = handlerInput;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        let citySlot = requestEnvelope.request.intent.slots.city.value;

        let response = "e";
        if (citySlot[citySlot.length - 1] == '.' || citySlot[citySlot.length - 1] == '!' || citySlot[citySlot.length - 1] == '?') {
            citySlot = citySlot.slice(0, -1);
        }
        
        await mensaInCity(citySlot, requestAttributes).then((res) => {
            if (res.length == 0) {
                response = requestAttributes.t('NO_MENSA_FOUND_1') + citySlot + requestAttributes.t('NO_MENSA_FOUND_2');
            } else {
                let allMensas = res.map(function (item) {
                    return item.name;
                }).join(', ');

                if (res.length > 5) {
                    response = requestAttributes.t('MENSA_L_1') + res.length + requestAttributes.t('MENSA_L_2');
                } else {
                    response = requestAttributes.t('MENSA_S_1') + allMensas + requestAttributes.t('MENSA_S_2');
                }
                return responseBuilder
                        .speak(response)
                        .withSimpleCard(requestAttributes.t('MENSA_IN') + capitalize(citySlot), requestAttributes.t('MENSA_TUT') + '\n\n' + allMensas.replace(/\,/g,"\n"))
                        .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
                        .getResponse();
            }
        }).catch((err) => {
            logEvent(handlerInput);
            response = err;
        });
        
        return responseBuilder
            .speak(response)
            .reprompt(response)
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
        await getMensaID(mensaNameSlot).then((res) => {
            handlerInput.attributesManager.setSessionAttributes({
                'mensaID': res.id
            });
            response = requestAttributes.t('CONFIRMATION_1') + res.name + requestAttributes.t('CONFIRMATION_2');
        }).catch((err) => {
            logEvent(handlerInput);
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
            await getMensaMeals(attributes.mensaID, dateSlot, requestAttributes).then((res) => {
                if (today == dateSlot) {
                    response = requestAttributes.t('TODAY_MEAL') + res;
                } else {
                    response = requestAttributes.t('DAY_MEAL_1') + weekday(dateSlot, requestAttributes) + requestAttributes.t('DAY_MEAL_2') + res;
                }
            }).catch((err) => {
                logEvent(handlerInput);
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
        console.log(`Handler Input: ` + JSON.stringify(handlerInput));

        return handlerInput.responseBuilder.getResponse();
    },
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        console.log(`Error handled in ErrorHandler: ${error}`);

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
            return value;
        };
        const attributes = handlerInput.attributesManager.getRequestAttributes();
        attributes.t = function translate(...args) {
            return localizationClient.localize(...args);
        };
    },
};

function getMensaMeals(id, date, requestAttributes) {
    return new Promise((resolve, reject) => {
        axios.get(`https://openmensa.org/api/v2/canteens/${id}/days/${date}/meals`).then((response) => {
            let mealNameList = response.data.map(function (item) {
                return item['name'].replace(/\,/g, '').replace('!', '');
            });
            let mealsString = mealNameList.join(', ') + ".";
            resolve(mealsString);
        }).catch((error) => {
            console.log("ERROR in getMensaMeals(): ", error);
            console.log("ID: " + id + " date: " + date);
            if (error.response.status == "404") {
                reject(requestAttributes.t('NO_MEALS_ON_DATE'));
            } else {
                reject(requestAttributes.t('ERROR_HARD'));
            }
        });
    })
}

async function mensaInCity(city, requestAttributes) {
    return new Promise(async (resolve, reject) => {
        let counter = 1;
        let allResults = [];
        let stillResults = true;
        while (stillResults) {
            console.log(1);
            await axios.get(`http://openmensa.org/api/v2/canteens?page=${counter++}`).then((response) => {
                allResults = allResults.concat(response.data);
                if (response.data.length == 0) {
                    allResults = allResults.filter((mensa) => {//TODO stringsimilarity
                        city = city.toLowerCase();
                        return (mensa.name.toLowerCase().includes(city) || mensa.address.toLowerCase().includes(city) || mensa.city.toLowerCase().includes(city));
                    });
                    stillResults = false;
                }
            }).catch((error) => {
                console.log(4);
                console.error("error in mensainCity(): " + error);
                console.log("City: " + city);
                reject(requestAttributes.t('ERROR_HARD'));
            });
        }
        resolve(allResults);
    });
}

function getMensaID(mensaName, requestAttributes) {
    return new Promise(async (resolve, reject) => {
        let counter = 1;
        let allResults = [];
        let stillResults = true
        while (stillResults) {
            await axios.get(`http://openmensa.org/api/v2/canteens?page=${counter++}`).then((response) => {
                allResults = allResults.concat(response.data)
                if (response.data.length == 0) stillResults = false;
            }).catch((error) => {
                console.error("Error in getMensaID()" + error);
                reject(requestAttributes.t('ERROR_HARD'));
            });
        }
        let mensaNames = allResults.map(function (item) {
            return item['name'];
        });

        let matches = stringSimilarity.findBestMatch(mensaName, mensaNames);
        for (let i = 0; i < allResults.length; i++) {
            if (allResults[i].name == matches.bestMatch.target) {
                resolve(allResults[i]);
            }
        }
});
}

function weekday(date, requestAttributes) {
    return requestAttributes.t('WEEKDAYS')[new Date(date).getDay()]
}

function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}

function logEvent(handlerInput){
    console.log('Handler Input: ' + JSON.stringify(handlerInput));
}

const deData = {
    translation: {
        LAUNCH: 'Willkommen bei MyMensa. Hier bekommst du den aktuellen Speiseplan für deine Mensa.',
        DEFAULT_REPROMPT: 'Wie kann ich dir helfen?',
        HELP_MESSAGE: 'Bei mir bekommst du deinen Speiseplan deiner Mensa. Wenn du noch nicht deine Mensa ausgewählt hast geht das indem du folgendes sagst: Meine Mensa liegt in <break time="100ms"/> und dann deine Stadt nennst. Daraufhin bekommst eine Liste mit den dir verfügbaren Mensen. Deine Mensa kannst du festlegen indem du folgendes sagst: meine Mensa heißt <break time="100ms"/> und dann deine Mensa nennst. Wenn du deine Mensa ausgewählt hast kannst du mich fragen was es heute oder an einem anderen Tag zu essen gibt.',
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
        NO_MENSA_FOUND_1: 'Ich habe leider keine Mensa in ',
        NO_MENSA_FOUND2_: ' gefunden.',
        MENSA_S_1: 'Ich konnte folgende Mensen finden: ',
        MENSA_S_2: '. Sag meine Mensa heißt <break time="100ms"/> und dann deine Mensa um sie festzulegen. <break time="300ms"/> Wie heißt deine Mensa?',
        MENSA_L_1: 'Ich habe ',
        MENSA_L_2: ' Mensen für deine Stadt gefunden. Ich habe Sie an deine Alexa App gesendet. Du kannst deine Mensa festlegen indem du sagst: Alexa, sag My Mensa meine Mensa heißt <break time="100ms"/> und dann deine Mensa nennst.',
        MENSA_IN: 'Mensen in ',
        MENSA_TUT: 'Du kannst deine Mensa festlegen indem du sagst: "Alexa, sag My Mensa meine Mensa heißt (Dein Mensa Name)"',
        WEEKDAYS: [
            'Sonntag',
            'Montag',
            'Dienstag',
            "Mittwoch",
            'Donnerstag',
            'Freitag',
            'Samstag'
        ]
    },
};

const dedeData = {
    translation: {
        SKILL_NAME: 'My Mensa auf Deutsch',
    },
};

const languageStrings = {
    'de': deData,
    'de-DE': dedeData
};

const skillBuilder = Alexa.SkillBuilders.custom();

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
        partitionKeyName: 'userId'
    }))
    .lambda();