
$(function(){
    new Clipboard('.btn');
    show_playlists();
    $(document).on("click", ".playlist", function (event) {
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
  http(s)://www.youtube.com/playlist?list=... or 
  http(s)://www.youtube.com/user/... or 
  http(s)://www.youtube.com/channel/...
		 `);
	    return;
	}
	url = url.match(/(https?:[^\s]+)/)[1];
	if (url.startsWith('https://www.youtube.com/playlist?list=') ||
	    url.startsWith('http://www.youtube.com/playlist?list=')) {
	    let playlist = url.substr(url.lastIndexOf('=') + 1);
	    $.ajax({url: `/api/playlist/${playlist}`, success: function(result){
		poll_playlist_add_status(playlist, 1, 10);
	    }});
	} else if (url.startsWith('https://www.youtube.com/channel/') ||
		   url.startsWith('http://www.youtube.com/channel/') ||
		   url.startsWith('https://www.youtube.com/user/') ||
		   url.startsWith('http://www.youtube.com/user/')) {
	    $.ajax({url: '/api/url', 
		    data: 'url=' + url,
		    type: "POST", 
		    success: function(result){
			let playlist = result.playlist_id;
			console.log(`channel playlist: ${playlist}`);
			$.ajax({url: `/api/playlist/${playlist}`, success: function(result){
			    poll_playlist_add_status(playlist, 1, 10);
			}});
		    }});
	}
    });
    $(document).on("click", ".delete", function (event) {
        let elem = $(event.currentTarget);
	let playlist = elem.attr('playlist');
	$.ajax({url: `/api/playlist/${playlist}`, type: "DELETE", success: function(result){
	    console.log("DELETE done, removing the element.");
            $(`tr#${playlist}`).remove();
	}});
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
		add_playlist(playlist, title);
	    } else {
		setTimeout(poll_playlist_add_status(playlist, ++counter, loops), 5000); 
	    }
	});
}

function validate_url(url) {
    return url.startsWith('https://www.youtube.com/playlist?list=') ||
           url.startsWith('http://www.youtube.com/playlist?list=') ||
           url.startsWith('https://www.youtube.com/channel/') ||
           url.startsWith('http://www.youtube.com/channel/') ||
           url.startsWith('https://www.youtube.com/user/') ||
           url.startsWith('http://www.youtube.com/user/') ;
}

function show_playlists() {
    // $('div.btn-group-lg').empty();
    $.get('/api/playlists', function (data, status) {
	let playlists = data.playlists;
	for (let i = 0, len = playlists.length; i < len; i++) {
	    let id = playlists[i].id;
	    let title = playlists[i].title;
	    add_playlist(id, title);
	}
    });
}

function add_playlist(id, title) {
    if (!$(`tr#${id}`).length) {
	$('table#playlists').append(`
<tr id="${id}">
  <td>
    <button style="width:100%" class="btn btn-primary btn-sm has-spinner playlist" data-clipboard-text="http://${location.host}/api/feed/${id}" playlist="${id}">
      ${title}
      <span class="spinner"><img src="/spinner.gif" width="20" height="20"></span>
    </button>
  </td>
  <td>
    <button style="width:100%" class="btn btn-sm delete" playlist="${id}">
      <span><img src="/delete.png" width="15" height="15"></span>
    </button>
  </td>
</tr>
				    `);
    } else {
	console.log(`playlist ${id} already exists in the list`)
    }
}
