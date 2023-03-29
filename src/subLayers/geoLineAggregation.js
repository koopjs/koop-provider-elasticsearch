
const NAME = "geoline_aggregation";

class GeoLineAggregation {
    name = NAME;

    /**
     *
     * @param options
     * @returns {Promise<FeatureCollection>}
     */
    async getFeatures(options) {
        this.indexConfig = options.indexConfig;
        this.aggConfig = this.indexConfig.subLayers.find(agg => agg.name === NAME);

        if(!this.aggConfig) {
            // this shouldn't have even been called, return the feature collection
            return Promise.resolve(options.featureCollection);
        }
        let query = options.query;
        this.mapping = options.mapping;
        this.esClient = options.esClient;
        let featureCollection = options.featureCollection;
        let queryParams = options.queryParameters;
        this.aggregationFields = queryParams.customAggregations || this.aggConfig.options.aggregationFields;

        try {
            let aggField = this.indexConfig.geometryField;
            let updatedQuery = this.updateQuery(query);
            let results = await this.queryAggregations(updatedQuery);
            featureCollection.metadata.geometryType = "MultiLineString";
            let returnFC = this.hitsToFeatureCollection(results, featureCollection, aggField);
            return Promise.resolve(returnFC);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    updateQuery(query) {
        if(undefined === query.body.query.bool.filter){
            if(this.aggConfig.options.defaultExtent){
                query.body.query.bool.filter = [this.aggConfig.options.defaultExtent];
            }
        }
        let aggs = {};
        aggs.agg = {
            terms: {field: this.aggConfig.options.termField, size: this.indexConfig.maxResults}
        };

        if(!this.aggConfig.options.ignoreGeoBoundary){
            aggs.agg.aggs = {
                line: {
                    geo_line: {
                        point: { field: this.indexConfig.geometryField },
                        sort: { field: this.aggConfig.options.sortField }
                    }
                },
                ...this.aggregationFields
            }
        }
        query.body.aggs = aggs;
        query.body.size = 0;

        return query;
    }

    async queryAggregations(query) {
        try {
            console.log(JSON.stringify(query, null, 2))
            let searchResponse = await this.esClient.search(query);
            if(this.aggConfig.options.ignoreGeoBoundary) {
                searchResponse = await this.performUnboundedSearch(searchResponse, query);
            }
            return Promise.resolve(searchResponse.body);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    async performUnboundedSearch(initialResponse, query){
        query.body.query.bool.filter = undefined;
        let terms = {};
        terms[this.aggConfig.options.termField] = initialResponse.body.aggregations.agg.buckets.map(bucket => bucket.key);
        query.body.query.bool.must.push({terms});
        query.body.aggs.agg.aggs = {
            line: {
                geo_line: {
                    point: { field: this.indexConfig.geometryField },
                    sort: { field: this.aggConfig.options.sortField },
                    sort_order: this.aggConfig.options.sortOrder || "ASC",
                    include_sort: true
                }
            },
            ...this.aggregationFields
        }

        try {
            let searchResponse = await this.esClient.search(query);
            return Promise.resolve(searchResponse);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    hitsToFeatureCollection(queryResults, featureCollection) {
        let buckets = queryResults.aggregations.agg.buckets;
        for (let i = 0; i < buckets.length; i++) {
            let bucket = buckets[i];
            let feature = {
                type: 'Feature',
                properties: {
                    count: bucket.doc_count
                },
                geometry: bucket.line.geometry
            };
            feature.properties[this.aggConfig.options.termField] = bucket.key;

            Object.keys(bucket).forEach( bucket_key => {
                if(!["key", "doc_count", "line"].includes(bucket_key)) {
                    let prop = bucket[bucket_key];
                    if (prop.hasOwnProperty("value")) {
                        feature.properties[bucket_key] = prop.value;
                    } else if(prop.hasOwnProperty("buckets")) {
                        feature.properties[bucket_key] = prop.buckets[0]?.key;
                    }
                }
            });

            featureCollection.features.push(feature);
        }
        return featureCollection;
    }

    defaultReturnFields(mapping, indexConfig, customAggs) {
        let properties = {count: 0}; // always use a count
        const aggConfig = indexConfig.subLayers.find(agg => agg.name === NAME);
        if (!aggConfig) {
            return properties;
        }

        let aggs = customAggs || aggConfig.options.aggregationFields || {};

        let aggFieldNames = Object.keys(aggs);

        aggFieldNames.forEach(fieldName => {
            properties[fieldName] = 0;
        });
        return properties;
    }
}





module.exports = {NAME, GeoLineAggregation};
