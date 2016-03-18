'use strict';

var raml2obj = require('raml2obj');
var pjson = require('./package.json');
var Q = require('q');
var fs = require('fs');

/**
 * Render the source RAML object using the config's processOutput function
 *
 * The config object should contain at least the following property:
 * processRamlObj: function that takes the raw RAML object and returns a promise with the rendered HTML
 *
 * @param {(String|Object)} source - The source RAML file. Can be a filename, url, contents of the RAML file,
 * or an already-parsed RAML object.
 * @param {Object} config
 * @param {Function} config.processRamlObj
 * @returns a promise
 */
function render(source, config) {
  config = config || {};
  config.raml2HtmlVersion = pjson.version;

  return raml2obj.parse(source).then(function (ramlObj) {
    ramlObj.config = config;

    if (config.processRamlObj) {
      return config.processRamlObj(ramlObj).then(function (html) {
        if (config.postProcessHtml) {
          return config.postProcessHtml(html);
        }
        return html;
      });
    }

    return ramlObj;
  });
}

/**
 * @param {String} [mainTemplate] - The filename of the main template, leave empty to use default templates
 * @param {String} [schemasPath] - Schema files path for ref with Id
 * @param {String} [templatesPath] - Optional, by default it uses the current working directory
 * @returns {{processRamlObj: Function, postProcessHtml: Function}}
 */
function getDefaultConfig(mainTemplate, schemasPath, templatesPath) {
  if (!mainTemplate) {
    mainTemplate = './lib/template.nunjucks';

    // When using the default template, make sure that Nunjucks isn't
    // using the working directory since that might be anything
    templatesPath = __dirname;
  }

  return {
    processRamlObj: function (ramlObj) {
      var nunjucks = require('nunjucks');
      var markdown = require('nunjucks-markdown');
      var marked = require('marked');
      var ramljsonexpander = require('./expander');
      var renderer = new marked.Renderer();
      renderer.table = function (thead, tbody) {
        // Render Bootstrap style tables
        return '<table class="table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
      };

      // Setup the Nunjucks environment with the markdown parser
      var env = nunjucks.configure(templatesPath, { watch: false });
      markdown.register(env, function (md) {
        return marked(md, { renderer: renderer });
      });

      // Add extra function for finding a security scheme by name
      ramlObj.securitySchemeWithName = function (name) {
        for (var index = 0; index < ramlObj.securitySchemes.length; ++index) {
          if (ramlObj.securitySchemes[index][name] !== null) {
            return ramlObj.securitySchemes[index][name];
          }
        }
      };

      //Only interate schemas defined in raml entry file
      /*for (var schemaIndex in schemas) {
        var schema = schemas[schemaIndex];
        var objectKey = Object.keys(schema)[0];
        var schemaText = schema[objectKey];
        if (isJsonSchema(schemaText)) {
          var schemaObject = JSON.parse(schemaText);
          if (schemaObject.id) {
            schemaMap[schemaObject.id.toLowerCase()] = schemaObject;
          }
        }
      }*/

      var schemaMap = {};
      //Cache all the schema objects
      if (schemasPath) {
        var files = require('glob').sync(schemasPath + '/**/*.json');
        files.forEach(function(file) {
          var schema = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (schema.id) {
            schemaMap[schema.id.toLowerCase()] = schema;
          }
        });
      }

      // Find and replace the $ref parameters.
      ramlObj = ramljsonexpander.expandJsonSchemas(ramlObj, schemaMap);

      // Render the main template using the raml object and fix the double quotes
      var html = env.render(mainTemplate, ramlObj);
      html = html.replace(/&quot;/g, '"');

      // Return the promise with the html
      return Q.fcall(function () {
        return html;
      });
    },

    postProcessHtml: function (html) {
      // Minimize the generated html and return the promise with the result
      var Minimize = require('minimize');
      var minimize = new Minimize({ quotes: true });

      var deferred = Q.defer();

      minimize.parse(html, function (error, result) {
        if (error) {
          deferred.reject(new Error(error));
        } else {
          deferred.resolve(result);
        }
      });

      return deferred.promise;
    }
  };
}

module.exports = {
  getDefaultConfig: getDefaultConfig,
  render: render
};

if (require.main === module) {
  console.log('This script is meant to be used as a library. You probably want to run bin/raml2html if you\'re looking for a CLI.');
  process.exit(1);
}
