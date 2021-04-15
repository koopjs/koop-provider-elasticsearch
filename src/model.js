'use strict';
const proj4 = require('proj4');
const proj = proj4('GOOGLE', 'WGS84');
const http = require('http');
const HitConverter = require('./utils/hitConverter');
const GeoHashUtil = require('./utils/geohashUtil');
const IndexInfo = require('./utils/indexInfo');
const WhereParser = require('./utils/whereParser');
const distanceConstants = require('./utils/distanceConstants');
const Logger = require('@koopjs/logger');
const config = require('config');
const logger = new Logger(config);
const moment = require('moment');
const rewind = require('@mapbox/geojson-rewind');
const ElasticConnectUtil = require('./utils/elasticConnectUtil');

module.exports = function (koop) {
    this.customSymbolizers = [];
    this.customAggregations = [];
    this.customIndexNameBuilder = undefined;

    this.setTimeExtent = function (featureCollection) {
        featureCollection.metadata.timeInfo.timeExtent = [this.startFieldStats.min, this.endFieldStats.max];
    };

    this.getTileOffset = function (z) {
        // Emulate the offset that would come from a feature service request with a minimum of 4.864
        // Level 22 has 0.019 meters per pixel and this increases by a factor of 2 as the tile level goes down
        return Math.max(4.864, 0.019 * Math.pow(2, 22 - parseInt(z)));
    }

    this.getData = async function (req, callback) {
        if (!this.esClients) {
            this.esClients = ElasticConnectUtil.initializeESClients();
            this.esConfig = null;
            this.indexInfo = new IndexInfo(this.esClients);
        }
        const serviceName = req.params.id;
        const esId = req.params.host;
        let layerId = req.params.layer;
        this.esConfig = config.esConnections[esId];
        const indexConfig = this.esConfig.indices[serviceName];
        let extent = indexConfig.extent;
        let customSymbolizer = this.getCustomSymbolizer(indexConfig);

        if (!extent) {
            // use global extent by default
            extent = {
                'xmin': -20037507.067161843,
                'ymin': -20037507.067161843,
                'xmax': 20037507.067161843,
                'ymax': 20037507.067161843,
                'spatialReference': {
                    'cs': 'pcs',
                    'wkid': 102100
                }
            };
        }

        if (req.url.includes('VectorTileServer')) {
            layerId = indexConfig.vectorLayerID ? indexConfig.vectorLayerID.toString() : "0";
            if (req.params.x && req.params.y && req.params.z) {
                const tileBBox = getTileBBox(req, customSymbolizer);
                req.query.geometry = tileBBox;
                req.query.maxAllowableOffset = this.getTileOffset(req.params.z);
                //TODO: Investigate using the bbox extent (must be in web mercator)
                extent = undefined;
            }
        } else {
            extent = undefined;
        }
        if (!indexConfig) {
            logger.warn("No Layer with name " + serviceName + " is configured.");
            callback(new Error("No Layer with name " + serviceName + " is configured."), "No Layer with name " + serviceName + " is configured.");
            return;
        }

        const aggServiceConfig = config.aggServer;
        let featureCollection = {
            type: 'FeatureCollection',
            features: [],
            metadata: {
                name: serviceName,
                maxRecordCount: indexConfig.maxResults,
                extent: extent
            }
        };

        if (customSymbolizer) {
            featureCollection.metadata.vt = customSymbolizer.vtStyle();
        } else if (indexConfig.vectorStyle) {
            featureCollection.metadata.vt = indexConfig.vectorStyle;
        }

        // For Time Aware Layers
        if (indexConfig.timeInfo) {
            featureCollection.metadata.timeInfo = indexConfig.timeInfo;
            // if time extent is not present in config, we'll need to generate it at some point.
            if ((indexConfig.timeInfo.timeExtent && indexConfig.timeInfo.timeExtent.length === 2) ||
                (this.startFieldStats !== undefined && this.endFieldStats !== undefined)) {
                if (this.startFieldStats !== undefined && this.endFieldStats !== undefined) {
                    this.setTimeExtent(featureCollection);
                }
            } else {
                // get the time extent from the index
                try {
                    let result = await this.indexInfo.getStatistics(esId, indexConfig.index, indexConfig.timeInfo.startTimeField);
                    this.startFieldStats = result;
                    if (indexConfig.timeInfo.startTimeField !== indexConfig.timeInfo.endTimeField) {
                        this.endFieldStats = await this.indexInfo.getStatistics(esId, indexConfig.index, indexConfig.timeInfo.endTimeField);
                        this.setTimeExtent(featureCollection);
                    } else {
                        this.endFieldStats = result;
                        this.setTimeExtent(featureCollection);
                    }
                } catch (e) {
                    console.error(e);
                    callback(e, featureCollection);
                }
            }
        }

        if (indexConfig.idField) {
            featureCollection.metadata.idField = indexConfig.idField;
        }

        let query = req.query;

        // validate bounds here
        if (query.geometry && !query.distance && !validateBounds(query.geometry)) {
            callback(null, featureCollection);
            return;
        }

        // logger.debug(JSON.stringify(esQuery));
        if (layerId === "0" || undefined === layerId) {
            try {
                let mapping = await this.indexInfo.getMapping(esId, indexConfig.index, indexConfig.mapping);

                let maxRecords = query.resultRecordCount;
                if (!maxRecords || maxRecords > indexConfig.maxResults) {
                    maxRecords = indexConfig.maxResults;
                }

                if (query.returnCountOnly && query.returnCountOnly === true) {
                    let countQuery = buildESQuery(indexConfig, query, {
                        mapping,
                        customIndexNameBuilder: this.customIndexNameBuilder
                    });
                    this.esClients[esId].count(countQuery).then(function (resp) {
                        logger.debug("count resp:", resp);
                        featureCollection.count = resp.count;
                        callback(null, featureCollection);
                    }, function (err) {
                        logger.error(err.message);
                        callback(err, featureCollection);
                    });
                    return;
                }

                let esQuery = buildESQuery(indexConfig, query, {
                    maxRecords,
                    mapping,
                    customIndexNameBuilder: this.customIndexNameBuilder
                });

                // check for join shapes
                let useJoinShapes = !!indexConfig.shapeIndex;
                let joinShapeHits = null;
                let hitConverter = new HitConverter(customSymbolizer);

                if (useJoinShapes) {
                    let joinConfig = this.esConfig.shapeIndices[indexConfig.shapeIndex.name];
                    joinShapeHits = await queryJoinShapes(indexConfig.shapeIndex.name, null, joinConfig, this.esClients[esId], query);
                    hitConverter.setJoinShapes(joinShapeHits, joinConfig);

                    let joinValues = joinShapeHits.map(hit => {
                        let joinPath = joinConfig.joinField.split('.');
                        let joinVal = hit._source[joinPath[0]];
                        for (let i = 1; i < joinPath.length; i++) {
                            if (joinPath[i] !== 'keyword') { // keyword is a property of a field and not a field itself
                                joinVal = joinVal[joinPath[i]];
                            }
                        }
                        return joinVal;
                    });

                    // update the query with the valid join values
                    esQuery = updateQueryWithJoinValues(esQuery, joinValues, indexConfig);
                }
                // logger.debug(esQuery);
                let searchResponse = await this.esClients[esId].search(esQuery);
                let totalHits = isNaN(searchResponse.hits.total) ? searchResponse.hits.total.value : searchResponse.hits.total;
                logger.debug("Returned " + searchResponse.hits.hits.length + " Features out of a total of " + totalHits);

                for (let i = 0; i < searchResponse.hits.hits.length; i++) {
                    try {
                        let feature = hitConverter.featureFromHit(searchResponse.hits.hits[i], indexConfig,
                            {
                                mapping: mapping,
                                maxAllowableOffset: query.maxAllowableOffset
                            });
                        if (feature) {
                            featureCollection.features.push(feature);
                        }
                    } catch (e) {
                        logger.warn(`Failed to parse ${JSON.stringify(searchResponse.hits.hits[i])} with following error:`);
                        logger.error(e);
                    }

                }

                logger.debug(`Total parsed features: ${featureCollection.features.length}`);
                //logger.debug("Counts were from query: " + JSON.stringify(esQuery.body.query));

                // if an result offset is specified use it, otherwise the offset is 0
                let offset = query.resultOffset;
                if (!offset) {
                    offset = 0;
                }

                // Set the returned features limit flags
                if ((totalHits - offset) > maxRecords) {
                    logger.verbose(`(totalHits - offset) > maxRecords: ${(totalHits - offset) > maxRecords}`);

                    // Below both of these flags need to be set. Setting limitExceeded means the limit we determined
                    // was exceeded, and filtersApplied.limit tells featureserver plugin that we are limiting the features
                    // so that it will take into account the limitExceeded flag we set in metadata.
                    featureCollection.metadata.limitExceeded = true;
                    featureCollection.filtersApplied = {
                        limit: true
                    };
                }

                // This does not appear to fix the "requested provider has no "idField" assignment. This can cause errors in ArcGIS clients" error.
                //featureCollection.metadata.idField = "OBJECTID";

                if (!featureCollection.filtersApplied) {
                    featureCollection.filtersApplied = {};
                }

                // in cases where there is a mapping of the return values we direct the featureserver to not filter
                // the values based on the query parameters (since the values don't match up until after mapping) by
                // telling the featureserver that the where clause filtering has already been applied.
                //if (true || indexConfig.mapReturnValues) {
                // if (indexConfig.mapReturnValues) {
                //     featureCollection.filtersApplied.where = true;
                // }

                featureCollection.filtersApplied.where = true;

                // we have already filtered the geometries using the incoming request. there are bugs regarding
                // filtering by geometry, so we can turn it off and use elastic search's filtering.

                featureCollection.filtersApplied.geometry = true;
                // featureCollection.filtersApplied.projection = true;

                if (indexConfig.geometryType === "geo_point" && indexConfig.allowMultiPoint === true) {
                    featureCollection.metadata.geometryType = "MultiPoint";
                } else if (featureCollection.features.length && featureCollection.features[0].geometry !== undefined) {
                    featureCollection.metadata.geometryType = featureCollection.features[0].geometry.type;
                } else {
                    featureCollection.metadata.geometryType = indexConfig.geometryType;
                }

                // returnCountOnly only set. This appears to trigger the count response in featureserver
                featureCollection.count = searchResponse.hits.hits.length;

                // if there an offset
                if (offset > 0) {
                    featureCollection.filtersApplied.offset = true;
                }

                if (indexConfig.reversePolygons) {
                    featureCollection = rewind(featureCollection);
                }

                let returnObject = {layers: [featureCollection]};
                if (indexConfig.aggregations && indexConfig.aggregations.length && undefined === layerId) {
                    const aggLayers = buildDefaultAggLayers(indexConfig, mapping, this.customAggregations);
                    returnObject.layers = returnObject.layers.concat(aggLayers);

                    callback(null, returnObject);
                } else {
                    callback(null, featureCollection);
                }
            } catch (error) {
                logger.error(error);
                callback(error, featureCollection);
            }
            // Handle getMapping promise rejections so browser gets an error response instead of hanging


        } else if (indexConfig.aggregations && indexConfig.aggregations.length >= parseInt(layerId)) {
            const aggType = indexConfig.aggregations[parseInt(layerId) - 1];
            if (aggType.name == 'geohash') {
                this.indexInfo.getMapping(esId, indexConfig.index, indexConfig.mapping).then(mapping => {

                    let maxRecords = query.resultRecordCount;
                    if (!maxRecords || maxRecords > indexConfig.maxResults) {
                        maxRecords = indexConfig.maxResults;
                    }
                    let geohashUtil = new GeoHashUtil(query.geometry, query.maxAllowableOffset);
                    if (geohashUtil.bbox) {
                        geohashUtil.fitBoundingBoxToHashes();
                    }
                    let esQuery = buildESQuery(indexConfig, query, {
                        maxRecords,
                        mapping,
                        aggregationBBox: geohashUtil.bbox,
                        customIndexNameBuilder: this.customIndexNameBuilder
                    });

                    queryHashAggregations(indexConfig, mapping, esQuery, geohashUtil, this.esClients[esId]).then(result => {
                        featureCollection.features = result;
                        featureCollection.metadata = {
                            name: indexConfig.index + "_geohash",
                            maxRecordCount: 10000
                        };
                        featureCollection.filtersApplied = {where: true};
                        featureCollection.filtersApplied.geometry = true;
                        callback(null, featureCollection);
                    }).catch(error => {
                        logger.error(error);
                        callback(error, featureCollection);
                    });

                }).catch(error => {
                    // Handle getMapping promise rejections so browser gets an error response instead of hanging
                    logger.error(error);
                    callback(error, featureCollection);
                });
            } else {
                let customAggregation = this.customAggregations.find(agg => agg.name === aggType.name);

                if (customAggregation) {
                    this.indexInfo.getMapping(esId, indexConfig.index, indexConfig.mapping).then(mapping => {
                        let maxRecords = query.resultRecordCount;
                        let esQuery = buildESQuery(indexConfig, query, {
                            maxRecords,
                            mapping,
                            customIndexNameBuilder: this.customIndexNameBuilder
                        });
                        featureCollection = customAggregation.getAggregationFeatures({
                            indexConfig, mapping, query: esQuery, esClient: this.esClients[esId], featureCollection,
                            offset: req.query.maxAllowableOffset
                        }).then(aggregatedFeatureCollection => {
                            callback(null, aggregatedFeatureCollection);
                        }).catch(error => {
                            logger.error(error);
                            callback(error, featureCollection);
                        });
                    }).catch(error => {
                        // Handle getMapping promise rejections so browser gets an error response instead of hanging
                        logger.error(error);
                        callback(error, featureCollection);
                    });

                }
            }
        }
    }
    ;

    this.registerCustomIndexNameBuilder = function (indexer) {
        this.customIndexNameBuilder = indexer;
    }

    this.registerCustomSymbolizer = function (symbolizer) {
        this.customSymbolizers.push(symbolizer);
    }

    this.registerCustomAggregation = function (aggregation) {
        this.customAggregations.push(aggregation);
    }

    this.getCustomSymbolizer = function (indexConfig = {}) {
        return this.customSymbolizers.find(symbolizer => {
            return symbolizer.name === indexConfig.customSymbolizer
        });
    }


    function queryHashAggregations(indexConfig, mapping, esQuery, geohashUtil, esClient) {
        return new Promise((resolve, reject) => {
            // just aggs, no need to get documents back
            esQuery.body.size = 1;

            esQuery.body.aggregations = {
                agg_grid: {
                    geohash_grid: {
                        field: indexConfig.geometryField,
                        precision: geohashUtil.precision
                    }
                }
            };

            esClient.search(esQuery).then(response => {
                let geohashFeatures = [];
                let hitConverter = new HitConverter();
                for (let i = 0; i < response.aggregations.agg_grid.buckets.length; i++) {
                    let feature = hitConverter.featureFromGeoHashBucket(response.aggregations.agg_grid.buckets[i],
                        response.hits.hits[0], indexConfig, mapping, esQuery.body.query.bool);
                    if (feature) {
                        geohashFeatures.push(feature);
                    }
                }
                resolve(geohashFeatures);
            }).catch(error => {
                logger.error(error);
                reject(error);
            })

        });
    }

    function tile2long(x, z) {
        return (x / Math.pow(2, z) * 360 - 180);
    }

    function tile2lat(y, z) {
        const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
        return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
    }

    function getTileBBox(request, customSymbolizer) {
        let x = parseInt(request.params.x);
        let y = parseInt(request.params.y);
        let z = parseInt(request.params.z);
        let buffer = customSymbolizer ? customSymbolizer.tileBuffer : 0;
        let xmin = tile2long(x, z);
        let xmax = tile2long(x + 1, z);
        let ymin = tile2lat(y + 1, z);
        let ymax = tile2lat(y, z);
        let ydiff = ymax - ymin;
        let xdiff = xmax - xmin;
        xmin = xmin - Math.abs(xdiff * buffer);
        ymin = ymin - Math.abs(ydiff * buffer);
        xmax = xmax + Math.abs(xdiff * buffer);
        ymax = ymax + Math.abs(ydiff * buffer);
        return {xmin, ymin, xmax, ymax};
    }

    async function queryJoinShapes(joinIndexName, joinValues, joinConfig, esClient, requestQuery) {
        let queryBody = {
            index: joinIndexName,
            body: {
                query: {
                    bool: {
                        must: []
                    }
                }
            },
            size: 1000
        };
        if (joinConfig.maxResults) {
            queryBody.size = joinConfig.maxResults;
        }
        if (joinValues) {
            let valueTerms = {terms: {}};
            valueTerms.terms[joinConfig.joinField] = joinValues;
            queryBody.body.query.bool.must.push(valueTerms);
        }

        let geoFilter = buildGeoFilter(requestQuery, joinConfig);
        if (geoFilter) {
            queryBody.body.query.bool.filter = [];
            queryBody.body.query.bool.filter.push(geoFilter);
        }

        try {
            logger.debug(JSON.stringify(queryBody, null, 2));
            let response = await esClient.search(queryBody);
            let shapeHits = response.hits.hits;
            return Promise.resolve(shapeHits);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function updateQueryWithJoinValues(queryBody, joinValues, indexConfig) {
        let valueTerms = {terms: {}};
        valueTerms.terms[indexConfig.shapeIndex.joinField] = joinValues;
        queryBody.body.query.bool.must.push(valueTerms);
        return queryBody;
    }

    function queryHexAggregations(indexConfig, aggServerConfig, query, callback) {
        queryAggregations(indexConfig, aggServerConfig, query, "geo_hex", (result) => {
            callback(result);
        });
    }

    function queryGridAggregations(indexConfig, aggServerConfig, query, callback) {
        queryAggregations(indexConfig, aggServerConfig, query, "geo_grid", (result) => {
            callback(result);
        });
    }

    function queryPolygonAggregations(indexConfig, aggServerConfig, query, aggField, callback) {
        queryAggregations(indexConfig, aggServerConfig, query, aggField, (result) => {
            callback(result);
        });
    }

    function queryAggregations(indexConfig, aggServerConfig, query, aggType, callback) {
        var bbox = {xmin: -180, xmax: 180, ymin: -90, ymax: 90};
        if (query.geometry) {
            bbox = JSON.parse(query.geometry);
            if (bbox.rings !== undefined) {
                bbox.xmin = 180.0;
                bbox.xmax = -180.0;
                bbox.ymax = -90.0;
                bbox.ymin = 90.0;
                for (var ringIdx = 0; ringIdx < bbox.rings[0].length; ringIdx++) {
                    bbox.xmin = Math.min(bbox.xmin, bbox.rings[0][ringIdx][0]);
                    bbox.xmax = Math.max(bbox.xmax, bbox.rings[0][ringIdx][0]);
                    bbox.ymin = Math.min(bbox.ymin, bbox.rings[0][ringIdx][1]);
                    bbox.ymax = Math.max(bbox.ymax, bbox.rings[0][ringIdx][1]);
                }
            }
        }
        if (undefined !== bbox.spatialReference && bbox.spatialReference.wkid === 102100) {
            var topLeft = proj.forward([bbox.xmin, bbox.ymax]);
            var bottomRight = proj.forward([bbox.xmax, bbox.ymin]);
            bbox.xmin = topLeft[0];
            bbox.ymax = topLeft[1];
            bbox.xmax = bottomRight[0];
            bbox.ymin = bottomRight[1];
        }


        const options = {
            hostname: aggServerConfig.hostname,
            port: aggServerConfig.port,
            path: '/algorithm/execute',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        if (undefined !== aggServerConfig.path) {
            options.path = aggServerConfig.path + options.path;
        }
        var resultJson = '';
        var request = http.request(options, (res) => {
            res.on('data', (chunk) => {
                resultJson += chunk;
            });
            res.on('end', () => {
                callback(resultJson);
            });
            res.on('error', (error) => {
                console.error(error);
                logger.error(error);
            });
        });


        request.write(JSON.stringify({
            data_source: indexConfig.index,
            bounding_box: bbox,
            aggregate_by: aggType,
            algorithm: "feature_count",
            return_features: true
        }));
        request.end();
    }

    function buildESQuery(indexConfig, query, options) {
        let maxRecords = options.maxRecords;
        let mapping = options.mapping;
        let aggregationBBox = options.aggregationBBox;
        let customIndexNameBuilder = options.customIndexNameBuilder;
        var rawSearchKey = 'rawElasticQuery';
        let indexName = indexConfig.index;
        if (indexConfig.hasOwnProperty("indexNameConfig")) {
            if (customIndexNameBuilder) {
                indexName = customIndexNameBuilder(indexConfig, query);
            }
        }
        var esQuery = {
            index: indexName,
            ignore_unavailable: true,
            body: {
                query: {
                    bool: {
                        must: []
                    }
                }
            }
        };

        // add collapse
        if (indexConfig.collapse) {
            esQuery.body.collapse = indexConfig.collapse;
        }

        // add sorting
        if (indexConfig.sort) {
            esQuery.body.sort = indexConfig.sort;
        }

        if (indexConfig.geometryField && !indexConfig.isTable) {
            esQuery.body.query.bool.must.push({exists: {field: indexConfig.geometryField}});
        }

        // time aware data
        if (query.time && indexConfig.timeInfo) {
            let timeVals = query.time.split(',');
            if (timeVals.length === 2) {
                let startTimeRange = {
                    range: {}
                };
                startTimeRange.range[indexConfig.timeInfo.startTimeField] = {
                    gte: timeVals[0]
                };

                let endTimeRange = {
                    range: {}
                };
                endTimeRange.range[indexConfig.timeInfo.endTimeField] = {
                    lte: timeVals[1]
                };

                esQuery.body.query.bool.must.push(startTimeRange);
                esQuery.body.query.bool.must.push(endTimeRange);
            }
        }

        // Only set size attribute if maxRecords was passed in.
        if (maxRecords) {
            esQuery.body.size = maxRecords;
        }

        if (query.where && query.where.indexOf(rawSearchKey) > -1) {
            logger.debug("Original Where Clause: \n" + query.where);
            //get a substring after the search key, then get everything to the right of the first equal sign and left
            //of the next &.  This should be the raw elastic query object
            var elasticQueryString = query.where.slice(query.where.indexOf(rawSearchKey)).split(' AND')[0];
            var elasticQueryVal = elasticQueryString.split('=')[1];
            if (elasticQueryVal[elasticQueryVal.length - 1] === ')') {
                elasticQueryVal = elasticQueryVal.slice(0, elasticQueryVal.length - 1);
            }
            logger.debug("Extracted Raw Elastic Query: \n" + elasticQueryVal);
            esQuery.body.query = Object.assign(esQuery.body.query, JSON.parse(elasticQueryVal));

            //remove this part of the where clause
            query.where = query.where.replace('(' + elasticQueryString + ' AND ', '');
            query.where = query.where.replace(elasticQueryString, '');

            //check for redundant parens
            if (query.where[0] === '(') {
                query.where = query.where.substring(1, query.where.length - 1);
            }
            logger.debug("Remaining where clause: \n" + query.where);
        }

        // set the elasticsearch 'from' to the resultOffset of the query to support pagination.
        if (query.resultOffset) {
            esQuery.body.from = query.resultOffset;
        }

        var whereParser = new WhereParser();
        if (query.where || indexConfig.queryDefinition) {

            // server-side we can apply a query definition to simplify a layer's output via the queryDefinition index
            // config property. we append to any existing request where clause.
            var finalQuery;
            if (query.where && query.where !== "" && indexConfig.queryDefinition) {
                finalQuery = "(" + query.where + ") AND " + indexConfig.queryDefinition;
            } else if (indexConfig.queryDefinition) {
                finalQuery = indexConfig.queryDefinition;
            } else {
                finalQuery = query.where;
            }

            var boolClause = whereParser.parseWhereClause(finalQuery, indexConfig.dateFields, indexConfig.returnFields, indexConfig.mapReturnValues, mapping);
            if (boolClause) {
                if (boolClause.bool) {
                    if (indexConfig.geometryField && !indexConfig.isTable) {
                        if (boolClause.bool.must) {
                            boolClause.bool.must.push({exists: {field: indexConfig.geometryField}});
                        } else {
                            boolClause.bool.must = [
                                {exists: {field: indexConfig.geometryField}}
                            ];
                        }
                    }
                    esQuery.body.query = boolClause;
                } else {
                    esQuery.body.query.bool.must.push(boolClause);
                }
            }

        }

        if (query.geometry && indexConfig.geometryField) { // don't bother if no geometry from the original index

            let geoFilter = buildGeoFilter(query, indexConfig, aggregationBBox);
            if (geoFilter) {
                if (!esQuery.body.query.bool.filter) {
                    esQuery.body.query.bool.filter = [];
                }
                esQuery.body.query.bool.filter.push(geoFilter);
            }
        }

        if (query.sourceSearch && indexConfig.sourceSearchFields) {
            // custom parameter was passed in asking us to look for a term in all fields
            var sourceSearchTerms = query.sourceSearch.split(',');
            esQuery.body.query.bool.should = [];
            for (var i = 0; i < sourceSearchTerms.length; i++) {
                esQuery.body.query.bool.should.push(
                    {
                        multi_match: {
                            query: sourceSearchTerms[i],
                            type: "phrase_prefix",
                            fields: indexConfig.sourceSearchFields
                        }
                    }
                );
            }
            esQuery.body.query.bool.minimum_should_match = 1;
        }

        // If it isn't a return count only request, then we can specify
        // which columns to return using the ArcGIS outFields parameter
        if (query.returnCountOnly !== true) {

            // handle outFields so that only the requested fields are returned
            if (query.outFields && query.outFields !== "*") {
                var outFieldsArray = query.outFields.split(',');
                esQuery._source = outFieldsArray;
            } else {
                // if outfields wasn't specified, then return all the fields per the index config
                if (!esQuery._source) {
                    esQuery._source = [].concat(indexConfig.returnFields);
                }
            }

            if (indexConfig.geometryField && ((query.returnGeometry !== false) || (indexConfig.geometryField && indexConfig.isTable))) {
                esQuery._source.push(indexConfig.geometryField);
            }
        }

        // logger.debug(`Outbound Network call, Elastic query to index: ${esQuery.index}: Query:`);
        // logger.debug(esQuery.body);
        return esQuery;
    }

    function buildGeoFilter(query, indexConfig, aggregationBBox = null) {
        let geoFilter;
        if (query.distance) {
            geoFilter = {
                geo_distance: {
                    distance: `${query.distance}${distanceConstants[query.units]}`
                }
            };
            if (query.geometry.spatialReference && query.geometry.spatialReference.wkid === 102100) {
                let reprojPoint = proj.forward([query.geometry.x, query.geometry.y]);
                geoFilter.geo_distance[indexConfig.geometryField] = reprojPoint;
            } else {
                geoFilter.geo_distance[indexConfig.geometryField] = [query.geometry.x, query.geometry.y];
            }
        } else {
            let bbox = query.geometry;
            if (!bbox) {
                return null;
            }
            let topLeft = undefined;
            let bottomRight = undefined;

            if (aggregationBBox) {
                topLeft = [aggregationBBox.xmin, aggregationBBox.ymax];
                bottomRight = [aggregationBBox.xmax, aggregationBBox.ymin];
            } else {
                if (bbox.rings !== undefined) {
                    bbox.xmin = 180.0;
                    bbox.xmax = -180.0;
                    bbox.ymax = -90.0;
                    bbox.ymin = 90.0;
                    for (let ringIdx = 0; ringIdx < bbox.rings[0].length; ringIdx++) {
                        bbox.xmin = Math.min(bbox.xmin, bbox.rings[0][ringIdx][0]);
                        bbox.xmax = Math.max(bbox.xmax, bbox.rings[0][ringIdx][0]);
                        bbox.ymin = Math.min(bbox.ymin, bbox.rings[0][ringIdx][1]);
                        bbox.ymax = Math.max(bbox.ymax, bbox.rings[0][ringIdx][1]);
                    }
                }

                topLeft = [bbox.xmin, bbox.ymax];
                bottomRight = [bbox.xmax, bbox.ymin];
                if (bbox.spatialReference && bbox.spatialReference.wkid === 102100) {
                    topLeft = proj.forward([bbox.xmin, bbox.ymax]);
                    bottomRight = proj.forward([bbox.xmax, bbox.ymin]);
                }
            }
            // check bounds
            topLeft[0] = Math.max(-180.0, topLeft[0]);
            bottomRight[0] = Math.min(180.0, bottomRight[0]);
            bottomRight[1] = Math.max(-90.0, bottomRight[1]);
            topLeft[1] = Math.min(90.0, topLeft[1]);


            if (indexConfig.geometryType === "geo_point") {
                geoFilter = {
                    geo_bounding_box: {}
                };

                geoFilter.geo_bounding_box[indexConfig.geometryField] = {
                    top_left: topLeft,
                    bottom_right: bottomRight
                };
            } else {
                geoFilter = {
                    geo_shape: {}
                };

                geoFilter.geo_shape[indexConfig.geometryField] = {
                    shape: {
                        type: "envelope",
                        coordinates: [topLeft, bottomRight]
                    },
                    relation: "intersects"
                };
            }
        }
        return geoFilter;
    }

    function buildDefaultAggLayers(indexConfig, mapping, customAggregations) {

        let index = indexConfig.index;
        let aggNames = indexConfig.aggregations.map(agg => agg.name)
        let returnFields = indexConfig.returnFields;
        let aggLayerList = [];

        aggNames.forEach(aggName => {
            if (aggName == 'geohash') {

                let hashCollection = {
                    type: 'FeatureCollection',
                    features: [],
                    metadata: {
                        name: index + "_geohash",
                        maxRecordCount: 6000
                    }
                };
                let defaultFeature = {
                    type: 'Feature',
                    geometry: {
                        "type": "Polygon",
                        "coordinates": [
                            [[100.0, 0.0], [101.0, 0.0], [101.0, 1.0],
                                [100.0, 1.0], [100.0, 0.0]]
                        ]
                    },
                    properties: {
                        FEATURE_CNT: 0,
                        AGGREGATION: "value"
                    }
                };
                hashCollection.features = [addDefaultReturnFields(defaultFeature, mapping, returnFields)];

                aggLayerList.push(hashCollection);
            } else {
                let customAggregation = customAggregations.find(customAgg => customAgg.name === aggName);
                if (customAggregation) {
                    let aggCollection = {
                        type: 'FeatureCollection',
                        features: [],
                        metadata: {
                            name: `${index}_${aggName}`,
                            maxRecordCount: 6000
                        }
                    };
                    let defaultFeature = {
                        type: 'Feature',
                        geometry: {
                            "type": "Polygon",
                            "coordinates": [
                                [[100.0, 0.0], [101.0, 0.0], [101.0, 1.0],
                                    [100.0, 1.0], [100.0, 0.0]]
                            ]
                        },
                        properties: customAggregation.defaultReturnFields(mapping, indexConfig)
                    };
                    aggCollection.features = [defaultFeature];

                    aggLayerList.push(aggCollection);
                }

            }
        });

        return aggLayerList;
    }

    function addDefaultReturnFields(feature, mapping, returnFields) {
        for (let i = 0; i < returnFields.length; i++) {
            let fieldPath = returnFields[i].split('.');

            let mappingField = mapping[fieldPath[0]];
            for (let pathIndex = 1; pathIndex < fieldPath.length; pathIndex++) {
                if (mappingField.properties) {
                    mappingField = mappingField.properties;
                }
                mappingField = mappingField[fieldPath[pathIndex]];
            }
            switch (mappingField.type) {
                case "integer":
                    feature.properties[returnFields[i]] = 0;
                    break;
                case "text":
                    feature.properties[returnFields[i]] = '';
                    break;
                case "date":
                    feature.properties[returnFields[i]] = moment().unix();
                    break;

            }
        }
        return feature;
    }

    function validateBounds(geometry) {
        let bbox = geometry;
        if (bbox.ymax !== undefined) {
            if (bbox.xmax == null && bbox.xmin == null) {
                return false;
            }
        }

        if (bbox.rings !== undefined) {
            bbox.xmin = 180.0;
            bbox.xmax = -180.0;
            bbox.ymax = -90.0;
            bbox.ymin = 90.0;
            for (var ringIdx = 0; ringIdx < bbox.rings[0].length; ringIdx++) {
                bbox.xmin = Math.min(bbox.xmin, bbox.rings[0][ringIdx][0]);
                bbox.xmax = Math.max(bbox.xmax, bbox.rings[0][ringIdx][0]);
                bbox.ymin = Math.min(bbox.ymin, bbox.rings[0][ringIdx][1]);
                bbox.ymax = Math.max(bbox.ymax, bbox.rings[0][ringIdx][1]);
            }
        }

        let topLeft = [bbox.xmin, bbox.ymax];
        let bottomRight = [bbox.xmax, bbox.ymin];

        if (typeof bbox === 'string') {
            // arcmap
            bbox = bbox.split(',');
            topLeft = [Number(bbox[0]), Number(bbox[3])];
            bottomRight = [Number(bbox[2]), Number(bbox[1])];
        }

        if (bbox.spatialReference && bbox.spatialReference.wkid === 102100) {
            topLeft = proj.forward([bbox.xmin, bbox.ymax]);
            bottomRight = proj.forward([bbox.xmax, bbox.ymin]);
        }

        // check bounds
        topLeft[0] = Math.max(-180.0, topLeft[0]);
        bottomRight[0] = Math.min(180.0, bottomRight[0]);
        bottomRight[1] = Math.max(-90.0, bottomRight[1]);
        topLeft[1] = Math.min(90.0, topLeft[1]);

        if (topLeft[0] === bottomRight[0] ||
            topLeft[1] === bottomRight[1] ||
            topLeft[1] < bottomRight[1]
        ) {
            return false;
        } else {
            return true;
        }
        return true;
    }
};
