var rest = require('rest');
var pathPrefix = require('rest/interceptor/pathPrefix');
var errorCode = require('rest/interceptor/errorCode');
var mime = require('rest/interceptor/mime');
var template = require('rest/interceptor/template');
var registry = require('rest/mime/registry')
var jsonType = require('rest/mime/type/application/json');

registry.lookup('application/json').then(function(jsonConverter){
  registry.register('application/vnd.schemaregistry.v1+json',jsonConverter);
});

var defaultConfig = {
  type: 'schema-registry',
	url: 'http://localhost:8081'
};
var providedConfig = {};
var client;

function isSame(o1,o2) {
	var k1 = Object.keys(o1).sort().join();
	var k2 = Object.keys(o2).sort().join();
	if (k1 !== k2) return false;
	for (k in o1) {
		if (o1[k] != o2[k]) return false;
	}
	return true;
}

function config(updatedConfig) {
	var c = Object.assign({}, defaultConfig, updatedConfig);
	if (!isSame(c, providedConfig)) {
    providedConfig = c;
	  client = rest.wrap(mime,{
								 mime: 'application/json',
								 accept: 'application/vnd.schemaregistry.v1+json,application/vnd.schemaregistry+json;q=0.9,application/json;q=0.8,*/*;q=0.7',
								 permissive: true
							 })
	             .wrap(errorCode)
							 .wrap(template)
							 .wrap(pathPrefix, { prefix: c.url });
  }
  return providedConfig;
}

function ok(cb) {
	return function(response) {
		console.log("ok",response.entity);
		cb(null, response.entity);
	}
}

function err(cb) {
	return function(response) {
		console.log("err",response);
		cb(response.entity,null);
	}
}

function method(method, path, params, cb) {
	var args = { path: path, method: method };
	if (typeof params == 'function') {
		cb = params;
	}
	else {
		args.params = params;
	}
	client(args).then(ok(cb), err(cb));
}

function get(path, params, cb) {
  method('GET',path,params,cb);
}

function post(path,params,cb) {
  method('POST',path,params,cb);
}

function getSchemaById(id, cb) {
	get('/schema/ids/{id}', {id: id}, cb);
}

function getSubjects(cb) {
	get('/subjects', cb);
}

function getSubjectVersions(subject, cb) {
	get('/subjects/{subject}/versions', {subject: subject}, cb);
}

function getSchemaBySubjectVersion(subject, version, cb) {
	get(
		'/subjects/{subject}/versions/{version}',
	  {subject: subject, version: version},
		function(err,data){
      if (err) cb(err,null)
      else {
        try {
          data.schema = JSON.parse(data.schema);
        }
        catch (ex) {
          cb({error_code:500,message:"Can't parse schema"},null);
          return;
        }
        cb(null,data);
      }
    }
	);
}

function getAllSubjectVersions(cb) {
	getSubjects(function(err, subjects){
		if (err) {
			cb(err,null);
			return;
		}
		var numSchemas = subjects.length;
		var schemas = [];
		subjects.forEach(function(subject){
			getSubjectVersions(subject,function(err,versions){
				if (err) {
					cb(err,null);
					return;
				}
        schemas.push({subject:subject, versions:versions});
				if (schemas.length == numSchemas) {
					cb(null,schemas);
				}
			});
		});
	});
}

function postSubjectVersions(subject,schema,cb) {
  // schema is an object...need to escape it
  var entity = JSON.stringify({schema: JSON.stringify(schema)});
  console.log("post",subject,entity);
  post('/subjects/{subject}/versions',{subject:subject, entity:entity},cb);
}

/*
  GET /schemas/ids/:id  -> {schema:"the schema"}
  GET /subjects         -> ["subj1","subj2",...]
  GET /subjects/:subject/versions -> [1,2,3,4,...]
  GET /subjects/:subject/versions/:version -> {name:"thename",version:1,schema:"theschema"}
  POST /subjects/:subject/versions (body = {schema:"theschema"}) ->
*/

var api = {
	  config: config,
    getSchemaById: getSchemaById,
    getSchemaBySubjectVersion: getSchemaBySubjectVersion,
    getSubjects: getSubjects,
    getSubjectVersions: getSubjectVersions,
    getAllSubjectVersions: getAllSubjectVersions,
    postSubjectVersions: postSubjectVersions
};

// create default client
providedConfig = config({});

module.exports = api;
