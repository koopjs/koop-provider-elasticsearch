const sqliteParser = require('sqlite-parser');
const moment = require('moment');
const Logger = require('@koopjs/logger');
const config = require('config');
const logger = new Logger(config);

class WhereParser {
    constructor(){
    }


    _trueFieldName(lowercaseFieldName, includePropertyExtension=false){
        let returnFieldName = lowercaseFieldName;

        // convert objectid's to the _id used by elasticsearch.
        // TODO: make the objectid column configurable (allow using other columns/attributes)
        if (lowercaseFieldName === "objectid") {
            return "_id";
        }

        for(let i=0; i< this.returnFields.length; i++){
            let rootFieldName = this.returnFields[i];
            if(!lowercaseFieldName.includes('.')){
                // only do this if the field we're being passed doesn't have .
                rootFieldName = rootFieldName.split('.')[0];
            }
            if(rootFieldName.toLowerCase() === lowercaseFieldName){
                if(includePropertyExtension){
                    returnFieldName = this.returnFields[i];
                } else {
                    returnFieldName = rootFieldName;
                }
                break;
            }
        }
        return returnFieldName;
    }

    _isEmpty(map) {
        for(let key in map) {
            if (map.hasOwnProperty(key)) {
                return false;
            }
        }
        return true;
    }

    _mapValue(column, value, variant) {
        // This method maps back the values we aliased if that is configured for the index.

        if (!this.reverseMappedReturnValues) {
            if(variant === "decimal"){
                value = Number(value);
            }
            return value;
        } else {
            if (Array.isArray(value)) {
                // handle a whole array of value mappings
                return value.map(x => {
                    let mappedArray = this.reverseMappedReturnValues[column];
                    if (mappedArray) {
                        let mappedArrayVal = mappedArray[x];
                        return mappedArrayVal ? mappedArrayVal : x;
                    } else {
                        // case where this column isn't mapped
                        return x;
                    }
                });
            } else {
                // handle single mapped value
                let mappedArray = this.reverseMappedReturnValues[column];
                if (mappedArray) {
                    let mappedVal = mappedArray[value];
                    return mappedVal ? mappedVal : value;
                } else {
                    // case where this column isn't mapped
                    return value;
                }

            }
        }
    }

    // This constructs the reverse mapping for each indexConfig's mapReturnValues mapping
    _setReverseMappingValues(mapReturnValues) {
        if (mapReturnValues) {
            this.reverseMappedReturnValues = {};
            for(let key in mapReturnValues){
                this.reverseMappedReturnValues[key] = {};
                for (let mappingKey in mapReturnValues[key]) {
                    this.reverseMappedReturnValues[key][mapReturnValues[key][mappingKey]] = mappingKey;
                }
            }
        }
    }

    _parseNegativeValue(item){
        // check for negative value
        if(item.operator === '-'){
            return `-${item.expression.value}`;
        }
        return undefined;
    }

    _processItem(leftItem, rightItem, operation){

        let returnItem = {};
        if(leftItem.type === 'identifier' && rightItem.type === 'literal'){
            if(operation === '='){
                let trueColname = this._trueFieldName(leftItem.name, true);
                if (trueColname === "_id") {
                    returnItem.terms = {};
                    returnItem.terms[trueColname] = [rightItem.value, rightItem.value];
                } else {
                    returnItem.match = {};
                    returnItem.match[trueColname] = this._mapValue(trueColname, rightItem.value, rightItem.variant);
                }
            } else if(operation === 'not like'){
                returnItem = {bool:{ must_not: [{match_phrase_prefix:{}}]}};
                returnItem.bool.must_not[0].match_phrase_prefix[this._trueFieldName(leftItem.name)] = rightItem.value.replace(/%/g, '');
            } else if(operation === 'like'){
                returnItem.match_phrase_prefix = {};
                returnItem.match_phrase_prefix[this._trueFieldName(leftItem.name)] = rightItem.value.replace(/%/g, '');
            } else if(operation === '>'){
                returnItem = {range: {}};
                if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                    returnItem.range[this._trueFieldName(leftItem.name)] = {gt: rightItem.value};
                } else {
                    let moVal = moment(rightItem.value);

                    logger.debug("moVal.valueOf():", moVal.valueOf());
                    let dateConfig = this.mapping[this._trueFieldName(leftItem.name)];
                    logger.debug("dateConfigdateConfig:", dateConfig);

                    //let formattedVal = dateConfig && dateConfig.format ? moVal.format(dateConfig.format.toUpperCase()) : moVal.valueOf();
                    returnItem.range[this._trueFieldName(leftItem.name)] = {
                        //gt: formattedVal
                        gt: moVal.valueOf(),
                        format: "strict_date_optional_time||epoch_millis"
                    };
                }
            } else if(operation === '<'){
                returnItem = {range: {}};
                if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                    returnItem.range[this._trueFieldName(leftItem.name)] = {lt: rightItem.value};
                } else {
                    let moVal = moment(rightItem.value);
                    returnItem.range[this._trueFieldName(leftItem.name)] = {
                        lt: moVal.valueOf(),
                        format: "strict_date_optional_time||epoch_millis"
                    };
                }
            } else if(operation === '>='){
                returnItem = {range: {}};
                if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                    returnItem.range[this._trueFieldName(leftItem.name)] = {gte: rightItem.value};
                } else {
                    let moVal = moment(rightItem.value);
                    returnItem.range[this._trueFieldName(leftItem.name)] = {
                        gte: moVal.valueOf(),
                        format: "strict_date_optional_time||epoch_millis"
                    };
                }
            } else if(operation === '<='){
                returnItem = {range: {}};
                if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                    returnItem.range[this._trueFieldName(leftItem.name)] = {lte: rightItem.value};
                } else {
                    let moVal = moment(rightItem.value);
                    returnItem.range[this._trueFieldName(leftItem.name)] = {
                        lte: moVal.valueOf(),
                        format: "strict_date_optional_time||epoch_millis"
                    };
                }
            } else if (operation === '<>'){
                returnItem = {bool:{ must_not: [{match:{}}]}};
                returnItem.bool.must_not[0].match[this._trueFieldName(leftItem.name, true)] = rightItem.value;
            } else if (operation === 'is'){
                if(rightItem.value === 'null'){
                    returnItem = {bool: {must_not: [{exists: {field: this._trueFieldName(leftItem.name)}}] } };
                }
            } else if (operation === 'is not'){
                if(rightItem.value === 'null'){
                    returnItem = {exists: {field: this._trueFieldName(leftItem.name)}};
                }
                // TODO: why is there not full "is not" support here?
            }
            return returnItem;
        } else if(leftItem.type === 'identifier' && rightItem.type === 'expression'){
            if(rightItem.right){
                if(operation === 'between' || operation === 'not between'){
                    let rangeItem = {
                        range: {

                        }
                    };
                    if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                        let leftValue = rightItem.left.value;
                        let rightValue = rightItem.right.value;
                        if(leftValue === undefined){
                            leftValue = this._parseNegativeValue(rightItem.left);
                        }
                        if(rightValue === undefined){
                            rightValue = this._parseNegativeValue(rightItem.right);
                        }
                        rangeItem.range[this._trueFieldName(leftItem.name)] = {
                            gte: leftValue,
                            lte: rightValue
                        };
                    } else {
                        // we're assuming moment will be able to parse this format
                        let moleft = moment(rightItem.left.value);
                        let moRight = moment(rightItem.right.value);
                        rangeItem.range[this._trueFieldName(leftItem.name)] = {
                            gte: moleft.valueOf(),
                            lte: moRight.valueOf(),
                            format: "strict_date_optional_time||epoch_millis"
                        };
                    }

                    if(operation === 'between'){
                        return rangeItem;
                    } else {
                        return {bool: {must_not: [rangeItem]} };
                    }
                } else {
                    let returnItemLeft = this._processItem(leftItem, rightItem.left, rightItem.operation);
                    let returnItemRight = this._processItem(rightItem.right.left, rightItem.right.right, rightItem.right.operation);
                    if(operation === 'or'){
                        return {bool:{ should: [returnItemLeft, returnItemRight], minimum_should_match: 1}};
                    } else if (operation === 'and'){
                        return {bool:{ must: [returnItemLeft, returnItemRight]}};
                    }
                }

            } else if(leftItem.variant === "column" && operation === "in" && rightItem.variant === "list") {
                // This case is for queries of the form OBJECT IN ('Objectid1', 'Objectid2', etc).
                // We should refactor this branch so we specifically use an ids query (https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-ids-query.html)
                // when the column is the objectid or _id column. This approach works though for both regular and objectid/_id values
                // in the meantime as being part of the MUST terms query

                if (!returnItem.terms) {
                    returnItem.terms = {};
                }

                let trueColName = this._trueFieldName(leftItem.name, true);

                // for each entry of the list on the right (i.e. "in (value,value)"), use it's value property as it's entry
                // for the final array of items to search for as terms
                //returnItem.terms[this._trueFieldName(leftItem.name, true)] = rightItem.expression.map(x => x.value);
                let termValues = rightItem.expression.map(x => {
                    if(x.value){
                        return x.value;
                    }
                    if(x.operator === '-'){
                        // deal with negative numbers

                        return Number(this._parseNegativeValue(x));
                    }
                    return '';
                });
                if (!this._isEmpty(returnItem.terms[trueColName])) {
                    // If match values already exist for this match, append additional values
                    returnItem.terms[trueColName] = returnItem.terms[trueColName].concat(termValues);
                } else {
                    // If match does not already exists, create by setting the match to its values
                    returnItem.terms[trueColName] = this._mapValue(trueColName, termValues);
                }

                return returnItem;
            } else if (leftItem.type === "identifier" && operation === "=" && rightItem.operator === '-'){
                // This is the case for a negative value being passed in.
                returnItem.terms = {};
                returnItem.terms[this._trueFieldName(leftItem.name)] = [Number(`${rightItem.operator}${rightItem.expression.value}`)];
                return returnItem;
            } else {
                return this._processItem(leftItem, rightItem.left, rightItem.operation);
            }
        } else if(leftItem.type === 'expression' && rightItem.type === 'expression'){
            let returnItemLeft = this._processItem(leftItem.left, leftItem.right, leftItem.operation);
            let returnItemRight = this._processItem(rightItem.left, rightItem.right, rightItem.operation);

            // This branch requires additional support
            if (false && returnItemLeft.terms && returnItemRight.terms) {
                logger.debug("both children returned term searches. combining.");
                logger.debug(`returnItemLeft.terms: ${returnItemLeft.terms}`);
                logger.debug(`returnItemRight.terms: ${returnItemRight.terms}`);
                logger.debug(`Array.isArray(returnItemLeft.terms): ${Array.isArray(returnItemLeft.terms)}`);

                return {bool:{ must: [{"terms":{"_id": returnItemLeft.terms["_id"].concat(returnItemRight.terms["_id"])}}]}};
            } else {
                if(operation === 'or'){
                    return {bool:{ should: [returnItemLeft, returnItemRight], minimum_should_match: 1}};
                } else if (operation === 'and'){
                    return {bool:{ must: [returnItemLeft, returnItemRight]}};
                }
            }
        } else if(leftItem.type === 'literal' && rightItem.type === 'literal'){
            // branch to deal with both sides being literals (e.g. 1=1 queries)
            if (operation === '=') {
                if (leftItem.value === rightItem.value) {
                    // For literals that are equal (e.g. 1=1) do a match_all
                    return {"match_all": {}};
                } else if(leftItem.value !== rightItem.value) {
                    // For literals that are not equal (e.g. 1=2) do a match_none
                    return {"match_none": {}};
                }
            }
        }
    }

    parseWhereClause(whereClause, dateFields, returnFields, mapReturnValues, mapping){
        this.dateFields = dateFields;
        this.returnFields = returnFields;
        this.mapping = mapping;

        // Prepare the reversed mapping of mapped values (for aliased return values)
        this._setReverseMappingValues(mapReturnValues);

        let shouldArray = [];
        let mustArray = [];
        let mustNotArray = [];
        whereClause = whereClause.replace(/timestamp '/g, " '");
        whereClause = whereClause.replace('UPPER', '');
        let ast = sqliteParser("SELECT * FROM BLAH WHERE " + whereClause);
        let whereItem = ast.statement[0].where[0];
        let esClause = this._processItem(whereItem.left, whereItem.right, whereItem.operation);
        // create Elastic Items
        // let elasticQuery = {};

        return esClause;
    }
}

module.exports = WhereParser;
