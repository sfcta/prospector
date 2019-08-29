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
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'tmc_transit';
const DATA_VIEW = 'tnctr_bus';
const API_SERVER2 = 'http://shinyta.sfcta.org/apiprivate/';
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
let _featJson, _featJson2, _tripsJson;
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
  //await drawMapFeatures2(true);
  await hhselectionChanged(app.hhidSelVal);
  
  console.log('3... ');
  //await buildChartHtmlFromData();

  console.log('4 !!!');
}

async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?select=tmc,geometry,street,intersec,direction,dir2';

  try {
    // get a list of valid TMCs
    let trtmc_ids = [];
    let resp = await fetch(API_SERVER2 + HH_VIEW);
    let features = await resp.json();
    for (let feat of features) {
      feat['type'] = 'Feature';
      feat['geometry'] = {};
      feat['geometry']['type'] = 'Point';
      feat['geometry']['coordinates'] = [feat[HLON_VAR], feat[HLAT_VAR]];
      _hhlist.push(feat['hh_id']);
      _hhmap[feat['hh_id']] = feat;
    }
    _featJson2 = features;
    app.hhidOptions = app.hhidOptions.concat(_hhlist);
    
    resp = await fetch(geo_url);
    features = await resp.json();

    // do some parsing and stuff
    let feat_filtered = [];
    for (let feat of features) {
      feat['type'] = 'Feature';
      feat['geometry'] = JSON.parse(feat.geometry);
      feat_filtered.push(feat);
    }
    return feat_filtered;

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

async function getMapData() {
  let data_url = API_SERVER + DATA_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();
  base_lookup = {};
  let tmp = {};
  for (let yr of SCNYR_LIST) {
    tmp[yr] = {};
    base_lookup[yr] = {};
    for (let tod of app.time_options) {
      tmp[yr][tod.value] = {};
      base_lookup[yr][tod.value] = {};
      for (let met of app.metric_options) {
        tmp[yr][tod.value][met.value] = 0;
      }
    }
  }
  for (let entry of jsonData) {
    base_lookup[entry[YR_VAR]][entry[TOD_VAR]][entry[GEOID_VAR]] = entry;
    for (let met of app.metric_options) {
      tmp[entry[YR_VAR]][entry[TOD_VAR]][met.value] += entry[met.value];
    }
  }
  _aggregateData = {};
  for (let tod of app.time_options) {
    _aggregateData[tod.value] = [];
  }
  for (let yr of SCNYR_LIST) {
    for (let tod of app.time_options) {
      let row = {};
      row['year'] = yr.toString();
      for (let met of app.metric_options) {
        row[met.value] = Math.round(tmp[yr][tod.value][met.value]*prec)/prec;
      }
      _aggregateData[tod.value].push(row);
    }
  }
}

async function updateTripData() {
  let query = API_SERVER2 + TRIP_VIEW + '?person_id=eq.' + app.hhidSelVal + app.pernumSelVal.padStart(2, '0');
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
  let query = API_SERVER2 + LOCATION_VIEW + '?person_id=eq.' + app.hhidSelVal + app.pernumSelVal.padStart(2, '0');
  if (query != prevloc_query) {
    prevloc_query = query;
    if (Object.keys(tripmap).length > 0) {
      let resp = await fetch(query).then(resp => resp.json());
      _locations = resp;
      console.log(Object.keys(tripmap).length);
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
async function drawMapFeatures2(init=false) {
  
  if (app.hhidSelVal == 'All') {
    mymap.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM);
    if (homeMarker) homeMarker.remove();
    if (workMarker) workMarker.remove();
    if (schoolMarker) schoolMarker.remove();
    if (tripLayer) mymap.removeLayer(tripLayer);
    if (popSelGeo) popSelGeo.remove();
    app.pernumOptions = [''];
    app.pernumSelVal = '';
    app.dateOptions = [''];
    app.dateSelVal = [''];
    app.tripOptions = [{text:'',value:''}];
    app.tripSelVal = [''];
    
    if (!allHHLayer) {
      allHHLayer = L.geoJSON(_featJson2, {
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
      query = API_SERVER2 + PERSON_VIEW + '?hh_id=eq.' + app.hhidSelVal;
      app.prevHHId = app.hhidSelVal;
      resp = await fetch(query);
      resp = await resp.json();
      for (let rec of resp) {
        tmp_arr.push(rec['person_num']);
        _personmap[rec['person_num']] = rec;
      }
      app.pernumOptions = tmp_arr;
      if (!app.pernumOptions.includes(app.pernumSelVal)) app.pernumSelVal = app.pernumOptions[0];
    }
    
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

    _tripmap = await updateTripData();
    //console.log(_tripmap);

    let _tripJson = [];
    if (tripLayer) mymap.removeLayer(tripLayer);
    _tripmap = await updateLocData(_tripmap);
    console.log(_tripmap);
    if (Object.keys(_tripmap).length > 0) {
      let tmpOptions = [];
       
      for (let tid of _triplist) {
        _tripmap[tid]['type'] = 'Feature';
        _tripJson.push(_tripmap[tid]);
        tmpOptions.push(await getTripOption(_tripmap[tid]));
      }
      app.tripOptions = tmpOptions;
      if (!app.tripOptions.includes(app.tripSelVal)) app.tripSelVal = [''];
      //console.log(_tripJson);
      if (tripLayer) mymap.removeLayer(tripLayer);
      tripLayer = L.geoJSON(_tripJson, {
          onEachFeature: function(feature, layer) {
            layer.on({
              mouseover: hoverTripFeature,
              click: clickedOnTripFeature,
              });
          },
        });
      tripLayer.addTo(mymap); 
    }    
    
    
    mymap.flyTo(home_coords, DEFAULT_ZOOM);
  }
  
}

async function getTripOption(trec) {
  let retval = {};
  retval['text'] = trec['trip_num']+', '+PURP_MAP[trec['o_purpose_category']]+', '+PURP_MAP[trec['d_purpose_category']]+', '+MODE_MAP[trec['mode_1']]+
                    ','+trec['depart_time'].substring(11,19)+', '+trec['arrive_time'].substring(11,19);
  retval['value'] = trec['trip_num']; 
  return retval;
}


let base_lookup;
let map_vals;
let bwidth_vals;
async function drawMapFeatures(queryMapData=true) {
  // create a clean copy of the feature Json
  if (!_featJson) return;
  let cleanFeatures = _featJson.slice();
  let sel_metric = app.selected_metric;
  let base_scnyr = app.sliderValue[0];
  let comp_scnyr = app.sliderValue[1];
  if (base_scnyr==comp_scnyr) {
    app.comp_check = false;
    app.pct_check = false;
  } else {
    app.comp_check = true;
  }
  prec = (FRAC_COLS.includes(sel_metric) ? 100 : 1);
  
  try {
    if (queryMapData) {
      if (base_lookup == undefined) await getMapData();
      
      let map_metric;
      let bwidth_metric;
      map_vals = [];
      bwidth_vals = [];
      for (let feat of cleanFeatures) {
        bwidth_metric = null;
        if (base_lookup[base_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
          bwidth_metric = Math.round(base_lookup[base_scnyr][app.selected_timep][feat[GEOID_VAR]][app.selected_bwidth]);
          if (bwidth_metric !== null) bwidth_vals.push(bwidth_metric);
        }
        feat['bwmetric'] = bwidth_metric;
        
        map_metric = null;
        feat['base'] = null;
        feat['comp'] = null;
        if (app.comp_check) {
          if (base_lookup[base_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
            if (base_lookup[comp_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
              feat['base'] = base_lookup[base_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
              feat['comp'] = base_lookup[comp_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
              map_metric = feat['comp'] - feat['base'];
              if (app.pct_check && app.comp_check) {
                if (feat['base']>0) {
                  map_metric = map_metric*100/feat['base'];
                } else {
                  map_metric = 0;
                }
              }
            } else {
              feat['base'] = base_lookup[base_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
            }
          } else {
            if (base_lookup[comp_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) feat['comp'] = base_lookup[comp_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
          }
        } else {
          if (base_lookup[base_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
            map_metric = base_lookup[base_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
          }
        }
        if (map_metric !== null) {
          map_metric = Math.round(map_metric*prec)/prec;
          map_vals.push(map_metric);
        }
        feat['metric'] = map_metric;
      }
      map_vals = map_vals.sort((a, b) => a - b);  
      bwidth_vals = bwidth_vals.sort((a, b) => a - b); 
    }
    
    if (map_vals.length > 0) {
      let color_func;
      let sel_colorvals2;
      let bp;
      
      if (queryMapData) {
        sel_colorvals = Array.from(new Set(map_vals)).sort((a, b) => a - b);
        
        //calculate distribution
        let dist_vals = (app.comp_check && app.pct_check)? map_vals.filter(entry => entry <= MAX_PCTDIFF) : map_vals;
        let x = d3.scaleLinear()
                .domain([dist_vals[0], dist_vals[dist_vals.length-1]])
        let numticks = 20;
        if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) numticks = sel_colorvals.length;
        let histogram = d3.histogram()
            .domain(x.domain())
            .thresholds(x.ticks(numticks));
        updateDistChart(histogram(dist_vals));

        if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) {
          sel_binsflag = false;
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals.concat([sel_colorvals[sel_colorvals.length-1]+1]));
          sel_colorvals2 = sel_colorvals.slice(0);
          
          app.custom_disable = true;
          app.bp0 = 0;
          app.bp1 = 0;
          app.bp2 = 0;
          app.bp3 = 0;
          app.bp4 = 0;
          app.bp5 = 1;
          
        } else {
          app.custom_disable = false;
          
          let mode = 'base';
          if (app.comp_check){
            if(app.pct_check){
              mode = 'pctdiff';
            } else {
              mode = 'diff';
            }
          }
          let custom_bps;
          if (CUSTOM_BP_DICT.hasOwnProperty(sel_metric)){
            custom_bps = CUSTOM_BP_DICT[sel_metric][mode];
            sel_colorvals = [map_vals[0]];
            for (var i = 0; i < custom_bps.length; i++) {
              if (custom_bps[i]>map_vals[0] && custom_bps[i]<map_vals[map_vals.length-1]) sel_colorvals.push(custom_bps[i]);
            }
            sel_colorvals.push(map_vals[map_vals.length-1]);
          } else {
            sel_colorvals = getQuantiles(map_vals, app.selected_breaks);
          }
          bp = Array.from(sel_colorvals).sort((a, b) => a - b);
          app.bp0 = bp[0];
          app.bp5 = bp[bp.length-1];
          if (CUSTOM_BP_DICT.hasOwnProperty(sel_metric)){
            app.bp1 = custom_bps[0];
            app.bp2 = custom_bps[1];
            app.bp3 = custom_bps[2];
            app.bp4 = custom_bps[3];
            if (custom_bps[0] < app.bp0) app.bp1 = app.bp0;
          } else {
            app.bp1 = bp[1];
            app.bp4 = bp[bp.length-2];
            if (app.selected_breaks==3) {
              app.bp2 = app.bp3 = bp[2];
            } else {
              app.bp2 = bp[2];
              app.bp3 = bp[3];
            }
          }
          
          sel_colorvals = Array.from(new Set(sel_colorvals)).sort((a, b) => a - b);
          updateColorScheme(sel_colorvals);
          sel_binsflag = true; 
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
          sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
        }

        app.bwcustom_disable = false;
        sel_bwvals = getQuantiles(bwidth_vals, 5);
        bp = Array.from(sel_bwvals).sort((a, b) => a - b);
        app.bwbp0 = bp[0];
        app.bwbp1 = bp[1];
        app.bwbp2 = bp[2];
        app.bwbp3 = bp[3];
        app.bwbp4 = bp[4];
        app.bwbp5 = bp[5];
        sel_bwvals = Array.from(new Set(sel_bwvals)).sort((a, b) => a - b); 
      } else {
        sel_colorvals = new Set([app.bp0, app.bp1, app.bp2, app.bp3, app.bp4, app.bp5]);
        sel_colorvals = Array.from(sel_colorvals).sort((a, b) => a - b);
        updateColorScheme(sel_colorvals);
        sel_binsflag = true; 
        color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
        sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
        
        sel_bwvals = new Set([app.bwbp0, app.bwbp1, app.bwbp2, app.bwbp3, app.bwbp4, app.bwbp5]);
        sel_bwvals = Array.from(sel_bwvals).sort((a, b) => a - b);
      }

      let bw_widths;
      if (app.bwidth_check) {
        bw_widths = BWIDTH_MAP[sel_bwvals.length]; 
        for (let feat of cleanFeatures) {
          if (feat['bwmetric'] !== null) {
            if (sel_bwvals.length <= 2){
              feat['bwmetric_scaled'] = bw_widths;
            } else {
              for (var i = 0; i < sel_bwvals.length-1; i++) {
                if (feat['bwmetric'] <= sel_bwvals[i + 1]) {
                  feat['bwmetric_scaled'] = bw_widths[i];
                  break;
                }
              }
            }
            //feat['bwmetric_scaled'] = (feat['bwmetric']-bwidth_vals[0])*(MAX_BWIDTH-MIN_BWIDTH)/(bwidth_vals[bwidth_vals.length-1]-bwidth_vals[0])+MIN_BWIDTH;
          } else {
            feat['bwmetric_scaled'] = null;
          }
        }
      }
      
      sel_colors = [];
      for(let i of sel_colorvals2) {
        sel_colors.push(color_func(i).hex());
      }
 
      if (geoLayer) mymap.removeLayer(geoLayer);
      if (mapLegend) mymap.removeControl(mapLegend);
      
      geoLayer = L.geoJSON(_featJson2, {
        pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, geojsonMarkerOptions);
        }
        /*style: {"color": "#ff7800"},
        onEachFeature: function(feature, layer) {
          layer.on({
            mouseover: hoverFeature,
            click: clickedOnFeature,
            });
        },*/
      });

      geoLayer.addTo(mymap);
      

      mapLegend = L.control({ position: 'bottomright' });
      mapLegend.onAdd = function(map) {
        let div = L.DomUtil.create('div', 'info legend');
        let legHTML = getLegHTML(
          sel_colorvals,
          sel_colors,
          sel_binsflag,
          (app.pct_check && app.comp_check)? '%': ''
        );
        legHTML = '<h4>' + sel_metric.toUpperCase() + (app.pct_check? ' % Diff': (METRIC_UNITS.hasOwnProperty(sel_metric)? (' (' + METRIC_UNITS[sel_metric] + ')') : '')) +
                  '</h4>' + legHTML;
        if (app.bwidth_check) {
          legHTML += '<hr/>' + '<h4>' + app.selected_bwidth.toUpperCase() +  '</h4>';
          legHTML += getBWLegHTML(sel_bwvals, bw_widths);
        }
        div.innerHTML = legHTML;
        return div;
      };
      mapLegend.addTo(mymap);
      
      if (selectedGeo) {
        if (base_lookup[base_scnyr][app.selected_timep].hasOwnProperty(selectedGeo.feature[GEOID_VAR])) {
          buildChartHtmlFromData(selectedGeo.feature[GEOID_VAR]);
          return cleanFeatures.filter(entry => entry[GEOID_VAR] == selectedGeo.feature[GEOID_VAR])[0];
        } else {
          resetPopGeo();
        }
      } else {
        buildChartHtmlFromData();
        return null;
      }
    }

  } catch(error) {
    console.log(error);
  }
}

function updateColorScheme(colorvals) {
  if (colorvals[0] * colorvals[colorvals.length-1] >= 0) {
    app.selected_colorscheme = COLORRAMP.SEQ;
  } else {
    app.selected_colorscheme = COLORRAMP.DIV;
  } 
}

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
  if (!selGeoId) return;

  mymap.eachLayer(function (e) {
    try {
      if (e.feature[GEOID_VAR] === selGeoId) {
        e.bringToFront();
        e.setStyle(styles.popup);
        selectedGeo = e;
        return;
      }
    } catch(error) {}
  });
}

let distChart = null;
let distLabels;
function updateDistChart(bins) {
  let data = [];
  distLabels = [];
  for (let b of bins) {
    let x0 = Math.round(b.x0*prec)/prec;
    let x1 = Math.round(b.x1*prec)/prec;
    data.push({x:x0, y:b.length});
    distLabels.push(x0 + '-' + x1);
  }

  if (distChart) {
    distChart.setData(data);
  } else {
      distChart = new Morris.Area({
        element: 'dist-chart',
        data: data,
        xkey: 'x',
        ykeys: 'y',
        ymin: 0,
        labels: ['Freq'],
        lineColors: ['#1fc231'],
        xLabels: 'x',
        xLabelAngle: 25,
        xLabelFormat: binFmt,
        hideHover: true,
        parseTime: false,
        fillOpacity: 0.4,
        pointSize: 1,
        behaveLikeLine: false,
        eventStrokeWidth: 2,
        eventLineColors: ['#ccc'],
      });
  }

}

function binFmt(x) {
  return distLabels[x.x] + ((app.pct_check && app.comp_check)? '%':'');
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
  selGeoId = geo[TRIPID_VAR];

  // unselect the previously-selected selection, if there is one
  if (selectedGeo && selectedGeo.feature[TRIPID_VAR] != geo[TRIPID_VAR]) {
    prevSelectedGeo = selectedGeo;
    geoLayer.resetStyle(prevSelectedGeo);
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
    resetPopGeo();
  });
}

function resetPopGeo() {
  tripLayer.resetStyle(selectedGeo);
  prevSelectedGeo = selectedGeo = selGeoId = null;
  //app.chartSubtitle = chart_deftitle;
  //buildChartHtmlFromData();
}

let trendChart = null
function buildChartHtmlFromData(geoid = null) {
  document.getElementById('longchart').innerHTML = '';
  if (geoid) {
    let selgeodata = [];
    for (let yr of SCNYR_LIST) {
      let row = {};
      row['year'] = yr.toString();
      row[app.selected_metric] = base_lookup[yr][app.selected_timep][geoid][app.selected_metric];
      selgeodata.push(row);
    } 
    trendChart = new Morris.Line({
      data: selgeodata,
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: [app.selected_metric.toUpperCase()],
      lineColors: ['#f66'],
      xkey: 'year',
      smooth: false,
      parseTime: false,
      xLabelAngle: 45,
      ykeys: [app.selected_metric],
    });
  } else {
    trendChart = new Morris.Line({
      data: _aggregateData[app.selected_timep],
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: [app.selected_metric.toUpperCase()],
      lineColors: ['#f66'],
      xkey: 'year',
      smooth: false,
      parseTime: false,
      xLabelAngle: 45,
      ykeys: [app.selected_metric],
    });
  }
}


function bp1Changed(thing) {
  if (thing < app.bp0) app.bp1 = app.bp0;
  if (thing > app.bp2) app.bp2 = thing;
  app.isUpdActive = true;
}
function bp2Changed(thing) {
  if (thing < app.bp1) app.bp1 = thing;
  if (thing > app.bp3) app.bp3 = thing;
  app.isUpdActive = true;
}
function bp3Changed(thing) {
  if (thing < app.bp2) app.bp2 = thing;
  if (thing > app.bp4) app.bp4 = thing;
  app.isUpdActive = true;
}
function bp4Changed(thing) {
  if (thing < app.bp3) app.bp3 = thing;
  if (thing > app.bp5) app.bp4 = app.bp5;
  app.isUpdActive = true;
}
function bwbp1Changed(thing) {
  if (thing < app.bwbp0) app.bwbp1 = app.bwbp0;
  if (thing > app.bwbp2) app.bwbp2 = thing;
  app.isBWUpdActive = true;
}
function bwbp2Changed(thing) {
  if (thing < app.bwbp1) app.bwbp1 = thing;
  if (thing > app.bwbp3) app.bwbp3 = thing;
  app.isBWUpdActive = true;
}
function bwbp3Changed(thing) {
  if (thing < app.bwbp2) app.bwbp2 = thing;
  if (thing > app.bwbp4) app.bwbp4 = thing;
  app.isBWUpdActive = true;
}
function bwbp4Changed(thing) {
  if (thing < app.bwbp3) app.bwbp3 = thing;
  if (thing > app.bwbp5) app.bwbp4 = app.bwbp5;
  app.isBWUpdActive = true;
}

async function selectionChanged(thing) {
  app.chartTitle = app.selected_metric.toUpperCase() + ' TREND';
  if (app.sliderValue && app.selected_metric && app.selected_timep) {
    let selfeat = await drawMapFeatures();
    if (selfeat) {
      highlightSelectedSegment();
      popSelGeo.setContent(getInfoHtml(selfeat));
    }
  }
}

async function hhselectionChanged(thing) {
  if (thing == 'All') {
    mymap.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM);
    if (homeMarker) homeMarker.remove();
    if (workMarker) workMarker.remove();
    if (schoolMarker) schoolMarker.remove();
    if (tripLayer) mymap.removeLayer(tripLayer);
    if (popSelGeo) popSelGeo.remove();
    app.pernumOptions = [''];
    app.pernumSelVal = '';
    app.dateOptions = [''];
    app.dateSelVal = [''];
    
    if (!allHHLayer) {
      allHHLayer = L.geoJSON(_featJson2, {
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
      query = API_SERVER2 + PERSON_VIEW + '?hh_id=eq.' + app.hhidSelVal;
      app.prevHHId = app.hhidSelVal;
      resp = await fetch(query);
      resp = await resp.json();
      for (let rec of resp) {
        tmp_arr.push(rec['person_num']);
        _personmap[rec['person_num']] = rec;
      }
      app.pernumOptions = tmp_arr;
      app.pernumSelVal = app.pernumOptions[0];
    }
  }
}

async function perselectionChanged(thing) {
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
  
  
  
  let tmp_arr = [];
  _datemap = {};
  let resp = await fetch(API_SERVER2 + TRIP_VIEW + '?person_id=eq.' + app.hhidSelVal + app.pernumSelVal.padStart(2, '0'));  
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
  let locdata = await fetch(API_SERVER2 + LOCATION_VIEW + '?person_id=eq.' + app.hhidSelVal + app.pernumSelVal.padStart(2, '0'));  
  return await locdata.json();
}

async function dateChanged(thing) {
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
      app.tripOptions = tmpOptions;
      app.tripSelVal = 'All';
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
    mymap.flyTo(home_coords, DEFAULT_ZOOM);
  } else if (thing=='') {
    if (tripLayer) mymap.removeLayer(tripLayer);
  }
}


async function updateMap(thing) {
  app.isUpdActive = false;
  let selfeat = await drawMapFeatures(false);
  if (selfeat) {
    highlightSelectedSegment();
    popSelGeo.setContent(getInfoHtml(selfeat));
  }
}
function customBreakPoints(thing) {
  if(thing) {
    app.isUpdActive = false;
  } else {
    drawMapFeatures();
  }
}
function customBWBreakPoints(thing) {
  if(thing) {
    app.isBWUpdActive = false;
  } else {
    drawMapFeatures();
  }
}

function colorschemeChanged(thing) {
  app.selected_colorscheme = thing;
  drawMapFeatures(false);
}

function bwidthChanged(thing) {
  app.bwcustom_disable = !thing;
  drawMapFeatures(false);
}
function bwUpdateMap(thing) {
  app.isBWUpdActive = false;
  drawMapFeatures(false);
}

function getColorMode(cscheme) {
  if (app.modeMap.hasOwnProperty(cscheme.toString())) {
    return app.modeMap[cscheme];
  } else {
    return 'lrgb';
  }
}

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
    isUpdActive: false,
    comp_check: true,
    pct_check: true,
    bwidth_check: false,
    custom_check: true,
    custom_disable: false,
    bp0: 0.0,
    bp1: 0.0,
    bp2: 0.0,
    bp3: 0.0,
    bp4: 0.0,
    bp5: 0.0,
    
    isBWUpdActive: false,
    bwcustom_check: false,
    bwcustom_disable: true,
    bwbp0: 0.0,
    bwbp1: 0.0,
    bwbp2: 0.0,
    bwbp3: 0.0,
    bwbp4: 0.0,
    bwbp5: 0.0,
    
    hhidOptions: ['All'],
    hhidSelVal: 'All',
    prevHHId: 'All',
    pernumOptions: [''],
    pernumSelVal: '',
    dateOptions: [''],
    dateSelVal: [''],
    tripOptions: [{text:'',value:''}],
    tripSelVal: '',
    
    selected_metric: 'avg_ride',
    metric_options: [
    {text: 'avg_ride', value: 'avg_ride'},
    {text: 'pickups', value: 'pickups'},
    {text: 'dropoffs', value: 'dropoffs'},
    {text: 'avg_ride_muni_rail', value: 'avg_ride_muni_rail'},
    
    {text: 'ontime5', value: 'ontime5'},
    {text: 'ons', value: 'ons'},
    {text: 'offs', value: 'offs'},
    {text: 'freq_s', value: 'freq_s'},
    {text: 'num_stops', value: 'num_stops'},
    
    {text: 'hhlds', value: 'hhlds'},
    {text: 'pop', value: 'pop'},
    {text: 'empres', value: 'empres'},
    {text: 'cie', value: 'cie'},
    {text: 'med', value: 'med'},
    {text: 'mips', value: 'mips'},
    {text: 'pdr', value: 'pdr'},
    {text: 'retail', value: 'retail'},
    {text: 'visitor', value: 'visitor'},
    {text: 'totalemp', value: 'totalemp'},
    
    {text: 'areatype', value: 'areatype'},
    {text: 'non_white_pop_total', value: 'non_white_pop_total'},
    {text: 'white_pop_total', value: 'white_pop_total'},
    {text: 'senior_65p_pop_total', value: 'senior_65p_pop_total'},
    
    {text: 'totalemp_30', value: 'totalemp_30'},
    {text: 'totalemp_60', value: 'totalemp_60'},
    {text: 'hhlds_30', value: 'hhlds_30'},
    {text: 'hhlds_60', value: 'hhlds_60'},
    {text: 'pop_30', value: 'pop_30'},
    {text: 'pop_60', value: 'pop_60'},
    ],
    chartTitle: 'AVG_RIDE TREND',
    chartSubtitle: chart_deftitle,
    
    sliderValue: [SCNYR_LIST[0],SCNYR_LIST[SCNYR_LIST.length-1]],
    
    selected_timep: 'Daily',
    time_options: [
    {text: 'Daily', value: 'Daily'},
    {text: '0300-0559', value: '0300-0559'},
    {text: '0600-0859', value: '0600-0859'},
    {text: '0900-1359', value: '0900-1359'},
    {text: '1400-1559', value: '1400-1559'},
    {text: '1600-1859', value: '1600-1859'},
    {text: '1900-2159', value: '1900-2159'},
    {text: '2200-0259', value: '2200-0259'},
    ],

    selected_bwidth: bwidth_metric_list[0],
    bwidth_options: [],    
    
    selected_colorscheme: COLORRAMP.DIV,
    modeMap: {
      '#ffffcc,#3f324f': 'hsl',
    },

    selected_breaks: 5,
  },
  watch: {
    hhidSelVal: hhselectionChanged,
    pernumSelVal: perselectionChanged,
    dateSelVal: dateChanged,
    tripSelVal: tripChanged,
    selected_timep: selectionChanged,
    selected_metric: selectionChanged,
    pct_check: selectionChanged,
    
    bp1: bp1Changed,
    bp2: bp2Changed,
    bp3: bp3Changed,
    bp4: bp4Changed,
    bwbp1: bwbp1Changed,
    bwbp2: bwbp2Changed,
    bwbp3: bwbp3Changed,
    bwbp4: bwbp4Changed,
    //custom_check: customBreakPoints,
    bwcustom_check: customBWBreakPoints,
    bwidth_check: bwidthChanged,
  },
  methods: {
    updateMap: updateMap,
    bwUpdateMap: bwUpdateMap,
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

