/**
 * AmqpWrapper.ts - provides a simple interface to read from and write to RabbitMQ amqp exchanges
 * Created by Ab on 23-7-2014.
 */

var Amq: any = require('amq');
var os: any = require('os');

//todo: share connections to the same host

export class Exchange {
  private connection: any;
  private exchange: any;
  private queueName: string;
  private queue: any;
  private consumerFunction: (string) => void;
  private consumerTag: any;

  constructor(exchangeDefinition: any, consumerFunction?: (string) => void, callbackConsumerWorking?: () => any) {
    // create connection
    this.connection = Amq.createConnection({
      host: exchangeDefinition.connectionUrl,
      debug: false
    }, {
      reconnect: { strategy: 'constant', initial: 1000 }
    });
    this.exchange = this.connection.exchange(exchangeDefinition.exchange, exchangeDefinition.exchangeOptions);
    this.queueName = exchangeDefinition.exchange + '.r2o.' + os.hostname() + '_' + process.pid;
    if (consumerFunction) {
      this.startConsumer(consumerFunction).then(callbackConsumerWorking);
      // no promises possible in this configuration
    }
  }

  getExchange() {
    return this.exchange;
  }

  startConsumer(consumerFunction: (string) => void) {
    this.consumerFunction = consumerFunction;
    this.queue = this.connection.queue(this.queueName, {exclusive: true, durable: false});
    this.queue.bind(this.exchange);
    // start consumer and return the promise
    return this.queue.consume((message) => {
      var payload = message.content.toString();
      this.consumerFunction(payload);
      this.queue.ack(message);
    }).then((consumer) => {
      this.consumerTag = consumer.consumerTag;
    });
  }

  stopConsumer() {
    //close the consumer
    return this.queue.cancel(this.consumerTag).then(() => {
      var oldQueue = this.queue;
      this.queue = null;
      oldQueue.destroy();
    });
  }

  publish(message: string) {
    // hack: contenttype hardcoded to JSON
    this.exchange.publish('', message, {contentType: "application/json"});
  }

  close() {
    //close the consumer
    if (this.queue) {
      return this.stopConsumer()
        .then(() => {
          return this.connection.close();
        });
    } else {
      return this.connection.close();
    }
  }
}


export class Queue {
  private connection: any;
  private queue: any;
  private consumerFunction: (string) => void;
  private consumerTag: any;

  constructor(queueDefinition: any, consumerFunction?: (string) => void, callbackConsumerWorking?: () => any) {
    // create connection
    this.connection = Amq.createConnection({
      host: queueDefinition.connectionUrl,
      debug: true
    }, {
      reconnect: { strategy: 'constant', initial: 1000 }
    });
    this.queue = this.connection.queue(queueDefinition.queue, queueDefinition.queueOptions);
    if (consumerFunction) {
      this.startConsumer(consumerFunction).then(callbackConsumerWorking);
      // no promises possible in this configuration
    }
  }

  bind(exchange: string) {
    return this.queue.bind(exchange);
  }

  startConsumer(consumerFunction: (string) => void) {
    this.consumerFunction = consumerFunction;

    // start consumer and return the promise
    return this.queue.consume((message) => {
      var payload = message.content.toString();
      this.consumerFunction(payload);
      this.queue.ack(message);
    }).then((consumer) => {
      this.consumerTag = consumer.consumerTag;
    });
  }

  stopConsumer() {
    //close the consumer
    return this.queue.cancel(this.consumerTag);
  }

  publish(message: string) {
    this.queue.publish(message);
  }

  close() {
    return this.stopConsumer()
      .then(() => {
        return this.connection.close();
      });
  }
}
