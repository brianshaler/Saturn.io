var Saturn = 
{
	requires_login: function (req, res, me) {
		if (!me.isUser()) {
			res.render('users/login', {user_name: '', return_url: req.url, errors: []});
			return false;
		} else {
			return true;
		}
	},
	
	api_call: function (options, cb) {
		if (options.host.indexOf(":") > 0) {
			options.host = options.host.substring(0, options.host.indexOf(":"));
		}
		options.port = (this.conf.live === true ? 80 : this.conf.port);
		if (options.me && options.me.isUser()) {
			if (options.path.indexOf("?") > 0) {
				options.path += "&";
			} else {
				options.path += "?";
			}
			options.path += "_session_key="+options.me.getSessionKey()+"&_session_token="+options.me.generateToken();
			options.me = undefined;
		}
		
		this.http.get(options, function(_res) {
			var page_data = "";
			_res.setEncoding('utf8');
			_res.on('data', function (chunk) {
				page_data += chunk;
			});
			
			_res.on('end', function () {
				if (page_data.charAt(0) == "[" || page_data.charAt(0) == "{") {
					page_data = JSON.parse(page_data);
				}
				cb(null, page_data);
			});
		}).on('error', function (err) {
			cb(err);
		});
	},
	
	create_coord_str: function (places) {
		
		var markers = [];
		var coords = [];

		var clat = 0;
		var clng = 0;
		var min_lat = -1;
		var min_lng = -1;
		var max_lat = -1;
		var max_lng = -1;

		places.forEach(function (place) {
			var loc = {lat: place.location[1], lng: place.location[0]};
			if (min_lat == -1 || loc.lat < min_lat) {
				min_lat = loc.lat;
			}
			if (max_lat == -1 || loc.lat > max_lat) {
				max_lat = loc.lat;
			}
			if (min_lng == -1 || loc.lng < min_lng) {
				min_lng = loc.lng;
			}
			if (max_lng == -1 || loc.lng > max_lng) {
				max_lng = loc.lng;
			}
			coords.push(loc);
		});
		clat = (max_lat-min_lat)/2 + min_lat;
		clng = (max_lng-min_lng)/2 + min_lng;
		var variance = .001;
		var max_points = 15;
		if (coords.length == 0) {
			return "";
		}
		if (coords.length < 3) {
			coords.push({lat: coords[0].lat+Math.random()*variance*2-variance, lng: coords[0].lng+Math.random()*variance*2-variance});
		}
		if (coords.length < 4) {
			coords.push({lat: coords[1].lat+Math.random()*variance*2-variance, lng: coords[1].lng+Math.random()*variance*2-variance});
		}
		coords.sort(function (a, b) {
			return Math.atan2(a.lat-clat, a.lng-clng) < Math.atan2(b.lat-clat, b.lng-clng) ? 1 : -1;
		});

		coord_str = "path=color:0x00000000%7Cweight:5%7Cfillcolor:0xFF110099";
		var counter = 0;
		coords.forEach(function (coord) {
			if (counter == 0 || counter % Math.ceil(coords.length/max_points) == 0) {
				coord_str += "%7C" + coord.lat + "," + coord.lng;
			}
			counter++;
		});
		return coord_str;
	}
};

Saturn.http = require('http');
Saturn.conf = require('node-config');

module.exports = Saturn;


if (!Array.prototype.to_public)
{
	Array.prototype.to_public = function () {
		var arr = [];
		this.forEach(function (item) {
			arr.push(item.to_public());
		});
		return arr;
	}
}
