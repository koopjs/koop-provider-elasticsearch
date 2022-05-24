const h3 = require('h3-js');
const polygonSplitter = require('polygon-splitter');

const NAME = "geohex_aggregation";

/**
 * Geo Hex Sub Layer Class
 *
 * Custom Query Params:
 * - customAggregations: JSON object with sub aggregations
 * - hexConfig:
 *
 * Configuration Object:
 *  - name: geohex_aggregation (required)
 *  - options:
 *      - aggregationFields: custom elastic search aggregations which will be used as return fields
 *      - hexConfig: An array of objects { resolution: [0-15], offset: offset_value} the precision coincides with tile
 *        level and offset_value comes from the client
 */
class GeoHexAggregation {
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
        let hexConfig = queryParams.hexConfig || this.aggConfig.options.hexConfig;
        let offsetSRFactor = 1;
        if(queryParams.inSR === 4326){
            offsetSRFactor = 0.00001;
        }
        let resolution = hexConfig.find(hex => hex.offset * offsetSRFactor >= this.maxAllowableOffset)?.resolution || 0;

        try {
            let aggField = this.indexConfig.geometryField;
            let updatedQuery = this.updateQuery(query, aggField, resolution);
            let results = await this.queryAggregations(updatedQuery);
            featureCollection.metadata.geometryType = "MultiPolygon";
            let returnFC = this.hitsToFeatureCollection(results, featureCollection, aggField);

            return Promise.resolve(returnFC);
        } catch (e) {
            return Promise.reject(e);
        }

    }

    updateQuery(query, aggField, precision=0) {
        let aggs = {
            agg: {
                geohex_grid: {field: aggField, precision, size: this.indexConfig.maxResults},
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
        featureCollection.count = totalHits;
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
                    let h3Value = bucket[key];
                    // create shape
                    // let zxy = tileKey.split('/').map(val => Number(val));
                    let boundaryPoints = h3.h3ToGeoBoundary(h3Value);
                    boundaryPoints.forEach(pointArray => pointArray.reverse());
                    feature.geometry = {
                        type: "Polygon",
                        coordinates: [[...boundaryPoints, boundaryPoints[0]]]
                    };
                    feature.geometry = this._splitPolygon(feature.geometry);
                    feature.properties.OBJECTID = h3Value;
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

    _splitPolygon(polygon){
        let xmin=180, xmax=-180;
        polygon.coordinates[0].forEach(point => {
            xmin = Math.min(xmin, point[0]);
            xmax = Math.max(xmax, point[0]);
        });
        if(xmin < 0 && xmax > 0){
            // shift all points up 180
            const coordinates = [polygon.coordinates[0].map(point => [point[0] > 0 ? point[0] - 180  : point[0] + 180, point [1]])];
            // split at 0
            const splitFeature = polygonSplitter({type: "Polygon", coordinates}, {
                type: "LineString",
                coordinates: [[0, -90], [0, 90]]
            });
            if(!splitFeature.geometry){
                // doesn't cross the antimeridian
                return polygon;
            }
            splitFeature.geometry.coordinates[0][0] = this._shiftPolygonRing(splitFeature.geometry.coordinates[0][0]);
            splitFeature.geometry.coordinates[1][0] = this._shiftPolygonRing(splitFeature.geometry.coordinates[1][0]);
            return splitFeature.geometry
        } else {
            return polygon;
        }
    }

    _shiftPolygonRing(ring){
        let isPositive = true;
        ring.forEach(point => {
            if(point[0] < 0){
                isPositive = false;
            }
        });

        if(isPositive){
            return ring.map(point => [point[0] - 180, point[1]]);
        } else {
            return ring.map(point => [point[0] + 180, point[1]]);
        }
    }
}

module.exports = {NAME, GeoHexAggregation};
