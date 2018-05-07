'use strict';
const proj4 = require('proj4');
const proj = proj4('GOOGLE', 'WGS84');
const http = require('http');
const HitConverter = require('../utils/hitConverter');
const IndexInfo = require('../utils/indexInfo');
const WhereParser = require('../utils/whereParser');

module.exports = function(koop) {
    this.init = function(esClients, appConfig) {
        this.esClients = esClients;
        this.appConfig = appConfig;
    };
    this.getData = function(req, callback) {
        var index = req.params.id;
        var esId = req.params.host;

        var indexConfig = this.getIndexConfig(index, this.appConfig.esConnections[esId]);
        const featureCollection = {
            type: 'FeatureCollection',
            features: [],
            metadata: {
                name: index,
                maxRecordCount: indexConfig.maxResults
            }
        };

        if(indexConfig.timeInfo){
            featureCollection.metadata.timeInfo = indexConfig.timeInfo;
            // if time extent is not present in config, we'll need to generate it at some point.
            if((indexConfig.timeInfo.timeExtent && indexConfig.timeInfo.timeExtent.length === 2) ||
                (this.startFieldStats !== undefined && this.endFieldStats !== undefined)){
                if(this.startFieldStats !== undefined && this.endFieldStats !== undefined){
                    this.setTimeExtent(featureCollection);
                }
                this.performQuery(featureCollection, req, callback);
            } else {
                // get the time extent from the index
                var indexInfo = new IndexInfo(this.esClients);
                indexInfo.getStatistics(esId, index, indexConfig.timeInfo.startTimeField).then(result => {
                    this.startFieldStats = result;
                    if(indexConfig.timeInfo.startTimeField !== indexConfig.timeInfo.endTimeField){
                        indexInfo.getStatistics(esId, index, indexConfig.timeInfo.endTimeField).then(endResult => {
                            this.endFieldStats = endResult;
                            this.setTimeExtent(featureCollection);
                            this.performQuery(featureCollection, req, callback);
                        }, error => {
                            console.error(error);
                            callback(error, featureCollection);
                        });
                    } else {
                        this.endFieldStats = result;
                        this.setTimeExtent(featureCollection);
                        this.performQuery(featureCollection, req, callback);
                    }
                }, error => {
                    console.error(error);
                    callback(error, featureCollection);
                });
            }
        } else {
            this.performQuery(featureCollection, req, callback);
        }

    };

    this.setTimeExtent = function (featureCollection){
        featureCollection.metadata.timeInfo.timeExtent = [this.startFieldStats.min, this.endFieldStats.max];
    };

    this.performQuery = function(featureCollection, req, callback){
        var index = req.params.id;
        var esId = req.params.host;
        var layerId = req.params.layer;
        var indexConfig = this.getIndexConfig(index, this.appConfig.esConnections[esId]);

        var where = req.query.where;
        var query = req.query;

        // console.log(JSON.stringify(esQuery));
        if(layerId === "0" || undefined === layerId){
            var indexInfo = new IndexInfo(this.esClients);
            indexInfo.getMapping(esId, index, indexConfig.mapping).then(mapping => {

                var esQuery = this.buildESQuery(indexConfig, query, where);
                // console.log(JSON.stringify(esQuery, null, 2));
                this.esClients[esId].search(esQuery).then(function(resp){
                    console.log("Found " + resp.hits.hits.length + " Features");
                    var hitConverter = new HitConverter();
                    for(var i=0; i<resp.hits.hits.length; i++){
                        var feature = hitConverter.featureFromHit(resp.hits.hits[i], indexConfig, mapping);
                        featureCollection.features.push(feature);
                    }
                    if(layerId === undefined){
                        var returnObject = {layers: [featureCollection]};

                        callback(null, returnObject);
                    } else {
                        req.query.where = "";
                        callback(null, featureCollection);
                    }
                }, function (err) {
                    console.error(err);
                    callback(err, featureCollection);
                });
            }, function (err) {
                console.error(err);
                callback(err, null);
            });
        }
    };

    this.buildESQuery = function(indexConfig, query, where) {
        var esQuery = {
            index: indexConfig.index,
            body: {
                size: indexConfig.maxResults,
                query: {
                    bool: {
                        must: [
                            { exists: {field: indexConfig.geometryField} }
                        ]
                    }
                }
            }
        };

        var whereParser = new WhereParser();
        if(where){
            var boolClause = whereParser.parseWhereClause(where, indexConfig.dateFields, indexConfig.returnFields);
            if(boolClause){
                if(boolClause.bool ){
                    if(boolClause.bool.must){
                        boolClause.bool.must.push( { exists: {field: indexConfig.geometryField} });
                    } else {
                        boolClause.bool.must = [
                            { exists: {field: indexConfig.geometryField} }
                        ];
                    }
                    esQuery.body.query = boolClause;
                } else {
                    esQuery.body.query.bool.must.push(boolClause);
                }
            }

        }

        if (query.time && indexConfig.timeInfo){
            var timeVals = query.time.split(',');
            if (timeVals.length === 2){
                var startTimeRange = {
                    range: {

                    }
                };
                startTimeRange.range[indexConfig.timeInfo.startTimeField] = {
                    gte: timeVals[0]
                };

                var endTimeRange = {
                    range: {

                    }
                };
                endTimeRange.range[indexConfig.timeInfo.endTimeField] = {
                    lte: timeVals[1]
                };

                esQuery.body.query.bool.must.push(startTimeRange);
                esQuery.body.query.bool.must.push(endTimeRange);
            }
        }

        if (query.geometry){
            var bbox = JSON.parse(query.geometry);
            if(bbox.rings !== undefined){
                bbox.xmin = 180.0;
                bbox.xmax = -180.0;
                bbox.ymax = -90.0;
                bbox.ymin = 90.0;
                for(var ringIdx=0; ringIdx < bbox.rings[0].length; ringIdx++){
                    bbox.xmin = Math.min(bbox.xmin, bbox.rings[0][ringIdx][0]);
                    bbox.xmax = Math.max(bbox.xmax, bbox.rings[0][ringIdx][0]);
                    bbox.ymin = Math.min(bbox.ymin, bbox.rings[0][ringIdx][1]);
                    bbox.ymax = Math.max(bbox.ymax, bbox.rings[0][ringIdx][1]);
                }
            }

            var topLeft = [bbox.xmin, bbox.ymax];
            var bottomRight = [bbox.xmax, bbox.ymin];
            if(bbox.spatialReference.wkid === 102100){
                topLeft = proj.forward([bbox.xmin, bbox.ymax]);
                bottomRight = proj.forward([bbox.xmax, bbox.ymin]);
            }

            // check bounds
            topLeft[0] = Math.max(-180.0, topLeft[0]);
            bottomRight[0] = Math.min(180.0, bottomRight[0]);
            bottomRight[1] = Math.max(-90.0, bottomRight[1]);
            topLeft[1] = Math.min(90.0, topLeft[1]);


            if(indexConfig.geometryType === "geo_point"){
                esQuery.body.query.bool.filter = {
                    geo_bounding_box: {}
                };

                esQuery.body.query.bool.filter.geo_bounding_box[indexConfig.geometryField] = {
                    top_left: topLeft,
                    bottom_right: bottomRight
                };
            } else {
                esQuery.body.query.bool.filter = {
                    geo_shape: {
                    }
                };

                esQuery.body.query.bool.filter.geo_shape[indexConfig.geometryField] = {
                    shape: {
                        type: "envelope",
                        coordinates: [topLeft, bottomRight]
                    },
                    relation: "intersects"
                };
            }

        }
        return esQuery;
    }

    this.getIndexConfig = function(indexName, esConfig) {
        for(var i=0; i<esConfig.indices.length; i++){
            if(esConfig.indices[i].index === indexName){
                return esConfig.indices[i];
            }
        }
        return null;
    };
};