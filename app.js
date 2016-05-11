/*jshint node:true */

var express = require('express');
var bodyParser = require('body-parser');
var serveStatic = require('serve-static');
var morgan = require('morgan');
var methodOverride = require('method-override');
var http = require('http');
var path = require('path');
var glob = require('glob');
var fs = require('fs');
var content = require('./lib/static_content');
var registry = require('./lib/schema-registry-rest');

//var schema_dir = path.resolve(process.cwd(), process.env.SCHEMA_DIR || 'schemata');
function getSchemata(source, cb) {
  var schemata = [];
  if (source.type == 'schema-registry') {
    registry.config(source);
    registry.getAllSubjectVersions(function(err,subjects){
      if (err) {
        cb(err,schemata);
      }
      else {
        subjects.forEach(function(s){
          s.versions.reverse().forEach(function(v){
            schemata.push({filename: '/subjects/' + s.subject + '/versions/' + v });
          });
        });
        cb(null,schemata);
      }
    });
  }
  else {
    glob('**/*.avsc', {cwd: source.url}, function (err, files) {
        if (err) {
          cb(err,schemata);
        }
        else {
          files.sort().forEach(function (file) {
              schemata.push({filename: '/schemata/' + file});
            });
          cb(null,schemata);
        }
    });
  }
}

// Precompile dust templates at app startup, and then serve them out of memory
var dust_templates = content.dustTemplates();

var app = express();

app.set('port', process.env.PORT || 8124);
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(require('less-middleware')(__dirname + '/public'));
app.use(serveStatic(__dirname + '/public'));

app.get('/subjects', function(req, res){
  registry.getAllSubjectVersions(function(err,subjects){
    if (err) {
      console.log(err);
      res.status(err.error_code).json(err);
    }
    console.log(subjects);
    res.json(subjects);
  });
});

app.post('/subjects/:subject/versions', function(req, res){
  var subject = req.params.subject;
  var schema = req.body;
  console.log(subject,schema);

  registry.postSubjectVersions(subject,schema,function(err,result){
    if (err) {
      var code = err.error_code > 999 ? Math.floor(err.error_code/100) : err.error_code;
      res.status(code).json(err);
    }
    else {
      res.json(result);
    }
  });
});

app.get('/subjects/:subject/versions/:version', function(req, res){
  var subject = req.params.subject;
  var version = req.params.version;
  registry.getSchemaBySubjectVersion(subject, version, function(err,schema){
    if (err) {
      console.log(err);
      res.status(err.error_code).json(err);
    }
    console.log(schema);
    res.json(schema.schema);
  });
});


app.get('/', function (req, res) {
  var t = req.query.type || 'file-system';
  var u = req.query.url  || 'schemata';
  if (t=='schema-registry' && !u.startsWith('http')) {
    u = 'http://' + u
  }
  var source = { type: t, url: u };
  getSchemata(source, function(err, schemata){
    content.topLevelHTML({schemata: schemata, source: source}, function (err, html) {
        res.set('Content-Type', 'text/html').send(html);
    });
  });
});

app.get('/dust-templates.js', function (req, res) {
    res.set('Content-Type', 'text/javascript').send(dust_templates);
});

app.get(/^\/schemata\/(\w[\w.\-]*(?:\/\w[\w.\-]*)*)$/, function (req, res) {
  var schema_dir = 'schemata';
    fs.readFile(path.join(schema_dir, req.params[0]), 'utf-8', function (err, data) {
        if (err) {
            res.status(404).send('Not found');
        } else {
            res.set('Content-Type', 'application/json').send(data);
        }
    });
});

http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});
