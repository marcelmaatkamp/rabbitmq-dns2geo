/**
 * DnsResultCache.ts - temporary storage that combines up to maxCache DNS
 * requests per sensor. And executes every updateInterval a geolookup with the
 * specified wifiToGeo interface implementation.
 * Created by Ab Reitsma on 22-07-2015
 */

import {WifiAccessPoint, WifiToGeo} from "./WifiToGeo"; //geo conversion interface
import {Store} from "./Store"; //result storage interface
import {logger} from "./Logger"; //configured logging

//DnsResultCache object literal. This one contains all of our business logic.
//The glue between the incomming DNS requests and the outgoing Google Geolocation API calls.
export class DnsResultCache {
  dictionaryMaxSize: number;
  wifiToGeo: WifiToGeo;
  geoStore: Store;
  dnsStore: Store;
  queries: any = [];
  needsFlush: any = [];

  constructor(dictionaryMaxSize: number, wifiToGeo: WifiToGeo, geoStore?: Store, dnsStore?: Store) {
    this.dictionaryMaxSize = dictionaryMaxSize;
    this.wifiToGeo = wifiToGeo;
    this.geoStore = geoStore;
    this.dnsStore = dnsStore;
  }

  //Check a dbm token
  private CheckDbm(signalStrength: number) {
    if (signalStrength > -30) {
      throw new Error("Invalid dbm string: " + signalStrength);
    }
    if (signalStrength < -100) {
      throw new Error("Invalid dbm string: " + signalStrength);
    }
    return signalStrength;
  }

  //Check a MAC address token
  private CheckMac(mac: string) {
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

  //Limit the number of BSSID to the last DICTIONARY_MAX_SIZE
  private Limit(sensor) {
    if (Object.keys(this.queries[sensor]).length > this.dictionaryMaxSize) {
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

  //Parse and add a single DNS name based measurement to the tempstore.
  public Add(date: Date, sensor: number, macaddress: string, rssi: number) {
    try { 
      var db = this.CheckDbm(rssi);
      var mac = this.CheckMac(macaddress);

      if (!(this.queries.hasOwnProperty(sensor))) {
        this.queries[sensor] = {};
        this.needsFlush[sensor] = false;
      }
      logger.info("Adding request to tempstore, mac=" + mac);

      this.queries[sensor][mac] = {
        "timestamp": Math.floor(Date.now() / 1000),
        "date": date,
        "dbm": db,
        "mac": mac
      };
      this.needsFlush[sensor] = true;

      if (this.dnsStore !== undefined) {
        this.dnsStore.store(JSON.stringify(this.queries[sensor][mac]));
      }

      this.Limit(sensor);
    }
    catch (e) {
      logger.info(+ e.message + ", Ignoring DNS request for sensor("+sensor+"), mac("+macaddress+"), rssi("+rssi+")");
      logger.info(e.stack);
    }
  }

  //performs a (new) geo lookup for the sensors that need to be updated
  public Update() {
    var sensorId: string;
    var wifiAccessPoints: WifiAccessPoint[];
    var bssid;
    var measurement;
    var now = Math.floor(Date.now() / 1000);

    for (sensorId in this.queries) {
      if (this.queries.hasOwnProperty(sensorId) && this.needsFlush[sensorId]) {
        //This particular sensor has something that needs flushing, we are going to do that now.
        this.needsFlush[sensorId] = false;
        //Construct a helper object for calling the google geolocation api functionality
        wifiAccessPoints = [];
        for (var bssid in this.queries[sensorId]) {
          if (this.queries[sensorId].hasOwnProperty(bssid)) {
            measurement = this.queries[sensorId][bssid];
            console.log("measurement: " + JSON.stringify(measurement));
            wifiAccessPoints.push({
              macAddress: measurement.mac,
              age: now - measurement.timestamp,
              date: { $date: measurement.date },
              signalStrength: measurement.dbm
            });
          }
        }
        //Invoke the google geolocation appi functionality
        logger.info("Invoking Google GeoLocation API for " + sensorId);
        this.wifiToGeo.GetGeoLocation(sensorId, wifiAccessPoints)
          .then(geoLocation => {
            var result = {
              lat: geoLocation.latitude,
              lng: geoLocation.longitude,
              acc: geoLocation.accuracy,
              measurements: wifiAccessPoints,
              sensorname: sensorId,
              flushtimestamp: { $date: new Date() }
            }
            logger.info("Success result from Google GeoLocation API:" + JSON.stringify(result));
            this.geoStore.store(JSON.stringify(result));
          })
          .error(e => {
            logger.error("Error result from Google GeoLocation API: " + (e.msg || e.message));
          });
      }
    }
  }
}
