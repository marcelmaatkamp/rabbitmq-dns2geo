/*
 * leus-dns.ts
 * 
 * translation of geodns.js to typescript for better understanding of the code
 * Ab Reitsma, 13-07-2015
 */

// we do not have typescript definition files for the following node modules,
// so we just require them (without having type support from the IDE):
var amq = require("amq");

// node.js system imports
import * as https from "https";
import * as stream from "stream";
import * as fs from "fs";

// amqp (rabbitmq) queue and exchange abstraction
import * as Amqp from "./lib/AmqpWrapper";

// configure logging
import Logger = require("./lib/Logger");
var logger = Logger.startLog();

// get AMQP DNS message format
import * as AmqpDns from "./lib/AmqpDns";

// get result storage implementations
import {Store, FileStore, ExchangeStore} from "./lib/Store";


// define the used structures
interface WifiAccessPoint {
    macAddress: string,
    age: number,
    signalStrength: number
}


//Google Geolocation support class
class GoogleApi {
    apiKey: string;
    geoStore: Store;
    server: any;

    constructor(key: string, geoStore?: Store) {
        this.apiKey = key;
        this.geoStore = geoStore;
    }

    // get geo-location from google from wifiAccessPoints MAC array
    lookupMac(sensor: any, wifiAccessPoints: [WifiAccessPoint]) {
        var requestUri = "/geolocation/v1/geolocate?key=" + this.apiKey;
        var jsonData = JSON.stringify({ wifiAccessPoints: wifiAccessPoints });
        var options = {
            hostname: "www.googleapis.com",
            port: 443,
            path: requestUri,
            method: "POST",
            headers: {
                "Host": "www.googleapis.com",
                "Content-Type": "application/json",
                "Content-length": jsonData.length
            }
        };

        var request = https.request(options, (res: stream.Readable) => {
            res.setEncoding("utf8");
			
            // fetch result data
            var resultData = "";
            res.on("data", (chunk) => {
                resultData += chunk;
            });
			
            // process result
            res.on("end", () => {
                var result = JSON.parse(resultData);
                //Add the original sensor/wifiAccessPoints array to the result so we get one object.
                result.measurements = wifiAccessPoints;
                result.sensorname = sensor;
                //Also add the time that Google responded.
                result.flushtimestamp = (new Date).toISOString();        
                //Store result
                if (this.geoStore !== undefined) {
                    this.geoStore.store(JSON.stringify(result));
                }

                logger.info("Response received from Google Geolocation API("+this.apiKey+")");
            })
        });
        request.on('error', (e) => {
            logger.error("Problem with request:" + e.message);
        })
        request.write(jsonData);
        request.end();
    }
}

//Tempstore object literal. This one contains all of our business logic. 
//The glue between the incomming DNS requests and the outgoing Google Geolocation API calls.
class TempStore {
    googleApi: GoogleApi;
    dnsStore: Store;
    queries: any = [];
    needsFlush: any = [];


    constructor(googleApi: GoogleApi, dnsStore?: Store) {
        this.googleApi = googleApi;
        this.dnsStore = dnsStore;
    }
    
    //Check a dbm token
    checkDbm(dbm: string) {
        //The first token in the dns name is the the character 's' followed by the (negative integer) signal strength in dbm.
        var signalStrength = parseInt(dbm.substr(1, dbm.length - 1), 10);
        //The result should be somewhere in the -30dbm .. -100dbm range to be valid. 
        if (signalStrength > -30) {
            throw new Error("Invalid dbm string: " + dbm);
        }
        if (signalStrength < -100) {
            throw new Error("Invalid dbm string: " + dbm);
        }
        return signalStrength;
    }
	
    //Check a MAC address token
    checkMac(mac: string) {
        const MAC_LENGTH = 12;
		
        //Must be exactly 12 characters long.
        if (mac.length !== MAC_LENGTH) {
            throw new Error("Invalid mac string: " + mac + " (wrong size)");
        }
        mac = mac.toLowerCase();
        //Must be a valid hexadecimal number.
        for (var i = 0; i < MAC_LENGTH; i++) {
            if ("1234567890abcdef".indexOf(mac.charAt(i)) < 0) {
                throw new Error("Invalid mac string: " + mac + " (not hex)");
            }
        }
		
        //Add the colons in the proper places to return the BSSID mac adress.
        return mac.substr(0, 2) + ":" +
            mac.substr(2, 2) + ":" +
            mac.substr(4, 2) + ":" +
            mac.substr(6, 2) + ":" +
            mac.substr(8, 2) + ":" +
            mac.substr(10, 2);
    }
	
    //Check a bigish numeric token
    checkBigInt(bigInt: string) {
        var len = bigInt.length;

        if (len < 1 || len > 20) {
            throw new Error("Invalid integer string: " + bigInt + " (wrong size)");
        }
        for (var i = 0; i < len; i++) {
            if ("1234567890".indexOf(bigInt.charAt(i)) < 0) {
                throw new Error("Invalid integer string: " + bigInt + " (not decimal)");
            }
        }
        return bigInt;
    }
	
	
    //Parse and add a single DNS name based measurement to the tempstore.
    public add(dnsName: string) {
        var dnstokens;
        var db; //signal strength of access point
        var mac; //BSSID mac address of access point
        var ticks; //Duno, some ticks variable in DNS query, won't use.
        var sensor; //Unique identifier of sensor.

        logger.info("Incoming DNS request for: " + dnsName);

        try {
            //Get and check the first four tokens of the DNS name (ignore the rest).
            dnstokens = dnsName.split(".").slice(0, 4);
            if (dnstokens.length !== 4) {
                throw new Error("Too few tokens");
            }
            db = this.checkDbm(dnstokens[0]);
            mac = this.checkMac(dnstokens[1]);
            ticks = this.checkBigInt(dnstokens[2]);
            sensor = this.checkBigInt(dnstokens[3]);
			
            //Make sure the specific sensor is defined in our queries store.
            if (!(this.queries.hasOwnProperty(sensor))) {
                this.queries[sensor] = {};
                this.needsFlush[sensor] = false;
            }
            logger.info("Adding request to tempstore, mac=" + mac);
			
            //Add (or overwrite) query for specific BSSID to the tempstore.
            this.queries[sensor][mac] = {
                "timestamp": Math.floor(Date.now() / 1000),
                "dbm": db,
                "mac": mac
            };
            this.needsFlush[sensor] = true;

            if (this.dnsStore !== undefined) {
                this.dnsStore.store(JSON.stringify(this.queries[sensor][mac]));
            }

            this.prune(sensor);
        }
        catch (e) {
            logger.info(+ e.message + ", Ignoring DNS request for: " + dnsName);
        }
    }


    public flush() {
        var sensor,
            bssid,
            wifiaccesspoints,
            measurement,
            age,
            mac,
            dbm,
            now;
        for (sensor in this.queries) {
            if (this.queries.hasOwnProperty(sensor) && this.needsFlush[sensor]) {
                //This particular sensor has something that needs flushing, we are going to do that now.
                this.needsFlush[sensor] = false;
                //Construct a helper object for calling the google geolocation api functionality
                wifiaccesspoints = [];
                for (bssid in this.queries[sensor]) {
                    if (this.queries[sensor].hasOwnProperty(bssid)) {
                        measurement = this.queries[sensor][bssid];
                        mac = measurement.mac;
                        now = Math.floor(Date.now() / 1000);
                        age = now - measurement.timestamp;
                        dbm = measurement.dbm;
                        wifiaccesspoints.push({
                            macAddress: mac,
                            age: age,
                            signalStrength: dbm
                        });
                    }
                }
                //Invoke the google geolocation appi functionality
                logger.info("Invoking Google GeoLocation API.");
                this.googleApi.lookupMac(sensor, wifiaccesspoints);
            }
        }
    }

    prune(sensor) {
        const DICTIONARY_MAX_SIZE = 10;
		
        //We only keep the 10 last seen unique BSSID's
        if (Object.keys(this.queries[sensor]).length > DICTIONARY_MAX_SIZE) {
            //Find and delete the oldest BSSID.
            var oldestbssidtime = Math.floor(Date.now() / 1000);
            var oldestbssid = "";
            for (var candidatebssid in this.queries[sensor]) {
                if (this.queries[sensor].hasOwnProperty(candidatebssid)) {
                    if (this.queries[sensor][candidatebssid].timestamp < oldestbssidtime) {
                        oldestbssidtime = this.queries[sensor][candidatebssid].timestamp;
                        oldestbssid = candidatebssid;
                    }
                }
            }
            //And delete the oldest one.
            logger.info("Dropping oldest request for mac=" + oldestbssid);
            delete this.queries[sensor][oldestbssid];
        }
    }
}

// initialize file store
var dnsStore = new FileStore("./logs/dns-events.txt");

// initialize exchange store
var geoResultExchange = new Amqp.Exchange({
    connectionUrl: '37.48.122.199',
    socketOptions: {},
    exchange: 'geo',
    exchangeOptions: {
        type: 'fanout',
        durable: true,
        autoDelete: false
    }
});
var geoStore = new ExchangeStore(geoResultExchange);

//Set the Google Geolocation API key using the api.json content.
var googleApiKey = process.env.API_GOOGLE || process.env.GOOGLE_API_KEY
logger.info("Using google api key: " + googleApiKey)
var googleApi = new GoogleApi(googleApiKey, geoStore);
var tempStore = new TempStore(googleApi, dnsStore);

//Set the maximum per-sensor API request rate to one query per 30 seconds.
setInterval(() => {tempStore.flush()}, 30000);

//Configure the message queue
var dnsQueryQueue = new Amqp.Queue({
    connectionUrl: "37.48.122.199",
    socketOptions: {},
    queue: 'dns_log',
    queueOptions: {
        durable: true,
        autoDelete: false
    }
});

dnsQueryQueue.startConsumer(dnsMessageJson => {
    logger.info("received: " + dnsMessageJson)
    var dnsMessage = <AmqpDns.Message> JSON.parse(dnsMessageJson);
    for(var i=0, len=dnsMessage.question.length; i<len; i++) {
        var dnsQuery = dnsMessage.question[i];
        tempStore.add(dnsQuery.name);    
    }
})

