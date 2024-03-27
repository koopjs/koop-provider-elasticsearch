const appConfig = require('config');
const {Client} = require('@opensearch-project/opensearch');

function initializeOSClients() {
    let osClients = {};
    for(let osId in appConfig.osConnections){
        let opensearchInfo = appConfig.osConnections[osId];
        try {
            osClients[opensearchInfo.id] = new Client(opensearchInfo.connectConfig);
        } catch (e) {
            console.error(e);
        }
    }
    return osClients;
}

exports.initializeOSClients = initializeOSClients;
