
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
	    let playlist = url.substr(url.lastIndexOf('=') + 1);
	    $.ajax({url: `/api/playlist/${playlist}`, success: function(result){
		poll_playlist_add_status(playlist, 1, 10);
	    }});
	}
    });
})

function poll_playlist_add_status(playlist, counter, loops) {
    console.log(`${counter} : ${loops}`);
    if (counter == loops) {
	return;
    }
    $.get(`/api/info/playlist/${playlist}`)
	.always(function(result) {
	    if (result.result == 'success') {
		let title = result.info.title;
		console.log(`title: ${title}`)
		$('div.btn-group-lg').append(`
					     <button class="btn btn-primary btn-sm has-spinner" data-clipboard-text="http://${location.host}/api/feed/${playlist}" playlist="${playlist}">
					     ${title}
					     <span class="spinner"><img src="/spinner.gif" width="20" height="20"></span>
					     </button>
					     `);
	    } else {
		setTimeout(poll_playlist_add_status(playlist, ++counter, loops), 5000); 
	    }
	});
}

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
