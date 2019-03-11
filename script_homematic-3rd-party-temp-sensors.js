/*******************************************************************************
 * ---------------------------
 * Script "Einbindung Fremd-Temperatur-Sensoren in Homematic mittels Offset-Setzen"
 * ----------------------------------------------------
 * WICHTIG: Dieses Script funktioniert nur mit HM IP Thermostaten!
 * Nicht-IP-Thermostate: müsste noch implementiert werden aus Script-Version 0.2 -- hier wird HM-intern anders kalkuliert
 * ----------------------------------------------------
 * ---------------------------
 * Version: 0.4
 * Source: https://github.com/Mic-M/iobroker.homematic-3rd-party-temp-sensors
 ******************************************************************************/
 
/*******************************************************************************
 * Konfiguration
 ******************************************************************************/

// Hier für jeden Raum den externen Temperatursensor eintragen, sowie ein oder mehrere Homematic-Thermostate
// 0. Name: kann beliebig benannt werden und dient nur zur Log-Ausgabe.
// 1. Datenpunkt Externer Sensor: Hier entsprechend den Datenpunkt eintragen, in dem die Temperatur steht (Xiaomi, etc.).
// 2. Min-Temp: Minimum-Soll-Temperatur (Set Temperature) am Homematic-Thermostat, erst dann löst das Script die 
//              Änderung aus. Das vermeidet unnötiges setzen des Offset, wenn z.B. Thermostat auf 12°C eingestellt, 
//              während Raumtemperatur bei 22°C ist.
// 3. Pfad HomeMatic-Thermostat: Hier den State des jeweiligen Homematic-Thermostates eingeben, unter dem
//                               die Datenpunkte '.ACTUAL_TEMPERATURE' etc. liegen, z.B. hm-rpc.0.XXXXXXXXXXXXXXX.1.
// 4. Datenpunkt von HomeMatic für die aktuell am Thermostat gemessene Temperatur, i.d.R. 'ACTUAL_TEMPERATURE'
// 5. Datenpunkt von HomeMatic für die am Thermostat eingestellte Soll-Temperatur, i.d.R. 'SET_POINT_TEMPERATURE'

var thermConf = [];
//             [0] Name (beliebig)   [1] Datenpunkt zu externen Temperatursensor (z.B. Xiaomi) [2] Min-Temp   [3] Pfad HM-Thermostat           [4] HM-Datenpunkt: Gemessene Temp   [5] HM-Datenpunkt: Gesetzte Temp   
thermConf[0] = ['Badezimmer',        'mihome.0.devices.weather_v1_xxxxxxxxxxxxxx.temperature', '20',          'hm-rpc.0.xxxxxxxxxxxxxx.1',     'ACTUAL_TEMPERATURE',               'SET_POINT_TEMPERATURE'];
thermConf[1] = ['Schlafzimmer',      'mihome.0.devices.weather_v1_xxxxxxxxxxxxxx.temperature', '17',          'hm-rpc.0.xxxxxxxxxxxxxx.1',     'ACTUAL_TEMPERATURE',               'SET_POINT_TEMPERATURE'];
thermConf[2] = ['Wohnzimmer-Gruppe', 'mihome.0.devices.weather_v1_xxxxxxxxxxxxxx.temperature', '21',          'hm-rpc.1.xxxxxxxxxx.1',         'ACTUAL_TEMPERATURE',               'SET_POINT_TEMPERATURE'];

// Script wie oft ausführen? 
//const SCHEDULE = '0 */3 * * *' // Alle 3 Stunden
const SCHEDULE = '*/30 * * * *' // Alle 30 Minuten

// Logeinträge: Infos zeigen (2 Zeilen pro Thermostat)
const INFO = true;

// Logeinträge auf Debug setzen (umfangreicherer Log)
const DEBUG = false;


// Maximal-Offset in °C: Falls der Unterschied der gemessenen Temperatur am Thermostat im Vergleich zum externen Thermostat
// größer als dieser Wert (in °C) ist, wird nichts gemacht. Dies ist ein zusätzlicher Sicherheitsschritt, denn Abweichungen
// z.B. > 6°C wären schon seltsam.
const MAX_DIFF = 6;

// Pfad für die Datenpunkte
const STATE_PATH = 'javascript.'+ instance + '.' + 'mic.Heizung.';


/*******************************************************************************
 * Ab hier nichts mehr ändern / Stop editing here!
 ******************************************************************************/

/*****************************************
 * Global Variables
 ****************************************/
var mSchedule;      // Schedule

/*******************************************************************************
 * Initiale Function
 *******************************************************************************/
init();
function init() {
    
    // 1. Create states
    createScriptStates();

    // 2. Get initially the offset temperatures
    setTimeout(getHomematicOffsets, 1500);

    // Call main function later
    setTimeout(main, 4000);

}

/*******************************************************************************
 * Haupt-Skript
 *******************************************************************************/
function main() {

    // Schedule beenden falls aktiv, dann starten.
    clearSchedule(mSchedule);
    setTimeout(function(){
        mSchedule = schedule(SCHEDULE, updateThermostats);
    }, 30000);
 
    // Einmalig bei Script-Start ausführen. Danach greift der Schedule.
    updateThermostats();
}

function updateThermostats() {

    for (let i = 0; i < thermConf.length; i++) {
        var loopName = thermConf[i][0];
        if(DEBUG) log('=== Processing [' + loopName + '] ===');
        var loopHmSetTemp = getState(thermConf[i][3] + '.' + thermConf[i][5]).val;
        var loopHmActualTemp = getState(thermConf[i][3] + '.' + thermConf[i][4]).val;
        var loopExtTemp = getState(thermConf[i][1]).val;
        var tempArr = thermConf[i][3].split("."); // Zum extrahieren der Teile aus 'hm-rpc.0.XXXXXXXXXXXX.1'
        var loopHmState = tempArr[0] + '.' + tempArr[1]; // Wir brauchen nur den Anfang des States, also von 'hm-rpc.0.XXXXXXXXXXXX.1' den Teil "hm-rpc.0"
        var loopHmID = tempArr[2]; // Wir brauchen nur die ID, also von 'hm-rpc.0.XXXXXXXXXXXX.1' den Teil "XXXXXXXXXXXX"
        var currentOffset = getState(STATE_PATH + thermConf[i][0] + '.' + 'offsetTemperature').val;
        if(DEBUG) log(loopName + ': Aktuell gesetztes Offset: ' + currentOffset + ' °C');
        var loopHmActualTempInclCurrOffset = (loopHmActualTemp - currentOffset);
        if(DEBUG) log(loopName + ' - Aktuell: ' + loopHmActualTemp + ' °C - Offset einbezogen: ' + loopHmActualTempInclCurrOffset + ' °C');
        var loopOffsetNew = (loopExtTemp - loopHmActualTempInclCurrOffset) // We need to include the currently set offset temperature into our calculation
        loopOffsetNew = Math.round(loopOffsetNew * 100) / 100; // Zunächst runden auf 2 Nachkommastellen
        var infoLog = '['+ loopName + '] HM-Temp.: ' + loopHmActualTemp + ' °C (- Offset ' + currentOffset + ' °C = ' + loopHmActualTempInclCurrOffset + ' °C), Xiaomi-Sensor: ' + loopExtTemp + ' °C => Offset neu: ' + loopOffsetNew + ' °C -> ' + convertTemperatureToHMvalue(loopOffsetNew) + ' °C';
        if (Math.abs(loopOffsetNew) > MAX_DIFF) {
            // Maximal-Offset in °C: Falls der Unterschied der gemessenen Temperatur am Thermostat im Vergleich zum externen Thermostat
            // größer als dieser Wert (in °C) ist, wird nichts gemacht. Dies ist ein zusätzlicher Sicherheitsschritt, denn Abweichungen
            // z.B. > 6°C wären schon seltsam.
            if(INFO) log(infoLog + '--> ' + 'Keine Anpassung, da das Offset mit ' + loopOffsetNew + ' °C größer als ' + MAX_DIFF + ' °C ist.');
        } else if (loopHmSetTemp < thermConf[i][2]) {
            // Derzeit gesetzte Temperatur ist kleiner als definierte Minimum-Soll-Temperatur, also machen wir nichts.
            // Das vermeidet unnötiges setzen des Offset, wenn z.B. Thermostat auf 12°C eingestellt, während Raumtemperatur bei 22°C ist.
            if(INFO) log(infoLog + '--> ' + 'Keine Anpassung, da die am Thermostat eingestellte Temp. (' + loopHmSetTemp + ' °C) unterhalb der definierten Mindest-Temp. (' + thermConf[i][2] + ' °C) ist.');
        } else if (currentOffset === convertTemperatureToHMvalue(loopOffsetNew)) {
            // Keine Änderung, da bisheriges Offset = neu kalkuliertes Offset
            if(INFO) log(infoLog + '--> ' + 'Keine Anpassung, da bisheriges Offset von ' + currentOffset + ' °C = neu kalkuliertes Offset ist.');
        } else {
            // Gleich oder überhalb der Minimum-Soll-Temperatur, also machen wir weiter.
            // Nun setzen wir das neue HomeMatic Offset
            var result = setHomematicOffset(loopHmState, loopHmID, convertTemperatureToHMvalue(loopOffsetNew));
            if (isEmpty(result)) {
                if(INFO) log(infoLog + '--> ' + 'Neues Offset von ' + convertTemperatureToHMvalue(loopOffsetNew) + '°C erfolgreich gesetzt.');
                setState(STATE_PATH + thermConf[i][0] + '.' + 'offsetTemperature', convertTemperatureToHMvalue(loopOffsetNew));
            } else {
                log(infoLog + '--> ' + 'Fehler beim Offset-setzen aufgetreten: ' + result, 'warn');
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
    sendTo(strState, 'putParamset', {ID: strID + ':1', paramType: 'MASTER', params: {'TEMPERATURE_OFFSET': offsetVal}}, res => {
        var errorResult = res['error'];
        if (isEmpty(errorResult)) {
            return '';
        } else {
            return errorResult;
        }
    });
}

/**
 * Liest für das gegebene Homematic-Thermostat den Offset-Wert in °C aus
 * und füllt die Datenpunkte
 */
function getHomematicOffsets() {
    for (let i = 0; i < thermConf.length; i++) {
        var tempArr = thermConf[i][3].split("."); // Zum extrahieren der Teile aus 'hm-rpc.0.XXXXXXXXXXXX.1'
        var loopHmState = tempArr[0] + '.' + tempArr[1]; // Wir brauchen nur den Anfang des States, also von 'hm-rpc.0.XXXXXXXXXXXX.1' den Teil "hm-rpc.0"
        var loopHmID = tempArr[2]; // Wir brauchen nur die ID, also von 'hm-rpc.0.XXXXXXXXXXXX.1' den Teil "XXXXXXXXXXXX"
        sendTo(loopHmState, 'getParamset', {ID: loopHmID + ':1', paramType: 'MASTER'}, res => {
            var errorResult = res['error'];
            if (isEmpty(errorResult)) {
                var offset = res["result"]['TEMPERATURE_OFFSET'];
                if(DEBUG) log(thermConf[i][0] + ': Ausgelesene Offset-Temperatur = ' + offset + ' °C');
                setState(STATE_PATH + thermConf[i][0] + '.' + 'offsetTemperature', offset);
            } else {
                log(thermConf[i][0] + ': Fehler beim Auslesen des Offsets aufgetreten: ' + errorResult, 'error');
            }
        });
    }
}


 /**
 * Converts a temperature number into Homematic value.
 * @param {number}   tempInput   Temperature to convert
 * @return {number}  target value. Example: -2.655 will result in -2.5
 */
function convertTemperatureToHMvalue(tempInput) {
    
    // Make sure we get a rounded number with base of ".5". 1.4 will result in 1.5, 8.6 in 9, etc. 
    var tempInp = Math.round(tempInput * 2) / 2;
    
    // Homematic does not accept temparatures lower than -3.5 or higher than 3.5
    if (tempInp > 3.5) tempInp = 3.5;
    if (tempInp < -3.5) tempInp = -3.5;

    return tempInp;

}

/**
 * Create states needed for this script. 
  */
function createScriptStates() {
    for (let i = 0; i < thermConf.length; i++) {
        createState(STATE_PATH + thermConf[i][0] + '.' + 'offsetTemperature', {'name':'Offset Temperature', 'type':'number', 'read':true, 'write':false, 'role':'info'});
    }
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



