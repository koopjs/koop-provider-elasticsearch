const appConfig = require('config');
const {Client} = require('@elastic/elasticsearch');
const fs = require('fs');

function initializeESClients() {
    let esClients = {};
    let envConfig = checkForEnvironmentVariables();
    for (let esId in appConfig.esConnections){
        let connectInfo = appConfig.esConnections[esId];
        const hosts = connectInfo.hosts;

        // optional security
        let esKey = connectInfo.key;
        let esCert = connectInfo.cert;
        let pfx = connectInfo.pfx;
        let passphrase = connectInfo.passphrase;

        if (null != pfx){
            pfx = fs.readFileSync(pfx);
        }

        if (null != esKey){
            esKey = fs.readFileSync(esKey);
        }

        if (null != esCert){
            esCert = fs.readFileSync(esCert);
        }

        if(envConfig[esId]){
            connectInfo.userName = envConfig[esId].user;
            connectInfo.password = envConfig[esId].password;
            connectInfo.apiKey = envConfig[esId].apiKey;
        }

        let esClient = new Client({
            node: hosts,
            auth: {
                username: connectInfo.userName,
                password: connectInfo.password,
                apiKey: connectInfo.apiKey
            },
            requestTimeout: 900000,
            keepAlive: false,
            ssl: {
                key: esKey,
                cert: esCert,
                pfx: pfx,
                passphrase: passphrase,
                rejectUnauthorized: false
            }
        });
        esClients[connectInfo.id] = esClient;
    }
    return esClients;
}


function checkForEnvironmentVariables(){
    try {
        let koopEnvKeys = process.env.KOOP_ENV_KEYS?.split("||");
        let koopEnvConfig = {};
        if(koopEnvKeys){
            koopEnvKeys.forEach(envConf => {
                let envInfo = envConf.split(',');
                koopEnvConfig[envInfo[0]] = {
                    user: envInfo[1],
                    password: envInfo[2],
                    apiKey: envInfo[3]
                };
            });
        }
        // console.dir(koopEnvConfig);// esId,user,password,apiKey||esId,user,password,apiKey
        return koopEnvConfig;
    } catch (e) {
        console.error(e);
    }
}

exports.initializeESClients = initializeESClients;
