const sqliteParser = require('sqlite-parser');
const moment = require('moment');

class WhereParser {
    constructor(){
    }


    _trueFieldName(lowercaseFieldName){
        var returnFieldName = lowercaseFieldName;

        for(var i=0; i< this.returnFields.length; i++){
            if(this.returnFields[i].toLowerCase() === lowercaseFieldName){
                returnFieldName = this.returnFields[i];
                break;
            }
        }
        return returnFieldName;
    }

    _processItem(leftItem, rightItem, operation){
        var returnItem = {};
        if(leftItem.type === 'identifier' && rightItem.type === 'literal'){
            if(operation === '='){
                returnItem.term = {};
                returnItem.term[this._trueFieldName(leftItem.name)] = rightItem.value;
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
                    returnItem.range[this._trueFieldName(leftItem.name)] = {
                        gt: moVal.valueOf()
                    };
                }
            } else if(operation === '<'){
                returnItem = {range: {}};
                if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                    returnItem.range[this._trueFieldName(leftItem.name)] = {lt: rightItem.value};
                } else {
                    let moVal = moment(rightItem.value);
                    returnItem.range[this._trueFieldName(leftItem.name)] = {
                        lt: moVal.valueOf()
                    };
                }
            } else if(operation === '>='){
                returnItem = {range: {}};
                if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                    returnItem.range[this._trueFieldName(leftItem.name)] = {gte: rightItem.value};
                } else {
                    let moVal = moment(rightItem.value);
                    returnItem.range[this._trueFieldName(leftItem.name)] = {
                        gte: moVal.valueOf()
                    };
                }
            } else if(operation === '<='){
                returnItem = {range: {}};
                if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                    returnItem.range[this._trueFieldName(leftItem.name)] = {lte: rightItem.value};
                } else {
                    let moVal = moment(rightItem.value);
                    returnItem.range[this._trueFieldName(leftItem.name)] = {
                        lte: moVal.valueOf()
                    };
                }
            } else if (operation === '<>'){
                returnItem = {bool:{ must_not: [{term:{}}]}};
                returnItem.bool.must_not[0].term[this._trueFieldName(leftItem.name)] = rightItem.value;
            } else if (operation === 'is'){
                if(rightItem.value === 'null'){
                    returnItem = {bool: {must_not: [{exists: {field: this._trueFieldName(leftItem.name)}}] } };
                }
            } else if (operation === 'is not'){
                if(rightItem.value === 'null'){
                    returnItem = {exists: {field: this._trueFieldName(leftItem.name)}};
                }
            }
            return returnItem;
        } else if(leftItem.type === 'identifier' && rightItem.type === 'expression'){

            if(rightItem.right){
                if(operation === 'between' || operation === 'not between'){
                    var rangeItem = {
                        range: {

                        }
                    };
                    if(!this.dateFields.includes(this._trueFieldName(leftItem.name))){
                        rangeItem.range[this._trueFieldName(leftItem.name)] = {
                            gte: rightItem.left.value,
                            lte: rightItem.right.value
                        };
                    } else {
                        // we're assuming moment will be able to parse this format
                        var moleft = moment(rightItem.left.value);
                        var moRight = moment(rightItem.right.value);
                        rangeItem.range[this._trueFieldName(leftItem.name)] = {
                            gte: moleft.valueOf(),
                            lte: moRight.valueOf()
                        };
                    }

                    if(operation === 'between'){
                        return rangeItem;
                    } else {
                        return {bool: {must_not: [rangeItem]} };
                    }

                } else {
                    var returnItemLeft = this._processItem(leftItem, rightItem.left, rightItem.operation);
                    var returnItemRight = this._processItem(rightItem.right.left, rightItem.right.right, rightItem.right.operation);
                    if(operation === 'or'){
                        return {bool:{ should: [returnItemLeft, returnItemRight], minimum_should_match: 1}};
                    } else if (operation === 'and'){
                        return {bool:{ must: [returnItemLeft, returnItemRight]}};
                    }
                }

            } else {
                return this._processItem(leftItem, rightItem.left, rightItem.operation);
            }
        } else if(leftItem.type === 'expression' && rightItem.type === 'expression'){
            var returnItemLeft = this._processItem(leftItem.left, leftItem.right, leftItem.operation);
            var returnItemRight = this._processItem(rightItem.left, rightItem.right, rightItem.operation);
            if(operation === 'or'){
                return {bool:{ should: [returnItemLeft, returnItemRight], minimum_should_match: 1}};
            } else if (operation === 'and'){
                return {bool:{ must: [returnItemLeft, returnItemRight]}};
            }
        }
    }

    parseWhereClause(whereClause, dateFields, returnFields){
        this.dateFields = dateFields;
        this.returnFields = returnFields;
        var shouldArray = [];
        var mustArray = [];
        var mustNotArray = [];
        whereClause = whereClause.replace(/timestamp '/g, " '");
        var ast = sqliteParser("SELECT * FROM BLAH WHERE " + whereClause);
        var whereItem = ast.statement[0].where[0];
        var esClause = this._processItem(whereItem.left, whereItem.right, whereItem.operation);
        // create Elastic Items
        // var elasticQuery = {};

        return esClause;
    }
}

module.exports = WhereParser;