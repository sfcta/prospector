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
import 'isomorphic-fetch';
import Cookies from 'js-cookie';
Vue.component('v-select', VueSelect.VueSelect);

var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML2;
let getColorFromVal = maplib.getColorFromVal2;
let getBWLegHTML = maplib.getBWLegHTML;
let getQuantiles = maplib.getQuantiles;
let mymap = maplib.sfmap;
const DEFAULT_ZOOM = 13;
const DEFAULT_CENTER = [37.76889, -122.440997];
mymap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

// some important global variables.
const API_SERVER = 'http://shinyta.sfcta.org/apiprivate/';
const HH_VIEW = 'household';
const PERSON_VIEW = 'person';
const TRIP_VIEW = 'trip';
const LOCATION_VIEW = 'location';

const GEOTYPE = 'Segment';
const GEOID_VAR = 'tmc';
const YR_VAR = 'year';
const TOD_VAR = 'tod';
const HHID_VAR = 'hh_id';
const TRIPID_VAR = 'trip_id';
const HLON_VAR = 'sample_home_lon';
const HLAT_VAR = 'sample_home_lat';
const WLON_VAR = 'work_lon';
const WLAT_VAR = 'work_lat';
const SLON_VAR = 'school_lon';
const SLAT_VAR = 'school_lat';

const FRAC_COLS = ['freq_s','avg_ride','ontime5','ons','offs','shr_hh_0veh','crowded','hh_den_acs','pop_den_acs',
                  'veh_per_hh','avg_hh_size'];
const SCNYR_LIST = [2010,2015];

const INT_COLS = [''];
const DISCRETE_VAR_LIMIT = 10;
const MISSING_COLOR = '#ccd';
const COLORRAMP = {SEQ: ['#ffffcc','#3f324f'],
                    DIV: ['#d7191c','#fdae61','#ffffbf','#a6d96a','#1a9641']};

const MIN_BWIDTH = 2;
const MAX_BWIDTH = 10;
const DEF_BWIDTH = 4;
const BWIDTH_MAP = {
  1: DEF_BWIDTH,
  2: DEF_BWIDTH,
  3: [2.5, 5],
  4: [1.6, 3.2, 4.8],
  5: [1.25, 2.5, 3.75, 5],
  6: [1, 2, 3, 4, 5]
};
const MAX_PCTDIFF = 200;
const CUSTOM_BP_DICT = {
  'hh': {'base':[250, 500, 750, 1000], 'diff':[-100, -5, 5, 100], 'pctdiff':[-20, -5, 5, 20]},
}

const METRIC_UNITS = {'speed':'mph','tot':'jobs'};

const hhStyles = {
  init: {
        radius: 4,
        fillColor: "#ff7800",
        color: "#000",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8
      },
  highlighted: {
        fillColor: "#ffff00",
        color: "#000",
        weight: 2,
        opacity: 1,
        fillOpacity: 1},
};
const tripStyles = {
  highlighted: {
        color: "#ffff00",
  },
  popup: {"color": "purple", "weight": 9, "opacity": 1.0 }
};

const MODE_MAP = {1:'Walk',2:'Bike',3:'Bike',4:'Bike',
6:'Car',7:'Car',8:'Car',9:'Car',10:'Car',11:'Car',12:'Car',16:'Car',17:'Car',18:'Carshare',21:'Carpool',22:'Car',24:'SchoolBus',
25:'Bus',26:'Bus',27:'Bus',28:'Bus',30:'BART',31:'Air',32:'Ferry',33:'Car',34:'Car',36:'Taxi',38:'Bus',39:'LRT',41:'Rail',42:'Rail',
43:'Other',44:'Other',46:'Bus',47:'Other',55:'ExpBus',59:'Car',60:'Car',62:'Bus',63:'Car',64:'TNC',65:'TNC',66:'TNC',67:'Bus',
68:'CableCar',69:'Bikeshare',70:'Bikeshare',71:'Scooter',73:'Scooter',74:'Other',75:'Scooter',76:'Carpool',77:'Scooter',995:'',997:'Other'};
const PURP_MAP = {1:'Home',2:'Work',3:'Work-related',4:'School',5:'Escort',6:'Shop',7:'Meal',8:'SocRec',9:'Other',10:'ChangeMode'};

let sel_colorvals, sel_colors, sel_binsflag;
let sel_bwvals;
let bwidth_metric_list = [''];

let chart_deftitle = 'All Segments Combined';

let iconHome = L.AwesomeMarkers.icon({
    prefix: 'ion',
    icon: 'home',
    markerColor:'green',
  });
let iconWork = L.AwesomeMarkers.icon({
    prefix: 'ion',
    icon: 'briefcase',
    markerColor:'blue',
  });
let iconSchool = L.AwesomeMarkers.icon({
  prefix: 'ion',
  icon: 'school',
  markerColor:'orange',
});

let geoLayer, mapLegend, allHHLayer, hhLayer, tripLayer;
let _featJson, _tripsJson;
let _hhmap = {};
let _hhlist = [];
let _personmap;
let _datemap;
let _triplist;
let _tripmap;
let _locations;
let selHHObj, selpersonObj;
let home_coords;
let _aggregateData;
let prec;

async function initialPrep() {

  console.log('1...');
  _featJson = await fetchMapFeatures();

  console.log('2... ');
  await hhselectionChanged(app.hhidSelVal);
  
  console.log('3... ');
  //await buildChartHtmlFromData();

  console.log('4 !!!');
}

async function fetchMapFeatures() {
  try {
    // get a list of valid TMCs
    let trtmc_ids = [];
    let resp = await fetch(API_SERVER + HH_VIEW);
    let features = await resp.json();
    for (let feat of features) {
      feat['type'] = 'Feature';
      feat['geometry'] = {};
      feat['geometry']['type'] = 'Point';
      feat['geometry']['coordinates'] = [feat[HLON_VAR], feat[HLAT_VAR]];
      _hhlist.push(feat['hh_id']);
      _hhmap[feat['hh_id']] = feat;
    }

    return features;

  } catch (error) {
    console.log('map feature error: ' + error);
  }
}


// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

function getInfoHtml(geo) {
  //let metric_val = null;
  //if (geo.metric !== null) metric_val = (Math.round(geo.metric*100)/100).toLocaleString();
  let retval = '';
  if (geo.geometry.type == 'Point') {
    retval = '<b>HHID: </b>' + `${geo[HHID_VAR]}<br/>` +
                '<b>COUNTY_FIPS: </b>' + `${geo.home_county_fips}<br/>` +
                '<b>ADDRESS: </b>' + `${geo.sample_address}<br/><hr>`;
  } else if (geo.geometry.type == 'LineString') {
    retval = '<b>HHID: </b>' + `${geo[HHID_VAR]}<br/>` +
                '<b>PERSONID: </b>' + `${geo['person_num']}<br/>` +
                '<b>TRIPID: </b>' + `${geo['trip_num']}<br/><hr>` +
                
                '<b>O_PURP: </b>' + `${PURP_MAP[geo['o_purpose_category']]}<br/>` +
                '<b>D_PURP: </b>' + `${PURP_MAP[geo['d_purpose_category']]}<br/>` +
                '<b>MODES: </b>' + `${MODE_MAP[geo['mode_1']]} - ${MODE_MAP[geo['mode_2']]} - ${MODE_MAP[geo['mode_3']]}<br/>` +
                '<b>DEP_TIME: </b>' + `${geo['depart_time'].substring(11,19)}<br/>` +
                '<b>ARR_TIME: </b>' + `${geo['arrive_time'].substring(11,19)}<br/><hr>`;
  }
  return retval; 
}

infoPanel.update = function(geo) {
  infoPanel._div.innerHTML = '';
  infoPanel._div.className = 'info-panel';
  if (geo) this._div.innerHTML = getInfoHtml(geo);

  infoPanelTimeout = setTimeout(function() {
    // use CSS to hide the info-panel
    infoPanel._div.className = 'info-panel-hide';
    // and clear the hover too
    if (oldHHHoverTarget && oldHHHoverTarget.feature[HHID_VAR] != selHHId) allHHLayer.resetStyle(oldHHHoverTarget);
    if (oldTrHoverTarget && oldTrHoverTarget.feature[TRIPID_VAR] != selGeoId) tripLayer.resetStyle(oldTrHoverTarget);
  }, 2000);
};
infoPanel.addTo(mymap);

async function updateTripData() {
  let query = API_SERVER + TRIP_VIEW + '?person_id=eq.' + app.hhidSelVal + app.pernumSelVal.padStart(2, '0');
  if (query != prevtrip_query) {
    prevtrip_query = query;
    let resp = await fetch(query);
    resp = await resp.json();
    let tmp_arr = [];
    _datemap = {};
    
    if (resp.length > 0) {
      for (let rec of resp) {
        if (!tmp_arr.includes(rec['travel_date'])) {
          tmp_arr.push(rec['travel_date']);
          _datemap[rec['travel_date']] = [];
        }
        _datemap[rec['travel_date']].push(rec);
      }
      app.dateOptions = tmp_arr.sort();
      app.dateSelVal = [app.dateOptions[0]];
    } else {
      app.dateOptions = [''];
      app.dateSelVal = [''];
      app.tripOptions = [{text:'',value:''}];
      app.tripSelVal = [''];
    }
  }

  _triplist = [];
  let tripmap = {};
  if (Object.keys(_datemap).length > 0) {
    for (let dt of app.dateSelVal) {
      for (let triprec of _datemap[dt]) {
        _triplist.push(triprec['trip_id']);
        triprec['geometry'] = {};
        triprec['geometry']['type'] = 'LineString';
        triprec['geometry']['coordinates'] = [];
        triprec['type'] = 'Feature';
        tripmap[triprec['trip_id']] =  triprec;
      }
    }
  }
  
  return tripmap;
}

async function updateLocData(tripmap) {
  let query = API_SERVER + LOCATION_VIEW + '?person_id=eq.' + app.hhidSelVal + app.pernumSelVal.padStart(2, '0');
  if (query != prevloc_query) {
    prevloc_query = query;
    if (Object.keys(tripmap).length > 0) {
      let resp = await fetch(query).then(resp => resp.json());
      _locations = resp;
    }
  }

  if (_locations) {
    for (let loc of _locations) {
      if (tripmap.hasOwnProperty(loc['trip_id'])) {
        tripmap[loc['trip_id']]['geometry']['coordinates'].push([loc['lon'],loc['lat']]);
      }
    }
  }
  
  return tripmap;
}


let homeMarker, workMarker, schoolMarker;
let prevtrip_query = '';
let prevloc_query = '';


async function getTripOption(trec) {
  let retval = {};
  retval['text'] = trec['trip_num']+', '+PURP_MAP[trec['o_purpose_category']]+', '+PURP_MAP[trec['d_purpose_category']]+', '+MODE_MAP[trec['mode_1']]+
                    ', '+trec['depart_time'].substring(11,19)+', '+trec['arrive_time'].substring(11,19);
  retval['value'] = trec['trip_num']; 
  return retval;
}


let base_lookup;
let map_vals;
let bwidth_vals;

function styleByMetricColor(feat) {
  let color = getColorFromVal(
              feat['metric'],
              sel_colorvals,
              sel_colors,
              sel_binsflag
              );
  if (!color) color = MISSING_COLOR;
  if (!app.bwidth_check) {
    return { color: color, weight: DEF_BWIDTH, opacity: 1.0 };
  } else {
    return { color: color, weight: feat['bwmetric_scaled'], opacity: 1.0 };
  }
}

let infoPanelTimeout;
let oldHHHoverTarget, oldTrHoverTarget;

function hoverHHFeature(e) {
  clearTimeout(infoPanelTimeout);
  infoPanel.update(e.target.feature);
  
  // don't do anything else if the feature is already clicked
  if (selHHId === e.target.feature[HHID_VAR]) return;

  // return previously-hovered segment to its original color
  if (oldHHHoverTarget && e.target.feature[HHID_VAR] != selHHId) {
    if (oldHHHoverTarget.feature[HHID_VAR] != selHHId)
      allHHLayer.resetStyle(oldHHHoverTarget);
  }

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();
  highlightedGeo.setStyle(hhStyles.highlighted);
  oldHHHoverTarget = e.target; 
}

function hoverTripFeature(e) {
  clearTimeout(infoPanelTimeout);
  infoPanel.update(e.target.feature);
  
  // don't do anything else if the feature is already clicked
  if (selGeoId === e.target.feature[TRIPID_VAR]) return;

  // return previously-hovered segment to its original color
  if (oldTrHoverTarget && e.target.feature[TRIPID_VAR] != selGeoId) {
    if (oldTrHoverTarget.feature[TRIPID_VAR] != selGeoId)
      tripLayer.resetStyle(oldTrHoverTarget);
  }

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();
  highlightedGeo.setStyle(tripStyles.highlighted);
  oldTrHoverTarget = e.target; 
}

function highlightSelectedSegment() {
  selGeoId = app.hhidSelVal + app.pernumSelVal.padStart(2, '0') + app.tripSelVal.padStart(3, '0');
  if (selectedGeo && selectedGeo.feature[TRIPID_VAR] != selGeoId) {
    tripLayer.resetStyle(selectedGeo);
    if (popSelGeo) popSelGeo.remove();
  }

  mymap.eachLayer(function (e) {
    try {
      if (e.feature[TRIPID_VAR] === selGeoId) {
        e.bringToFront();
        e.setStyle(tripStyles.popup);
        selectedGeo = e;
        return;
      }
    } catch(error) {}
  });
}

let selGeoId, selHHId;
let selectedGeo, prevSelectedGeo;
let selectedLatLng;

function clickedOnHHFeature(e) {
  let geo = e.target.feature;
  app.hhidSelVal = geo[HHID_VAR];
}

function clickedOnTripFeature(e) {
  e.target.setStyle(tripStyles.popup);
  let geo = e.target.feature;
  app.tripSelVal = geo['trip_num'];
  selGeoId = geo[TRIPID_VAR];

  // unselect the previously-selected selection, if there is one
  if (selectedGeo && selectedGeo.feature[TRIPID_VAR] != geo[TRIPID_VAR]) {
    prevSelectedGeo = selectedGeo;
    tripLayer.resetStyle(prevSelectedGeo);
  }
  selectedGeo = e.target;
  let selfeat = selectedGeo.feature;
  //app.chartSubtitle = GEOTYPE + ' ' + selfeat[GEOID_VAR];
  selectedLatLng = e.latlng;
  showGeoDetails(selectedLatLng);
}

let popSelGeo;
function showGeoDetails(latlng) {
  // show popup
  popSelGeo = L.popup()
    .setLatLng(latlng)
    .setContent(infoPanel._div.innerHTML)
    .addTo(mymap);

  // Revert to overall chart when no segment selected
  popSelGeo.on('remove', function(e) {
    //resetPopGeo();
  });
}

function resetPopGeo() {
  tripLayer.resetStyle(selectedGeo);
  prevSelectedGeo = selectedGeo = selGeoId = null;
  app.tripSelVal = 'All';
  //app.chartSubtitle = chart_deftitle;
  //buildChartHtmlFromData();
}

let trendChart = null

async function hhselectionChanged(thing) {
  if (popSelGeo) popSelGeo.remove();
  if (app.hhidSelVal == 'All') {
    app.prevHHId = app.hhidSelVal;
    mymap.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM);
    if (homeMarker) homeMarker.remove();
    if (workMarker) workMarker.remove();
    if (schoolMarker) schoolMarker.remove();
    if (tripLayer) mymap.removeLayer(tripLayer);
    app.pernumOptions = [''];
    app.pernumSelVal = '';
    app.dateOptions = [''];
    app.dateSelVal = [''];
    
    if (!allHHLayer) {
      allHHLayer = L.geoJSON(_featJson, {
        pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, hhStyles.init);
        },
        onEachFeature: function(feature, layer) {
          layer.on({
            mouseover: hoverHHFeature,
            click: clickedOnHHFeature,
            });
        },
      });
    }
    allHHLayer.addTo(mymap);
  } else {
    if (allHHLayer) mymap.removeLayer(allHHLayer);
    selHHObj = _hhmap[app.hhidSelVal];
    home_coords = [selHHObj[HLAT_VAR], selHHObj[HLON_VAR]];
    if (homeMarker) homeMarker.remove();
    homeMarker = new L.marker(home_coords, {icon: iconHome}).addTo(mymap);

    let query, resp;
    let tmp_arr = [];
    if (app.hhidSelVal != app.prevHHId) {
      _personmap = {};
      query = API_SERVER + PERSON_VIEW + '?hh_id=eq.' + app.hhidSelVal;
      app.prevHHId = app.hhidSelVal;
      resp = await fetch(query);
      resp = await resp.json();
      for (let rec of resp) {
        tmp_arr.push(rec['person_num']);
        _personmap[rec['person_num']] = rec;
      }
      app.pernumOptions = tmp_arr;
      app.pernumSelVal = app.pernumOptions[0];
      perselectionChanged(app.pernumSelVal);
    }
    mymap.flyTo(home_coords, DEFAULT_ZOOM);
  }
}

async function perselectionChanged(thing) {
  if (popSelGeo) popSelGeo.remove();
  if (app.pernumSelVal == '') return;
  selpersonObj = _personmap[app.pernumSelVal];
  if (workMarker) workMarker.remove();
  if ((selpersonObj[WLAT_VAR]!==null) & (selpersonObj[WLON_VAR]!==null)) {
    let work_coords = [selpersonObj[WLAT_VAR], selpersonObj[WLON_VAR]];
    workMarker = new L.marker(work_coords, {icon: iconWork}).addTo(mymap);
  }
  if (schoolMarker) schoolMarker.remove();
  if ((selpersonObj[SLAT_VAR]!==null) & (selpersonObj[SLON_VAR]!==null)) {
    let school_coords = [selpersonObj[SLAT_VAR], selpersonObj[SLON_VAR]];
    schoolMarker = new L.marker(school_coords, {icon: iconSchool}).addTo(mymap);
  }
  
  if (tripLayer) mymap.removeLayer(tripLayer);
  
  let tmp_arr = [];
  _datemap = {};
  let resp = await fetch(API_SERVER + TRIP_VIEW + '?person_id=eq.' + app.hhidSelVal + app.pernumSelVal.padStart(2, '0'));  
  resp = await resp.json();
  if (resp.length > 0) {
    for (let rec of resp) {
      if (!tmp_arr.includes(rec['travel_date'])) {
        tmp_arr.push(rec['travel_date']);
        _datemap[rec['travel_date']] = [];
      }
      _datemap[rec['travel_date']].push(rec);
    }
    
    _locations = await getLocData();
    
    app.dateOptions = tmp_arr.sort();
    app.dateSelVal = [app.dateOptions[0]];
  } else {
    app.dateOptions = [''];
    app.dateSelVal = [''];  
  }
}

async function getLocData() {
  let locdata = await fetch(API_SERVER + LOCATION_VIEW + '?person_id=eq.' + app.hhidSelVal + app.pernumSelVal.padStart(2, '0'));  
  return await locdata.json();
}

async function dateChanged(thing) {
  if (popSelGeo) popSelGeo.remove();
  if (app.hhidSelVal == 'All') {
    app.tripOptions = [{text:'',value:''}];
    app.tripSelVal = '';
  } else {
    _tripmap = {};
    _triplist = [];
    let tmpOptions = [];
    if (Object.keys(_datemap).length > 0) {
      for (let dt of app.dateSelVal) {
        for (let triprec of _datemap[dt]) {
          triprec['geometry'] = {};
          triprec['geometry']['type'] = 'LineString';
          triprec['geometry']['coordinates'] = [];
          _triplist.push(triprec['trip_id']);
          _tripmap[triprec['trip_id']] =  triprec;
          tmpOptions.push(await getTripOption(triprec));
        }
      }
      
      for (let loc of _locations) {
        if (_tripmap.hasOwnProperty(loc['trip_id'])) {
          _tripmap[loc['trip_id']]['geometry']['coordinates'].push([loc['lon'],loc['lat']]);
        }
      }
      app.tripOptions = tmpOptions.sort((a,b) => a.value-b.value);
      app.tripSelVal = 'All';
      tripChanged(app.tripSelVal);
    } else {
      app.tripOptions = [{text:'',value:''}];
      app.tripSelVal = '';
    }
  }
}

async function tripChanged(thing) {
  if (thing=='All') {
    let _tripJson = [];
    if (tripLayer) mymap.removeLayer(tripLayer);
    for (let tid of _triplist) {
      _tripmap[tid]['type'] = 'Feature';
      _tripJson.push(_tripmap[tid]);
    }
    tripLayer = L.geoJSON(_tripJson, {
        onEachFeature: function(feature, layer) {
          layer.on({
            mouseover: hoverTripFeature,
            click: clickedOnTripFeature,
            });
        },
      });
    tripLayer.addTo(mymap); 
    mymap.flyToBounds(tripLayer.getBounds());
  } else if (thing=='') {
    if (tripLayer) mymap.removeLayer(tripLayer);
  } else if (thing) {
    highlightSelectedSegment();
    //showGeoDetails(selectedLatLng);
  }
}


let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
    
    hhidOptions: ['All'],
    hhidSelVal: 'All',
    prevHHId: 'All',
    pernumOptions: [''],
    pernumSelVal: '',
    dateOptions: [''],
    dateSelVal: [''],
    tripOptions: [{text:'',value:''}],
    tripSelVal: '',
    
    chartTitle: 'AVG_RIDE TREND',
    chartSubtitle: chart_deftitle,
  },
  watch: {
    hhidSelVal: hhselectionChanged,
    pernumSelVal: perselectionChanged,
    dateSelVal: dateChanged,
    tripSelVal: tripChanged,
  },
  methods: {
    clickToggleHelp: clickToggleHelp,
    clickedShowHide: clickedShowHide,
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

// eat some cookies -- so we can hide the help permanently
let cookieShowHelp = Cookies.get('showHelp');
function clickToggleHelp() {
  helpPanel.showHelp = !helpPanel.showHelp;

  // and save it for next time
  if (helpPanel.showHelp) {
    Cookies.remove('showHelp');
  } else {
    Cookies.set('showHelp', 'false', { expires: 365 });
  }
}

let helpPanel = new Vue({
  el: '#helpbox',
  data: {
    showHelp: cookieShowHelp == undefined,
  },
  methods: {
    clickToggleHelp: clickToggleHelp,
  },
  mounted: function() {
    document.addEventListener('keydown', e => {
      if (this.showHelp && e.keyCode == 27) {
        clickToggleHelp();
      }
    });
  },
});

initialPrep();

