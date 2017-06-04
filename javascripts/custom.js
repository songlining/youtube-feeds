
$(function(){
    new Clipboard('.btn');
    $.get('/api/playlists', function (data, status) {
	let playlists = data.playlists;
	for (let i = 0, len = playlists.length; i < len; i++) {
	    let id = playlists[i].id;
	    let title = playlists[i].title;
	    $('div.btn-group-lg').append(`
<button class="btn btn-primary btn-sm has-spinner" data-clipboard-text="http://${location.host}/api/feed/${id}" playlist="${id}">
  ${title}
  <span class="spinner"><img src="/spinner.gif" width="10" height="10"></span>
</button>
				      `);
	}
    });
    $(document).on("click", ".btn-primary", function (event) {
        var elem = $(event.currentTarget);
        elem.addClass('active');
	var playlist = elem.attr('playlist');
	$.ajax({url: `/api/playlist/${playlist}`, success: function(result){
            elem.removeClass('active');
	    console.log(result);
	}});
    });
})

