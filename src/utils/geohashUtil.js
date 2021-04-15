const geohash = require('ngeohash');
const proj4 = require('proj4');
const proj = proj4('GOOGLE', 'WGS84');

class GeohashUtil{

    constructor(boundingBox, maxAllowableOffset) {
        this.bbox = null;
        this.precision = 1;
        this.maxAllowableOffset = maxAllowableOffset;
        if (boundingBox) {
            this.bbox = {};
            if (undefined !== boundingBox.spatialReference && boundingBox.spatialReference.wkid === 102100) {
                var topLeft = proj.forward([boundingBox.xmin, boundingBox.ymax]);
                var bottomRight = proj.forward([boundingBox.xmax, boundingBox.ymin]);
                this.bbox.xmin = topLeft[0];
                this.bbox.ymax = topLeft[1];
                this.bbox.xmax = bottomRight[0];
                this.bbox.ymin = bottomRight[1];
            } else {
                this.bbox = boundingBox;
            }
            this._calculateGeohashPrecision();
        }
    }

    fitBoundingBoxToHashes(){
        let hashes = this._getHashesForBoundingBox();
        let hashbbox = {
            ymin: 90.0,
            ymax: -90.0,
            xmin: 180.0,
            xmax: -180.0
        };
        let newbbox = false;

        for(let i=0; i<hashes.length; i++){
            let hash = hashes[i];
            newbbox = true;
            hashbbox = this._updateBoundingBoxByHash(hash, hashbbox);
        }

        if(newbbox){
            this.bbox = hashbbox;
        }
    }

    _updateBoundingBoxByHash(hash, bbox){
        let hashBbox = geohash.decode_bbox(hash);
        bbox.ymin = hashBbox[0] < bbox.ymin ? hashBbox[0] : bbox.ymin;
        bbox.xmin = hashBbox[1] < bbox.xmin ? hashBbox[1] : bbox.xmin;
        bbox.ymax = hashBbox[2] > bbox.ymax ? hashBbox[2] : bbox.ymax;
        bbox.xmax = hashBbox[3] > bbox.xmax ? hashBbox[3] : bbox.xmax;
        return bbox;
    }

    _getHashesForBoundingBox() {
        return geohash.bboxes(this.bbox.ymin, this.bbox.xmin, this.bbox.ymax, this.bbox.xmax, this.precision);
    }

    _isHashInBounds(hash) {
        let latlon = geohash.decode(hash);
        return (this.bbox.ymin <= latlon.latitude && this.bbox.ymax >= latlon.latitude &&
            this.bbox.xmin <= latlon.longitude && this.bbox.xmax >= latlon.longitude);
    }

    _calculateGeohashPrecision() {
        this.precision = 1;
        if (this.bbox){
            if(undefined === this.maxAllowableOffset){
                this.precision = 9;
                // only happens when zoom level is very high
            } else {
                if(this.maxAllowableOffset <= 1){
                    this.precision = 9;
                } else if(this.maxAllowableOffset <= 2){
                    this.precision = 8;
                } else if(this.maxAllowableOffset <= 4){
                    this.precision = 7;
                } else if (this.maxAllowableOffset <= 38){
                    this.precision = 6;
                } else if (this.maxAllowableOffset <= 152){
                    this.precision = 5;
                } else if (this.maxAllowableOffset <= 1222){
                    this.precision = 4;
                } else if (this.maxAllowableOffset <= 4891){
                    this.precision = 3;
                } else if (this.maxAllowableOffset <= 19567){
                    this.precision = 2;
                }
            }
        }
    }
}

module.exports = GeohashUtil;
