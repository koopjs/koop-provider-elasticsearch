
class IndexInfo{
    constructor(esClients){
        this.esClients = esClients;
    }

    /*
    * If type is undefined, will return the first mapping for the index.
    * */
    getMapping(esName, indexName, type=undefined){
        return new Promise((resolve, reject) => {
            var esClient = this.esClients[esName];
            esClient.indices.getMapping({ index: indexName, type: type}).then(result => {
                if(type !== undefined){
                    resolve(result[Object.keys(result)[0]].mappings[type]);
                } else {
                    var mappings = result[Object.keys(result)[0]].mappings;
                    resolve(mappings[Object.keys(mappings)[0]]);
                }

            }, error => {
                reject(error);
            });
        });
    }

    getStatistics(esName, indexName, fieldName){
        return new Promise((resolve, reject) => {
            var esClient = this.esClients[esName];
            var statsQuery = {
                index: indexName,
                body: {
                    size: 0,
                    aggs: {
                        fieldstats: {
                            stats: { field: fieldName }
                        }
                    }
                }
            };
            esClient.search(statsQuery).then(result => {
                resolve(result.aggregations.fieldstats);
            }, error => {
                reject(error);
            });
        });
    }
}

module.exports = IndexInfo;