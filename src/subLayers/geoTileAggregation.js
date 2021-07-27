const tilebelt = require('@mapbox/tilebelt');

const NAME = "geotile_aggregation";

/**
 * Geo Tile Sub Layer Class
 *
 * Custom Query Params:
 * - customAggregations: JSON object with sub aggregations
 * - tileConfig: an array of objects like { "precision": #, "offset": value } where # is a number 0-29
 *                   and value is a number that matches against the maxAllowableOffset coming from the client.
 *                   These fields are used to do aggregation queries and build aggregation tiles
 *
 * Configuration Object:
 *  - name: geotile_aggregation (required)
 *  - options:
 *      - aggregationFields: custom elastic search aggregations which will be used as return fields
 *      - tileConfig: An array of objects { precision: [0-29], value: offset_value} the precision coincides with tile
 *        level and offset_value comes from the client
 */
class GeoTileAggregation {
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
        this.maxAllowableOffset = queryParams.maxAllowableOffset || 0;
        this.aggregationFields = queryParams.customAggregations || this.aggConfig.options.aggregationFields;
        let tileConfig = queryParams.tileConfig || this.aggConfig.options.tileConfig;
        let precision = tileConfig.find(tile => tile.offset >= this.maxAllowableOffset).precision || 0;

        try {
            let aggField = this.indexConfig.geometryField;
            let updatedQuery = this.updateQuery(query, aggField, precision);
            let results = await this.queryAggregations(updatedQuery);
            featureCollection.metadata.geometryType = "Polygon";
            let returnFC = this.hitsToFeatureCollection(results, featureCollection, aggField);

            return Promise.resolve(returnFC);
        } catch (e) {
            return Promise.reject(e);
        }

    }

    updateQuery(query, aggField, precision=0) {
        let aggs = {
            agg: {
                geotile_grid: {field: aggField, precision, size: this.indexConfig.maxResults},
                aggs: this.aggregationFields
            }
        };
        query.body.aggs = aggs;
        query.body.size = 0;

        return query;
    }

    async queryAggregations(query) {
        try {
            // console.log(JSON.stringify(query, null, 2))
            let searchResponse = await this.esClient.search(query);
            return Promise.resolve(searchResponse.body);
        } catch (e) {
            return Promise.reject(e);
        }


    }

    hitsToFeatureCollection(queryResults, featureCollection, aggField) {
        let totalHits = isNaN(queryResults.hits.total) ? queryResults.hits.total.value : queryResults.hits.total;
        let buckets = queryResults.aggregations.agg.buckets;
        for (let i = 0; i < buckets.length; i++) {
            let bucket = buckets[i];
            let feature = {
                type: 'Feature',
                properties: {}
            };
            let bucketKeys = Object.keys(bucket);
            for (let j = 0; j < bucketKeys.length; j++) {
                let key = bucketKeys[j];
                if (key === 'key') {
                    let tileKey = bucket[key];
                    // create shape
                    let zxy = tileKey.split('/').map(val => Number(val));
                    feature.geometry = tilebelt.tileToGeoJSON([zxy[1],zxy[2],zxy[0]]);//this.getTilePolygon(...zxy);
                    feature.properties.OBJECTID = Number(zxy.join('')) % 2147483647;
                } else if (key === 'doc_count') {
                    feature.properties.count = bucket[key];
                } else {
                    feature.properties[key] = bucket[key].value;
                }
            }
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

module.exports = {NAME, GeoTileAggregation};
