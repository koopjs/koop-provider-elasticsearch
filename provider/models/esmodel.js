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
        var layerId = req.params.layer;
        var indexConfig = getIndexConfig(index, this.appConfig.esConnections[esId]);
        const featureCollection = {
            type: 'FeatureCollection',
            features: [],
            metadata: {
                name: index,
                maxRecordCount: indexConfig.maxResults
            }
        };

        var where = req.query.where;
        var query = req.query;

        // console.log(JSON.stringify(esQuery));
        if(layerId === "0" || undefined === layerId){
            var indexInfo = new IndexInfo(this.esClients);
            indexInfo.getMapping(esId, index, indexConfig.mapping).then(mapping => {

                var esQuery = buildESQuery(indexConfig, query, where, mapping);
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
                    console.trace(err.message);
                    callback(err, featureCollection);
                });
            });
        }
    };

    function buildESQuery(indexConfig, query, where, mapping) {
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
            var boolClause = whereParser.parseWhereClause(where, indexConfig.dateFields);
            if(boolClause){
                if(boolClause.bool ){
                    if(boolClause.bool.must){
                        boolClause.must.push( { exists: {field: indexConfig.geometryField} });
                    } else {
                        boolClause.must = [
                            { exists: {field: indexConfig.geometryField} }
                        ];
                    }
                    esQuery.body.query = boolClause;
                } else {
                    // simple 1 term where
                    esQuery.body.query.bool.must.push(boolClause);
                }
            }

        }
        if(esQuery.body.query.bool){
            if(esQuery.body.query.bool.must){
                esQuery.body.query.bool.must.push({ exists: {field: indexConfig.geometryField} });
            } else {
                esQuery.body.query.bool.must = [{ exists: {field: indexConfig.geometryField} }];
            }
        } else {
            esQuery.body.query = {
                bool: {
                    must: [
                        { exists: {field: indexConfig.geometryField} }
                    ]
                }
            };
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

    function getIndexConfig(indexName, esConfig) {
        for(var i=0; i<esConfig.indices.length; i++){
            if(esConfig.indices[i].index === indexName){
                return esConfig.indices[i];
            }
        }
        return null;
    }
};