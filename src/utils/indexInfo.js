
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
                        this.mappings[esName][indexName] = result.body[Object.keys(result.body)[0]].mappings[type];
                        resolve(this.mappings[esName][indexName]);
                    } else {
                        const mappings = result.body[Object.keys(result.body)[0]].mappings;
                        this.mappings[esName][indexName] = mappings.properties;
                        resolve(this.mappings[esName][indexName]);
                    }

                }, error => {
                    reject(error);
                });
            }

        });
    }

    getFields(mapping, idField, returnFields, editable = false){
        let fields = [];
        const fieldTemplate = {
            name: "name",
            type: "type",
            alias: "alias",
            sqlType: "sqlTypeOther",
            domain: null,
            editable,
            defaultValue: null
        };

        let keys = Object.keys(mapping);
        keys = keys.filter(key => returnFields.includes(key));
        keys.forEach(key => {
            let field = {...fieldTemplate};
            field.name = field.alias = key;
            if(key === idField){
                field.type = "Integer";
                field.sqlType = "sqlTypeInteger";
                fields.push(field);
            } else if(mapping[key].type !== "geo_point" && mapping[key].type !== "geo_shape") {
                switch (mapping[key].type) {
                    case "keyword":
                    case "text":
                        field.type = "String";
                        field.sqlType = "sqlTypeNVarchar";
                        field.length = 256;
                        break;
                    case "integer":
                        field.type = "Integer";
                        field.sqlType = "sqlTypeInteger";
                        break;
                    case "float":
                        field.type = "Double";
                        field.sqlType = "sqlTypeFloat";
                        break;
                    case "date":
                        field.type = "Date";
                        field.sqlType = "sqlTypeOther";
                        break;
                }
                fields.push(field);
            }
        });

        return fields;
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
                resolve(result.body.aggregations.fieldstats);
            }, error => {
                reject(error);
            });
        });
    }
}

module.exports = IndexInfo;
