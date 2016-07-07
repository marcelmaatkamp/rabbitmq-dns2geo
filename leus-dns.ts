/**
 * leus-dns.ts - translation of geodns.js to typescript for better understanding of the code
 *
 * fully refactored 23-07-2015
 * Created by Ab Reitsma on 13-07-2015
 */

// configurable (environment) settings
const GEO_HOSTNAME = process.env.GEO_HOSTNAME || "www.googleapis.com";
const GEO_URL = process.env.GEO_URL || "/geolocation/v1/geolocate";
const GEO_LOOKUP_INTERVAL = process.env.GEO_LOOKUP_INTERVAL || 900000; //in ms
const GEO_API_KEY = process.env.GEO_API_KEY;
const AMQP_CONNECTION_URL = process.env.AMQP_CONNECTION_URL || "rabbitmq";
const AMQP_DNS_EXCHANGE = process.env.AMQP_DNS_EXCHANGE || "dns";
const AMQP_DNS_QUEUE = process.env.AMQP_DNS_QUEUE || "dns_geo";
const AMQP_GEO_EXCHANGE = process.env.AMQP_GEO_EXCHANGE || "geo";
const SSID_DICTIONARY_MAX_SIZE = process.env.SSID_DICTIONARY_MAX_SIZE || 10;

//we do not have typescript definition files for the following node modules,
//so we just require them (without having type support from the IDE):
var amq = require("amq");

import {logger} from "./lib/Logger"; //configure logging

import * as Amqp from "./lib/AmqpWrapper"; //amqp (rabbitmq) queue and exchange abstraction
import * as AmqpDns from "./lib/AmqpDns"; //AMQP DNS message format
import {Store, FileStore, ExchangeStore} from "./lib/Store"; //storage implementations
import {WifiToGeoGoogle} from "./lib/WifiToGeo"; //geolocation for wifi access points
import {DnsResultCache} from "./lib/DnsResultCache"; //main logic for single access point DNS request processing

//Configure exchange
var dnsExchange = new Amqp.Exchange({
  connectionUrl: AMQP_CONNECTION_URL,
  socketOptions: {},
  exchange: AMQP_DNS_EXCHANGE,
  exchangeOptions: {
    type: "fanout",
    durable: true,
    autoDelete: false
  }
});
var geoResultExchange = new Amqp.Exchange({
  connectionUrl: AMQP_CONNECTION_URL,
  socketOptions: {},
  exchange: AMQP_GEO_EXCHANGE,
  exchangeOptions: {
    type: "fanout",
    durable: true,
    autoDelete: false
  }
});
//Configure the DNS requests message queue
var dnsQueryQueue = new Amqp.Queue({
  connectionUrl: AMQP_CONNECTION_URL,
  socketOptions: {},
  queue: AMQP_DNS_QUEUE,
  queueOptions: {
    durable: true,
    autoDelete: false
  }
});
dnsQueryQueue.bind(dnsExchange.getExchange());


var dnsStore = new FileStore("./dns-events.txt"); //initialize DNS file store for logging src DNS requests
var geoStore = new ExchangeStore(geoResultExchange); //initialize geo exchange store for geo lookup results

logger.info("Using google api key: " + GEO_API_KEY)
var wifiToGeo = new WifiToGeoGoogle(GEO_API_KEY, GEO_HOSTNAME, GEO_URL);

var dnsResultCache = new DnsResultCache(SSID_DICTIONARY_MAX_SIZE, wifiToGeo, geoStore, dnsStore); //initialize the DNS result cache
setInterval(() => { dnsResultCache.Update() }, GEO_LOOKUP_INTERVAL); //set the flush interval for geo lookups

//Start the DNS message consumer
dnsQueryQueue.startConsumer(dnsMessageJson => {
  logger.info("received: " + dnsMessageJson)
  var dnsMessage = <AmqpDns.Message> JSON.parse(dnsMessageJson);
  for (var i = 0, len = dnsMessage.question.length; i < len; i++) {
    var dnsQuery = dnsMessage.question[i];
    dnsResultCache.Add(dnsQuery.name);
  }
})
