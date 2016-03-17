'use strict';

var schemaMapCache = {};
var expandedSchemaCache = {};

function expandJsonSchemas(ramlObj, schemaMap) {
  schemaMapCache = schemaMap
  for (var schemaIndex in ramlObj.schemas) {
    var schema = ramlObj.schemas[schemaIndex];
    var objectKey = Object.keys(schema)[0];
    var schemaText = expandSchema(schema[objectKey]);
    schema[objectKey] = schemaText;
  }

  for (var resourceIndex in ramlObj.resources) {
    var resource = ramlObj.resources[resourceIndex];
    ramlObj.resources[resourceIndex] = fixSchemaNodes(resource);
  }

  return ramlObj;
}

/**
 *  Walk through the hierarchy provided and replace schema nodes with expanded schema.
 */
function fixSchemaNodes(node) {
  var keys = Object.keys(node);
  for (var keyIndex in keys) {
    var key = keys[keyIndex];
    var value = node[key];
    if (key === "schema" && isJsonSchema(value)) {
      var schemaObj = JSON.parse(value);
      if (schemaObj.id && schemaObj.id in expandedSchemaCache) {
        node[key] = JSON.stringify(expandedSchemaCache[schemaObj.id], null, 2);
      }
    } else if (isObject(value)) {
      node[key] = fixSchemaNodes(value);
    } else if (isArray(value)) {
      node[key] = fixSchemaNodesInArray(value);
    }
  }
  return node;
}

function fixSchemaNodesInArray(value) {
  for (var i in value) {
    var element = value[i];
    if (isObject(element)) {
      value[i] = fixSchemaNodes(element);
    }
  }
  return value;
}

function expandSchema(schemaText) {
  if (schemaText.indexOf("$ref") > 0 && isJsonSchema(schemaText)) {
    var schemaObject = JSON.parse(schemaText);
    if (schemaObject.id) {
      var expandedSchema = walkTree(schemaObject);
      expandedSchemaCache[schemaObject.id] = expandedSchema;
      return JSON.stringify(expandedSchema, null, 2);
    } else {
      return schemaText;
    }
  } else {
    return schemaText;
  }
}

/**
 * Walk the tree hierarchy until a ref is found. Download the ref and expand it as well in its place.
 * Return the modified node with the expanded reference.
 */
function walkTree(node) {
  var keys = Object.keys(node);
  var expandedRef;
  for (var keyIndex in keys) {
    var key = keys[keyIndex];
    var value = node[key];
    if (key === "$ref") {
      if (value === "#") {
        //Avoid recursively expanding
        return node;
      } else {
        //Node has a ref, create expanded ref in its place.
        expandedRef = expandRef(value);
        delete node["$ref"];
      }
    } else if (isObject(value)) {
      node[key] = walkTree(value);
    } else if (isArray(value)) {
      node[key] = walkArray(value);
    }
  }

  //Merge an expanded ref into the node
  if (expandedRef != null) {
    mergeObjects(node, expandedRef);
  }

  return node;
}

function mergeObjects(destination, source) {
  for (var attrname in source) { destination[attrname] = source[attrname]; }
}

function expandRef(value) {
  var refObject = schemaMapCache[value.toLowerCase()];
  if (refObject) {
    return walkTree(refObject);
  } else {
    console.warn('Lack of ' + value + ' schema');
    return null;
  }
}

function walkArray(value) {
  for (var i in value) {
    var element = value[i];
    if (isObject(element)) {
      value[i] = walkTree(element);
    }
  }
  return value;
}

function isObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function isArray(value) {
  return Object.prototype.toString.call(value) === "[object Array]";
}

function isJsonSchema(schemaText) {
  return (schemaText.indexOf("http://json-schema.org/draft-04/schema") > 0);
}

module.exports.expandJsonSchemas = expandJsonSchemas;
