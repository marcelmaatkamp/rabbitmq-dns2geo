/**
 * AmqpDns.ts - type definitions for the amqp dns message
 * Created bt Ab Reitsma on 21-07-2015
 */
 
 // amqp message queue payload example:
// {"header":{"id":24906,"qr":0,"opcode":0,"aa":0,"tc":0,"rd":0,"ra":0,"res1":0,"res2":0,"res3":0,"rcode":0},"question":[{"name":"s-70.98fc1182a159.11906792.10219030.l.Hec.TO","type":1,"class":1}],"answer":[],"authority":[],"additional":[],"edns_options":[],"address":{"address":"213.75.71.13","family":"IPv4","port":60304,"size":62}}

// define the amqp message format
export interface MessageHeader {
    id: number,
    qr: number,
    opcode: number,
    aa: number,
    tc: number,
    rd: number,
    ra: number,
    res1: number,
    res2: number,
    res3: number,
    rcode: number
}

export interface Query {
    name: string,
    type: number,
    class: number
}

export interface Address {
    address: string,
    family: string,
    port: number,
    size: number
}

export interface Message {
    header: MessageHeader,
    question: [Query],
    answer: [any],
    authority: [any],
    additional: [any],
    edns_options: [any],
    address: Address
}
