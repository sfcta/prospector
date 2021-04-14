'use strict';

/*
SFCTA PROSPECTOR: Data visualization platform.

Copyright (C) 2018 San Francisco County Transportation Authority
and respective authors. See Git history for individual contributions.

This program is free software: you can redistribute it and/or modify
it under the terms of the Apache License version 2.0, as published
by the Apache Foundation, or any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the Apache License for more details.

You should have received a copy of the Apache License along with
this program. If not, see <https://www.apache.org/licenses/LICENSE-2.0>.
*/

// Must use npm and babel to support IE11/Safari

///////////////////////////////// IMPORTS /////////////////////////////////////

import 'isomorphic-fetch';
import Cookies from 'js-cookie';

///////////////////////////////// SETUP ////////////////////////////////////////

var maplib = require('../jslib/maplib');
let mymap = maplib.sfmap;
mymap.setView([37.76889, -122.440997], 13);

// Maps the *full INRIX network GID* to an object with features of that GID
let gid_to_attrs = {};

// Current selected links. Right now includes both full INRIX network & Aggregated Network links. TODO: FIX THIS perhaps. 
let selected_links = new Set();

// A list of all cmp_segids *in the Aggregated INRIX network*. Useful for generating new segids for user-created aggregations. 
let agg_segids;

// A list of all GIDs *in the Aggregated INRIX network*. Useful for generating new GIDs for user-created aggregations. 
let agg_gids;

// Tooltip
let geoPopup;

// Three layers of the map:
let fullinrix_layer;   // Full INRIX network 
let agg_layer;         // Aggregated Network
let newaggs_layer;     // User-defined aggregations not yet committed to Aggregated network

// Data for each layer
let fullinrix_data;
let agg_data; 
var newaggs_data = [];

async function initialPrep() {

  app.segmentLength = 0;

  // Add color to buttons (move to html/css)
  document.getElementsByClassName("layer_description")[0].style.color = 'CornflowerBlue';
  document.getElementsByClassName("layer_description")[1].style.color = 'Green';
  document.getElementsByClassName("layer_description")[2].style.color = 'Orange';

  fullinrix_data = await getFullINRIXLinks();
  agg_data = await getAggLinks();

  // Click Full INRIX Network button
  document.getElementsByClassName("layerbutton")[1].click();

  // End Loader
  document.getElementById("dimmer").outerHTML = "";
}

async function getFullINRIXLinks() {
  try {

    let resp = await fetch('https://api.sfcta.org/api/sf_xd_2002'); 
    let segments = await resp.json();

    // Parse geometry & rename. 
    for (let segment of segments) {
      segment['type'] = 'Feature';
      segment['geometry'] = JSON.parse(segment.geometry);
      segment['clicked'] = false;
      segment['combined'] = false;
      segment['linktype'] = 'raw';
      segment['id'] = 'raw_' + String(segment.gid);
      segment['length'] = segment['miles']

      gid_to_attrs[segment['gid']] = segment;
    }
    return segments;

  } catch (error) {
    console.log('map segment error: ' + error);
  }
}


async function getAggLinks() {
  agg_gids = [];
  agg_segids = [];
  try {
    let resp = await fetch('https://api.sfcta.org/commapi/sf_xd_2002_agg'); // 'https://api.sfcta.org/commapi/sf_xd_2002_agg_view'
    let segments = await resp.json();

    // Parse geometry & rename. 
    for (let segment of segments) {
      segment['geometry'] = segment.geom; // Only diff with sf_xd_2002_agg_view is: JSON.parse(segment.geometry);
      segment['type'] = 'Feature';
      segment['clicked'] = false;
      segment['combined'] = true; 
      segment['linktype'] = 'agg';
      segment['id'] = 'agg_' + String(segment.gid);
      segment['original'] = true; 

      agg_gids.push(segment['gid'])
      agg_segids.push(segment['cmp_segid'])
    }

    return segments;


  } catch (error) {
    console.log('map segment error: ' + error);
  }
}

//////////////////////////////////////////// ADD LAYERS ////////////////////////////////////////////////////

const ADDLAYERS = [
  {name: 'Full INRIX Network'},
  {name: 'Aggregated Network'}, 
  {name: 'Uncommitted Aggregated Segments'}
]

function showExtraLayers(a, b, reset_inrix=false) {

  // Raw Layer
  if (app.addLayers.includes('Full INRIX Network')) {
    drawFullINRIXLinks(reset_inrix);
  } else {
    try {
      mymap.removeLayer(fullinrix_layer)
    } catch (e) {
      // layer not created yet
    }
  }

  // Aggregate Layer
  if (app.addLayers.includes('Aggregated Network')) {
    drawAggLinks();
  } else {
    try {
      mymap.removeLayer(agg_layer)
    } catch (e) {
      // layer not created yet
    }
  }

  // New Segments
  if (app.addLayers.includes('Uncommitted Aggregated Segments')) {
      drawNewLinks();
  } else {
    try {
      mymap.removeLayer(newaggs_layer)
    } catch (e) {
      // layer not created yet
    }
  }
}

//////////////////////////////////////////// FUNCTIONS /////////////////////////////////////////////////////

function drawFullINRIXLinks(reset_colors=false) {

  if (fullinrix_layer) mymap.removeLayer(fullinrix_layer);
  fullinrix_layer = L.geoJSON(fullinrix_data, {
    style: function(feature) {
      let col = 'CornflowerBlue';
      if (feature['clicked'] && (!reset_colors)) {
        col = '#FFD700'
      }
      return {'color': col}
    },
    onEachFeature: function(feature, layer) {
      if (reset_colors) {feature['clicked'] = false; }
      layer.on({
        mouseover: mouseoverFeature,
        mouseout: mouseoutFeature,
        click: clickedOnFeature,
      });
    },

  });
  fullinrix_layer.addTo(mymap);
}

function drawAggLinks() {
  if (agg_layer) mymap.removeLayer(agg_layer);
  agg_layer = L.geoJSON(agg_data, {
    style: {'color':'green'},
    onEachFeature: function(feature, layer) {
      feature['clicked'] = false; 
      layer.on({
        mouseover: mouseoverFeature,
        mouseout: mouseoutFeature,
        click: clickedOnFeature,
      });
    },

  });
  agg_layer.addTo(mymap);
}

function drawNewLinks() {
  if (newaggs_layer) mymap.removeLayer(newaggs_layer);
  newaggs_layer = L.geoJSON(newaggs_data, {
    style: {'color':'orange'},
    onEachFeature: function(feature, layer) {
      feature['clicked'] = false; 
      layer.on({
        mouseover: mouseoverFeature,
        mouseout: mouseoutFeature,
        //click: clickedOnFeature,
      });
    },

  });
  newaggs_layer.addTo(mymap);
}



function mouseoverFeature(e) {
  e.target.setStyle({'color':'#FFD700'})
  hoverFeature(e)
}


function mouseoutFeature(e) {
  if (!e.target.feature.clicked) {
    e.target.setStyle({'color':getLinkColor(e.target.feature)})
  } else {
    e.target.setStyle({'color':'#FFD700'})
  }
  hoverFeature(e);
}


function hoverFeature(e) {

  if (e.target.feature['linktype']=='raw') {
    var content = 'gid: ' + String(e.target.feature.gid) + '<br>' + 
        'Street: ' + e.target.feature.roadname + '<br>' + 
        'Direction: ' + e.target.feature.bearing + '<br>' + 
        'Length: ' + e.target.feature.length.toFixed(2) + ' miles'

  } else {
    var content = 'gid: ' + String(e.target.feature.gid) + '<br>' + 
        'Name: ' + e.target.feature.cmp_name + '<br>' + 
        'From: ' + e.target.feature.cmp_from + '<br>' + 
        'To: ' + e.target.feature.cmp_to + '<br>' +
        'Direction: ' + e.target.feature.direction + '<br>' + 
        'Length: ' + e.target.feature.length.toFixed(2) + ' miles <br>' + 
        'cls_hcm00: ' + e.target.feature.cls_hcm00 + '<br>' + 
        'cls_hcm85: ' +  e.target.feature.cls_hcm85

  }

  if (e.type == 'mouseover') {
    geoPopup = L.popup()
      .setLatLng(e.latlng)
      .setContent(content)
      .addTo(mymap)
  } else {
    mymap.removeControl(geoPopup)
  }
}


function getLinkColor(feature) {

  if (feature['linktype']=='raw') {
    return 'CornflowerBlue'
  } else if (feature['linktype']=='agg') {
    return 'Green'
  } else {
    return 'Orange'
  }

}


function clickedOnFeature(e) {

  if (e.target.feature['linktype']=='raw') {
    document.getElementById("agglinkdetails").style.display = "block";  
  } else if (e.target.feature['linktype']=='agg') {
    document.getElementById("agglinkdetails").style.display = "none";  
    createRemoveFromDBButton();
  }


  // Edit Link
  e.target.feature['clicked'] = !e.target.feature['clicked'];
  e.target.setStyle({'color':'#FFD700'});

  var btn_id = e.target.feature.gid;

  // Handle Button
  if (!selected_links.has(btn_id)) {
    selected_links.add(btn_id);
    createLinkButton(e);
  } else {
    app.segmentLength -= e.target.feature.length;
    selected_links.delete(btn_id);
    buttonClose(e.target.feature.gid);
  }
}


function createAggButton(combination) {

  // Create button
  var text = combination.gid + ': ' + combination.cmp_name + ' From ' + combination.cmp_from + ' To ' + combination.cmp_to + ' (' + combination.direction + ')';
  var btn_id = combination.gid;

  var button = 
    `
    <div class="ui left labeled button" tabindex="0" 
    `
    + ' id="' + btn_id + '"' + 
    `
    >
      <a class="ui basic label" 
    ` 
    + ' id="' + btn_id + '_o" style="color:orange"' + 
    `
      >
    `
    + text + 
    `
      </a>
      <div class="ui icon button""
    `
        + ' id= "' + btn_id + '_x"' + 
    `
    >
    <i class="remove circle icon""></i>
      </div>
    </div>
    `
  $("#createdAggs").append(button)

  // Create button listeners

  // Main button
  //document.getElementById(btn_id+'_o').addEventListener("click", function() {buttonMain(e)})
  //document.getElementById(btn_id+'_o').addEventListener('mouseover', function() {mouseoverButton(e, btn_id)})
  //document.getElementById(btn_id+'_o').addEventListener('mouseout', function() {mouseoutButton(e, btn_id)})

  // X Button
  document.getElementById(btn_id+'_x').addEventListener("click", function() {

    buttonClose(combination.gid);

    // Remove segment, update map. 
    delete gid_to_attrs[btn_id];
    for (let i=0; i<newaggs_data.length; i++) {
      if (newaggs_data[i]['gid']==btn_id) {newaggs_data.splice(i, 1)}
    }
    for (let i=0; i<agg_data.length; i++) {
      if (agg_data[i]['gid']==btn_id) {agg_data.splice(i, 1)}
    }

  // Remove GID from the list of all aggregate GIDs. 
    for (let i=0; i<agg_gids.length; i++) {
      if (agg_gids[i]==btn_id) {agg_gids.splice(i, 1)}
    }
    showExtraLayers();
  })

  // TODO -- remove cmp_segid all_cmp_segids
}


function createLinkButton(e) {

  app.segmentLength += e.target.feature.length;

  // Create button
  if (e.target.feature.linktype=='raw') {
    var text = e.target.feature.gid + ': ' + e.target.feature.roadname + ' (' + e.target.feature.bearing + ')';
    createCombineButton();
  } else {
    var text = e.target.feature.gid + ': ' + e.target.feature.cmp_name + ' from ' + e.target.feature.cmp_from + ' to ' + e.target.feature.cmp_to;
  }
  
  var btn_id = e.target.feature.gid;
  var button = 
    `
    <div class="ui left labeled button" tabindex="0" 
    `
    + ' id="' + btn_id + '"' + 
    `
    >
      <a class="ui basic label" 
    ` 
    + ' id="' + btn_id + '_o" style="color:' + getLinkColor(e.target.feature) + '"' + 
    `
      >
    `
    + text + 
    `
      </a>
      <div class="ui icon button""
    `
        + ' id= "' + btn_id + '_x"' + 
    `
    >
    <i class="remove circle icon""></i>
      </div>
    </div>
    `
  $("#selectedLinks").append(button)

  // Create button listeners

  // Main button
  //document.getElementById(btn_id+'_o').addEventListener("click", function() {buttonMain(e)})
  //document.getElementById(btn_id+'_o').addEventListener('mouseover', function() {mouseoverButton(e, btn_id)})
  //document.getElementById(btn_id+'_o').addEventListener('mouseout', function() {mouseoutButton(e, btn_id)})

  // X Button
  document.getElementById(btn_id+'_x').addEventListener("click", function() {
    app.segmentLength -= e.target.feature.length
    buttonClose(e.target.feature.gid);
    e.target.feature['clicked'] = false; 
    mouseoutFeature(e);
    if (e.target.feature.linktype=='raw') {selected_links.delete(btn_id);}
  })
}


function buttonClose(gid) {
  document.getElementById(gid).remove();
  if ($('#selectedLinks').text().trim().length == 0 ) {
    $("#combineButton").empty()
    $("#removeLinks").empty()
    document.getElementById("agglinkdetails").style.display = "none"; 
  }

  if ($('#createdAggs').text().trim().length == 0 ) {
    $('#pushtoDb').empty()
  }
}


function createCombineButton() {
  $('#combineButton').empty()
  var button = '<button class="fluid ui blue button">Combine</button>'
  $("#combineButton").append(button)
  document.getElementById("combineButton").addEventListener("click", function() {
    document.getElementById("agglinkdetails").style.display = "none";
    combine();
    app.segmentLength = 0
  })
}

function createRemoveFromDBButton() {
  $('#removeLinks').empty()
  var button = '<button class="fluid ui red button">Remove Aggregate Link(s) From Database</button>'
  $("#removeLinks").append(button)
  document.getElementById("removeLinks").addEventListener("click", function() {
    removeFromDB()
  })
}

function createPushToDBButton() {
  $("#pushtoDb").empty();
  var button = '<button class="fluid ui blue button">Push to Database</button>'
  $("#pushtoDb").append(button)
  document.getElementById("pushtoDb").addEventListener("click", function() {pushToDB()})
}

async function removeFromDB() {

  app.segmentLength = 0; 

  // Remove all links in selected_links from db
  for (let i=0; i<Array.from(selected_links).length; i++) {

    var gid = Array.from(selected_links)[i]

    // Don't allow user to remove original aggregated links
    if (gid <= 269) {
      window.alert('Cannot remove original aggregated link segments (1-269)');
    } else {

      var write_url = 'https://api.sfcta.org/commapi/sf_xd_2002_agg?gid=eq.' + String(gid)

      try {
        var resp = await fetch(write_url, {method: 'DELETE',})
        if (resp.status==204) {
          window.alert('Successfully removed gid ' + String(gid));
        } else {
          window.alert('Failed to remove ' + String(gid));
        }
      } catch (e) {
        window.alert(resp.statusText);
        console.log('Error posting: ' + String(agg.cmp_segid))
        console.log(e)
      }

        // Reload agg-links
        agg_data = await getAggLinks();
        drawAggLinks();

        selected_links = new Set();

        // Clear link section 
        $('#removeLinks').empty()
        $('#selectedLinks').empty()
    }
  }
}

function prepareComboForDB(combo) {
  let to_push = {};
  to_push['gid'] = combo.gid;
  to_push['cmp_segid'] = combo.cmp_segid;
  to_push['geom'] = combo.geometry;
  to_push['direction'] = combo.direction;
  to_push['cmp_to'] = combo.cmp_to;
  to_push['cmp_name'] = combo.cmp_name;
  to_push['cmp_from'] = combo.cmp_from;
  to_push['length'] = combo.length;
  to_push['cls_hcm00'] = combo.cls_hcm00;
  to_push['cls_hcm85'] = combo.cls_hcm85;
  to_push['xd_ids'] = String(combo.xd_ids);

  return to_push
}


async function postAggregation(agg) {

  var write_url = 'https://api.sfcta.org/commapi/sf_xd_2002_agg'

  try {
    var resp = await fetch(write_url, {
      method: 'POST',
      body: JSON.stringify(agg),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    if (resp.statusText == 'Conflict') {
      window.alert('Conflict.');
    } else {
      window.alert(resp.statusText);
    }
    
  } catch (e) {
    console.log(e);
    if (e=='TypeError: Failed to fetch') {
      var mssg = 'Successfully posted: ' + String(agg.cmp_segid)
      window.alert(mssg);
    }
  }

}


function pushToDB() {

  $("#pushtoDb").empty();
  $('#createdAggs').empty()

  // For each aggregation
  for (let i=0; i<newaggs_data.length; i++) {
    var resp = await postAggregation(prepareComboForDB(newaggs_data[i]));
    if (resp == 'Created') {
      newaggs_data[i]['linktype'] = 'agg';
      agg_data.push(newaggs_data[i])
    } else {
      // do something
    }
  }

  // Reset
  newaggs_data = [];

  getAggLinks()
  showExtraLayers(true)
}



function combine() {

  var combination = -1;
  var new_gid = Math.max.apply(null, agg_gids) + 1;
  var segs = [];

  // Create the combination
  selected_links.forEach(function(gid) {

    if (combination==-1) {

      // Initialize 
      combination = {...gid_to_attrs[gid]};
      combination['cmp_from'] = document.getElementById('cmp_from').value;
      combination['cmp_to'] = document.getElementById('cmp_to').value;
      combination['cmp_name'] = document.getElementById('cmp_name').value;
      combination['direction'] = document.getElementById('cmp_direction').value;
      combination['cls_hcm00'] = document.getElementById('cls_hcm00').value;
      combination['cls_hcm85'] = document.getElementById('cls_hcm85').value;
      combination['cmp_segid'] = Math.max(...agg_segids) + 1
      combination['combined'] = true;
      combination['clicked'] = true;
      combination['new'] = true;
      combination['gid'] = new_gid;
      combination['linktype'] = 'new';
      combination['length'] = combination['length'];
      combination['id'] = 'agg_' + String(new_gid);
      combination['xd_ids'] = [gid_to_attrs[gid].xdsegid];
      // Create MultiLineString
      combination['geometry'] = {
        'type':'MultiLineString',
        'coordinates':[combination['geometry']['coordinates']]
      }
    } else {
      // Combine lengths, geometries, segments
      combination['length'] += gid_to_attrs[gid]['length'];
      combination['xd_ids'].push(gid_to_attrs[gid].xdsegid);
      combination['geometry']['coordinates'].push(gid_to_attrs[gid]['geometry']['coordinates']);
    }
    segs.push(gid)
  }) 

  // Deal with the combination
  if (combination != -1) {

    // Add to dataset
    //gid_to_attrs[new_gid] = combination
    newaggs_data.push(combination)
    agg_gids.push(new_gid)

    // Add to list of created aggregations
    createAggButton(combination);

    // Reset Selected Links
    $("#selectedLinks").empty()
    $("#combineButton").empty()
    selected_links = new Set();

    // Create push to db button
    createPushToDBButton();

    // Reset user values
    document.getElementById('cmp_from').value = '';
    document.getElementById('cmp_to').value = '';
    document.getElementById('cmp_name').value = '';
    document.getElementById('cmp_direction').value = '';
    document.getElementById('cls_hcm00').value = '';
    document.getElementById('cls_hcm85').value = '';

    agg_segids.push(combination['cmp_segid']);

    showExtraLayers();
  }
}

////////////////////////////////////////////// VUE ///////////////////////////////////////////////////////

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
    extraLayers: ADDLAYERS,
    addLayers:[],
    segmentLength:0
  },
  methods: {
    addLayers: showExtraLayers
  },
  watch: {
    addLayers: showExtraLayers
  }
});


let slideapp = new Vue({
  el: '#slide-panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
  },
  methods: {
    clickedShowHide: clickedShowHide
  }
});


function clickedShowHide(e) {
  slideapp.isPanelHidden = !slideapp.isPanelHidden;
  app.isPanelHidden = slideapp.isPanelHidden;
  // leaflet map needs to be force-recentered, and it is slow.
  for (let delay of [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]) {
    setTimeout(function() {
      mymap.invalidateSize()
    }, delay)
  }
}


//////////////////////////////// MAIN ////////////////////////////////////

initialPrep();