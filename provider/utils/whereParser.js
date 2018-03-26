const sqliteParser = require('sqlite-parser');
const moment = require('moment');

class WhereParser {
    constructor(){
    }



    _processItem(leftItem, rightItem, operation){
        var returnItem = {};
        if(leftItem.type === 'identifier' && rightItem.type === 'literal'){
            if(operation === '='){
                returnItem.term = {};
                returnItem.term[leftItem.name] = rightItem.value;
            } else if(operation === 'like'){
                returnItem.prefix = {};
                returnItem.prefix[leftItem.name] = rightItem.value.replace(/%/g, '');
            } else if(operation === '>'){
                returnItem = {range: {}};
                returnItem.range[leftItem.name] = {gt: rightItem.value};
            } else if(operation === '<'){
                returnItem = {range: {}};
                returnItem.range[leftItem.name] = {lt: rightItem.value};
            } else if(operation === '>='){
                returnItem = {range: {}};
                returnItem.range[leftItem.name] = {gte: rightItem.value};
            } else if(operation === '<='){
                returnItem = {range: {}};
                returnItem.range[leftItem.name] = {lte: rightItem.value};
            }
            return returnItem;
        } else if(leftItem.type === 'identifier' && rightItem.type === 'expression'){

            if(rightItem.right){
                if(operation === 'between'){
                    var rangeItem = {
                        range: {

                        }
                    };
                    if(!this.dateFields.includes(leftItem.name)){
                        rangeItem.range[leftItem.name] = {
                            gte: rightItem.left.value,
                            lte: rightItem.right.value
                        };
                    } else {
                        // we're assuming moment will be able to parse this format
                        var moleft = moment(rightItem.left.value);
                        var moRight = moment(rightItem.right.value);
                        rangeItem.range[leftItem.name] = {
                            gte: moleft.valueOf(),
                            lte: moRight.valueOf()
                        };
                    }

                    return rangeItem;
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

    parseWhereClause(whereClause, dateFields){
        this.dateFields = dateFields;
        var shouldArray = [];
        var mustArray = [];
        var mustNotArray = [];
        whereClause = whereClause.replace(/timestamp/g, '');
        var ast = sqliteParser("SELECT * FROM BLAH WHERE " + whereClause);
        var whereItem = ast.statement[0].where[0];
        var esClause = this._processItem(whereItem.left, whereItem.right, whereItem.operation);
        // create Elastic Items
        // var elasticQuery = {};

        return esClause;
    }
}

module.exports = WhereParser;