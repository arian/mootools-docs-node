
var yaml = require('yaml').eval,
	fs = require('fs');

fs.readFile('../mootools-core/package.yml', function(err, data){

	console.log(yaml(data.toString()));

});

