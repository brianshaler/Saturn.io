var activity_items = {};
var current_view;
var all_views = {};
var max_link_length = 34;

var COLOR_LAME = [[251, 251, 251], [246, 246, 246]];
var COLOR_AVERAGE = [[251, 251, 251], [246, 246, 246]];
var COLOR_IMPORTANT = [[225, 234, 235], [240, 245, 246]];

var MODE_COLLAPSED = "collapsed";
var MODE_NORMAL = "normal";
var MODE_EXPANDED = "expanded";
var MODE_SELECTED = "selected";



key('k, up', previous_activity_item);
key('j, down', next_activity_item);
key('esc', deselect_all);
//key('ctrl+r, ⌘+r', );



function previous_activity_item () {
	//console.log("j, down!");
	var current_selection = $('.activity-item-selected', current_view.div).data('obj');
	if (current_selection) {
		//console.log(current_selection);
		//current_selection.div.removeClass('activity-item-selected')
		current_selection.deselect();
		current_selection = current_selection.div.prev().data('obj');
		if (current_selection) {
			current_selection.select();
			if ($(window).scrollTop() > current_selection.div.offset().top - current_selection.div.parent().offset().top) {
				$(window).scrollTop(current_selection.div.offset().top - current_selection.div.parent().offset().top);
			}
		} else
		if (current_view.new_items.length > 0) {
			
		}
		return false;
	}
}
function next_activity_item () {
	//console.log("j, down!");
	var current_selection = $('.activity-item-selected', current_view.div).data('obj');
	if (current_selection) {
		//console.log(current_selection);
		//current_selection.div.removeClass('activity-item-selected')
		current_selection.deselect();
		current_selection = current_selection.div.next().data('obj');
		if (current_selection) {
			current_selection.select();
		}
		if ($(window).height()+$(window).scrollTop() < current_selection.div.offset().top + current_selection.div.outerHeight()) {
			$(window).scrollTop(current_selection.div.offset().top + current_selection.div.outerHeight()-$(window).height());
		}
		return false;
	} else {
		if ($('.activity-item', current_view.div).filter(":first").data('obj')) {
			$('.activity-item', current_view.div).filter(":first").data('obj').select();
		}
	}
}
function deselect_all () {
	$('.activity-item-selected').each(function (i, item) {
		var ai = $(item).data('obj');
		if (ai) {
			ai.deselect();
		}
	});
	if (current_view.new_items.length > 0) {
		current_view.show_new_items();
	}
}


/** /
function current_view () {
	return get_view(current_activity_view.name);
}
function get_view (_name) {
	if (!all_views[_name]) {
		all_views[_name] = $(".stream-"+_name);
	}
	return $(".stream-"+_name);
}
/**/


function ActivityView (_name, _url) {
	var self = this;
	self.active = true;
	self.name = _name;
	self.url = _url;
	self.new_items = [];
	self.all_items = {};
	self.newest_item = 0;
	self.sort_by = "int_created_at";
	self.sort_order = "desc";
	self.rating_mode = "overall";
	self.minimum_rating = -100;
	self.collapse_below = 0;
	//self.div = get_view(self.name);
	self.div = $(".stream-"+self.name);
	self.new_item_alert = $("<div class=\"new-item-alert\"><a href=\"#\"></a></div>");
	$("a", self.new_item_alert).bind('click', function (e) { e.preventDefault(); return self.show_new_items(); });
	
	current_view = self;
	
	if (self.url) {
		setInterval(function () { self.fetch_items(); }, 10000);
	}
	setInterval(function () { self.update_times(); }, 10000);
}
ActivityView.prototype.set_sort = function (sort) {
	var self = this;
	var sorts = sort.split(" ");
	if (sorts.length > 0) {
		self.sort_by = sorts[0];
	}
	if (sorts.length > 1) {
		if (sorts[1].toLowerCase() == "asc") {
			self.sort_order = "asc";
		} else {
			self.sort_order = "desc";
		}
	}
}


ActivityView.prototype.fetch_items = function () {
	var self = this;
	
	if (!self.active) { return; }
	
	$.getJSON(self.url+"?since="+(self.newest_item-60), function (data) {
		if (data && data.length > 0) {
			data.forEach(function (item) {
				if (item.ratings) {
					if (self.all_items[item._id]) {
					
					} else {
						self.add_item(item);
					}
				}
			});
		}
		self.update_times();
	});
}
ActivityView.prototype.update_times = function () {
	var self = this;
	
	$('.activity-item', self.div).each(function (i, item) {
		var obj = $(item).data('obj');
		if (obj) {
			obj.set_time();
		}
	});
}


ActivityView.prototype.add_item = function (data) {
	var self = this;
	
	if (self.all_items[data._id]) { return; }
	var item = new ActivityItem(data);
	self.all_items[data._id] = item;
	item.my_view = self;
	var c = item.int_created_at;
	if (c > self.newest_item) {
		self.newest_item = Math.ceil(c);
	}
	var selected_item = $('.activity-item-selected', self.div).data('obj');
	if (!selected_item && self.new_items.length == 0) {
		item.display();
	} else {
		if (self.minimum_rating > -100 && item.ratings[self.rating_mode] < self.minimum_rating) {
			return;
		} else {
			self.new_items.push(item);
			self.new_new_item();
		}
	}
}
ActivityView.prototype.new_new_item = function () {
	var self = this;
	
	self.div.prepend(self.new_item_alert);
	self.new_item_alert.show();
	$("a", self.new_item_alert).html(self.new_items.length+" new item"+(self.new_items.length == 1 ? "" : "s"));
	
}
ActivityView.prototype.show_new_items = function (e) {
	var self = this;
	var items_to_add = self.new_items;
	self.new_items = [];
	
	deselect_all();
	
	items_to_add.forEach(function (item) {
		item.display();
	});
	
	self.new_item_alert.hide();
	
	return false;
}
ActivityView.prototype.deactivate = function () {
	var self = this;
	self.active = false;
}




function ActivityItem (data) {
	var self = this;
	var div = $("<div class=\"activity-item\">");
	self.div = div;
	div.data('obj', self);
	var item = data;
	self.item = item;
	self.my_view = false;
	
	self.mode = MODE_NORMAL;
	
	self.opacity = 1;
	self.color = COLOR_IMPORTANT;
	
	self.user = {};
	self.message = "";
	for (var k in data) {
		self[k] = data[k];
	}
	var id = self._id || self.id;
	item._id = self._id = self.id = id;
	item.parsed_message = self.get_message();
	item.avatar_url = self.get_avatar_url();
	self.int_created_at = Date.parse(self.created_at) / 1000;
	self.rating = self.ratings && self.ratings.overall ? self.ratings.overall : -100;
	
	div.html(new EJS({url: '/js/templates/activity_item.ejs'}).render(item));
	div.bind('mouseenter', function (e) { self.div.addClass('activity-item-hover'); });
	div.bind('mouseleave', function (e) { self.div.removeClass('activity-item-hover'); });
	div.bind('size_changed', function (e) { self.size_changed(); });
	$(".expand-item", div).bind('click', function (e) { return self.expand(e); });
	self.div.bind('click', function (e) { if (self.mode != MODE_EXPANDED) { self.expand(); } });
	$(".collapse-item", div).bind('click', function (e) { return self.collapse(e); });
	$(".like-item", div).bind('click', function (e) { return self.like(e); });
	$(".dislike-item", div).bind('click', function (e) { return self.dislike(e); });
	
	$(".activity-item-text a", div).each(function (i, link) {
		var txt = $(link).html();
		if (txt.length > max_link_length) {
			$(link).html(txt.substring(0, max_link_length-4)+"...");
		}
	});
	self.set_time();
	
	activity_items[self.id] = self;
}

ActivityItem.prototype.display = function () {
	var self = this;
	var items = $(".activity-item", self.my_view.div);
	var inserted = false;
	var field = self.my_view.sort_by;
	var sort_order = self.my_view.sort_order;
	
	var add_topic_click = function (e) {
		e.preventDefault();
		
		console.log("Clicked!");
		$(".add-topic", self.div).addClass("show-form");
		self.size_changed();
		$(".add-topic form input", self.div).focus();
		$(".add-topic", self.div).unbind('mouseup', add_topic_click);
		
		return false;
	};
	$(".add-topic", self.div).bind('mouseup', add_topic_click);
	$(".add-topic form", self.div).bind('submit', function (e) {
		e.preventDefault();
		e.stopPropagation();
		
		var text = $(".add-topic form input", self.div).val();
		if (text.length > 0) {
			$(".add-topic", self.div).before($("<a href=\"/topic/bytext/"+text+"\">"+text+"</a>"));
		}
		$(".add-topic form input", self.div).val("");
		$(".add-topic", self.div).removeClass("show-form");
		$(".add-topic", self.div).bind('mouseup', add_topic_click);
		
		$.getJSON("/item/add_topic/"+self._id+".json?text="+text, function (data) {
		});
		
		
		return false;
	});
	
	var rating_mode = self.my_view.rating_mode;
	
	if (self.ratings[rating_mode]) {
		rating = parseInt(self.ratings[rating_mode]);
		if (rating < self.my_view.collapse_below) {
			self.mode = MODE_COLLAPSED;
		}
	}
	self.starting_mode = self.mode;
	self.set_mode();
	
	if (self.my_view.minimum_rating > -100 && self.ratings[rating_mode] < self.my_view.minimum_rating) {
		// nothing?
	} else {
		items.each(function (i, item) {
			if (!inserted) {
				var ai = $(item).data('obj');
				if (ai && ((sort_order == "desc" && ai[field] < self[field]) || (sort_order == "asc" && ai[field] > self[field]))) {
					inserted = true;
					$(item).before(self.div);
				}
			}
		});
		if (!inserted) {
			self.my_view.div.append(this.div);
		}
		self.size_changed();
	}
	return self;
}

ActivityItem.prototype.set_time = function () {
	var self = this;
	var time_div = $('.activity-item-time-ago', self.div);
	var ctime = (new Date()).getTime()/1000;
	var diff = ctime - self.int_created_at;
	if (diff < 60) {
		str = "<1m";
	} else
	if (diff < 60*60) {
		str = Math.round(diff/60)+"m";
	} else
	if (diff < 60*60*24) {
		str = Math.round(diff/60/60)+"h";
	} else
	if (diff < 60*60*24*30) {
		str = Math.round(diff/60/60/24)+"d";
	} else {
		var d = new Date(self.int_created_at*1000);
		str = (d.getMonth()+1) + "/" + d.getDate() + (d.getFullYear() != (new Date()).getFullYear() ? "/" + d.getFullYear() : "");
	}
	time_div.html(str);
}

ActivityItem.prototype.set_mode = function (mode) {
	var self = this;
	
	if (mode) {
		self.mode = mode;
	}
	
	self.div.removeClass("activity-item-collapsed");
	self.div.removeClass("activity-item-expanded");
	
	if (self.mode == MODE_COLLAPSED) {
		self.div.bind('click', function (e) { return self.expand(e); });
		self.div.addClass("activity-item-collapsed");
	} else {
		self.div.unbind('click');
		if (self.mode == MODE_EXPANDED) {
			self.div.addClass("activity-item-expanded");
		}
	}
	self.div.trigger('size_changed');
}

ActivityItem.prototype.expand = function (e) {
	var self = this;
	
	if (e) { e.preventDefault(); }
	self.set_mode(MODE_EXPANDED);
	self.select();
	return false;
}
ActivityItem.prototype.collapse = function (e) {
	var self = this;
	
	if (e) { e.preventDefault(); }
	self.set_mode(self.starting_mode);
	deselect_all();
	return false;
}

ActivityItem.prototype.select = function (e) {
	var self = this;
	
	if (e) {
		e.preventDefault();
	}
	if (self.mode != MODE_EXPANDED) {
		self.expand();
	}
	$('.activity-item-selected', self.my_view.div).removeClass('activity-item-selected').trigger('size_changed');
	self.div.addClass('activity-item-selected').trigger('size_changed');
	return false;
}

ActivityItem.prototype.deselect = function (e) {
	var self = this;
	
	if (e) {
		e.preventDefault();
	}
	if (self.mode == MODE_EXPANDED) {
		self.collapse();
	}
	$('.activity-item-selected', self.my_view.div).removeClass('activity-item-selected').trigger('size_changed');
	return false;
}

ActivityItem.prototype.size_changed = function (e) {
	var self = this;
	var new_height = $(".media", self.div).outerHeight();
	//new_height += self.div.css('padding-top')*2;
	
	/** /
	if (self.mode == MODE_COLLAPSED) {
		new_height += 4;
	} else {
		if (self.mode == MODE_EXPANDED) {
			new_height += 18;
		} else {
			new_height += 18;
		}
	}/**/
	
	self.div.css('height', new_height);
}

ActivityItem.prototype.like = function (e) {
	var self = this;
	
	if (e) {
		e.preventDefault();
	}
	$.getJSON("/item/like/"+self._id+".json", function (data) {
		// liked
		self.starting_mode = MODE_NORMAL;
	});
	return false;
}
ActivityItem.prototype.dislike = function (e) {
	var self = this;
	
	if (e) {
		e.preventDefault();
	}
	$.getJSON("/item/dislike/"+self._id+".json", function (data) {
		// disliked
	});
	self.div.remove();
	return false;
}




ActivityItem.prototype.get_avatar = function () {
	return "<a href=\"/identity/view/"+this.user._id+"\"><img class=\"activity-item-avatar\" src=\""+this.get_avatar_url()+"\"></a>";
}
ActivityItem.prototype.get_avatar_url = function () {
	var url = "/images/saturn/logo_t.png";
	if (this.user && this.user.photo && this.user.photo.length > 0 && this.user.photo[this.user.photo.length-1] && this.user.photo[this.user.photo.length-1].url) {
		url = this.user.photo[this.user.photo.length-1].url;
	}
	return url;
}
ActivityItem.prototype.get_message = function () {
	return this.message.link_urls().link_hashtags().link_screen_names();
}


if (!String.prototype.link_urls) {
	String.prototype.link_urls = function () {
		var url_pattern = /(\(?\b)(https?:\/\/[-A-Za-z0-9+&@#\/%?=~_()|!:,.;]*[-A-Za-z0-9+&@#\/%=~_()|])/gi;
		return this.replace(url_pattern, "$1<a href='$2' class='truncate-link'>$2</a>");
	}
}
if (!String.prototype.link_hashtags) {
	String.prototype.link_hashtags = function () {
		var hash_pattern = /(^|\s)#([-A-Za-z0-9_]+)(\b)/gi;
		return this.replace(hash_pattern, "$1<a href='/topic/bytext/$2'>#$2</a>$3");
	}
}
if (!String.prototype.link_screen_names) {
	String.prototype.link_screen_names = function () {
		var at_pattern = /(^|\s|[^a-zA-Z0-9_\-+])@([-A-Za-z0-9_]+)(\b|\s|[^a-zA-Z0-9]|$)/gi;
		return this.replace(at_pattern, "$1<a href='/identity/byusername/$2'>@$2</a>$3");
	}
}
