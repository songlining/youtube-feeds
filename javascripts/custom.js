
$(function(){
    new Clipboard('.btn');
    show_playlists();
    $(document).on("click", ".btn-primary", function (event) {
        let elem = $(event.currentTarget);
        elem.addClass('active');
	let playlist = elem.attr('playlist');
	$.ajax({url: `/api/playlist/${playlist}`, success: function(result){
            elem.removeClass('active');
	    console.log(result);
	}});
    });
    $(document).on("click", "#add_url.btn", function (event) {
	let url = $('#url').val();
	if (!validate_url(url)) {
	    alert(`URL format must be either: 
  https://www.youtube.com/playlist?list=... or 
  https://www.youtube.com/user/... or 
  https://www.youtube.com/channel/...`);
	    return;
	}
	if (url.startsWith('https://www.youtube.com/playlist?list=')) {
	    var playlist = url.substr(url.lastIndexOf('=') + 1);
	    $.ajax({url: `/api/playlist/${playlist}`, success: function(result){
		show_playlists();
	    }});
	}
    });
})

function validate_url(url) {
    return url.startsWith('https://www.youtube.com/playlist?list=') ||
           url.startsWith('https://www.youtube.com/channel/') ||
           url.startsWith('https://www.youtube.com/user/') ;
}

function show_playlists() {
    $('div.btn-group-lg').empty();
    $.get('/api/playlists', function (data, status) {
	let playlists = data.playlists;
	for (let i = 0, len = playlists.length; i < len; i++) {
	    let id = playlists[i].id;
	    let title = playlists[i].title;
	    $('div.btn-group-lg').append(`
<button class="btn btn-primary btn-sm has-spinner" data-clipboard-text="http://${location.host}/api/feed/${id}" playlist="${id}">
  ${title}
  <span class="spinner"><img src="/spinner.gif" width="20" height="20"></span>
</button>
				      `);
	}
    });
}
