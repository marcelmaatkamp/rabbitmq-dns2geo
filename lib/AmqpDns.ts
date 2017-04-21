/**
 * AmqpDns.ts - type definitions for the amqp dns message
 * Created bt Ab Reitsma on 21-07-2015
 */
 
 // amqp message queue payload example:

export interface Measurements { 
   id: number,
   ticker: number,
   ap: Measurement[]
}

export interface Measurement { 
   bssid: number,
   rssi: number
}
