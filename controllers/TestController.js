exports.controller = function(req, res) {
	Controller.call(this, req, res);
	
	this.index = function() {
		if (req.params.format == "json") {
			this.send({title: "Express TEST"});
		} else {
			this.render('index', {
				locals: {
					title: 'Express TEST'
				}
			});
		}
	}
	
	this.testing = function() {
		if (req.params.format == "json") {
			this.send({title: "Testing!"});
		} else {
			this.send('testing!');
		}
	}
};