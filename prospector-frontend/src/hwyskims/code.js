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

// Use npm and babel to support IE11/Safari
import 'babel-polyfill';
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';
import Vue from 'vue/dist/vue.js';
Vue.component('v-select', VueSelect.VueSelect);

let api_server = 'http://api.sfcta.org/api/';
const GEO_VIEW = 'taz_boundaries';
const TABLES_VIEW = 'hwyskim_tables';
const MISSING_COLOR = '#ccc';
const DISTANCE_BINS = [0, 5, 10, 15, 20, 25, 30]
const DISTANCE_COLORS = ['#ccc', '#1a9850', '#91cf60', '#d9ef8b', '#ffffbf', '#fee08b', '#fc8d59', '#d73027']
const DEFAULT_ZOOM = 12;

let segmentLayer;
let selectedGeo, popupSegment, hoverColor, popupColor;
let speedCache = {};

let maplib = require('../jslib/maplib');
let mymap = maplib.sfmap;
let iconOrig = maplib.iconOrig;
let iconDest = maplib.iconDest;
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;
let geoColorFunc = maplib.colorFunc.distance;
let geoLayer;
let selTAZProps;

mymap.setView([37.77, -122.42], DEFAULT_ZOOM);


function highlightFeature(e) {
  selectedGeo = e.target;
  selectedGeo.setStyle(styles.selected);
  selectedGeo.bringToFront();
  info.update(selectedGeo.feature, selTAZProps, app.dirSel==app.dirOrig? 'otaz' : 'dtaz');
}
function resetHighlight(e) {
  geoLayer.resetStyle(e.target);
  info.update(null,  selTAZProps, app.dirSel==app.dirOrig? 'otaz' : 'dtaz');
}
function clickedOnFeature(e) {
  app.tazSelVal = {'label':e.target.feature.taz.toString(), value:e.target.feature.taz};
}

let info = L.control();
info.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
  this.update();
  return this._div;
};
info.update = function (props, seltaz=['',''], odind) {
  let pref, suff;
  if(odind=='otaz'){
    pref = 'From Origin TAZ: ';
    suff = 'To Destination TAZ: ';
  } else {
    pref = 'To Destination TAZ: ';
    suff = 'From Origin TAZ: ';
  }
  this._div.innerHTML = '<h4>Information</h4>' +
      '<b>' + pref + seltaz[0] + '</b>, Neighborhood: ' + seltaz[1] + '<br/>' +
      (props ?
      '<b>' + suff + props.taz + '</b>, Neighborhood: ' + props.nhood + '<br/> <b>Time: ' + props.distance + ' mins</b>'
      : 'Hover over a TAZ');
};
info.addTo(mymap);

let legend = L.control({position: 'bottomright'});
legend.onAdd = function (map) {
  let div = L.DomUtil.create('div', 'info legend')
  div.innerHTML = '<h4>Time (mins)</h4>' + getLegHTML(DISTANCE_BINS, DISTANCE_COLORS);
  return div;
};
legend.addTo(mymap);

function queryServer() {

  let dataurl = api_server + app.tableSelVal.label + '?';
  let urlparams = app.dirSel==app.dirOrig? 'otaz' : 'dtaz';
  urlparams += '=eq.' + app.tazSelVal.value;
  urlparams += '&select=otaz,dtaz,timeda';
  dataurl += urlparams;

  // Fetch viz data
  fetch(dataurl)
    .then((resp) => resp.json())
    .then(function(jsonData) {
      addGeoLayer(jsonData);
    })
    .catch(function(error) {
      console.log("err: "+error);
    });
}

let segmentLos = {};

function styleByColorFunc(feat) {
  let color = maplib.getColorByBin(feat.distance, DISTANCE_BINS, DISTANCE_COLORS);
  return {fillColor: color,
          fillOpacity: 0.65,
          weight: 0.4,
          opacity: 1.0,
          color: 'black'};
}

function addGeoLayer(jsonData){

  tazVar = app.dirSel==app.dirOrig? 'dtaz' : 'otaz';

  for(let rec in jsonData){
    if(typeof geoFeatures[jsonData[rec][tazVar]] !== 'undefined'){
      geoFeatures[jsonData[rec][tazVar]]['distance'] = jsonData[rec]['timeda'];
    }
  }

  if (geoLayer) geoLayer.clearLayers();
  geoLayer = L.geoJSON(Object.values(geoFeatures), {
    style: styleByColorFunc,
    onEachFeature: function(feature, layer) {
      layer.on({
                mouseover: highlightFeature,
                mouseout: resetHighlight,
                click : clickedOnFeature
      });
    }
  });

  geoLayer.addTo(mymap);



  /*

  if (mymap.segmentLayer) {
    selectedSegment = popupSegment = hoverColor = popupColor = null;
    mymap.removeLayer(segmentLayer);
    segmentLayer = null;
  }


  console.log(jsonData);*/
}


let tazMarker;
let geoFeatures = {};
let geoIds = [];
let tazVar = 'otaz';
// fetch the year details in data
function updateOptionsData() {
  let tazSelOptions = [];
  fetch(api_server + GEO_VIEW + '?select=geometry,taz,centroid,county,nhood').then((resp) => resp.json()).then(function(jsonData) {
    for (let entry of jsonData) {
	  tazSelOptions.push({label:entry.taz.toString(), value:entry.taz});

    //add a few attributes for geoJSON mapping
    entry.type = 'Feature';
    entry.geometry = JSON.parse(entry.geometry);

    geoFeatures[entry.taz] = entry;
    geoIds.push(entry.taz);
    }
	  app.tazSelOptions = tazSelOptions;
    app.tazSelVal = {'label':'608',value:608};
  });

  let tableSelOptions = [];
  fetch(api_server + TABLES_VIEW).then((resp) => resp.json()).then(function(jsonData) {
    for (let entry of jsonData) {
	  tableSelOptions.push({label:entry.table_name});
    }
	  app.tableSelOptions = tableSelOptions;
    app.tableSelVal = tableSelOptions[1];
  });

}

// ------

function getTAZCentroid(centroid_txt){
  centroid_txt = centroid_txt.slice(6);
  centroid_txt = centroid_txt.slice(0,-1);
  return centroid_txt.split(" ").map(Number).reverse();
}

function usrOptionChanged(thing) {

  // this occurs if an already selected item is selected again
  if(app.tazSelVal===null){
    app.tazSelVal = app.copytazSelVal;
  }
  if(app.tableSelVal===null){
    app.tableSelVal = app.copytableSelVal;
  }

  if(app.tazSelVal && app.tableSelVal){
    if(typeof app.tazSelVal.value !== 'undefined'){
      //make a copies because of a bug in vue-select
      app.copytazSelVal = {value:app.tazSelVal.value, label:app.tazSelVal.label};
      app.copytableSelVal = {label:app.tableSelVal.label};

      let cen_coords = getTAZCentroid(geoFeatures[app.tazSelVal.value].centroid);
      if (tazMarker) tazMarker.remove();
      tazMarker = new L.marker(cen_coords, {icon: app.dirSel==app.dirOrig? iconOrig : iconDest}).addTo(mymap);
      //mymap.setView(cen_coords, DEFAULT_ZOOM);
      selTAZProps = [app.tazSelVal.label, geoFeatures[app.tazSelVal.value].nhood];
      info.update(null, selTAZProps, app.dirSel==app.dirOrig? 'otaz' : 'dtaz');
      queryServer();
    }
  }

}


let app = new Vue({
  el: '#panel',
  data: {
    dirOrig: 'From Origin',
    dirDest: 'To Destination',
    dirSel: 'From Origin',

    tazSelOptions: [],
    tazSelVal: null,
    copytazSelVal: null,

    tableSelOptions: [],
    tableSelVal: {label:''},
    copytableSelVal: null,
  },
  watch: {
    tableSelVal: usrOptionChanged,
    tazSelVal: usrOptionChanged,
    dirSel: usrOptionChanged,
  }
});
updateOptionsData();
