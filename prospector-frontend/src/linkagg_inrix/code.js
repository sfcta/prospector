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

const RAW_ID_COL = 'xdsegid';
const AGG_ID_COL = 'cmp_segid';

// Maps ID to an object with features of that ID
let id_to_attrs = {};

// Current selected links.
let selected = {'raw': new Set(), 'agg': 'None'};

// A list of all cmp_segids, GIDs *in the Aggregated INRIX network*. Useful for generating new segids, gids for user-created aggregations. 
let agg_segids, agg_gids;

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

  // Add color to buttons (move to html/css)
  document.getElementsByClassName("layer_description")[0].style.color = 'CornflowerBlue';
  document.getElementsByClassName("layer_description")[1].style.color = 'Green';
  document.getElementsByClassName("layer_description")[2].style.color = 'Orange';

  // Load in data
  fullinrix_data = await getFullINRIXLinks();
  agg_data = await getAggLinks();

  // Click Full INRIX Network button
  document.getElementsByClassName("layerbutton")[1].click();

  // End Loader
  document.getElementById("dimmer").outerHTML = "";

  // Initialize listeners
  createListeners();
}

async function getFullINRIXLinks() {
  try {

    let resp = await fetch('https://api.sfcta.org/api/sf_xd_2101'); 
    let segments = await resp.json();

    // Parse geometry & rename. 
    for (let segment of segments) {
      segment['type'] = 'Feature';
      segment['geometry'] = JSON.parse(segment.geometry); // Offset
      segment['geomjson'] = JSON.parse(segment.geomjson); // Not offset
      segment['clicked'] = false;
      segment['linktype'] = 'raw';
      segment['id'] = 'raw_' + String(segment[RAW_ID_COL]);
      segment['length'] = segment['miles'];

      id_to_attrs[segment['id']] = segment;
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
    let resp = await fetch('https://api.sfcta.org/commapi/sf_xd_2101_agg_view');
    let segments = await resp.json();

    // Parse geometry & rename. 
    for (let segment of segments) {
      segment['geometry'] = JSON.parse(segment.geometry);
      segment['type'] = 'Feature';
      segment['clicked'] = false;
      segment['linktype'] = 'agg';
      segment['id'] = 'agg_' + String(segment[AGG_ID_COL]);

      id_to_attrs[segment['id']] = segment;
      agg_gids.push(segment['gid']);
      agg_segids.push(segment[AGG_ID_COL]);
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

function showLayers() {

  // Raw Layer
  if (app.addLayers.includes('Full INRIX Network')) {
    drawFullINRIXLinks();
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

async function resetColors(type) {
  if (app.addLayers.includes('Full INRIX Network')) {
    drawFullINRIXLinks(true);
  }

  // Aggregate Layer
  if (app.addLayers.includes('Aggregated Network')) {
    drawAggLinks();
  } else {
    if (type == 'push') {
      // Click Agg Network button
      document.getElementsByClassName("layerbutton")[1].click();
      // Unclick Uncommitted Aggs button
      document.getElementsByClassName("layerbutton")[2].click();

      await getAggLinks();
      drawAggLinks();
    }
  }

  // New Segments
  if (app.addLayers.includes('Uncommitted Aggregated Segments')) {
    drawNewLinks();
  } else {
    if (type == 'combine') {
      // Click Uncommitted Aggs button
      document.getElementsByClassName("layerbutton")[2].click();
      drawNewLinks();
    }
  }
}

//////////////////////////////////////////// FUNCTIONS /////////////////////////////////////////////////////

function drawFullINRIXLinks(reset_colors=false) {

  if (fullinrix_layer) mymap.removeLayer(fullinrix_layer);
  fullinrix_layer = L.geoJSON(fullinrix_data, {
    style: function(feature) {
      let col = 'CornflowerBlue';
      if (feature['clicked'] && (!reset_colors)) {col = '#FFD700'}
      return {'color': col}
    },
    onEachFeature: function(feature, layer) {
      if (reset_colors) {feature['clicked'] = false;}
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

  if (agg_layer) mymap.removeLayer(agg_layer); // 'cmp_segid', 'cmp_name', 'cmp_from', 'cmp_to', 'cls_hcm85', 'cls_hcm00', 'direction'
  agg_layer = L.geoJSON(agg_data, {
    style: function(feature) { 
      if (feature['clicked']) {
        return '#FFD700'
      } else {
        if ((feature['cmp_segid']=='')||(feature['cmp_name']=='')||(feature['cmp_from']=='')||(feature['cmp_to']=='')||(feature['cls_hcm85']=='')||(feature['cls_hcm00']=='')||(feature['direction']=='')) {
          // Highlight if information is missing
          return {'color':'red'}
        } else {
          return {'color':'green'}
        }
      }
      //return {'color' : feature['clicked'] ? '#FFD700' : 'green'};
    },
    onEachFeature: function(feature, layer) {
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
      });
    },

  });
  newaggs_layer.addTo(mymap);
}


function unclick(btn_id) {

  let data = (btn_id.split('_')[0]=='raw') ? fullinrix_data : agg_data;
  for (let i=0; i<data.length; i++) {
    if (data[i]['id'] == btn_id) {data[i]['clicked']=false;}
  }
}


function mouseoverFeature(e) {
  e.target.setStyle({'color':'#FFD700'})
  hoverFeature(e)
}


function mouseoutFeature(e) {

  if (!e.target.feature.clicked) {
    e.target.setStyle({'color':getLinkColor(e.target.feature)});
  } else {
    e.target.setStyle({'color':'#FFD700'});
  }
  hoverFeature(e);
}


function hoverFeature(e) {

  if (e.target.feature['linktype']=='raw') {
    var content = RAW_ID_COL + ': ' + String(e.target.feature[RAW_ID_COL]) + '<br>' + 
        'Street: ' + e.target.feature.roadname + '<br>' + 
        'Direction: ' + e.target.feature.bearing + '<br>' + 
        'Length: ' + e.target.feature.length.toFixed(2) + ' miles'

  } else {
    var content = AGG_ID_COL + ': ' + String(e.target.feature[AGG_ID_COL]) + '<br>' + 
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

  e.target.feature['clicked'] = !e.target.feature['clicked'];
  var btn_id = e.target.feature['id'];

  // 'raw' or 'agg' or 'new'
  let linktype = e.target.feature['linktype'];

  if (linktype=='agg') {

    // If clicked
    if (e.target.feature['clicked']) {

      // Remove previously selected if necessary
      if (selected['agg'] != 'None') {
        unclick(selected['agg']);
        clear('agg');
      };

      // Add button ID to list of selected
      selected['agg'] = btn_id;

      // Increment segment length
      app.segmentLength = e.target.feature.length;

      // Create Agg buttons
      createLinkButton(e);
      createRemoveFromDBButton();
      createEditLinkButton();

      // Remove Raw buttons
      $("#combineButton").empty()
      document.getElementById("agglinkdetails").style.display = "none"; 

      // Clear raw selections if necessary
      if (selected['raw'].size != 0) {clear('raw')};

    } else { // If unclicked

      // Reset list of selected
      selected['agg'] = 'None';

      // Remove that button
      buttonClose(btn_id);

      // Reset segment length
      app.segmentLength = 0; 
    }
  } else if (linktype == 'raw') {

    // If this link wasn't already selected
    if (!selected['raw'].has(btn_id)) {

      // Add to list of selected ids
      selected['raw'].add(btn_id);

      // Create the link button
      createLinkButton(e);

      // Remove agg buttons
      $("#removeLink").empty()
      $("#editLink").empty()
      $("#pushEdits").empty();

      // Increment segment length
      app.segmentLength += e.target.feature.length;

      // Clear agg selections if necessary
      if (selected['agg'] != 'None') {clear('agg')};

      // Show link aggregation details
      document.getElementById("agglinkdetails").style.display = "block";
      document.getElementById('cmp_segid').value = Math.max(...agg_segids) + 1;


    } else { // This link was already selected

      // Decrement segment length
      app.segmentLength -= e.target.feature.length;

      // Remove from list of selected ids
      selected['raw'].delete(btn_id);

      // Remove that button
      buttonClose(btn_id);
    }
  }

  // Re-draw
  showLayers();
}


function clear(linktype) {

  if (linktype=='agg') {

    // Close aggregate button
    buttonClose(selected['agg']);
    unclick(selected['agg']);

    // Reset selected
    selected['agg'] = 'None';

  } else if (linktype=='raw') {

    // Close raw buttons
    var ids = Array.from(selected['raw'])
    for (var i=0; i<ids.length; i++) {
      buttonClose(ids[i]);
      unclick(ids[i]);
    }

    // Reset selected
    selected['raw'] = new Set();
  }
}


function createAggButton(combination) {

  var btn_id = combination['id'];

  var text = combination.cmp_segid + ': ' + combination.cmp_name + ' From ' + combination.cmp_from + ' To ' + combination.cmp_to + ' (' + combination.direction + ')';

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

  // X Button
  document.getElementById(btn_id+'_x').addEventListener("click", function() {

    buttonClose(btn_id);

    // Remove aggregation, update map. 
    for (let i=0; i<newaggs_data.length; i++) {
      if (newaggs_data[i]['id']==btn_id) {newaggs_data.splice(i, 1)}
    }

    // Remove GID from the list of all aggregate GIDs. 
    for (let i=0; i<agg_gids.length; i++) {
      if (agg_gids[i]==combination['gid']) {agg_gids.splice(i, 1)}
    }
    for (let i=0; i<agg_segids.length; i++) {
      if (agg_segids[i]==combination['cmp_segid']) {agg_segids.splice(i, 1)}
    }
    showLayers();
  })
}


function createLinkButton(e) {
  var txt;
  var btn_id = e.target.feature['id'];
  var linktype = e.target.feature['linktype'];

  // Create button
  if (linktype=='raw') {
    txt = e.target.feature[RAW_ID_COL] + ': ' + e.target.feature.roadname + ' (' + e.target.feature.bearing + ')';
    createCombineButton();
  } else {
    txt = e.target.feature[AGG_ID_COL] + ': ' + e.target.feature.cmp_name + ' from ' + e.target.feature.cmp_from + ' to ' + e.target.feature.cmp_to;
    if (linktype == 'agg') {

    }
  }
  
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
    + txt + 
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

  // Create button listener
  document.getElementById(btn_id+'_x').addEventListener("click", function() {clickButtonX(e, btn_id)})
}

function clickButtonX(e, btn_id) {
  app.segmentLength -= e.target.feature.length; // Adjust total length count
  buttonClose(btn_id); // Remove link button (& others if appropriate)
  e.target.feature['clicked'] = false; // Re-color link
  showLayers();
  if (e.target.feature['linktype']=='raw') {
    selected['raw'].delete(btn_id);
  } else if (e.target.feature['linktype']=='agg') {
    selected['agg'] = 'None';
  }
  
}


function buttonClose(id) {

  // Remove that button
  document.getElementById(id).remove();

  // Adjust other buttons / desciptions as necessary
  if ($('#selectedLinks').text().trim().length == 0 ) {
    $("#combineButton").empty()
    $("#removeLink").empty()
    $("#editLink").empty()
    $("#pushEdits").empty();
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
}

function createRemoveFromDBButton() {
  $('#removeLink').empty()
  var button = '<button class="fluid ui red button">Remove Aggregate Link From Database</button>'
  $("#removeLink").append(button)
}

function createEditLinkButton() {
  $('#editLink').empty()
  var button = '<button class="fluid ui green button">Edit Aggregate Link</button>'
  $("#editLink").append(button)
}

function createPushToDBButton() {
  $("#pushtoDb").empty();
  var button = '<button class="fluid ui blue button">Push to Database</button>'
  $("#pushtoDb").append(button)
}

function createListeners() {
  document.getElementById("pushEdits").addEventListener("click", function() {pushEdits()});
  document.getElementById("pushtoDb").addEventListener("click", function() {pushToDB()});
  document.getElementById("editLink").addEventListener("click", function() {editLink()});
  document.getElementById("removeLink").addEventListener("click", function() {removeFromDB()});
  document.getElementById("combineButton").addEventListener("click", function() {
    document.getElementById("agglinkdetails").style.display = "none";
    combine();
    app.segmentLength = 0;
  })
}

function createPushEditsButton() {
  $("#pushEdits").empty();
  var button = '<button class="fluid ui blue button">Push Edits</button>'
  $("#pushEdits").append(button)
}

async function removeFromDB() {

  var segid = parseInt(selected['agg'].split('_')[1])

  // Don't allow user to remove original aggregated links
  if (segid <= 269) {
    window.alert('Cannot edit original aggregated link segments (1-269)');
  } else {

    // Reset segment length
    app.segmentLength = 0; 

    var write_url = 'https://api.sfcta.org/commapi/sf_xd_2101_agg?cmp_segid=eq.' + String(segid)

    try {
      var resp = await fetch(write_url, {method: 'DELETE',})
    } catch (e) {
      console.log(e)
    }
  }
  // Reload agg-links
  agg_data = await getAggLinks();
  showLayers();

  selected['agg'] = 'None';

  // Clear link section 
  $('#removeLink').empty()
  $('#selectedLinks').empty()
  $("#editLink").empty()
  $("#pushEdits").empty();
  document.getElementById("agglinkdetails").style.display = "none"; 
}

function prepareComboForDB(combo) {
  let to_push = {};
  to_push['gid'] = combo.gid;
  to_push['cmp_segid'] = combo.cmp_segid;
  to_push['geom'] = combo.geomjson; // combo.geometry
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

  var write_url = 'https://api.sfcta.org/commapi/sf_xd_2101_agg'

  try {
    var resp = await fetch(write_url, {
      method: 'POST',
      body: JSON.stringify(agg),
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (e) {
    console.log(e);
  }


} 


async function pushToDB() {

  $("#pushtoDb").empty();
  $('#createdAggs').empty()

  // For each aggregation
  for (let i=0; i<newaggs_data.length; i++) {
    var resp = await postAggregation(prepareComboForDB(newaggs_data[i]));
  }

  newaggs_data = [];
  agg_data = await getAggLinks();  

  resetColors('push')
}

async function removeNulls() {
  /*
  var write_url = 'https://api.sfcta.org/commapi/sf_xd_2101_agg?gid=eq.'

  var gids = [664, 663, 565, 663]

  for (let i=0; i<gids.length; i++) {
    try {
      var resp = await fetch(write_url + String(gids[i]), {method: 'DELETE',})
      console.log(resp)
    } catch (e) {
      console.log(e)
    }
  }
  */
}


function prepareEdits(edit) {
  let to_push = {};
  to_push['gid'] = edit.gid;
  to_push['cmp_segid'] = edit.cmp_segid;
  to_push['geom'] = edit.geom;
  to_push['direction'] = edit.direction;
  to_push['cmp_to'] = edit.cmp_to;
  to_push['cmp_name'] = edit.cmp_name;
  to_push['cmp_from'] = edit.cmp_from;
  to_push['length'] = edit.length;
  to_push['cls_hcm00'] = edit.cls_hcm00;
  to_push['cls_hcm85'] = edit.cls_hcm85;
  to_push['xd_ids'] = String(edit.xd_ids);

  return to_push
}


async function pushEdits() {

  // Current values
  var edit = id_to_attrs[selected['agg']];

  var cmp_segid = parseInt(document.getElementById('cmp_segid').value)

  if (cmp_segid != '') {

    // Set new values
    edit['cmp_segid'] = cmp_segid;
    let attrs = ['cmp_name', 'cmp_from', 'cmp_to', 'direction', 'cls_hcm00', 'cls_hcm85'];
    for (let i=0; i<attrs.length; i++) {
      edit[attrs[i]] = document.getElementById(attrs[i]).value;
    }

    let to_push = prepareEdits(edit);

    await removeFromDB();
    await postAggregation(to_push);

    agg_data = await getAggLinks();  
    showLayers();
    resetUserValues();
  } 
}

function resetUserValues() {
  document.getElementById('cmp_segid').value = '';
  document.getElementById('cmp_from').value = '';
  document.getElementById('cmp_from').value = '';
  document.getElementById('cmp_to').value = '';
  document.getElementById('cmp_name').value = '';
  document.getElementById('direction').value = '';
  document.getElementById('cls_hcm00').value = '';
  document.getElementById('cls_hcm85').value = '';
}



function combine() {

  var combination = -1;

  var new_gid = Math.max.apply(null, agg_gids) + 1;

  // Create the combination
  selected['raw'].forEach(function(id) {

    if (combination==-1) {

      // Initialize 
      combination = {...id_to_attrs[id]};
      combination['cmp_from'] = document.getElementById('cmp_from').value;
      combination['cmp_to'] = document.getElementById('cmp_to').value;
      combination['cmp_name'] = document.getElementById('cmp_name').value;
      combination['direction'] = document.getElementById('direction').value;
      combination['cls_hcm00'] = document.getElementById('cls_hcm00').value;
      combination['cls_hcm85'] = document.getElementById('cls_hcm85').value;
      combination['cmp_segid'] = document.getElementById('cmp_segid').value;
      combination['clicked'] = true;
      combination['new'] = true;
      combination['gid'] = new_gid;
      combination['linktype'] = 'new';
      combination['length'] = combination['length'];
      combination['id'] = 'agg_' + combination['cmp_segid'];
      combination['xd_ids'] = [id_to_attrs[id].xdsegid];
      combination['geometry'] = {
        'type':'MultiLineString',
        'coordinates':[combination['geometry']['coordinates']]
      };
      combination['geomjson'] = {
        'type':'MultiLineString',
        'coordinates':[combination['geomjson']['coordinates']]
      };
    } else {

      var seg = id_to_attrs[id]

      // Combine length
      combination['length'] += seg['length'];

      // Add segment id to list
      combination['xd_ids'].push(seg['xdsegid']);

      // Combine geometries
      combination['geometry']['coordinates'].push(seg['geometry']['coordinates']); // Offset (Displayed)
      combination['geomjson']['coordinates'].push(seg['geomjson']['coordinates']); // Non-Offset (Pushed to DB)
    }
  }) 

  // Deal with the combination
  if (combination != -1) {

    // Add to list of created links
    newaggs_data.push(combination);

    // Increment gid, segid
    agg_gids.push(new_gid);
    agg_segids.push(document.getElementById('cmp_segid').value);

    // Add to list of created aggregations
    createAggButton(combination);

    // Reset Selected Links
    $("#selectedLinks").empty()
    $("#combineButton").empty()
    selected['raw'] = new Set();

    // Create push to db button
    createPushToDBButton();

    resetUserValues()

    resetColors('combine');
  }
}


function editLink() {

  createPushEditsButton();

  let agg_attrs = id_to_attrs[selected['agg']];

  document.getElementById("agglinkdetails").style.display = "block"; 

  // Set current values
  let attrs = ['cmp_segid', 'cmp_name', 'cmp_from', 'cmp_to', 'direction', 'cls_hcm00', 'cls_hcm85'];
  for (let i=0; i<attrs.length; i++) {
    document.getElementById(attrs[i]).value = agg_attrs[attrs[i]];
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
    addLayers: showLayers
  },
  watch: {
    addLayers: showLayers
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