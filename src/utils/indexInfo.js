
class IndexInfo{
    constructor(esClients) {
        this.esClients = esClients;
        this.mappings = {};
    }


    /*
    * If type is undefined, will return the first mapping for the index.
    * */
    getMapping(esName, indexName, type=undefined){
        return new Promise((resolve, reject) => {
            if(this.mappings[esName] && this.mappings[esName][indexName]){
                resolve(this.mappings[esName][indexName]);
            } else {
                const esClient = this.esClients[esName];
                esClient.indices.getMapping({ index: indexName, type: type}).then(result => {
                    if(!this.mappings[esName]){
                        this.mappings[esName] = {};
                    }
                    if(type !== undefined){
                        this.mappings[esName][indexName] = result[Object.keys(result)[0]].mappings[type];
                        resolve(this.mappings[esName][indexName]);
                    } else {
                        const mappings = result[Object.keys(result)[0]].mappings;
                        this.mappings[esName][indexName] = mappings.properties;
                            resolve(this.mappings[esName][indexName]);
                    }

                }, error => {
                    reject(error);
                });
            }

        });
    }

    getStatistics(esName, indexName, fieldName){
        return new Promise((resolve, reject) => {
            const esClient = this.esClients[esName];
            let statsQuery = {
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