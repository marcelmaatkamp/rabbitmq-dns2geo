/**
 * Store.ts - implements the various storage options for geo results
 * Created by Ab Reitsma on 21-07-2015
 */
 
import stream = require("stream");
import fs = require("fs");
import os = require("os");

import Amqp = require("./AmqpWrapper");
 
export interface Store {
    store(result: string);
}

export class FileStore implements Store {
    fileName: string;

    constructor(fileName: string) {
        this.fileName = fileName;
    }

    store(result: string) {
        // var log = fs.createWriteStream(this.fileName, { flags: "a" });
        // log.end(result + os.EOL);
    }
}

export class ExchangeStore implements Store {
    exchange: Amqp.Exchange;
    
    constructor(queue: Amqp.Exchange) {
        this.exchange = queue;
    }
    
    store(result: string) {
       this.exchange.publish(result);
    }
}

export class ExchangeFileStore implements Store {
    exchange: ExchangeStore;
    file: FileStore; 
    
    constructor(queue: Amqp.Exchange, fileName: string) {
        this.exchange = new ExchangeStore(queue);
        this.file = new FileStore(fileName);
    }
    
    store(result: string) {
       // this.exchange.store(result);
       // this.file.store(result); 
    }
}
