/**
* Module dependencies.
*/
var cluster = require('cluster'),
	http = require('http'),
	conf = require('node-config'),
	saturn = require('./lib/saturn.js'),
	cron = require('cron').CronJob;

var app;

/**
* Initial bootstrapping
*/
exports.boot = function(port,path){
	
	conf.initConfig(function(err) {
		
		//Create our express instance	
		app = require('./app').boot();
		
		var proc = cluster(app)
			.use(cluster.reload(['lib', __dirname+'/models', __dirname+'/controllers'], { interval: 1000 }))
			.set('working directory', path)
			.set('socket path',path)
			.in('development')
				.set('workers', 4)	    
				.use(cluster.logger(path + '/logs', 'debug'))
				.use(cluster.debug())	   
				.use(cluster.pidfiles(path + '/pids'))
			.in('test')
				.set('workers', 2)
				.use(cluster.logger(path + '/logs', 'warning'))	    
				.use(cluster.pidfiles(path + '/pids'))
			.in('production')
				.set('workers', 4)
				.use(cluster.logger(path + '/logs'))	    
				.use(cluster.pidfiles(path + '/pids'))
			.in('all')
				.listen(conf.port);
		
		/**/
		if (!proc.isWorker) {
			cron('*/3 * * * * *', function () {
				var cron_controller = require('./controllers/CronController');
				try {
					cron_controller.tick(app);
				} catch (ex) {
					console.log("Something really bad happened... "+ex);
				}
			});
			
			// In 2 seconds, try to launch the twitter stream
			setTimeout(function () {
				var host = "local.saturn.io";
				var port = 3000;
				var client = http.createClient(port, host);
				var url = "/twitter/stream";
				var rand = Math.round(Math.random()*1000);
	            var request = client.request("GET", url, {host: host, port: port});
				client.addListener('error', function(error) {
					console.log('ERROR' + error.message);
				});
	            request.addListener("response", function(response) {
	                var body = "";
	                response.addListener("data", function(data) {
	                    body += data;
	                });
	                response.addListener("end", function() {
						// nothing?
	                });
	            });
	            request.end();
			}, 3000);
		}
		/**/
	}, 'conf');
};

