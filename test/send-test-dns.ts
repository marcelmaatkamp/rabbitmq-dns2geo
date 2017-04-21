/**
 * send-test-dns.ts - send test dns messages for testing purposes
 * 
 * fully refactored 23-07-2015
 * Created by Ab Reitsma on 13-07-2015
 */
 
// configurable (environment) settings
const SEND_INTERVAL = process.env.SEND_INTERVAL || 100; //in ms
const AMQP_CONNECTION_URL = process.env.AMQP_CONNECTION_URL || "localhost";
const AMQP_DNS_QUEUE = process.env.AMQP_DNS_QUEUE || "dns_geo";

//we do not have typescript definition files for the following node modules,
//so we just require them (without having type support from the IDE):
var amq = require("amq");

import * as Amqp from "../lib/AmqpWrapper"; //amqp (rabbitmq) queue and exchange abstraction
import * as AmqpDns from "../lib/AmqpDns"; //AMQP DNS message format

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

var dnsRequests = [
  "s-44.60beb539f50f.4796042.10219030.l.hec.to.",
  "s-64.7cd1c38fa924.4796042.10219030.l.hec.to.",
  "s-90.c4143c29b101.4994260.10219030.l.hec.to.",
  "s-45.60beb539f50f.4994260.10219030.l.hec.to.",
  "s-89.c4143c29b4d2.4994260.10219030.l.hec.to."
]
