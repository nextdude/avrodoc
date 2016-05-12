/*jshint node:true */

var uglify = require('uglify-js');
var fs = require('fs');
var path = require('path');
var dust = require('dustjs-linkedin');
require('dustjs-helpers');
var less = require('less');
var _ = require('underscore');

// LESS stylesheets required in the browser (relative to public/ directory)
var client_css = [
    'vendor/font-awesome/css/font-awesome.css',
    'vendor/roboto/font.css',
    'vendor/bootstrap/css/bootstrap.css',
    'vendor/toastr/toastr.css',
    'css/avrodoc2.css'
];

// JS code required in the browser (relative to public/ directory)
var client_js = [
    'vendor/jquery-2.2.3.min.js',
    'vendor/underscore-1.4.2.js',
    'vendor/dust-core-2.7.2.min.js',
    'vendor/dustjs-helpers-1.7.3.min.js',
    'vendor/sammy-0.7.6.min.js',
    'vendor/markdown.js',
    'vendor/tether.min.js',
    'vendor/bootstrap/js/bootstrap.js',
    'vendor/ace.js',
    'vendor/toastr/toastr.min.js',
    'js/avrodoc.js',
    'js/schema.js'
];

// Minimal HTML document that holds it all together
var client_html = dust.compileFn(fs.readFileSync(path.join(__dirname, 'top_level.dust'), 'utf-8'));

var template_dir = path.join(__dirname, '..', 'templates');
var public_dir   = path.join(__dirname, '..', 'public');


// Reads a local Javascript file and returns it in minified form.
function minifiedJS(filename) {
    var ast = uglify.parser.parse(fs.readFileSync(filename, 'utf-8'));
    ast = uglify.uglify.ast_mangle(ast);
    ast = uglify.uglify.ast_squeeze(ast);
    return uglify.uglify.gen_code(ast);
}

// Precompiles all templates found in the templates directory, and returns them as a JS string.
function dustTemplates() {
    var compiled = '';
    fs.readdirSync(template_dir).forEach(function (file) {
        if (file.match(/\.dust$/)) {
            var template = fs.readFileSync(path.join(template_dir, file), 'utf-8');
            compiled += dust.compile(template, file.replace(/\.dust$/, ''));
        }
    });
    return compiled;
}

// Compiles LESS stylesheets and calls callback(error, minified_css).
function stylesheets(callback) {
    var compiled = '', to_do = 0;
    client_css.forEach(function (file) {
        if (file.match(/\.less$/)) {
            to_do++;
            var style = fs.readFileSync(path.join(public_dir, file), 'utf-8');
            var parser = new(less.Parser)({
                paths: [path.join(public_dir, 'stylesheets')],
                filename: file
            });

            parser.parse(style, function (err, tree) {
                if (!err) {
                    compiled += tree.toCSS({compress: true});
                }
                to_do--;
                if (to_do === 0) {
                    to_do = -1000; // hack to avoid calling callback twice
                    callback(err, compiled);
                }
            });
        }
    });

    if (to_do === 0) {
        callback(null, compiled);
    }
}

// Calls callback(error, html) with HTML containing URL references to all JS and CSS required by the
// browser.
function remoteContent(callback) {
    var html = [];
    client_css.forEach(function (file) {
        var css_file = file.replace(/\.less$/, '.css');
        html.push('<link rel="stylesheet" type="text/css" href="/' + css_file + '"/>');
    });
    client_js.forEach(function (file) {
        html.push('<script type="text/javascript" src="/' + file + '"></script>');
    });
    html.push('<script type="text/javascript" src="/dust-templates.js"></script>');
    callback(null, html.join('\n'));
}

// Returns HTML containing all JS and CSS required by the browser inline.
function inlineContent(callback) {
    stylesheets(function (err, css) {
        if (err) {
            callback(err);
            return;
        }

        var html = [];
        html.push('<style type="text/css">');
        html.push(css);
        html.push('</style>');
        client_js.forEach(function (file) {
            html.push('<script type="text/javascript">');
            html.push(minifiedJS(path.join(public_dir, file)));
            html.push('</script>');
        });
        html.push('<script type="text/javascript">');
        html.push(dustTemplates());
        html.push('</script>');
        callback(null, html.join('\n'));
    });
}

function topLevelHTML(options, callback) {
    (options.inline ? inlineContent : remoteContent)(function (err, content) {
        if (err) {
            callback(err);
            return;
        }
        var context = _({
            title: 'Avrodoc',
            content: content,
            schemata: '[]'
        }).extend(options || {});

        context.isSchemaRegistry = context.source.type=='schema-registry';
        context.isFileSystem = !context.isSchemaRegistry;

        if (typeof(context.schemata) !== 'string') {
            context.schemata = JSON.stringify(context.schemata);
        }
        client_html(context, callback);
    });
}

exports.dustTemplates = dustTemplates;
exports.topLevelHTML = topLevelHTML;
