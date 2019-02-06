#!/usr/bin/env node
const AWS = require('aws-sdk');
const fs = require('fs');
const argv = require('yargs')
  .usage('Usage: $0 --env [env] --profile [profile] --region [region] command stream#N [stream#N]')
  .command('get', 'Get the N logs from 1 or more printx log groups for printx')
  .command('purge', 'Remove all the logstreams for 1 or more printx log groups')
  .example('$0 get DocumentEvent#2', 'get the latest two streams from Qa DocumentEvent lambda')
  .example('$0 --env=Dev get JobPost', 'get the latest stream from Dev JobPost lambda')
  .demandCommand(2)
  .default('env', 'Qa')
  .alias('e', 'env')
  .default('profile', 'default')
  .alias('p', 'profile')
  .default('region', 'us-east-2')
  .alias('r', 'region').argv;

const credentials = new AWS.SharedIniFileCredentials({ profile: argv.profile });
const locale = argv.region == 'us-east-2' ? "Oh" : "Or";
//console.log(argv.profile);
//console.log(credentials);

const command = argv._[0];
const lambdas = argv._.slice(1);

switch (command) {
  case "get":
    lambdas.forEach(async lambda => {
      try {
        await getLogs({ lambda, env: argv.env });
      } catch (e) {
        console.error("get error: " + e.message);
      }
    });
    break;
  case "purge":
    lambdas.forEach(async lambda => {
      try {
        await purge({ lambda, env: argv.env });
      } catch (e) {
        console.error("purge error: " + e.message);
      }
    });
    break;
  default:
    console.log("Uknown command: ", command);
}

async function getLogs({ lambda, env }) {
  return new Promise((resolve, reject) => {
    const ndx = lambda.indexOf('#');
    let count = 1;
    if (ndx !== -1) {
      count = parseInt(lambda.slice(ndx + 1)) || 1;
      lambda = lambda.slice(0, ndx);
    }
    const group = `/aws/lambda/Pxo001Us${locale}${env}LambdaFunction${lambda}Jar01`;

    console.log(` get logs for ${group} count: ${count}`);

    const params = {
      logGroupName: group,
      descending: true,
      limit: count,
      orderBy: 'LastEventTime'
    };

    //console.log(params);
    //console.log(argv.region);
    const cwl = new AWS.CloudWatchLogs({
      apiVersion: '2014-03-28',
      region: argv.region
    });

    //console.log(cwl);
    cwl.describeLogStreams(params, (err, data) => {
      if (err) {
        reject(err);
      } else if (data.logStreams.length == 0) {
        console.log('No logs found');
      } else {
        // console.log(`Capturing: ${data.logStreams[0].logStreamName}`);
        for (let i = 0; i < count; i++) {
          cwl.getLogEvents(
            {
              logGroupName: group,
              logStreamName: data.logStreams[i].logStreamName,
              startFromHead: true
            },
            (err, data) => {
              if (err) {
                reject(err);
              } else {
                let output = '';
                data.events.forEach(e => {
                  const msg =
                    e.message[0] === '\n' ? e.message.slice(1) : e.message;
                  const date = new Date(e.timestamp).toLocaleDateString();
                  const time = new Date(e.timestamp).toLocaleTimeString();
                  output += `${date} ${time} - ${msg}`;
                });
                fs.writeFile(`${env}-${lambda}-${i + 1}.log`, output, err => {
                  if (err) {
                    reject(err);
                  } else {
                    if (i === count - 1) resolve();
                  }
                });
              }
            }
          );
        }
      }
    });
  });
}

async function purge({ lambda, env }) {
  return new Promise((resolve, reject) => {
    const group = `/aws/lambda/Pxo001UsOh${env}LambdaFunction${lambda}Jar01`;

    console.log(group);

    const params = {
      logGroupName: group,
      descending: true,
      orderBy: 'LastEventTime'
    };

    const cwl = new AWS.CloudWatchLogs({
      apiVersion: '2014-03-28',
      region: argv.region
    });

    cwl.describeLogStreams(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        let purgedCount = data.logStreams.length;
        data.logStreams.forEach(stream => {
          console.log(`Purging: ${stream.logStreamName}`);
          cwl.deleteLogStream(
            {
              logGroupName: group,
              logStreamName: stream.logStreamName
            },
            (err, data) => {
              if (err) {
                reject(err);
              } else {
                if (--purgedCount == 0) {
                  resolve();
                }
              }
            });
        });
      }
    });
  });
}
