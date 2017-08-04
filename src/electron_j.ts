
'use strict';
let path = require('path');
let os = require('os');
let net = require('net');
let cp = require('child_process');

function makeRandomHexString(length) {
    let chars = ['0', '1', '2', '3', '4', '5', '6', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    let result = '';
    for (let i = 0; i < length; i++) {
        let idx = Math.floor(chars.length * Math.random());
        result += chars[idx];
    }
    return result;
}
function generatePipeName() {
    let randomName = 'vscode-' + makeRandomHexString(5);
    if (process.platform === 'win32') {
        return '\\\\.\\pipe\\' + randomName + '-sock';
    }
    // Mac/Unix: use socket file
    return path.join(os.tmpdir(), randomName + '.sock');
}
function generatePatchedEnv(env, stdInPipeName, stdOutPipeName) {
    // Set the two unique pipe names and the electron flag as process env
    let newEnv = {};
    for (let key in env) {
        newEnv[key] = env[key];
    }
    newEnv['STDIN_PIPE_NAME'] = stdInPipeName;
    newEnv['STDOUT_PIPE_NAME'] = stdOutPipeName;
    return newEnv;
}
function fork(modulePath, args, options, callback) {
    let callbackCalled = false;
    let resolve = function (result) {
        if (callbackCalled) {
            return;
        }
        callbackCalled = true;
        callback(null, result);
    };
    let reject = function (err) {
        if (callbackCalled) {
            return;
        }
        callbackCalled = true;
        callback(err, null);
    };

    // Generate two unique pipe names
    let stdInPipeName = generatePipeName();
    let stdOutPipeName = generatePipeName();
    
    let newEnv = generatePatchedEnv(options.env || process.env, stdInPipeName, stdOutPipeName);
    let childProcess;
    let streamInfo = {writer : null,
                      reader: null} ;
    // Begin listening to stdout pipe
    let serverOut = net.createServer(function (stream) {
            streamInfo.writer = stream;
            if(streamInfo.reader !== null){
                resolve(streamInfo);
            }
    });
    
    serverOut.listen(stdOutPipeName);
    let serverIn = net.createServer(function (stream) {
            streamInfo.reader = stream;
            if(streamInfo.writer !== null ){
                resolve(streamInfo);
            }
    });
    serverIn.listen(stdInPipeName);


    let serverClosed = false;
    let closeServer = function () {
        if (serverClosed) {
            return;
        }
        serverClosed = true;
        serverOut.close();
        serverIn.close();
    };
    // Create the process
    childProcess = cp.spawn(modulePath, args, {
        silent: true,
        cwd: options.cwd,
        env: newEnv,
        execArgv: options.execArgv
    });
    childProcess.stdout.on('data', function(data) {
        console.log('stdout: ' + data);
    });
    childProcess.stderr.on('data', function(data) {
        console.log('stderr: ' + data);
    });
    childProcess.once('error', function (err) {
        closeServer();
        reject(err);
    });
    childProcess.once('exit', function (err) {
        closeServer();
        reject(err);
    });
}
exports.fork = fork;
