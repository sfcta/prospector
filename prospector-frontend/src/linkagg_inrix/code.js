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

const AGG_TABLE = 'sf_xd_2002_agg';

// TODO
let segid_to_attrs = {};
let selected_links = new Set();
// TODO

let geoPopup;

let raw_layer;
let agg_layer;
let newsegs_layer;

let links;
let aggs; 

async function initialPrep() {
  links = await getLinks();
  aggs = await getAggregatedLinks();
  document.getElementById("layerbutton").click();
}

async function getLinks() {
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

      segid_to_attrs[segment['gid']] = segment;
    }
    return segments;

  } catch (error) {
    console.log('map segment error: ' + error);
  }
}

async function getAggregatedLinks() {
  try {
    let resp = await fetch('https://api.sfcta.org/commapi/sf_xd_2002_agg_view');
    let segments = await resp.json();

    // Parse geometry & rename. 
    for (let segment of segments) {
      segment['type'] = 'Feature';
      segment['geometry'] = JSON.parse(segment.geometry);
      segment['clicked'] = false;
      segment['combined'] = true; 
      segment['linktype'] = 'agg';
      segment['id'] = 'agg_' + String(segment.gid);
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
  {name: 'New Aggregated Segments'}
]

function showExtraLayers(e) {

  // Raw Layer
  if (app.addLayers.includes('Full INRIX Network')) {
    drawRawLinks();
  } else {
    try {
      mymap.removeLayer(raw_layer)
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
  if (app.addLayers.includes('New Aggregated Segments')) {
      drawNewLinks();
  } else {
    try {
      mymap.removeLayer(newsegs_layer)
    } catch (e) {
      // layer not created yet
    }
  }
}

//////////////////////////////////////////// FUNCTIONS /////////////////////////////////////////////////////

function drawRawLinks() {
  if (raw_layer) mymap.removeLayer(raw_layer);
  raw_layer = L.geoJSON(links, {
    style: {"color": "CornflowerBlue"},
    onEachFeature: function(feature, layer) {
      feature['clicked'] = false; 
      layer.on({
        mouseover: mouseoverFeature,
        mouseout: mouseoutFeature,
        click: clickedOnFeature,
      });
    },

  });
  raw_layer.addTo(mymap);
}

function drawAggLinks() {
  if (agg_layer) mymap.removeLayer(agg_layer);
  agg_layer = L.geoJSON(aggs, {
    style: {'color':'green'},
    onEachFeature: function(feature, layer) {
      feature['clicked'] = false; 
      layer.on({
        mouseover: mouseoverFeature,
        mouseout: mouseoutFeature,
        //click: clickedOnFeature,
      });
    },

  });
  agg_layer.addTo(mymap);
}

function drawNewLinks() {
  if (newsegs_layer) mymap.removeLayer(newsegs_layer);
  newsegs_layer = L.geoJSON(new_combinations, {
    style: {'color':'green'},
    onEachFeature: function(feature, layer) {
      feature['clicked'] = false; 
      layer.on({
        mouseover: mouseoverFeature,
        mouseout: mouseoutFeature,
        //click: clickedOnFeature,
      });
    },

  });
  newsegs_layer.addTo(mymap);
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

  if (e.target.feature['linktype']=='agg') {
    var content = 'gid: ' + String(e.target.feature.gid) + '<br>' + 
        'Name: ' + e.target.feature.cmp_name + '<br>' + 
        'From: ' + e.target.feature.cmp_from + '<br>' + 
        'To: ' + e.target.feature.cmp_to + '<br>' +
        'Direction: ' + e.target.feature.direction
  } else {
    var content = 'gid: ' + String(e.target.feature.gid) + '<br>' + 
        'Street: ' + e.target.feature.roadname + '<br>' + 
        'Direction: ' + e.target.feature.bearing
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
  return ((feature['linktype']=='raw') ? 'CornflowerBlue' : 'green')
}


function clickedOnFeature(e) {

  // Edit Link
  e.target.feature['clicked'] = !e.target.feature['clicked'];
  e.target.setStyle({'color':'#FFD700'});

  var btn_id = e.target.feature.gid;

  // Handle Button
  if (!selected_links.has(btn_id)) {
    selected_links.add(btn_id);
    createLinkButton(e);
  } else {
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
    + ' id="' + btn_id + '_o"' + 
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
    console.log('closing... ' + String(btn_id))

    delete segid_to_attrs[btn_id];
    for (let i=0; i<new_combinations.length; i++) {
      if (new_combinations[i]['gid']==btn_id) {new_combinations.splice(i, 1)}
    }
    for (let i=0; i<aggs.length; i++) {
      if (aggs[i]['gid']==btn_id) {aggs.splice(i, 1)}
    }

    showExtraLayers();

    //e.target.feature['clicked'] = false; 
    //mouseoutFeature(e);
    //selected_links.delete(btn_id);
  })
}


function createLinkButton(e) {

  createCombineButton()

  // Create button
  var text = e.target.feature.gid + ': ' + e.target.feature.roadname + ' (' + e.target.feature.bearing + ')';
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
    + ' id="' + btn_id + '_o"' + 
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
    buttonClose(e.target.feature.gid);
    e.target.feature['clicked'] = false; 
    mouseoutFeature(e);
    selected_links.delete(btn_id);
  })
}


function buttonClose(gid) {
  document.getElementById(gid).remove();
  if ($('#selectedLinks').text().trim().length == 0 ) {
    $("#combineButton").empty()
  }
}


function createCombineButton() {
  $('#combineButton').empty()
  var button = '<button class="fluid ui blue button">Combine</button>'
  $("#combineButton").append(button)
  document.getElementById("combineButton").addEventListener("click", function() {combine()})
}

function createUncombineButton(e) {
  var button = '<button class="fluid ui red button">Uncombine</button>'
  $("#combineButton").append(button)
  document.getElementById("combineButton").addEventListener("click", function() {uncombine(e.target.feature.gid)})
}

function createPushToDBButton() {
  $("#pushtoDb").empty();
  var button = '<button class="fluid ui blue button">Push to Database</button>'
  $("#pushtoDb").append(button)
  document.getElementById("pushtoDb").addEventListener("click", function() {pushToDB()})
}

function pushToDB() {
  console.log('pushing to db...')
}


function uncombine(x) {
  console.log('uncombining')
}


var combo_to_segs = {};
var new_combinations = [];

function combine() {

  console.log('COMBINING...')

  var combination = -1;
  var new_seg_id = Math.max.apply(null, Object.keys(segid_to_attrs)) + 1;
  var segs = [];

  // Combine
  selected_links.forEach(function(segid){

    if (combination==-1) {
      // Initialize 
      combination = {...segid_to_attrs[segid]};
      combination['cmp_from'] = document.getElementById('cmp_from').value;;
      combination['cmp_to'] = document.getElementById('cmp_to').value;;
      combination['cmp_name'] = document.getElementById('cmp_name').value;;
      combination['direction'] = document.getElementById('cmp_direction').value;;
      combination['combined'] = true;
      combination['clicked'] = true;
      combination['new'] = true;
      combination['gid'] = new_seg_id;
      combination['linktype'] = 'agg';
      combination['id'] = 'agg_' + String(new_seg_id);
    } else {
      // Combine lengths & geometries
      combination['length'] += segid_to_attrs[segid]['miles']
      combination['geometry']['coordinates'] = combination['geometry']['coordinates'].concat(segid_to_attrs[segid]['geometry']['coordinates'])
    }
    segs.push(segid)
  }) 

  if (combination != -1) {
    // Add to dataset
    segid_to_attrs[new_seg_id] = combination
    new_combinations.push(combination)
    aggs.push(combination)
    
    combo_to_segs[new_seg_id] = segs;

    // Add to list of created aggregations
    createAggButton(combination);

    // Reset Selected Links
    showExtraLayers();
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
  }
}


/*

function buttonMain(e) {
  // pass
}

function mouseoverButton(e, btn_id) {
  document.getElementById(btn_id+'_o').style.color = '#FFD700'
}

function mouseoutButton(e, btn_id) {
  document.getElementById(btn_id+'_o').style.color = 'black'
}
*/


////////////////////////////////////////////// VUE ///////////////////////////////////////////////////////

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
    extraLayers: ADDLAYERS,
    addLayers:[],
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
    clickedShowHide: clickedShowHide,
    addLayers: showExtraLayers
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