/*******************************************************************************
 * ---------------------------
 * Script "Einbindung Fremd-Temperatur-Sensoren in Homematic mittels Offset-Setzen"
 * ---------------------------
 * Version: 0.1
 * Source: https://github.com/Mic-M/iobroker.homematic-3rd-party-temp-sensors
 ******************************************************************************/

/*******************************************************************************
 * Konfiguration
 ******************************************************************************/

// Hier für jeden Raum den externen Temperatursensor eintragen, sowie ein oder mehrere Homematic-Thermostate
// 0. Raumname: kann beliebig benannt werden und dient nur zur Log-Ausgabe.
// 1. Datenpunkt Externer Sensor: Hier entsprechend den Datenpunkt eintragen, in dem die Temperatur steht (Xiaomi, etc.).
// 2. Min-Temp: Minimum-Soll-Temperatur (Set Temperature) am Homematic-Thermostat, erst dann löst das Script die 
//              Änderung aus. Das vermeidet unnötiges setzen des Offset, wenn z.B. Thermostat auf 12°C eingestellt, 
//              während Raumtemperatur bei 22°C ist.
// 3. State 1. HomeMatic-Thermostat: Hier den State des ersten Homematic-Thermostates des Raumes eingeben, unter dem
//                                   die Datenpunkte '.ACTUAL_TEMPERATURE' etc. liegen, z.B. hm-rpc.0.ABCDEFGHJ.4.
// 4., 5., usw.: Hier können weitere HomeMatic-Thermostate des Raumes hinzugefügt werden (wie unter 3.).
//               Dies kann beliebig erweitert werden, also auch 10 oder mehr Thermostate pro Raum möglich.
const roomsHardware = [];
//                   [0] Raumname          [1] Datenpunkt zu externen Temperatursensor               [2] Min-Temp   [3] State 1. HM-Thermostat   [4] State 2. HM-Thermostat   [5] State 3. HM-Thermostat   [6] State 4. HM-Thermostat
roomsHardware[0] = ['Badezimmer',       'mihome.0.devices.weather_v1_xxxxxxxxxxxxxx.temperature',  '20',          'hm-rpc.0.XXXXXXXXXX.4',     '',                          '',                          ''];
roomsHardware[1] = ['Wohnzimmer',       'mihome.0.devices.weather_v1_xxxxxxxxxxxxxx.temperature',  '21',          'hm-rpc.0.XXXXXXXXXX.4',     'hm-rpc.0.XXXXXXXXXX.4',     '',                          ''];
roomsHardware[2] = ['Schlafzimmer',     'mihome.0.devices.weather_v1_xxxxxxxxxxxxxx.temperature',  '17',          'hm-rpc.0.XXXXXXXXXX.4',     '',                          '',                          ''];

// Datenpunkt von HomeMatic für die aktuell am Thermostat gemessene Temperatur
const HM_STATE_ACTUAL = '.ACTUAL_TEMPERATURE';

// Datenpunkt von HomeMatic für die am Thermostat eingestellte Soll-Temperatur
// const HM_STATE_SET = '.SET_POINT_TEMPERATURE' --> nehmen bei Homematic IP Thermostaten. Bitte am besten prüfen, welcher bei Euch vorhanden ist ('.SET_TEMPERATURE' oder '.SET_POINT_TEMPERATURE')
const HM_STATE_SET = '.SET_TEMPERATURE';


// Script wie oft ausführen? 
const SCHEDULE = '*/30 * * * *' // Alle 30 Minuten

// Logeinträge auf Debug setzen?
const DEBUG = true;


/*******************************************************************************
 * Ab hier nichts mehr ändern / Stop editing here!
 ******************************************************************************/



/*******************************************************************************
 * Initiale Function
 *******************************************************************************/
init();
function init() {
    main();
}

/*******************************************************************************
 * Haupt-Skript
 *******************************************************************************/
var mSchedule;
function main() {

    // Schedule beenden falls aktiv, dann starten.
    clearSchedule(mSchedule);
    mSchedule = schedule(SCHEDULE, updateThermostats);
    
    // Einmalig bei Script-Start ausführen. Danach greift der Schedule.
    updateThermostats();
}

function updateThermostats() {

    for (let i = 0; i < roomsHardware.length; i++) {
        // Get all thermostats of the room into an array. 
        var thermostatsArray = getRoomThermostats(roomsHardware[i]);
        var lRoom = roomsHardware[i][0];
        log('=== Processing room ' + lRoom);
        // Loop through each thermostat of the current room
        for (let loopElement of thermostatsArray) {
            var loopHmSetTemp = getState(loopElement + HM_STATE_SET).val;
            var loopHmActualTemp = getState(loopElement + HM_STATE_ACTUAL).val;
            var loopExtTemp = getState(roomsHardware[i][1]).val;
            var loopOffset = (loopHmActualTemp - loopExtTemp);
            var tempArr = loopElement.split(".");
            var loopHmState = tempArr[0] + '.' + tempArr[1]; // Wir brauchen nur den Anfang des States, also von 'hm-rpc.0.ABCDEFGHJ.4' den Teil "hm-rpc.0"
            var loopHmID = tempArr[2]; // Wir brauchen nur die ID, also von 'hm-rpc.0.ABCDEFGHJ.4' den Teil "ABCDEFGHJ"
            loopOffset = Math.round(loopOffset * 100) / 100; // Runden auf 2 Nachkommastellen

            // Nur berücksichten, falls derzeit gesetzte Temperatur nicht kleiner als definierte Minimum-Soll-Temperatur ist.
            // Das vermeidet unnötiges setzen des Offset, wenn z.B. Thermostat auf 12°C eingestellt, während Raumtemperatur bei 22°C ist.
            if (loopElement < roomsHardware[i][2]) {
                // Unterhalb der Minimum-Soll-Temperatur, also machen wir nichts.
                if(DEBUG) log(lRoom + ": Skip - Thermostat's set temperature (" + loopHmSetTemp + ") is below defined script min temp (" + roomsHardware[i][2] + ")")
            } else {
                // Gleich oder überhalb der Minimum-Soll-Temperatur, also machen wir weiter.
                if(DEBUG) log(lRoom + ': Temp Homematic: ' + loopHmActualTemp + ', Temp Externer Sensor: ' + loopExtTemp);
                if(DEBUG) log(lRoom + ': Offset: ' + loopOffset + '°C, (gerundet: ' + (Math.round(loopOffset * 2) / 2) + '°C) entspricht Homematic Wert von ' + convertTemperatureToHMvalue(loopOffset));
                // Nun setzen wir das neue HomeMatic Offset
                var offSetHomeMaticValue = convertTemperatureToHMvalue(loopOffset)
                var result = setHomematicOffset(loopHmState, loopHmID, offSetHomeMaticValue);
                if (isEmpty(result)) {
                    log(lRoom + ': Neues Offset von ' + convertHMvalueToTemperature(offSetHomeMaticValue) + '°C erfolgreich gesetzt.');
                } else {
                    log(lRoom + ': Fehler beim Offset-setzen aufgetreten: ' + result, 'warn');
                }
            }
        }
    }
}



/**
 * Setzt für das gegebene Homematic-Thermostat ein neues Offset
 * @param {string} strState     z.B. 'hm-rpc.0' oder 'hm-rpc.1'
 * @param {string} strID        z.B. 'QEW4433558'
 * @param {number} offsetVal    der Homematic Offset-Wert, siehe function convertTemperatureToHMvalue()
 * @return String with error message, or empty string if no error occurred.
 */
function setHomematicOffset(strState, strID, offsetVal) {
    sendTo(strState, 'putParamset', {ID: strID, paramType: 'MASTER', params: {'TEMPERATURE_OFFSET': offsetVal}}, res => {
        var errorResult = res['error'];
        if (isEmpty(errorResult)) {
            return '';
        } else {
            return errorResult;
        }
    });
}


/*
// *READ* the Offset from Homematic
sendTo('hm-rpc.0', 'getParamset', {ID: 'XXXXXXXXXX', paramType: 'MASTER'}, res => {
    //log(JSON.stringify(res));
    log(res["result"]['TEMPERATURE_OFFSET']);
});
*/

 /**
 * Converts an actual temperature number into Homematic value.
 * @param {number}   tempInput   Temperature to convert
 * @return {number}  HomeMatic value. Example: +2.5 will result in 12
 */
function convertTemperatureToHMvalue(tempInput) {
    
    // Make sure we get a rounded number with base of ".5". 1.4 will result in 1.5, 8.6 in 9, etc. 
    var tempInp = Math.round(tempInput * 2) / 2;
    
    // Homematic does not accept temparatures lower than -3.5 or higher than 3.5
    if (tempInp > 3.5) tempInp = 3.5;
    if (tempInp < -3.5) tempInp = -3.5;
    
    // Now we calculate the Homematic value, the rule is as follows:
    // -3,5° | -3,0° | -2,5° | -2,0° | -1,5° | -1,0° | -0,5° | 0,0° | +0,5° | +1,0° | +1,5° | +2,0° | +2,5° | +3,0° | +3,5°
    //   0       1       2       3       4        5       6     7       8       9      10       11      12     13      14
    return (tempInp * 2) + 7;

}

/**
 * Converts a Homematic value to actual temperature
 * @param {number}   valueInput   Value to convert
 * @return {number}  Temperature  Example: 12 will result in +2.5
 */
function convertHMvalueToTemperature(valueInput) {

    // Round, just in case
    var valInp = Math.round(valueInput);

    // Homematic does not accept values lower than 0 or higher than 14
    if (valInp > 14) valInp = 14;
    if (valInp < 0) valInp = 0;
    
    // Now we calculate the Homematic value, the rule is as follows:
    // -3,5° | -3,0° | -2,5° | -2,0° | -1,5° | -1,0° | -0,5° | 0,0° | +0,5° | +1,0° | +1,5° | +2,0° | +2,5° | +3,0° | +3,5°
    //   0       1       2       3       4        5       6     7       8       9      10       11      12     13      14
    return (valInp - 7) / 2;
}


/**
 * Get all thermostats of the room into a new array. 
 * Will also remove all falsy values: undefined, null, 0, false, NaN and "" (empty string)
 */
function getRoomThermostats(inputArray) {
  var newArray = [];
  for (var i = 3; i < inputArray.length; i++) {
    if (inputArray[i]) {
      newArray.push(inputArray[i]);
    }
  }
  return newArray;
}

/**
 * Checks if Array or String is not undefined, null or empty.
 * @param inputVar - Input Array or String, Number, etc.
 * @return true if it is undefined/null/empty, false if it contains value(s)
 * Array or String containing just whitespaces or >'< or >"< is considered empty
 */
function isEmpty(inputVar) {
    if (typeof inputVar !== 'undefined' && inputVar !== null) {
        var strTemp = JSON.stringify(inputVar);
        strTemp = strTemp.replace(/\s+/g, ''); // remove all whitespaces
        strTemp = strTemp.replace(/\"+/g, "");  // remove all >"<
        strTemp = strTemp.replace(/\'+/g, "");  // remove all >'<  
        if (strTemp !== '') {
            return false;            
        } else {
            return true;
        }
    } else {
        return true;
    }
}
