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
Vue.component('v-select', VueSelect.VueSelect);

const API_SERVER = 'http://api.sfcta.org/api/';
const GEO_VIEW = 'taz_boundaries';
const TABLES_VIEW = 'trnskim_tables';
const MISSING_COLOR = '#ccc';
const DISTANCE_BINS = [0, 5, 10, 15, 20, 25, 30]
const DISTANCE_COLORS = ['#ccc', '#1a9850', '#91cf60', '#d9ef8b', '#ffffbf', '#fee08b', '#fc8d59', '#d73027']
const DEFAULT_ZOOM = 12;

const ADDLAYERS = [
  {
    view: 'epc2021_diss', name: 'Equity Priority Communities',
    style: { opacity: 1, weight: 2, color: '#730073', fillOpacity: 0, interactive: false},
    info: 'https://www.sfcta.org/policies/equity-priority-communities',
  },
]

let segmentLayer;
let selectedGeo, popupSegment, hoverColor, popupColor;

let maplib = require('../jslib/maplib');
let mymap = maplib.sfmap;
let iconOrig = maplib.iconOrig;
let iconDest = maplib.iconDest;
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;
let geoColorFunc = maplib.colorFunc.distance;
let geoLayer;
let selTAZProps;
let addLayerStore = {};

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
      '<b>' + suff + props.taz + '</b>, Neighborhood: ' + props.nhood + '<br/>' +
      '<b>' + 'Time: ' + props.skim_value + ' mins</b>'
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

  let dataurl = API_SERVER + app.tableSelVal.label + '?';
  let urlparams = app.dirSel==app.dirOrig? 'otaz' : 'dtaz';
  urlparams += '=eq.' + app.tazSelVal.value;
  urlparams += '&tp=eq.' + app.timepSelVal;
  urlparams += '&mode=eq.' + app.modeSelVal;
  urlparams += '&select=otaz,dtaz,totivt';
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
  let color = maplib.getColorByBin(feat.skim_value, DISTANCE_BINS, DISTANCE_COLORS);
  if (!color) color = MISSING_COLOR;
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
      geoFeatures[jsonData[rec][tazVar]]['skim_value'] = jsonData[rec]['totivt']/100;
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
  fetch(API_SERVER + GEO_VIEW + '?select=geometry,taz,centroid,county,nhood').then((resp) => resp.json()).then(function(jsonData) {
    for (let entry of jsonData) {
	  tazSelOptions.push({label:entry.taz.toString(), value:entry.taz});

    //add a few attributes for geoJSON mapping
    entry.type = 'Feature';
    entry.geometry = JSON.parse(entry.geometry);

    geoFeatures[entry.taz] = entry;
    geoIds.push(entry.taz);
    }
	  app.tazSelOptions = tazSelOptions;
    app.tazSelVal = {'label':'586',value:586};
  });

  let tableSelOptions = [];
  fetch(API_SERVER + TABLES_VIEW).then((resp) => resp.json()).then(function(jsonData) {
    for (let entry of jsonData) {
	  tableSelOptions.push({label:entry.table_name});
    }
	  app.tableSelOptions = tableSelOptions;
    app.tableSelVal = tableSelOptions[0];
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
  delimiters: ['${', '}'],
  data: {
    dirOrig: 'From Origin',
    dirDest: 'To Destination',
    dirSel: 'To Destination',

    tazSelOptions: [],
    tazSelVal: null,
    copytazSelVal: null,

    tableSelOptions: [],
    tableSelVal: {label:''},
    copytableSelVal: null,
    
    modeSelOptions: [
    {text: 'Local Bus', value: 1},
    {text: 'Light Rail', value: 2},
    {text: 'Premium (Caltrain/Express Bus)', value: 3},
    {text: 'Ferry', value: 4},
    {text: 'BART', value: 5}
    ],
    modeSelVal: 1,
    
    timepSelOptions: [
    {text: 'AM (6a-9a)', value: 1},
    {text: 'MD (9a-3:30p)', value: 2},
    {text: 'PM (3:30p-6:30p)', value: 3},
    {text: 'EV (6:30p-3a)', value: 4},
    {text: 'EA (3a-6a)', value: 5}
    ],
    timepSelVal: 2,
  },
  watch: {
    tableSelVal: usrOptionChanged,
    tazSelVal: usrOptionChanged,
    dirSel: usrOptionChanged,
    modeSelVal: usrOptionChanged,
    timepSelVal: usrOptionChanged,
  }
});

function showExtraLayers(e) {
  for (let lyr in addLayerStore) {
    mymap.removeLayer(addLayerStore[lyr]);
  }
  for (let lyr of sideapp.addLayers) {
    addLayerStore[lyr].addTo(mymap);
  }
}

let sideapp = new Vue({
  el: '#sliderpanel',
  delimiters: ['${', '}'],
  data: {
    extraLayers: ADDLAYERS,
    addLayers:[],
  },
  watch: {
    addLayers: showExtraLayers,
  }
});


async function fetchAddLayers() {
  try {
    for (let item of ADDLAYERS) {
      let resp = await fetch(API_SERVER + item.view);
      let features = await resp.json();
      for (let feat of features) {
        feat['type'] = 'Feature';
        feat['geometry'] = JSON.parse(feat.geometry);
      }
      let lyr = L.geoJSON(features, {
        style: item.style,
        pane: 'shadowPane',
      }).addTo(mymap);
      addLayerStore[item.view] = lyr;
      mymap.removeLayer(lyr);
    }
  } catch (error) {
    console.log('additional layers error: ' + error);
  }
}
async function initialPrep() {
   await fetchAddLayers(); 
   updateOptionsData();
}
initialPrep();
