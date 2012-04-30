// ***************
// Events
// ***************

$('.selectable-link a.selector').live('click', function() {
	toggleSelectableLink(this);
	return false;
});


// ***************
// Functions
// ***************

function toggleSelectableLink(link_elem) {
	// Get the target element
	var target_id = $(link_elem).attr('class').replace(/selector|selected|\s*/g, "");
	var target_elem = $('#'+target_id);
	
	// Select
	if (!$(link_elem).hasClass('selected')) {
		// Get the correct size to animate to
		$(target_elem).show();
		var width = $(target_elem).width();
		var height = $(target_elem).height();
		$(target_elem).hide();
		
		// Hide all the child elements
		$(target_elem).children().hide();
		
		// Show the target element
		$(target_elem).show();
		// slide down content
		$(target_elem).animate({
			width: width,
			height: height
		}, 500, function() {
			// Fade in the child elements
			$(target_elem).children().fadeIn();
			// add selected class
			$(link_elem).addClass('selected');
			$(target_elem).addClass('selected');
			// Get rid of custom styling
			$(target_elem).removeAttr('style');
		});
	// Deselected
	} else {
		// Get the current width and height
		var width = $(target_elem).width();
		var height = $(target_elem).height();
		
		// Fade out all the child elements
		$(target_elem).children().fadeOut(400, function() {
			// Reset the container width and height
			$(target_elem).width(width);
			$(target_elem).height(height);
			
			// Hide the target element
			$(target_elem).slideUp(500, function() {
				// remove selected class
				$(link_elem).removeClass('selected');
				$(target_elem).removeClass('selected');
				// Get rid of custom styling
				$(target_elem).removeAttr('style');
			});
		});
		
		
	}
}
