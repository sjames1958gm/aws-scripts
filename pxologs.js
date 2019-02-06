#!/usr/bin/env node
const { spawn, exec } = require('child_process');
const fs = require('fs');
const argv = require('yargs')
  .usage(
    'Usage: $0 --env [env] --profile [profile] --locale [locale] command stream#N [stream#N]'
  )
  .command('get', 'Get the N logs from 1 or more printx log groups for printx')
  .command('purge', 'Remove all the logstreams for 1 or more printx log groups')
  .example(
    '$0 get DocumentEvent#2',
    'get the latest two streams from Qa DocumentEvent lambda'
  )
  .example(
    '$0 --env=Prod get JobPost',
    'get the latest stream from Production JobPost lambda'
  )
  .demandCommand(2)
  .default('env', 'Qa')
  .alias('e', 'env')
  .default('profile', 'default')
  .alias('p', 'profile').argv;

const { env, profile } = argv;

const command = argv._[0];
const lambdas = argv._.slice(1);

const locale = env !== 'Prod' ? 'UsOh' : 'UsOr';

switch (command) {
  case 'get':
    lambdas.forEach(async lambda => {
      try {
        await getLogs({ profile, lambda, env, locale });
      } catch (e) {
        console.error('get error: ' + e.message);
      }
    });
    break;
  case 'purge':
    lambdas.forEach(async lambda => {
      try {
        await purgeLogs({ profile, lambda, env, locale });
      } catch (e) {
        console.error('purge error: ' + e.message);
      }
    });
    break;
  default:
    console.log('Uknown command: ', command);
}

async function getLogs({ profile, lambda, env, locale }) {
  return new Promise((resolve, reject) => {
    const ndx = lambda.indexOf('#');
    let count = 1;
    if (ndx !== -1) {
      count = parseInt(lambda.slice(ndx + 1)) || 1;
      lambda = lambda.slice(0, ndx);
    }

    const group = `/aws/lambda/Pxo001${locale}${env}LambdaFunction${lambda}Jar01`;

    console.log(` get logs for ${group} count: ${count}`);

    let awsParms = [
      `--profile=${profile}`,
      'logs',
      'describe-log-streams',
      `--log-group-name=${group}`,
      `--order-by=LastEventTime`,
      `--descending`,
      `--limit=${count}`
    ];

    console.log(`Retrieving streams for ${group}`);
    const child = spawn(`aws`, awsParms);

    let chunks = '';
    child.stdout.on('data', chunk => {
      chunks += chunk;
    });

    child.on('close', code => {
      // console.log(`child process exited with code ${code}`);
      let logStreams = JSON.parse(chunks);
      getStreams({ profile, logStreams, group, env, lambda, locale });
      resolve();
    });

    child.stderr.on('data', chunk => {
      console.error(chunk);
      reject();
    });
  });
}

function getStreams({ profile, logStreams, group, env, lambda }) {
  logStreams.logStreams.forEach((stream, index) => {
    const awsParms = [
      `--profile=${profile}`,
      'logs',
      'get-log-events',
      `--log-group-name=${group}`,
      `--log-stream-name=${stream.logStreamName}`
    ];

    console.log(`Retrieving events for ${group} -- ${stream.logStreamName}`);
    const child = spawn(`aws`, awsParms);

    let chunks = '';
    child.stdout.on('data', chunk => {
      chunks += chunk;
    });

    child.on('close', code => {
      // console.log(`child process exited with code ${code}`);
      let logEvents = JSON.parse(chunks);
      writeEvents({ events: logEvents.events, index: index + 1, env, lambda });
      // console.log(logEvents.events.length);
      // processStreams(logStreams);
    });

    child.stderr.on('data', chunk => {
      console.error('' + chunk);
    });
  });
}

function writeEvents({ events, env, lambda, index }) {
  let output = '';
  events.forEach(e => {
    const msg = e.message[0] === '\n' ? e.message.slice(1) : e.message;
    const date = new Date(e.timestamp).toLocaleDateString();
    const time = new Date(e.timestamp).toLocaleTimeString();
    output += `${date} ${time} - ${msg}`;
  });
  const fileName = `${env}-${lambda}-${index}.log`;
  console.log(`Writing file: ${fileName}`);
  fs.writeFile(fileName, output, err => {
    if (err) {
      console.log(err);
    }
  });
}

async function purgeLogs({ profile, lambda, env, locale }) {
  return new Promise((resolve, reject) => {
    const ndx = lambda.indexOf('#');
    let count = 1;
    if (ndx !== -1) {
      count = parseInt(lambda.slice(ndx + 1)) || 1;
      lambda = lambda.slice(0, ndx);
    }

    const group = `/aws/lambda/Pxo001${locale}${env}LambdaFunction${lambda}Jar01`;

    console.log(` purge logs for ${group}`);

    let awsParms = [
      `--profile=${profile}`,
      'logs',
      'describe-log-streams',
      `--log-group-name=${group}`,
      `--order-by=LastEventTime`,
      `--descending`
    ];

    console.log(`Retrieving streams for ${group}`);
    const child = spawn(`aws`, awsParms);

    let chunks = '';
    child.stdout.on('data', chunk => {
      chunks += chunk;
    });

    child.on('close', code => {
      // console.log(`child process exited with code ${code}`);
      let logStreams = JSON.parse(chunks);
      purgeStreams({ profile, logStreams, group, env, lambda, locale });
      resolve();
    });

    child.stderr.on('data', chunk => {
      console.error(chunk);
      reject();
    });
  });
}

function purgeStreams({ profile, logStreams, group, env, lambda }) {
  logStreams.logStreams.forEach((stream, index) => {
    const awsParms = [
      `--profile=${profile}`,
      'logs',
      'delete-log-stream',
      `--log-group-name=${group}`,
      `--log-stream-name=${stream.logStreamName}`
    ];

    console.log(`Purging events for ${group} -- ${stream.logStreamName}`);
    const child = spawn(`aws`, awsParms);

    let chunks = '';
    child.stdout.on('data', chunk => {
      chunks += chunk;
    });

    child.on('close', code => {
      // console.log(`child process exited with code ${code}`);
    });

    child.stderr.on('data', chunk => {
      console.error('' + chunk);
    });
  });
}
