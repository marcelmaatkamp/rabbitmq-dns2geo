/**
 * Logger.ts - provide and configure logging
 * Created by Ab on 21-07-2015
 */

import winston = require("winston");

// configure logging
export function startLog() {
    return new winston.Logger({
        transports: [
            new winston.transports.File({
                level: 'info',
                filename: './logs/all-logs.log',
                handleExceptions: false,
                json: true,
                maxsize: 5242880, //5MB
                maxFiles: 5,
                colorize: false
            }),
            new winston.transports.Console({
                level: 'debug',
                handleExceptions: false,
                json: false,
                colorize: true
            })
        ],
        exitOnError: false
    });
}
