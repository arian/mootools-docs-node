
/**
 * Module dependencies.
 */

// all can be installed via npm
var express = require('express'),
	yaml = require('yaml').eval,
	markdown = require('markdown').parse,
	koala = {
		JavaScript: require('./koala/koala/grammars/javascript').JavaScript,
		HTML: require('./koala/koala/formatters/html').HTML
	},
	jsdom = require('jsdom'),
	fs = require('fs');

require('mootools');

var app = module.exports = express.createServer();

// Packages configuration
var config = require('./config');

// Configuration

app.configure(function(){
	app.set('views', __dirname + '/views');
	app.set('view engine', 'html');
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(app.router);
	app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
	app.use(express.errorHandler({
		dumpExceptions: true,
		showStack: true
	})); 
});

app.configure('production', function(){
	app.use(express.errorHandler()); 
});

// So .html files will be rendered by ejs
app.register('html', require('ejs'));

// Routes

var routes = {'/': null};
Object.keys(config.packages).forEach(function(packageName){
	routes[('/' + packageName + '(/*)?')] = packageName;
});

Object.forEach(routes, function(packageName, route){

	app.get(route, function(req, res){

		if (!packageName) packageName = config.defaultPackage;

		var packageConfig = config.packages[packageName],
			path = packageConfig.path,
			file = req.params[0];

		if (file) file = (packageConfig.folder + '/' + file).replace(/(\/)$/, '');

		var steps = {
			
			isReady: function(){
				return this.menu && this.content;
			},

			// Building menu and stuff
			
			readYaml: function(){
				fs.readFile(path + '/package.yml', function(err, data){
					if (err) throw err;
					steps.parseYaml(data.toString());
				});
				return this;
			},

			parseYaml: function(data){
				var manifest = yaml(data);

				this.menu = Object.map(manifest.docs || steps.sourcesToDocs(manifest.sources), function(group){
					return group.map(function(file){
						return file.replace(/(\.md)$/, '').replace(new RegExp('^' + packageConfig.folder + '\\/', ''), '');
					});
				});

				// If we couldn't begin directly with fetching the md, we can do it now
				if (!file) steps.readMarkdown(manifest.docsindex);
				
				// If everyting is ready we can now render
				if (steps.isReady()) steps.render();
			},

			sourcesToDocs: function(sources){
				var menu = {};
				sources.forEach(function(file){
					var match = file.match(/^(Source)\/(\w+)\/([\w\._-]+)\.js$/);
					if (match) (menu[match[2]] || (menu[match[2]] = [])).push(match[2] + '/' + match[3]);
				});
				return menu;
			},

			// Fetching the markdown

			readMarkdown: function(filePath){

				fs.readFile(path + '/' + filePath, function(err, data){
					
					if (err){
						//res.redirect('/');
						return;
					}

					var md = data.toString(),
						html = markdown(md);

					steps.content = html;

					// We can render the page
					if (steps.isReady()) steps.render();
					
				});
			},
			
			render: function(){
				
				jsdom.env(this.content, function(errors, window){
					
					var document = window.document;
		
					// highlighting
					var codes = document.getElementsByTagName('code');
					for (var i = codes.length; i--;){
						var code = codes[i].innerHTML;
						if (!code.match(/&lt;\w+/)){ // is not html?
							codes[i].innerHTML = koala.HTML.render(koala.JavaScript, code);
						}
					}

					// replace the {#...} with the right stuff and collect them
					var methods = [];
					for (var h = 1; h <= 6; h++){
						var hs = document.getElementsByTagName('h' + h);
						for (var j = 0, l = hs.length; j < l; j++){
							var heading = hs[j],
								match = heading.innerHTML.match(/^(.*?)\{#(.*)\}/);

							if (!match) continue;

							var a = document.createElement('a');
							a.innerHTML = match[1].trim();
							a.setAttribute('href', '#' + match[2]);
							heading.setAttribute('id', match[2]);
							heading.innerHTML = '';
							heading.appendChild(a);		
							
							methods.push(match[2]);
						}
					}

					steps.methods = steps.fixMethods(methods);
					steps.respond(document.body.innerHTML);
				});
			},
			
			fixMethods: function(list){
				var methods = {};
				
				list.forEach(function(method){
					var tmp = method.split(':');
					if (tmp.length > 1){
						(methods[tmp[0]] || (methods[tmp[0]] = [])).push(tmp.slice(1).join(':'));
					} else if (!methods[method]) {
						methods[method] = [];
					}
				});
				return methods;
			},

			respond: function(content){
				res.render('index', {
					content: content,
					menu: this.menu,
					methods: this.methods,
					'package': packageName
				});
			}

		};

		// Start the steps, beginning with reading out the yaml
		steps.readYaml();
		// If the file is already known, we can begin reading the markdown
		if (file) steps.readMarkdown(file + '.md');

	});	
	
});

app.listen(3000);
console.log('Express app started on port 3000');
