const moment = require('moment');
const Logger = require('@koopjs/logger');
const config = require('config');
const logger = new Logger(config);
const geohash = require('ngeohash');
const flatten = require('flat');
const unflatten = require('flat').unflatten;

class HitConverter{

    constructor(customSymbolizer){
        // TODO: Keep a dictionary of mapping info here to speed up future queries.
        this.customSymbolizer = customSymbolizer;
    }

    /**
     *
     * @param hit
     * @param indexConfig
     * @param options - mapping: the ElasticSearch mapping for the index, maxAllowableOffset - the number of meters per pixel
     * @returns {null|{type: string, properties: {}}}
     */
    featureFromHit(hit, indexConfig, options) {
        //console.log("hit:", JSON.stringify(hit));

        let mapping = options.mapping;
        let maxAllowableOffset = options.maxAllowableOffset ? options.maxAllowableOffset : 1;

        let feature = {
            type: 'Feature',
            properties: {}
        };
        hit._source = flatten(hit._source, {safe:false});

        if(!indexConfig.shapeIndex){
            if(!indexConfig.isTable){
                if(!hit._source[indexConfig.geometryField]){
                    try {
                        // this is a polyline or polygon geometry and should be un-flattened
                        let tempSource = unflatten(hit._source);
                        let geoPath = indexConfig.geometryField.split('.');
                        feature.geometry = tempSource[geoPath[0]];
                        for(let i=1; i<geoPath.length; i++){
                            feature.geometry = feature.geometry[geoPath[i]];
                        }
                    } catch (e) {
                        logger.info(`failed to parse geometry on ${unflatten(hit._source)}`);
                    }

                } else {
                    feature.geometry = hit._source[indexConfig.geometryField];
                }

            } else if(indexConfig.geometryField) {
                if(hit._source[indexConfig.geometryField]){
                    feature.properties.hasShape = 1;
                } else {
                    feature.properties.hasShape = 0;
                }
            }
        } else if(this.joinHits){
            // lets add a shape from the ones given.
            let shapeHits = this.joinHits.filter( joinHit => {
                let joinPath = this.joinConfig.joinField.split('.');
                let joinValue = joinHit._source[joinPath[0]];
                for(let i=1; i<joinPath.length; i++){
                    if(joinPath[i] !== 'keyword'){ // keyword is a property of a field and not a field itself
                        joinValue = joinValue[joinPath[i]];
                    }
                }
                let indexJoinField = indexConfig.shapeIndex.joinField.split('.keyword')[0]; // remove keyword here as well
                return joinValue === hit._source[indexJoinField];
            });
            if(shapeHits.length > 0){
                let geoFieldParts = this.joinConfig.geometryField.split('.');
                feature.geometry = shapeHits[0]._source[geoFieldParts[0]];
                for(let i=1; i < geoFieldParts.length; i++){
                    feature.geometry = feature.geometry[geoFieldParts[i]];
                }
                feature.geometry = shapeHits[0]._source[this.joinConfig.geometryField];
            }
            if(!feature.geometry){
                return null;
            }
        }

        // It appears that as long as the id doesn't contain only numbers we can pass it as a string.
        // if it does contain only numbers we must parse it.
        if(!indexConfig.idField){
            if(isNaN(hit._id)){
                feature.properties["OBJECTID"] = hit._id;
            } else {
                feature.properties["OBJECTID"] = parseInt(hit._id);
            }
        }


        // check if there is a geometry (as long as returnGeometry=false was not specified)
        if (feature.geometry) {
            if(feature.geometry.type === "polygon") {
                // Koop expects a capital P and ES has lowercase
                feature.geometry.type = "Polygon";
            } else if(feature.geometry.type === "multipolygon"){
                feature.geometry.type = "Multipolygon";
            } else if (undefined === feature.geometry.type){
                // point
                var coords = undefined;

                var pointType = "Point";
                if(Array.isArray(feature.geometry)){

                    // If the index config is set to allow multiple points. If it isn't, then only the first point is used.
                    if (indexConfig.allowMultiPoint === true) {
                        pointType = "MultiPoint";
                        coords = [];
                        if (!isNaN(feature.geometry[0])){ // case where we allow multipoint but this is a single point
                            coords.push(feature.geometry);
                        } else {
                            feature.geometry.forEach((geom) => {
                                if(geom.hasOwnProperty('lon')){
                                    coords.push([geom.lon, geom.lat]);
                                } else {
                                    coords.push(geom);
                                }
                            });
                        }
                    } else {
                        // The index was not configured for multipoint, so only the first point is used.
                        pointType = "Point";
                        if(feature.geometry[0].hasOwnProperty('lon')){
                            coords = [feature.geometry[0].lon, feature.geometry[0].lat];
                        } else {
                            coords = feature.geometry;
                        }
                    }
                } else {
                    pointType = "Point";
                    if(feature.geometry.hasOwnProperty('lon')){
                        coords = [feature.geometry.lon, feature.geometry.lat];
                    } else {
                        coords = feature.geometry.split(",").map( coord => {
                            return parseFloat(coord);
                        }).reverse();
                    }

                }

                feature.geometry = {
                    type: pointType,
                    coordinates: coords
                };

            } else if ("MultiLineString" === feature.geometry.type){
                feature.geometry.type = "LineString";
                feature.geometry.coordinates = feature.geometry.coordinates[0];
            }
        }

        // If configured mapping of return values then check each column and map values
        // to return a different value. This allows us to alias to different values on-the-fly
        if (indexConfig.mapReturnValues) {
            for(var i=0; i<indexConfig.returnFields.length; i++){

                var val = hit._source[indexConfig.returnFields[i]];
                var mappingForField = indexConfig.mapReturnValues[indexConfig.returnFields[i]];
                if (mappingForField) {
                    if (mappingForField[val]) {
                        // a mapping for that column and value is configured so use it
                        feature.properties[indexConfig.returnFields[i]] = mappingForField[val];
                    } else if (mappingForField.__defaultmapping) {
                        // a default mapping is specified, so use that.
                        feature.properties[indexConfig.returnFields[i]] = mappingForField.__defaultmapping + " --- " + val;
                    } else {
                        // no mapping for that value matched, and no default mapping under entry __defaultmapping so
                        // directly set the value without mapping it
                        feature.properties[indexConfig.returnFields[i]] = val;
                    }
                } else {
                    // that column is not mapped so directly set value
                    feature.properties[indexConfig.returnFields[i]] = val;
                }
            }
        } else {
            // no mappings, iterate setting each field directly (less overhead)
            // return whatever is in the hits source.  By default this will be configured fields
            // but if outFields was set it can be overridden.
            let hitFields = Object.keys(hit._source);
            for(let i=0; i<hitFields.length; i++){
                if(hitFields[i] !== indexConfig.geometryField){
                    feature.properties[hitFields[i]] = hit._source[hitFields[i]];
                }
            }
        }

        if(indexConfig.dateFields.length > 0 && undefined !== mapping){
            const flatMapping = flatten(mapping);
            indexConfig.dateFields.forEach(field => {
                let flatField = field.split('.').join('.properties.');
                if(flatMapping[`${flatField}.type`] === "date"){
                    if(mapping[`${flatField}.format`] !== undefined){
                        try{
                            if(null !==feature.properties[field]) {
                                if (flatMapping[`${flatField}.format`]=="epoch_millis||yyyyMMDD HH:mm" ||
                                    flatMapping[`${flatField}.format`]=="yyyyMMDD HH:mm" || flatMapping[`${flatField}.format`]=="yyyyMMdd HH:mm") {
                                    //moment doesn't recognize this format, change it to standard
                                    if (hit._source[field].includes(":")) {
                                        //mapping.properties[field].format="YYYYMMDD HH:mm";
                                        feature.properties[field] = moment(hit._source[field], "YYYYMMDD HH:mm").toDate().toISOString();
                                    } else {
                                        //use unix time
                                        feature.properties[field] = moment(hit._source[field]).toDate().toISOString();
                                    }
                                } else {
                                    feature.properties[field] = moment(hit._source[field], flatMapping[field].format).toDate().toISOString();
                                }
                            }
                        } catch (error){
                            logger.info("couldn't parse date: " + hit._source[field] + " with format: " + flatMapping[field].format + ", will attempt auto parse");
                            try {
                                if(null !== feature.properties[field]) {
                                    feature.properties[field] = moment(hit._source[field]).toDate().toISOString();
                                }
                            } catch (error){
                                logger.info("couldn't auto parse date: " + hit._source[field]);

                            }
                        }
                    } else {
                        try {
                            if(null !== feature.properties[field]) {
                                feature.properties[field] = moment(hit._source[field]).toDate().toISOString();
                            }
                        } catch (error){
                            logger.info("couldn't auto parse date: " + hit._source[field]);

                        }
                    }

                }

            });
        } else {
            if(undefined === mapping){
                logger.info("Don't have mapping, didn't set date field");
            }
        }

        // turn any array values into delimited values
        const propNames = Object.keys(feature.properties);
        for(let i=0; i<propNames.length; i++){
            if(Array.isArray(feature.properties[propNames[i]])){
                feature.properties[propNames[i]] = feature.properties[propNames[i]].join(', ');
            }
        }

        if(this.customSymbolizer){
            feature = this.customSymbolizer.symbolize(feature, maxAllowableOffset);
        }

        return feature;
    }

    featureFromGeoHashBucket(bucket, hit, indexConfig, mapping=undefined, boolQuery){
        let bbox = geohash.decode_bbox(bucket.key);
        let filter = boolQuery.filter;
        if(filter){
            filter = filter[0];
            let bboxKey = Object.keys(filter.geo_bounding_box)[0];
            let filterBBox = filter.geo_bounding_box[bboxKey];
            // compare filter to bbox [ymin,xmin,ymax,xmax]
            if(filterBBox.bottom_right[1] >= bbox[2] ||
                filterBBox.top_left[1] <= bbox[0] ||
                filterBBox.top_left[0] >= bbox[3] ||
                filterBBox.bottom_right[0] <= bbox[1]
            ){
                return null;
            }
        }
        let feature = {
            type: 'Feature',
            geometry: {
                type: 'Polygon'
            },
            properties: {
                count: bucket.doc_count
                // created_user: hit._source.created_user
            }
        };
        let sampleFeature = this.featureFromHit(hit, indexConfig, mapping);
        // remove the objectid, it will be the same for all aggs and cause all but one to be ignored.
        delete sampleFeature.properties.OBJECTID;
        Object.assign(feature.properties, sampleFeature.properties);

        feature.properties.OBJECTID = this.objectIDFromKey(bucket.key);
        console.log(`OID ${feature.properties.OBJECTID}  Count: ${feature.properties.count}`);


        if(bbox[0] === -90 || bbox[0] === 90){
            bbox[0] = bbox[0] * 0.9999999999;
        }
        if(bbox[2] === -90 || bbox[2] === 90){
            bbox[2] = bbox[2] * 0.9999999999;
        }
        feature.geometry.coordinates = [[[bbox[1], bbox[0]], [bbox[3], bbox[0]], [bbox[3], bbox[2]], [bbox[1], bbox[2]],
            [bbox[1], bbox[0]]]];
        return feature;
    }

    setJoinShapes(joinHits, joinConfig){
        logger.debug("Setting join shapes");
        this.joinHits = joinHits;
        this.joinConfig = joinConfig;
    }

    objectIDFromKey(key){
        let idString = "";
        for(let i=0; i<key.length; i++){
            let char = key.charAt(i);
            if(/[0-9]/.test(char)){
                idString += char;
            } else {
                idString += (key.charCodeAt(i) - 87).toString();
            }
        }
        return Number.parseInt(idString);
    }

}

module.exports = HitConverter;
