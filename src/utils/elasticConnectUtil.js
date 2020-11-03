const appConfig = require('config');
const elasticsearch = require('elasticsearch');

function initializeESClients() {
    let esClients = {};
    for (let esId in appConfig.esConnections){
        let connectInfo = appConfig.esConnections[esId];
        let hostProtocol = connectInfo.protocol;
        let hosts = [];
        for (let i=0; i < connectInfo.hosts.length; i++){
            let host = hostProtocol + connectInfo.hosts[i];
            if(connectInfo.port) {
                host = host + ":" + connectInfo.port;
            }

            if (connectInfo.userName && connectInfo.password) {
                let hostJson = {
                    host: connectInfo.hosts[i],
                    auth: connectInfo.userName + ":" + connectInfo.password,
                    protocol: hostProtocol.split(":")[0],
                    port: connectInfo.port,
                    path: connectInfo.path
                };
                console.log(hostJson);
                hosts.push(hostJson);
            } else {
                console.log(host);
                hosts.push(host);
            }
        }

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

        let esClient = new elasticsearch.Client({
            hosts: hosts,
            log: 'error',
            requestTimeout: 900000,
            keepAlive: false,
            ssl: {
                key: esKey,
                cert: esCert,
                pfx: pfx,
                passphrase: passphrase
            }
        });
        esClients[connectInfo.id] = esClient;
    }
    return esClients;
}

exports.initializeESClients = initializeESClients;