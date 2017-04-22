/**
 * WifiToGeo.ts library that can contain various wifi access point to geo conversion options.
 * For now only the google api is supported
 * Created by Ab Reitsma on 22-07-2015
 */
 
// node.js system imports
import * as https from "https";
import * as stream from "stream";

// bluebird promises (old format?)
import Promise = require("bluebird");

// result storage implementation interface
import {Store} from "./Store";

// configured logging
import {logger} from "./Logger";
  
// define the used structures
export interface WifiAccessPoint {
  macAddress: string,
  age: number,
  signalStrength: number
}

export interface GeoLocation {
  latitude: number,
  longitude: number,
  accuracy: number
}

export interface WifiToGeo {
  GetGeoLocation(sensorName: string, wifiAccessPoints: WifiAccessPoint[]): Promise<GeoLocation>;
}


//Google Geolocation support class
export class WifiToGeoGoogle implements WifiToGeo {
  apiKey: string;
  server: any;
  geoHostName: string;
  geoUrl: string;

  constructor(key: string, geoHostName?: string, geoUrl?: string) {
    this.apiKey = key;
    this.geoHostName = geoHostName || "www.googleapis.com";
    this.geoUrl = geoUrl || "/geolocation/v1/geolocate";
  }
    
  // get geo-location from google from wifiAccessPoints MAC array and
  // returns: Promise for result GeoLocation
  GetGeoLocation(sensorId: string, wifiAccessPoints: WifiAccessPoint[]): Promise<GeoLocation> {
    return new Promise<GeoLocation>((resolve, reject) => {
      var requestUri = this.geoUrl + "?key=" + this.apiKey;
      var jsonData = JSON.stringify({ wifiAccessPoints: wifiAccessPoints });

      var options = {
        hostname: this.geoHostName,
        port: 443,
        path: requestUri,
        method: "POST",
        headers: {
          "Host": this.geoHostName,
          "Content-Type": "application/json",
          "Content-length": jsonData.length
        }
      };

      function ProcessRequest(res: stream.Readable) {
        res.setEncoding("utf8");			
        // fetch result data
        var resultData = "";
        res.on("data", chunk => {
          resultData += chunk;
        });			
        // process result
        res.on("end", () => {
          try {
            var result = JSON.parse(resultData);
            // console.log("result: "+resultData);
            if (result.error !== undefined) {
              reject(result.error);
            }
            var location: GeoLocation = {
              latitude: result.location.lat,
              longitude: result.location.lng,
              accuracy: result.accuracy
            };
            resolve(location);
          } catch (e) {
            reject(e);
          }
        })
      };

      var request = https.request(options, ProcessRequest);
      request.on('error', (e) => {
        reject(e);
      })
      request.write(jsonData);
      request.end();
    });
  }
}
