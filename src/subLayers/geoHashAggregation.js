const GeoHashUtil = require('../utils/geohashUtil');
const HitConverter = require('../utils/hitConverter');

const NAME = "geohash_aggregation";

/**
 * Geo Tile Sub Layer Class
 *
 * Custom Query Params:
 * - customAggregations: JSON object with sub aggregations
 * - tileConfig: an array of objects like { "precision": #, "offset": value } where # is a number 1-12
 *                   and value is a number that matches against the maxAllowableOffset coming from the client.
 *                   These fields are used to do aggregation queries and build aggregation hashes
 *
 * Configuration Object:
 *  - name: geohash_aggregation (required)
 *  - options:
 *      - aggregationFields: custom elastic search aggregations which will be used as return fields
 *      - tileConfig: An array of objects { precision: [1-12], value: offset_value} the precision coincides with tile
 *        level and offset_value comes from the client
 */
class GeoHashAggregation {
    name = NAME;

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
        let offsetSRFactor = 1;
        if(queryParams.inSR === 4326){
            offsetSRFactor = 0.00001;
        }
        let precision = tileConfig.find(tile => tile.offset * offsetSRFactor >= this.maxAllowableOffset)?.precision || 1;

        try {
            let aggField = this.indexConfig.geometryField;
            let updatedQuery = this.updateQuery(query, aggField, precision);
            let results = await this.queryAggregations(updatedQuery);
            featureCollection.metadata.geometryType = "Polygon";
            let returnFC = this.hitsToFeatureCollection(results, featureCollection, updatedQuery);

            return Promise.resolve(returnFC);
        } catch (e) {
            return Promise.reject(e);
        }

    }

    updateQuery(query, aggField, precision=0) {
        let size = this.indexConfig.maxResults;
        let hasGeoBoundingBox = false;
        query.body.query.bool.filter?.forEach(filter => {
            if(filter.geo_bounding_box) hasGeoBoundingBox = true;
        });

        if(!hasGeoBoundingBox){
            if(this.indexConfig.maxLayerInfoResults){
                size = this.indexConfig.maxLayerInfoResults;
            }
            if(this.aggConfig.options.defaultExtent){
                if(!query.body.query.bool.filter) query.body.query.bool.filter = [];
                query.body.query.bool.filter = [...query.body.query.bool.filter, this.aggConfig.options.defaultExtent];
            }
        }

        let geohashUtil = new GeoHashUtil(query.geometry, precision);
        if (geohashUtil.bbox) {
            geohashUtil.fitBoundingBoxToHashes();
            let topLeft = [aggregationBBox.xmin, aggregationBBox.ymax];
            let bottomRight = [aggregationBBox.xmax, aggregationBBox.ymin];
            topLeft[0] = Math.max(-180.0, topLeft[0]);
            bottomRight[0] = Math.min(180.0, bottomRight[0]);
            bottomRight[1] = Math.max(-90.0, bottomRight[1]);
            topLeft[1] = Math.min(90.0, topLeft[1]);
            query.body.query.bool.filter.forEach((filter, i) => {
                if(filter.geo_bounding_box){
                    query.body.query.bool.filter[i].geo_bounding_box[this.indexConfig.geometryField] = {
                        top_left: topLeft,
                        bottom_right: bottomRight
                    };
                } else if(filter.geo_shape){
                    query.body.query.bool.filter[i].geo_shape.shape.coordinates = [topLeft, bottomRight];
                }
            });

        }
        // add geohash aggregation.
        query.body.aggregations = {
            agg_grid: {
                geohash_grid: {
                    field: this.indexConfig.geometryField,
                    precision: precision,
                    size
                },
                aggs: this.aggregationFields
            }
        };
        query.body.size = 1;

        return query;
    }

    async queryAggregations(query) {
        try {
            console.log(JSON.stringify(query, null, 2))
            let searchResponse = await this.esClient.search(query);
            return Promise.resolve(searchResponse.body);
        } catch (e) {
            return Promise.reject(e);
        }


    }

    hitsToFeatureCollection(queryResults, featureCollection, esQuery) {
        let hitConverter = new HitConverter();
        for (let i = 0; i < queryResults.aggregations.agg_grid.buckets.length; i++) {
            let feature = hitConverter.featureFromGeoHashBucket(queryResults.aggregations.agg_grid.buckets[i],
                queryResults.hits.hits[0], this.indexConfig, this.mapping, esQuery.body.query.bool);
            if (feature) {
                featureCollection.features.push(feature);
            }
        }
        return featureCollection;
    }

    defaultReturnFields(mapping, indexConfig, customAggs) {
        let properties = {count: 0}; // always use a count
        const aggConfig = indexConfig.subLayers.find(subl => subl.name === NAME);
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

module.exports = {NAME, GeoHashAggregation};
