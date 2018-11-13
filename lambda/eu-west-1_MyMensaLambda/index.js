let speechOutput;
let reprompt = 'Wie kann ich dir helfen?';
let welcomeOutput = "Willkommen bei MyMensa. Hier bekommst du den aktuellen Speiseplan für deine Mensa. Was kann ich für dich tun?";
let welcomeReprompt = "Wie kann ich dir helfen?";
let mensaID;
"use strict";
const Alexa = require('alexa-sdk');
const axios = require('axios');
const stringSimilarity = require('string-similarity');
const APP_ID = "amzn1.ask.skill.0aa6211e-3132-4ddf-b411-663202ccb75f";
speechOutput = '';
const handlers = {
	'LaunchRequest': function () {
		this.emit(':ask', welcomeOutput, welcomeReprompt);
	},
	'AMAZON.HelpIntent': function () {
		speechOutput = 'Bei mir bekommst du deinen Speiseplan deiner Mensa. Wenn du noch nicht deine Mensa ausgewählt hast geht das indem du folgendes sagst: Meine Mensa liegt in <break time="100ms"/> und dann deine Stadt nennst. Daraufhin bekommst eine Liste mit den dir verfügbaren Mensen. Deine Mensa kannst du festlegen indem du folgendes sagst: meine Mensa heißt <break time="100ms"/> und dann deine Mensa nennst. Wenn du deine Mensa ausgewählt hast kannst du mich fragen was es heute oder an einem anderen Tag zu essen gibt.';
		this.emit(':ask', speechOutput + " " + reprompt, reprompt);
	},
   'AMAZON.CancelIntent': function () {
		this.emit('SessionEndedRequest');
	},
   'AMAZON.StopIntent': function () {
		this.emit('SessionEndedRequest');
   },
	'AMAZON.NavigateHomeIntent': function () {
		this.emit('SessionEndedRequest');
    },
  'SessionEndedRequest': function () {
		speechOutput = 'Bis zum nächsten mal.';
		this.emit(':tell', speechOutput);
   },
	'GetMenuIntent': function () {
		let dateSlot = resolveCanonical(this.event.request.intent.slots.date);
		
		let today = new Date().toLocaleDateString(undefined, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })

		if(!dateSlot){
	    dateSlot = today;
		}
		if(this.attributes["mensaID"] && this.attributes["mensaID"] > 0){
		    getMensaMeals(this.attributes["mensaID"] , dateSlot).then((res) => {
		      if(today == dateSlot){
		        this.emit(":tellWithCard", "Heute gibt es: " + res, "Speiseplan heute", res.replace(/\,/g,"\n"));
		      }else{
		        this.emit(":tellWithCard", "Am " + weekday(dateSlot) +" gibt es: " + res, "Speiseplan" + weekday(dateSlot), res.replace(/\,/g,"\n"));
		      }
        }).catch((err) =>{
          this.emit(":tell", err);
        });
		}else {
        this.emit(":ask", "Du hast noch nicht deine Mensa ausgewählt. Du kannst deine Mensa auswählen indem du sagst: Meine Mensa liegt in <break time='100ms'/> und dann deine Stadt nennst. <break time='300ms'/> Wo liegt deine Mensa?", reprompt);
		}
    },
    'GetCityIntent': function () {
        let filledSlots = delegateSlotCollection.call(this);
      	let citySlot = resolveCanonical(this.event.request.intent.slots.city);
      	if(citySlot[citySlot.length - 1] == '.' || citySlot[citySlot.length - 1] == '!' || citySlot[citySlot.length - 1] == '?'){
      	  citySlot = citySlot.slice(0, -1);
      	}
      	mensaInCity(citySlot).then((res) => {
    	    if(res.length == 0){
  	        this.emit(":tell", `Ich habe leider keine Mensa in ${citySlot} gefunden.`);
    	    } else {
  	        let allMensas = "";
  	        for(let i = 0; i < res.length; i++){
  	          if(i == res.length -1){
  	            allMensas = allMensas + res[i].name.replace(/\,/g,"");
  	          }else{
  	            allMensas = allMensas + res[i].name.replace(/\,/g,"") + ", ";
  	          }
  	        }
  	        if(res.length > 5){
  	          this.emit(":tellWithCard", "Ich habe " + res.length + " Mensen für deine Stadt gefunden. Ich habe Sie an deine Alexa App gesendet. Du kannst deine Mensa festlegen indem du sagst: Alexa, sage My Mensa meine Mensa heißt <break time='100ms'/> und dann deine Mensa nennst", "Mensen in " + capitalize(citySlot), "Du kannst deine Mensa festlegen indem du sagst: 'Alexa, sage My Mensa meine Mensa heißt (Dein Mensa Name)' \n \n" + allMensas.replace(/\,/g,"\n"));
  	        }else{
  	          this.emit(":askWithCard", "Ich konnte folgende Mensen finden: " + allMensas + ". Sag meine Mensa heißt <break time='100ms'/> und dann deine Mensa um sie festzulegen. <break time='300ms'/> Wie heißt deine Mensa?", "Wie heißt deine Mensa?", "Mensen in " + capitalize(citySlot), "Du kannst deine Mensa festlegen indem du sagst: 'Alexa, sage My Mensa meine Mensa heißt (Dein Mensa Name)'" + allMensas.replace(/\,/g,"\n")); 
  	        }
    	    }
      	}).catch((err) => {
      	  this.emit(":tell", err, "Es ist ein Fehler aufgetreten!");
      	});
    },
	'GetMensaIntent': function () {
		speechOutput = '';
		let mensaNameSlot = resolveCanonical(this.event.request.intent.slots.mensaName);

		getMensaID(mensaNameSlot).then((res) => {
		  speechOutput = "Der Name deiner Mensa ist also: " + res.name + ". Ist das richtig?";
		  mensaID = res.id;
	  	this.emit(":ask", speechOutput, speechOutput);
		}).catch((err) => {
		  this.emit(":tell", err);
		});

    },
	'AMAZON.YesIntent': function () {
		speechOutput = '';
    if(mensaID){
      this.attributes["mensaID"] = mensaID;
		  this.emit(':saveState', true);
		  mensaID = undefined;
		  speechOutput = "Deine Mensa wurde gespeichert.";
		  this.emit(":ask", speechOutput, "Wie kann ich dir helfen?");
    }else{
      this.emit('AMAZON.HelpIntent');
    }
  },
	'AMAZON.NoIntent': function () {
		speechOutput = '';
    if(mensaID){
      speechOutput = "Mensa nicht gespeichert.";
		  this.emit(":ask", speechOutput, "Wie kann ich dir helfen?");
		  mensaID = undefined;
    }else{
      this.emit('AMAZON.HelpIntent');
    }
    },
	'Unhandled': function () {
        speechOutput = "The skill didn't quite understand what you wanted.  Do you want to try something else?";
        this.emit(':ask', speechOutput, speechOutput);
    }
};

exports.handler = (event, context) => {
    const alexa = Alexa.handler(event, context);
    alexa.appId = APP_ID;
    // To enable string internationalization (i18n) features, set a resources object.
    //alexa.resources = languageStrings;
    alexa.registerHandlers(handlers);
	  alexa.dynamoDBTableName = 'MyMensaDB';
    alexa.execute();
};

//    END of Intent Handlers {} ========================================================================================
// 3. Helper Function  =================================================================================================

function resolveCanonical(slot){
	//this function looks at the entity resolution part of request and returns the slot value if a synonyms is provided
	let canonical;
    try{
		canonical = slot.resolutions.resolutionsPerAuthority[0].values[0].value.name;
	}catch(err){
	    console.log(err.message);
	    canonical = slot.value;
	};
	return canonical;
};

function delegateSlotCollection(){
  console.log("in delegateSlotCollection");
  console.log("current dialogState: "+this.event.request.dialogState);
    if (this.event.request.dialogState === "STARTED") {
      console.log("in Beginning");
	  let updatedIntent= null;
	  // updatedIntent=this.event.request.intent;
      //optionally pre-fill slots: update the intent object with slot values for which
      //you have defaults, then return Dialog.Delegate with this updated intent
      // in the updatedIntent property
      //this.emit(":delegate", updatedIntent); //uncomment this is using ASK SDK 1.0.9 or newer

	  //this code is necessary if using ASK SDK versions prior to 1.0.9
	  if(this.isOverridden()) {
			return;
		}
		this.handler.response = buildSpeechletResponse({
			sessionAttributes: this.attributes,
			directives: getDialogDirectives('Dialog.Delegate', updatedIntent, null),
			shouldEndSession: false
		});
		this.emit(':responseReady', updatedIntent);

    } else if (this.event.request.dialogState !== "COMPLETED") {
      console.log("in not completed");
      // return a Dialog.Delegate directive with no updatedIntent property.
      //this.emit(":delegate"); //uncomment this is using ASK SDK 1.0.9 or newer

	  //this code necessary is using ASK SDK versions prior to 1.0.9
		if(this.isOverridden()) {
			return;
		}
		this.handler.response = buildSpeechletResponse({
			sessionAttributes: this.attributes,
			directives: getDialogDirectives('Dialog.Delegate', null, null),
			shouldEndSession: false
		});
		this.emit(':responseReady');

    } else {
      console.log("in completed");
      console.log("returning: "+ JSON.stringify(this.event.request.intent));
      // Dialog is now complete and all required slots should be filled,
      // so call your normal intent handler.
      return this.event.request.intent;
    }
}


function randomPhrase(array) {
    // the argument is an array [] of words or phrases
    let i = 0;
    i = Math.floor(Math.random() * array.length);
    return(array[i]);
}
function isSlotValid(request, slotName){
        let slot = request.intent.slots[slotName];
        //console.log("request = "+JSON.stringify(request)); //uncomment if you want to see the request
        let slotValue;

        //if we have a slot, get the text and store it into speechOutput
        if (slot && slot.value) {
            //we have a value in the slot
            slotValue = slot.value.toLowerCase();
            return slotValue;
        } else {
            //we didn't get a value in the slot.
            return false;
        }
}

//These functions are here to allow dialog directives to work with SDK versions prior to 1.0.9
//will be removed once Lambda templates are updated with the latest SDK

function createSpeechObject(optionsParam) {
    if (optionsParam && optionsParam.type === 'SSML') {
        return {
            type: optionsParam.type,
            ssml: optionsParam['speech']
        };
    } else {
        return {
            type: optionsParam.type || 'PlainText',
            text: optionsParam['speech'] || optionsParam
        };
    }
}

function buildSpeechletResponse(options) {
    let alexaResponse = {
        shouldEndSession: options.shouldEndSession
    };

    if (options.output) {
        alexaResponse.outputSpeech = createSpeechObject(options.output);
    }

    if (options.reprompt) {
        alexaResponse.reprompt = {
            outputSpeech: createSpeechObject(options.reprompt)
        };
    }

    if (options.directives) {
        alexaResponse.directives = options.directives;
    }

    if (options.cardTitle && options.cardContent) {
        alexaResponse.card = {
            type: 'Simple',
            title: options.cardTitle,
            content: options.cardContent
        };

        if(options.cardImage && (options.cardImage.smallImageUrl || options.cardImage.largeImageUrl)) {
            alexaResponse.card.type = 'Standard';
            alexaResponse.card['image'] = {};

            delete alexaResponse.card.content;
            alexaResponse.card.text = options.cardContent;

            if(options.cardImage.smallImageUrl) {
                alexaResponse.card.image['smallImageUrl'] = options.cardImage.smallImageUrl;
            }

            if(options.cardImage.largeImageUrl) {
                alexaResponse.card.image['largeImageUrl'] = options.cardImage.largeImageUrl;
            }
        }
    } else if (options.cardType === 'LinkAccount') {
        alexaResponse.card = {
            type: 'LinkAccount'
        };
    } else if (options.cardType === 'AskForPermissionsConsent') {
        alexaResponse.card = {
            type: 'AskForPermissionsConsent',
            permissions: options.permissions
        };
    }

    let returnResult = {
        version: '1.0',
        response: alexaResponse
    };

    if (options.sessionAttributes) {
        returnResult.sessionAttributes = options.sessionAttributes;
    }
    return returnResult;
}

function getDialogDirectives(dialogType, updatedIntent, slotName) {
    let directive = {
        type: dialogType
    };

    if (dialogType === 'Dialog.ElicitSlot') {
        directive.slotToElicit = slotName;
    } else if (dialogType === 'Dialog.ConfirmSlot') {
        directive.slotToConfirm = slotName;
    }

    if (updatedIntent) {
        directive.updatedIntent = updatedIntent;
    }
    return [directive];
}

async function getMensaMeals(id, date) {
  try {
    const response = await axios.get(`https://openmensa.org/api/v2/canteens/${id}/days/${date}/meals`);
    let mealNames = response.data.map(function(item) {
      return item['name'];
    });
    let mealsString = "";
    for(let i = 0; i < mealNames.length; i++){
      let mealName = mealNames[i];
      mealName = mealName.replace(/\,/g,"");
      if(i == 0){
        mealsString =  mealName;
      }else {
        mealsString = mealsString + ", " + mealName;
      }
      if(i+1 == mealNames.length){
        mealsString = mealsString + ".";
      }
    }
    return(mealsString);
  } catch (error) {
    if(error.response.status == "404"){
      return Promise.reject(new Error("Leider liegen mir für diesen Tag keine Angebote vor."));
    } else {
      return Promise.reject(new Error("Es ist ein Fehler aufgetreten."));
    }
  }
}
async function mensaInCity(city) {
  try {
    let stillResults = true;
    let counter = 1;
    let allResults = [];
    while(stillResults){
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
    return(allResults);
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
    while(stillResults){
      let response = await axios.get(`http://openmensa.org/api/v2/canteens?page=${counter}`);
      counter++;
      allResults = allResults.concat(response.data)
      if (response.data.length == 0) {
        stillResults = false;
      }
    }

  var mensaNames = allResults.map(function(item) {
      return item['name'];
  });

  let matches = stringSimilarity.findBestMatch(mensaName, mensaNames);
  console.log();
  for(let i = 0; i < allResults.length; i++){
      if(allResults[i].name == matches.bestMatch.target){
          return allResults[i];
      }
  }
  } catch (error) {
    console.error(error);
    if(error.response.status == "404"){
      return("Leider liegen mir für diesen Tag keine Angebote vor.");//TODO
    } else {
      return("Es ist ein Fehler aufgetreten.");//TODO
    }
  }
}
function weekday(date){
  var weekday = new Date(date).getDay();  
  
  if (weekday==0) return("Sonntag");
  if (weekday==1) return("Montag");
  if (weekday==2) return("Dienstag");
  if (weekday==3) return("Mittwoch");
  if (weekday==4) return("Donnerstag");
  if (weekday==5) return("Freitag");
  if (weekday==6) return("Samstag");
}
function capitalize(s)
{
    return s[0].toUpperCase() + s.slice(1);
}