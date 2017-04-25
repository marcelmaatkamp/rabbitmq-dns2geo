// import * as convict from "convict";
// import convict = require('convict');
const convict : any = require('convict');

var config = convict({
  log: {
    level: {
      doc: 'The winston log level',
      format: 'string',
      default: 'INFO',
      env: 'LOG_LEVEL'
    }
  }
});
config.validate({allowed: 'strict'});

// export const config: convict = config;
