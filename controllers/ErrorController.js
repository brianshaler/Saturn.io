
/**
 *  Error Controller
 **/
var sys = require('sys');

module.exports = {
	index: function(req, res, next, me) {
		return res.render("500");
	}
};