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
var zoom_level = 13;
mymap.setView([37.76889, -122.440997], zoom_level);

const API_SERVER = 'https://api.sfcta.org/commapi/';
const AGG_VIEW = 'sf_xd_2002_agg_view';
const AGG_TABLE = 'sf_xd_2002_agg';

let geoLayer;
let links;
let segid_to_attrs = {};
let selected_links = new Set();
let geoPopup;

async function initialPrep() {
  links = await getLinks();
  drawLinks();
}

async function getLinks() {
  const geo_url = API_SERVER + AGG_VIEW //+ '?select=geometry,cmp_segid,cmp_name,cmp_from,cmp_to,direction,length';

  try {
    let resp = await fetch(geo_url);
    let segments = await resp.json();

    // Parse geometry & rename. 
    for (let segment of segments) {

      segment['type'] = 'Feature';
      segment['geometry'] = JSON.parse(segment.geometry);
      segment['clicked'] = false;
      segment['combo'] = false; 

      segid_to_attrs[segment['cmp_segid']] = segment;

    }

    console.log(segments)
    return segments;

  } catch (error) {
    console.log('map segment error: ' + error);
  }
}

initialPrep();

//////////////////////////////////////////// FUNCTIONS /////////////////////////////////////////////////////

function getLinkColor(feature) {
  return (feature['combo'] ? '#90ee90' : 'coral')
}

function createCombineButton() {
  var button = '<button class="fluid ui blue button">Combine</button>'
  $("#combineButton").append(button)
  document.getElementById("combineButton").addEventListener("click", function() {combine()})
}

function createUncombineButton(e) {
  var button = '<button class="fluid ui red button">Uncombine</button>'
  $("#combineButton").append(button)
  document.getElementById("combineButton").addEventListener("click", function() {uncombine(e.target.feature.cmp_segid)})
}

function drawLinks() {
  
  if (geoLayer) mymap.removeLayer(geoLayer);

  geoLayer = L.geoJSON(links, {
    style: function (feature) {
      return {"color": getLinkColor(feature),
              "weight": (feature['combo'] ? 4 : 3)}
    },
    onEachFeature: function(feature, layer) {
      feature['clicked'] = false; 
      layer.on({
        mouseover: mouseoverFeature,
        mouseout: mouseoutFeature,
        click: clickedOnFeature,
      });
    },
  });

  geoLayer.addTo(mymap);

}

function buttonMain(e) {
  // pass
}

function buttonClose(e) {
  document.getElementById(e.target.feature.cmp_segid).remove();
  if ($('#selectedLinks').text().trim().length == 0 ) {
    $("#combineButton").empty()
  }

}

function mouseoverButton(e, btn_id) {
  document.getElementById(btn_id+'_o').style.color = '#FFD700'
}

function mouseoutButton(e, btn_id) {
  document.getElementById(btn_id+'_o').style.color = 'black'
}

function createLinkButton(e) {

  $('#combineButton').empty()
  if (e.target.feature.combo) {
    createUncombineButton(e)
  } else {
    createCombineButton()
  }

  // Create button
  var text = e.target.feature.cmp_from + ' to ' + e.target.feature.cmp_to + ' (' + e.target.feature.direction + ')';
  var btn_id = e.target.feature.cmp_segid;
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
  document.getElementById(btn_id+'_o').addEventListener("click", function() {buttonMain(e)})
  document.getElementById(btn_id+'_o').addEventListener('mouseover', function() {mouseoverButton(e, btn_id)})
  document.getElementById(btn_id+'_o').addEventListener('mouseout', function() {mouseoutButton(e, btn_id)})

  // X Button
  document.getElementById(btn_id+'_x').addEventListener("click", function() {
    buttonClose(e);
    e.target.feature['clicked'] = false; 
    mouseoutFeature(e);
    selected_links.delete(btn_id);
  })
}


function clickedOnFeature(e) {

  //console.log(e.target.feature)

  // Edit Link
  e.target.feature['clicked'] = !e.target.feature['clicked'];
  e.target.setStyle({'color':'CornflowerBlue'});

  // Handle Button
  var btn_id = e.target.feature.cmp_segid;
  if (!selected_links.has(btn_id)) {
    selected_links.add(btn_id);
    createLinkButton(e);
  } else {
    selected_links.delete(btn_id);
    buttonClose(e);
  }
}

function hoverFeature(e) {
  if (e.type == 'mouseover') {
    geoPopup = L.popup()
      .setLatLng(e.latlng)
      .setContent('From: ' + e.target.feature.cmp_from + '<br>' + 
        'To: ' + e.target.feature.cmp_to + '<br>' +
        'Direction: ' + e.target.feature.direction)
      .addTo(mymap)
  } else {
    mymap.removeControl(geoPopup)
  }
}

function mouseoverFeature(e) {
  e.target.setStyle({'color':'#FFD700'})
  hoverFeature(e)
}

function mouseoutFeature(e) {
  if (!e.target.feature.clicked) {
    e.target.setStyle({'color':getLinkColor(e.target.feature)})
  } else {
    e.target.setStyle({'color':'CornflowerBlue'})
  }
  hoverFeature(e)
}

var combo_to_segs = {};

function combine() {

  // Vars that the user will give 
  var cmp_from = '<Street A>';
  var cmp_to = '<Street B>';
  var cmp_name = '<Street Name>';
  var cmp_direction = '<Direction>';

  var combination = -1;
  var new_seg_id = Math.max.apply(null, Object.keys(segid_to_attrs)) + 1;
  var segs = [];

  // Combine
  console.log('Combining: ')
  selected_links.forEach(function(segid){

    if (combination==-1) {
      // Initialize 
      combination = {...segid_to_attrs[segid]};
      combination['cmp_segid'] = new_seg_id; 
      combination['cmp_from'] = cmp_from;
      combination['cmp_to'] = cmp_to;
      combination['cmp_name'] = cmp_name;
      combination['direction'] = cmp_direction;
      combination['combo'] = true
      combination['clicked'] = true
    } else {
      // Combine lengths & geometries
      combination['length'] += segid_to_attrs[segid]['length']
      combination['geometry']['coordinates'] = combination['geometry']['coordinates'].concat(segid_to_attrs[segid]['geometry']['coordinates'])
    }
    segs.push(segid)
  }) 

  // Add to dataset
  segid_to_attrs[new_seg_id] = combination
  links.push(combination)
  
  combo_to_segs[new_seg_id] = segs;

  // Reset Selected Links
  drawLinks();
  $("#selectedLinks").empty()
  $("#combineButton").empty()
  selected_links = new Set();
}

function uncombine(segid) {

  //console.log('Removing: ' + segid)
  //console.log(links)

  // Remove combination from dataset
  for (let i=0; i<links.length; i++) {
    if (links[i].cmp_segid == segid) {
      links.splice(i, 1)
    }
  }
  delete segid_to_attrs.segid;

  drawLinks();
}


////////////////////////////////////////////// VUE ///////////////////////////////////////////////////////

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false
  },
  methods: {
    clickedShowHide:clickedShowHide,
    combine:combine
  },
});

let slideapp = new Vue({
  el: '#slide-panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
  },
  methods: {
    clickedShowHide: clickedShowHide,
  },
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
