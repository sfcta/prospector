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
import vueSlider from 'vue-slider-component';
import Cookies from 'js-cookie';

var maplib = require('../jslib/maplib');
let styles = {'polygon': maplib.styles, 'line': {selected: {"color": "#39f"},popup: {"color": "#33f"}}};
let getLegHTML = maplib.getLegHTML2;
let getColorFromVal = maplib.getColorFromVal2;
let getBWLegHTML = maplib.getBWLegHTML;

let baseLayer = maplib.baseLayer;
let mymap = maplib.sfmap;
mymap.setView([37.76889, -122.440997], 13);
mymap.removeLayer(baseLayer);
let url = 'https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let token = 'pk.eyJ1Ijoic2ZjdGEiLCJhIjoiY2ozdXBhNm1mMDFkaTJ3dGRmZHFqanRuOCJ9.KDmACTJBGNA6l0CyPi1Luw';
let attribution ='<a href="https://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="https://mapbox.com">Mapbox</a>';
baseLayer = L.tileLayer(url, {
  attribution:attribution,
  minZoom: 10,
  maxZoom: 18,
  accessToken:token,
}).addTo(mymap);

let stripes = new L.StripePattern({weight:3,spaceWeight:3,opacity:0.6,angle:135}); stripes.addTo(mymap);


// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'connectsf_tlinks';
const DATA_VIEW = 'connectsf_trnload';

const VIZ_LIST = ['ASPD','TCROWD','TTIME','VMT'];
const VIZ_INFO = {
  ASPD: {
    TXT: 'Traffic Volumes & Speeds',
	GEO_VIEW: 'hwy_base2020',
	GEO_VIEWKEY: 'hlinks',
	DATA_VIEW: 'covid_hwy_scn',
	GEOID_VAR: 'a_b',
    METRIC: 'spd_ratio',
    METRIC_DESC: 'Speed Ratio',
	BWIDTH_METRIC: 'totvol',
	COLORVALS: {false: [0, .5, .7, .8, .9, 500], true: [-10, -0.2, -0.1, 0.1, 0.2, 500]},
    COLORS: {false: ['#c73232','#f26e72','#f8afb1','#facacc','#fef0f1'], true: ['#d7191c','#fdae61','#ffffbf','#abd9e9','#2c7bb6']},
	BWVALS: [0, 1000, 5000, 25000, 125000, 500000],
	BWIDTHS: [1, 2, 4, 8, 10],
	STYLES_KEY: 'line',
    COLOR_BY_BINS: true,
    POST_UNITS: '',
  },
  TCROWD: {
    TXT: 'Transit Volumes & Crowding',
    GEO_VIEWKEY: 'tlinks',
	DATA_VIEW: 'covid_trnload_scn',
	GEOID_VAR: 'a_b_mode',
    METRIC: 'load',
    METRIC_DESC: 'Crowding',
	BWIDTH_METRIC: 'ab_vol',
	COLORVALS: {false: [0, 0.5, 0.85, 1, 500], true: [-10, -0.2, -0.05, 0.05, 0.2, 500]},
    COLORS: {false: ['#fde0e2','#f7a6a9','#f37377','#c73232'], true: ['#2c7bb6','#abd9e9','#ffffbf','#fdae61','#d7191c']},
	BWVALS: [0, 500, 2500, 5000, 10000, 500000],
	BWIDTHS: [1, 2, 4, 8, 16],
	STYLES_KEY: 'line',	
    COLOR_BY_BINS: true,
    POST_UNITS: 'V/C',
  },
  TTIME: {
    TXT: 'Average Travel Time',
    GEO_VIEWKEY: 'taz',
    DATA_VIEW: 'covid_ttime_scn',
	GEOID_VAR: 'taz',
    METRIC: 'avg_time',
    METRIC_DESC: 'Average Travel Time',
	COLORVALS: {false: [0, 15, 18, 21, 24, 27, 30, 500], true: [-100, -3, -0.5, 0.5, 3, 500]},
    COLORS: {false: ['#fef0f1','#fcd9db','#f9b8ba','#f69497','#f3787c','#e45b5d','#c73232'], true: ['#2c7bb6','#abd9e9','#ffffbf','#fdae61','#d7191c']},
	STYLES_KEY: 'polygon',	
    COLOR_BY_BINS: true,
    POST_UNITS: 'minutes',
  },
  VMT: {
    TXT: 'Vehicle Miles Traveled (VMT)',
    GEO_VIEWKEY: 'taz',
    DATA_VIEW: 'covid_vmt_scn',
	GEOID_VAR: 'taz',
    METRIC: 'vmt_per_pers',
    METRIC_DESC: 'Daily Vehicle Miles Traveled per Person',
	COLORVALS: {false: [0, 1, 2, 3, 4, 5, 6, 7, 8, 500], true: [-100, -3, -0.1, 0.1, 3, 500]},
    COLORS: {false: ['#fef0f1','#fde0e2','#facacc','#f8afb1','#f69497','#f47d80','#f26e72','#dd4f51','#c73232'], true: ['#2c7bb6','#abd9e9','#ffffbf','#fdae61','#d7191c']},
	STYLES_KEY: 'polygon',	
	COLOR_BY_BINS: true,
    POST_UNITS: '',
  }  
};

const SCEN_DEF = {
	1: {'name': 'Baseline (pre-COVID)', 'desc': ''},
	2: {'name': 'Shelter in Place', 'desc': ''},
	3: {'name': 'Carmageddon', 'desc': ''},
	4: {'name': 'Remote Work Forever', 'desc': ''},
	5: {'name': 'Lingering Fears', 'desc': ''},
	6: {'name': 'Doldrums', 'desc': ''},
	7: {'name': 'K Recovery', 'desc': ''},
	8: {'name': 'Transit Demand Worst Case', 'desc': ''},
	9: {'name': 'Transit Trendline', 'desc': ''},
}
let scn_list = [];
for (const prop in SCEN_DEF) {
	scn_list.push({id: prop, name: SCEN_DEF[prop]['name']});
}

const SCEN_SUMMARY = {
	1: [{key: 'SF Resident Trips', value: '2,850,049'}, 
		{key: 'Vehicle Miles Traveled', value: '9.53 million'}, 
		{key: 'Average Speed', value: '20.9 mph'}, 
		{key: 'Transit Mode Share', value: '21.1%'},
		{key: 'Muni Boardings', value: '662,788'},
		{key: 'BART Boardings', value: '416,767'},
		{key: 'Caltrain Boardings', value: '62,853'}],
	2: [{key: 'SF Resident Trips', value: '724,966'}, 
		{key: 'Vehicle Miles Traveled', value: '3.73 million'}, 
		{key: 'Average Speed', value: '25.1 mph'}, 
		{key: 'Transit Mode Share', value: '8.1%'},
		{key: 'Muni Boardings', value: '66,859'},
		{key: 'BART Boardings', value: '25,613'},
		{key: 'Caltrain Boardings', value: '6,509'}],
	3: [{key: 'SF Resident Trips', value: '2,830,916'}, 
		{key: 'Vehicle Miles Traveled', value: '10.45 million'}, 
		{key: 'Average Speed', value: '18.9 mph'}, 
		{key: 'Transit Mode Share', value: '7.6%'},
		{key: 'Muni Boardings', value: '223,082'},
		{key: 'BART Boardings', value: '99,088'},
		{key: 'Caltrain Boardings', value: '22,359'}],
	4: [{key: 'SF Resident Trips', value: '2,217,657'}, 
		{key: 'Vehicle Miles Traveled', value: '7.71 million'}, 
		{key: 'Average Speed', value: '22.5 mph'}, 
		{key: 'Transit Mode Share', value: '10.7%'},
		{key: 'Muni Boardings', value: '264,253'},
		{key: 'BART Boardings', value: '102,849'},
		{key: 'Caltrain Boardings', value: '18,706'}],
	5: [{key: 'SF Resident Trips', value: '1,675,785'}, 
		{key: 'Vehicle Miles Traveled', value: '6.95 million'}, 
		{key: 'Average Speed', value: '22.5 mph'}, 
		{key: 'Transit Mode Share', value: '14.2%'},
		{key: 'Muni Boardings', value: '264,097'},
		{key: 'BART Boardings', value: '123,704'},
		{key: 'Caltrain Boardings', value: '21,740'}],
	6: [{key: 'SF Resident Trips', value: '1,843,623'}, 
		{key: 'Vehicle Miles Traveled', value: '7.19 million'}, 
		{key: 'Average Speed', value: '22.5 mph'}, 
		{key: 'Transit Mode Share', value: '17.0%'},
		{key: 'Muni Boardings', value: '303,345'},
		{key: 'BART Boardings', value: '168,360'},
		{key: 'Caltrain Boardings', value: '39,313'}],
	7: [{key: 'SF Resident Trips', value: '2,511,373'}, 
		{key: 'Vehicle Miles Traveled', value: '8.55 million'}, 
		{key: 'Average Speed', value: '21.6 mph'}, 
		{key: 'Transit Mode Share', value: '11.5%'},
		{key: 'Muni Boardings', value: '315,038'},
		{key: 'BART Boardings', value: '133,129'},
		{key: 'Caltrain Boardings', value: '23,340'}],
	8: [{key: 'SF Resident Trips', value: '2,227,271'}, 
		{key: 'Vehicle Miles Traveled', value: '8.00 million'}, 
		{key: 'Average Speed', value: '22.0 mph'}, 
		{key: 'Transit Mode Share', value: '8.9%'},
		{key: 'Muni Boardings', value: '247,117'},
		{key: 'BART Boardings', value: '93,269'},
		{key: 'Caltrain Boardings', value: '14,322'}],
	9: [{key: 'SF Resident Trips', value: '2,541,408'}, 
		{key: 'Vehicle Miles Traveled', value: '8.77 million'}, 
		{key: 'Average Speed', value: '21.4 mph'}, 
		{key: 'Transit Mode Share', value: '14.8%'},
		{key: 'Muni Boardings', value: '421,350'},
		{key: 'BART Boardings', value: '229,428'},
		{key: 'Caltrain Boardings', value: '34,369'}]
}
const SCEN_IDMAP = {
	'low,low,low,low,low': 1,
	'high,high,high,high,high': 2,
	'low,low,low,high,high': 3,
	'low,high,low,med,med': 4,
	'low,med,med,med,med': 5,
	'high,low,med,low,high': 6,
	'med,med,low,med,med': 7,
	'low,high,low,high,low': 8,
	'low,med,low,med,low': 9,
}

const YR_VAR = 'year';
const TOD_VAR = 'tp';
const INC_VAR = 'income_group';
const PURP_VAR = 'importance';

const FRAC_COLS = ['cspd', 'spd_ratio', 'load', 'vmt_per_pers', 'avg_time'];
const YR_LIST = [2015,2050];

const MISSING_COLOR = '#ccd';

const DEF_BWIDTH = 4;

const MODE_DESC = {11: 'Muni Local',
                   12: 'Muni Expresss',
                   13: 'Muni BRT',
                   15: 'Muni Metro (LRT)',
                   22: 'AC Transbay Buses',
                   23: 'Golden Gate Bus',
                   24: 'Sam Trans Express Bus',
                   26: 'Caltrain',
                   31: 'Ferry',
                   32: 'BART'};

let sel_colorvals, sel_colors, sel_binsflag;
let sel_bwvals;

let GEOID_VAR = 'a_b';

let OPMODE_MAP = {'munib': [11,12,13],
                  'munil': [15],
                  'regtrn': [22,23,24,26,31,32]};

let geoLayer, mapLegend;
let _featJson = {};
let _aggregateData;
let prec;
let addLayerStore = {};

async function initialPrep() {

  console.log('1...');
  _featJson['hlinks'] = await fetchMapFeatures();

  console.log('2... ');
  await drawMapFeatures();
  
  console.log('3... ');
  //await buildChartHtmlFromData();
  //updateStats();
  
  console.log('4... ');
  await fetchAddLayers();

  console.log('5... ');
  
  console.log('6 !!!'); 
  await fetchOtherMapFeatures();
}

async function fetchMapFeatures() {
  const geo_url = API_SERVER + VIZ_INFO[app.selectedViz]['GEO_VIEW'] + '?select=a_b,streetname,geometry';

  try {
    let resp = await fetch(geo_url);
    let features = await resp.json();

    // do some parsing and stuff
    for (let feat of features) {
      feat['type'] = 'Feature';
      feat['geometry'] = JSON.parse(feat.geometry);
    }
    return features;

  } catch (error) {
    console.log('map feature error: ' + error);
  }
}

async function fetchOtherMapFeatures() {
	let geo_obj = [
	{key:'tlinks', url: 'covid_trn_links?select=a_b_mode,a,b,mode,geometry'},
	{key:'taz', url: 'taz_boundaries?taz=lt.1000&select=taz,geometry,nhood'}
	]
	
	for (let obj of geo_obj) {
		try {
			let resp = await fetch(API_SERVER + obj['url']);
			let features = await resp.json();

			for (let feat of features) {
			  feat['type'] = 'Feature';
			  feat['geometry'] = JSON.parse(feat.geometry);
			}
			_featJson[obj['key']] = features;

		  } catch (error) {
			console.log('map feature error: ' + error);
		  }
	}
}

async function fetchAddLayers() {
  try {/*
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
    }*/
  } catch (error) {
    console.log('additional layers error: ' + error);
  }
}

function updateStats() {
  for (let i = 0; i < _aggregateData.length; i++) {
    for (let m of app.metric_options) {
      app.aggData[i][m.value] = _aggregateData[i][m.value].toLocaleString();
    }
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
  let metric_val = null;
  let base_val = null;
  let comp_val = null;
  
  let basevol_val = null;
  if (geo.basevol !== null) basevol_val = Math.round(geo.basevol).toLocaleString();
  let compvol_val = null;
  if (geo.compvol !== null) compvol_val = Math.round(geo.compvol).toLocaleString();  
  
  let bwmetric_val = null;
  if (geo.bwmetric !== null) bwmetric_val = Math.round(geo.bwmetric).toLocaleString();

  let retval = '';
  if (app.selectedViz=='ASPD') {
	  let val1 = (Math.round(geo.cspd*10)/10).toLocaleString();
	  let val2 = (Math.round(geo.fspd*10)/10).toLocaleString();
	  
	  retval += '<b>Link AB: </b>' + `${geo[GEOID_VAR]}<br/>`;
	  retval += '<b>Street: </b>' + `${geo['streetname']}<br/>`;
	  retval += '<b>Congested Speed: </b>' + `${val1}` + ' mph' + `<br/>`;
	  retval += '<b>Free Flow Speed: </b>' + `${val2}` + ' mph' + `<br/><hr>`;
	  
	  if (geo.metric !== null) metric_val = (Math.round(geo.metric*100)/100).toLocaleString();
	  if (app.comp_check) {
		if (geo.base !== null) base_val = (Math.round(geo.base*100)/100).toLocaleString();
		if (geo.comp !== null) comp_val = (Math.round(geo.comp*100)/100).toLocaleString();
		retval += '<b>Base </b> '+`<b>${VIZ_INFO[app.selectedViz]['METRIC_DESC']}: </b>` + `${base_val}<br/>` +
              `<b>${VIZ_INFO[app.selectedViz]['METRIC_DESC']}: </b>` + `${comp_val}<br/>`;
	  }
  } else if (app.selectedViz=='TCROWD') {
	  retval += '<b>Link AB: </b>' + `${geo[GEOID_VAR]}<br/>`;
	  retval += '<b>Mode: </b>' + `${MODE_DESC[geo['mode']]}<br/><hr>`;
	  
	  if (geo.metric !== null) metric_val = (Math.round(geo.metric*100)/100).toLocaleString();
	  if (app.comp_check) {
		if (geo.base !== null) base_val = (Math.round(geo.base*100)/100).toLocaleString();
		if (geo.comp !== null) comp_val = (Math.round(geo.comp*100)/100).toLocaleString();
		retval += '<b>Base </b> '+`<b>${VIZ_INFO[app.selectedViz]['METRIC_DESC']}: </b>` + `${base_val}<br/>` +
              `<b>${VIZ_INFO[app.selectedViz]['METRIC_DESC']}: </b>` + `${comp_val}<br/>`;
	  }
  } else {
	  retval += '<b>TAZ: </b>' + `${geo[GEOID_VAR]}<br/>`;
	  retval += '<b>Neighborhood: </b>' + `${geo['nhood']}<br/><hr>`;
	  
	  if (app.selectedViz=='TTIME') {
		if (geo.metric !== null) metric_val = (Math.round(geo.metric*10)/10).toLocaleString();  
	  } else if (app.selectedViz=='VMT') {
		if (geo.metric !== null) metric_val = (Math.round(geo.metric*10)/10).toLocaleString();  
	  }
	  if (app.comp_check) {
		if (geo.base !== null) base_val = (Math.round(geo.base*10)/10).toLocaleString();
		if (geo.comp !== null) comp_val = (Math.round(geo.comp*10)/10).toLocaleString();
		retval += '<b>Base </b> '+`<b>${VIZ_INFO[app.selectedViz]['METRIC_DESC']}: </b>` + `${base_val}<br/>` +
              `<b>${VIZ_INFO[app.selectedViz]['METRIC_DESC']}: </b>` + `${comp_val}<br/>`;
	  }
  }

  retval += `<b>${VIZ_INFO[app.selectedViz]['METRIC_DESC']}</b>` + 
            (app.pct_check? '<b> %</b>': '') +
            (app.comp_check? '<b> Diff: </b>':'<b>: </b>') +   
            `${metric_val}` + ' ' + `${VIZ_INFO[app.selectedViz]['POST_UNITS']}` +
            ((app.pct_check && app.comp_check && metric_val !== null)? '%':'') + 
            ((app.bwidth_check)? `<br/><b>Volume</b>` + '<b>: </b>' + bwmetric_val:'');

  /*if (app.comp_check) {
    retval += `<hr><b>${app.sliderValue[0]}</b> `+`<b>${METRIC_DESC['ab_vol']}: </b>` + `${basevol_val}<br/>` +
              `<b>${app.sliderValue[1]}</b> `+`<b>${METRIC_DESC['ab_vol']}: </b>` + `${compvol_val}<br/>`;
  }*/            
            
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
    if (oldHoverTarget.feature[GEOID_VAR] != selGeoId) geoLayer.resetStyle(oldHoverTarget);
  }, 2500);
};
infoPanel.addTo(mymap);

function filterOpMode(entry) {
  for (let m of OPMODE_MAP[app.selected_op]) {
    if (entry.mode == m) return true;
  }
  return false;
}

async function getMapData() {
  let data_url = API_SERVER + VIZ_INFO[app.selectedViz]['DATA_VIEW'] + '?scn_id=eq.' + app.selectedScn;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();
  base_lookup = {};

  if (app.selectedViz == 'ASPD') {
	  for (let tod of app.tp_options2) {
		  base_lookup[tod.value] = {};
	  }
  } else if (app.selectedViz == 'TCROWD') {
	  for (let tod of app.tp_options) {
		  base_lookup[tod.value] = {};
	  }
  } else if (app.selectedViz == 'TTIME') {
	  for (let inc of app.income_options) {
		  base_lookup[inc.value] = {};
		  for (let purp of app.purp_options) {
			base_lookup[inc.value][purp.value] = {};
		  }
	  }	  
  }
  
  for (let entry of jsonData) {
	  if (app.selectedViz == 'ASPD') {
		  base_lookup[entry[TOD_VAR]][entry[GEOID_VAR]] = entry;
	  } else if (app.selectedViz == 'TCROWD') {
		  base_lookup[entry[TOD_VAR]][entry[GEOID_VAR]] = entry;
	  } else if (app.selectedViz == 'TTIME') {
		  base_lookup[entry[INC_VAR]][entry[PURP_VAR]][entry[GEOID_VAR]] = entry;
	  } else {
		  base_lookup[entry[GEOID_VAR]] = entry;
	  }
  }
  
  /*_aggregateData = [];
  for (let yr of YR_LIST) {
    let row = {};
    row['year'] = yr.toString();
    for (let met of app.metric_options) {
      row[met.value] = tmp[yr][met.value];
    }
    _aggregateData.push(row);
  }*/
}

let base_lookup;
let map_vals;
let bwidth_vals;
async function drawMapFeatures(queryMapData=true) {

  // create a clean copy of the feature Json
  if (!_featJson) return;
  let cleanFeatures = _featJson[VIZ_INFO[app.selectedViz]['GEO_VIEWKEY']];
  if (app.selectedViz == 'TCROWD') {
	  cleanFeatures = cleanFeatures.filter(filterOpMode);
  }
  GEOID_VAR = VIZ_INFO[app.selectedViz]['GEOID_VAR'];
  let sel_metric = VIZ_INFO[app.selectedViz]['METRIC'];
  let sel_bwidth = VIZ_INFO[app.selectedViz]['BWIDTH_METRIC'];
  
  prec = (FRAC_COLS.includes(sel_metric) ? 100 : 1);

  try {
    if (queryMapData) {
      await getMapData();
	}

    let map_metric;
    let bwidth_metric;
    map_vals = [];
    bwidth_vals = [];
    for (let feat of cleanFeatures) {
	  map_metric = null;
	  bwidth_metric = null;
	  feat['base'] = null;
	  feat['comp'] = null;
	  
	  if (app.selectedViz == 'ASPD') {
		  if (base_lookup[app.selected_timep2].hasOwnProperty(feat[GEOID_VAR])) {
			if (app.comp_check) {
				feat['base'] = base_lookup[app.selected_timep2][feat[GEOID_VAR]][sel_metric+'_base'];
				feat['comp'] = base_lookup[app.selected_timep2][feat[GEOID_VAR]][sel_metric];
				map_metric = feat['comp']-feat['base'];
			} else {
				map_metric = base_lookup[app.selected_timep2][feat[GEOID_VAR]][sel_metric];
			}
			
			bwidth_metric = base_lookup[app.selected_timep2][feat[GEOID_VAR]][sel_bwidth];
			feat['cspd'] = base_lookup[app.selected_timep2][feat[GEOID_VAR]]['cspd'];
			feat['fspd'] = base_lookup[app.selected_timep2][feat[GEOID_VAR]]['fspd'];
		  }
	  } else if (app.selectedViz == 'TCROWD') {
		  if (base_lookup[app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
			if (app.comp_check) {
				feat['base'] = base_lookup[app.selected_timep][feat[GEOID_VAR]][sel_metric+'_base'];
				feat['comp'] = base_lookup[app.selected_timep][feat[GEOID_VAR]][sel_metric];
				map_metric = feat['comp']-feat['base'];
			} else {
				map_metric = base_lookup[app.selected_timep][feat[GEOID_VAR]][sel_metric];
			}
			
			bwidth_metric = base_lookup[app.selected_timep][feat[GEOID_VAR]][sel_bwidth];
		  }
	  } else if (app.selectedViz == 'TTIME') {
		  if (base_lookup[app.selected_income][app.selected_purp].hasOwnProperty(feat[GEOID_VAR])) {
			if (app.comp_check) {
				feat['base'] = base_lookup[app.selected_income][app.selected_purp][feat[GEOID_VAR]][sel_metric+'_base'];
				feat['comp'] = base_lookup[app.selected_income][app.selected_purp][feat[GEOID_VAR]][sel_metric];
				map_metric = feat['comp']-feat['base'];
			} else {
				map_metric = base_lookup[app.selected_income][app.selected_purp][feat[GEOID_VAR]][sel_metric];
			}
		  }
	  } else {
		  if (base_lookup.hasOwnProperty(feat[GEOID_VAR])) {
			if (app.comp_check) {
				feat['base'] = base_lookup[feat[GEOID_VAR]][sel_metric+'_base'];
				feat['comp'] = base_lookup[feat[GEOID_VAR]][sel_metric];
				map_metric = feat['comp']-feat['base'];
			} else {
				map_metric = base_lookup[feat[GEOID_VAR]][sel_metric];
			}
		  }
	  }
	
	  if (map_metric !== null) {
	    map_metric = Math.round(map_metric*prec)/prec;
	    map_vals.push(map_metric);
	  }
	  feat['metric'] = map_metric;
	
	  if (bwidth_metric !== null) {
		bwidth_metric = Math.round(bwidth_metric);
		bwidth_vals.push(bwidth_metric);
	  }
	  feat['bwmetric'] = bwidth_metric;
    }
    map_vals = map_vals.sort((a, b) => a - b);
    bwidth_vals = bwidth_vals.sort((a, b) => a - b);       
    
    if (0 == 0) {
	//if (map_vals.length > 0) {	
	  sel_colorvals = VIZ_INFO[app.selectedViz]['COLORVALS'][app.comp_check];
	  sel_colors = VIZ_INFO[app.selectedViz]['COLORS'][app.comp_check];

      let bw_widths;
      if (app.bwidth_check) {
		sel_bwvals = VIZ_INFO[app.selectedViz]['BWVALS'];  
        bw_widths = VIZ_INFO[app.selectedViz]['BWIDTHS']; 
        for (let feat of cleanFeatures) {
          if (feat['bwmetric'] !== null) {
            if (sel_bwvals.length <= 2){
              feat['bwmetric_scaled'] = bw_widths;
            } else {
              for (var i = 0; i < sel_bwvals.length-1; i++) {
                if (feat['bwmetric'] <= sel_bwvals[i + 1]) {
                  feat['bwmetric_scaled'] = 1.2*bw_widths[i];
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

      if (geoLayer) mymap.removeLayer(geoLayer);
      if (mapLegend) mymap.removeControl(mapLegend);
      geoLayer = L.geoJSON(cleanFeatures, {
        style: styleByMetricColor,
        onEachFeature: function(feature, layer) {
          layer.on({
            mouseover: hoverFeature,
            click: clickedOnFeature,
            });
        },
      });
      geoLayer.addTo(mymap);

      mapLegend = L.control({ position: 'bottomright' });
      mapLegend.onAdd = function(map) {
        let div = L.DomUtil.create('div', 'legend');
        let legHTML = getLegHTML(
          sel_colorvals,
          sel_colors,
          true,
          (app.pct_check && app.comp_check)? '%': ''
        );
		
		let units = VIZ_INFO[app.selectedViz]['POST_UNITS'];
        legHTML = '<h4>' + VIZ_INFO[app.selectedViz]['METRIC_DESC'] +
                  (app.comp_check? ' Diff': (units!=''? ' (' + VIZ_INFO[app.selectedViz]['POST_UNITS'] + ')': '')) +
                  '</h4>' + legHTML;
                  
        if (app.bwidth_check) {
          legHTML += '<hr/>' + '<h4>Volume</h4>';
          legHTML += getBWLegHTML(sel_bwvals, bw_widths);
        }
        
        div.innerHTML = legHTML;
        return div;
      };
      mapLegend.addTo(mymap);
      
      if (selectedGeo) {
        resetPopGeo();
      }
    }

  } catch(error) {
    console.log(error);
  }
}

function styleByMetricColor(feat) {
  let color = getColorFromVal(
              feat['metric'],
              sel_colorvals,
              sel_colors,
              true
              );
  if (feat['metric']==0) color = MISSING_COLOR;
  if (!app.bwidth_check) {
	let fo = 0.7;
	if (feat['metric']==0 || !color) {
       fo = 0;
    }
    return { fillColor: color, opacity: 1, weight: 0, color: color, fillOpacity: fo};
  } else {
	if (!color) color = MISSING_COLOR;
    return {opacity: 1, 
            weight: feat['bwmetric_scaled'], 
            offset:(feat['bwmetric_scaled']/2) + 0.1, 
            color: color};
  }
}

let infoPanelTimeout;
let oldHoverTarget;

function hoverFeature(e) {
  clearTimeout(infoPanelTimeout);
  infoPanel.update(e.target.feature);
  
  // don't do anything else if the feature is already clicked
  if (selGeoId === e.target.feature[GEOID_VAR]) return;

  // return previously-hovered segment to its original color
  if (oldHoverTarget && e.target.feature[GEOID_VAR] != selGeoId) {
    if (oldHoverTarget.feature[GEOID_VAR] != selGeoId)
      geoLayer.resetStyle(oldHoverTarget);
  }

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();
  highlightedGeo.setStyle(styles[VIZ_INFO[app.selectedViz]['STYLES_KEY']].selected);
  oldHoverTarget = e.target; 
}

function highlightSelectedSegment() {
  if (!selGeoId) return;

  mymap.eachLayer(function (e) {
    try {
      if (e.feature[GEOID_VAR] === selGeoId) {
        e.bringToFront();
        e.setStyle(styles[VIZ_INFO[app.selectedViz]['STYLES_KEY']].popup);
        selectedGeo = e;
        return;
      }
    } catch(error) {}
  });
}

let selGeoId;
let selectedGeo, prevSelectedGeo;
let selectedLatLng;

function clickedOnFeature(e) {
  e.target.setStyle(styles[VIZ_INFO[app.selectedViz]['STYLES_KEY']].popup);
  let geo = e.target.feature;
  selGeoId = geo[GEOID_VAR];

  // unselect the previously-selected selection, if there is one
  if (selectedGeo && selectedGeo.feature[GEOID_VAR] != geo[GEOID_VAR]) {
    prevSelectedGeo = selectedGeo;
    geoLayer.resetStyle(prevSelectedGeo);
  }
  selectedGeo = e.target;
  //let selfeat = selectedGeo.feature;
  //app.chartSubtitle = GEOTYPE + ' ' + selfeat[GEOID_VAR] + ' in ' + selfeat.nhood;
  selectedLatLng = e.latlng;
  if (selGeoId) {
    showGeoDetails(selectedLatLng);
    //buildChartHtmlFromData(selGeoId);
  } else {
    resetPopGeo();
  }
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
  geoLayer.resetStyle(selectedGeo);
  prevSelectedGeo = selectedGeo = selGeoId = null;
  //buildChartHtmlFromData();
}

let trendChart = null;
function buildChartHtmlFromData(geoid = null) {
  document.getElementById('longchart').innerHTML = '';

  if (geoid) {
    let selgeodata = [];
    for (let yr of YR_LIST) {
      let row = {};
      row['year'] = yr.toString();
      for (let met of app.metric_options) {
        row[met.value] = base_lookup[geoid][met.value+yr];
      }
      selgeodata.push(row);
    } 
    trendChart = new Morris.Line({
      data: selgeodata,
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: [app.selected_metric.toUpperCase()],
      lineColors: ['#f56e71'],
      xkey: 'year',
      smooth: false,
      parseTime: false,
      xLabelAngle: 45,
      ykeys: [app.selected_metric],
    });
  } else {
    trendChart = new Morris.Line({
      data: _aggregateData,
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: [app.selected_metric.toUpperCase()],
      lineColors: ['#f56e71'],
      xkey: 'year',
      smooth: false,
      parseTime: false,
      xLabelAngle: 45,
      ykeys: [app.selected_metric],
    });
  }    
  
}

async function selectionChanged() {
  let scn_key = app.selected_dim1+','+app.selected_dim2+','+app.selected_dim3+','+app.selected_dim4+','+app.selected_dim5;
  if (SCEN_IDMAP.hasOwnProperty(scn_key)) {
	  app.selectedScn = SCEN_IDMAP[scn_key];
	  app.scnTitle = SCEN_DEF[app.selectedScn]['name'];
	  app.rows = SCEN_SUMMARY[app.selectedScn];
	  drawMapFeatures();
  } else {
	  app.scnTitle = 'Results Pending';
	  app.rows = [];
	  if (geoLayer) mymap.removeLayer(geoLayer);
      if (mapLegend) mymap.removeControl(mapLegend);
  }
}

function yrChanged(yr) {
  app.selected_year = yr;
  if (yr=='diff') {
    app.sliderValue = YR_LIST;
  } else {
    app.sliderValue = [yr,yr];
  }
}

function metricChanged(metric) {
  if (metric == app.selected_bwidth) {
    app.bwidth_check = false;
  } else {
    app.bwidth_check = true;
  }
  app.selected_metric = metric;
}
function compMode(check) {
  drawMapFeatures(false);
}
function tpChanged(chosentp) {
  app.selected_timep = chosentp;
  drawMapFeatures(false);
}
function opChanged(chosenop) {
  app.selected_op = chosenop;
  drawMapFeatures(false);
}
function tpChanged2(chosentp) {
  app.selected_timep2 = chosentp;
  drawMapFeatures(false);
}
function incomeChanged(choseninc) {
  app.selected_income = choseninc;
  drawMapFeatures(false);
}
function purpChanged(chosenp) {
  app.selected_purp = chosenp;
  drawMapFeatures(false);
}

function clickViz(chosenviz) {
  app.selectedViz = chosenviz;
  if (popSelGeo) popSelGeo.remove();
  
  if (chosenviz=='ASPD') {
	  app.isAspdHidden = false;
	  app.isTrnHidden = true;
	  app.isTTHidden = true;
	  app.bwidth_check = true;
  } else if (chosenviz=='TCROWD') {
	  app.isAspdHidden = true;
	  app.isTrnHidden = false;
	  app.isTTHidden = true;
	  app.bwidth_check = true;
  } else if (chosenviz=='TTIME') {
	  app.isAspdHidden = true;
	  app.isTrnHidden = true;
	  app.isTTHidden = false;
	  app.bwidth_check = false;
  } else {
	  app.isAspdHidden = true;
	  app.isTrnHidden = true;
	  app.isTTHidden = true;
	  app.bwidth_check = false;
  }

  drawMapFeatures();
}

function dim1Changed(chosen) {
  app.selected_dim1 = chosen.toLowerCase();
  selectionChanged();
}
function dim2Changed(chosen) {
  app.selected_dim2 = chosen.toLowerCase();
  selectionChanged();
}
function dim3Changed(chosen) {
  app.selected_dim3 = chosen.toLowerCase();
  selectionChanged();
}
function dim4Changed(chosen) {
  app.selected_dim4 = chosen.toLowerCase();
  selectionChanged();
}
function dim5Changed(chosen) {
  app.selected_dim5 = chosen.toLowerCase();
  selectionChanged();
}

// SLIDERS ----
let dim1Slider = {
  clickable: true,
  data: ['Low','Med','High'],
  disabled: false,
  dotSize: 16,
  height: 3,
  lazy: true,
  marks: true,
  hideLabel: false,
  process: false,
  sliderValue: 'Low',
  labelStyle: {color: '#fff', transform: 'translate(-50%, -225%)', fontSize: '1rem'},
  speed: 0.25,
  style: { marginTop: '0px'},
  tooltipPlacement: 'top',
  tooltipStyle: { backgroundColor: '#f56e71', borderColor: '#f56e71' },
  width: 'auto',
  dotStyle: {border: '2px solid #f56e71'},
};
let dim2Slider = {
  clickable: true,
  data: ['Low','Med','High'],
  disabled: false,
  dotSize: 16,
  height: 3,
  lazy: true,
  marks: true,
  hideLabel: true,
  process: false,
  sliderValue: 'Low',
  speed: 0.25,
  style: { marginTop: '0px'},
  tooltipPlacement: 'top',
  tooltipStyle: { backgroundColor: '#f56e71', borderColor: '#f56e71' },
  width: 'auto',
  dotStyle: {border: '2px solid #f56e71'},
};
let dim3Slider = {
  clickable: true,
  data: ['Low','Med','High'],
  disabled: false,
  dotSize: 16,
  height: 3,
  lazy: true,
  marks: true,
  hideLabel: true,
  process: false,
  sliderValue: 'Low',
  speed: 0.25,
  style: { marginTop: '0px'},
  tooltipPlacement: 'top',
  tooltipStyle: { backgroundColor: '#f56e71', borderColor: '#f56e71' },
  width: 'auto',
  dotStyle: {border: '2px solid #f56e71'},
};
let dim4Slider = {
  clickable: true,
  data: ['Low','Med','High'],
  disabled: false,
  dotSize: 16,
  height: 3,
  lazy: true,
  marks: true,
  hideLabel: true,
  process: false,
  sliderValue: 'Low',
  speed: 0.25,
  style: { marginTop: '0px'},
  tooltipPlacement: 'top',
  tooltipStyle: { backgroundColor: '#f56e71', borderColor: '#f56e71' },
  width: 'auto',
  dotStyle: {border: '2px solid #f56e71'},
};
let dim5Slider = {
  clickable: true,
  data: ['Low','Med','High'],
  disabled: false,
  dotSize: 16,
  height: 3,
  lazy: true,
  marks: true,
  hideLabel: true,
  process: false,
  sliderValue: 'Low',
  speed: 0.25,
  style: { marginTop: '0px'},
  tooltipPlacement: 'top',
  tooltipStyle: { backgroundColor: '#f56e71', borderColor: '#f56e71' },
  width: 'auto',
  dotStyle: {border: '2px solid #f56e71'},
};

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  components: {
    'vue-recaptcha': VueRecaptcha
  },   
  data: {
    isPanelHidden: false,
    comp_check: false,
    pct_check: false,
	
	vizlist: VIZ_LIST,
    vizinfo: VIZ_INFO,
	selectedViz: VIZ_LIST[0],
	isAspdHidden: false,
	isTrnHidden: true,
	isTTHidden: true,
	selectedScn: 1,
	scnTitle: 'Baseline',
	rows: SCEN_SUMMARY[1],
	scenario_options: scn_list,
	
	dim1Slider: dim1Slider,
	dim2Slider: dim2Slider,
	dim3Slider: dim3Slider,
	dim4Slider: dim4Slider,
	dim5Slider: dim5Slider,
	dim1Value: 'Low',
	dim2Value: 'Low',
	dim3Value: 'Low',
	dim4Value: 'Low',
	dim5Value: 'Low',
	
    bp0: 0.0,
    bp1: 0.0,
    bp2: 0.0,
    bp3: 0.0,
    bp4: 0.0,
    bp5: 0.0,
    aggData: [{pop:0,tot:0,jobpop:0},
              {pop:0,tot:0,jobpop:0}],
    
    bwidth_check: true,
    selected_bwidth: 'ab_vol',
    bwbp0: 100.0,
    bwbp1: 500.0,
    bwbp2: 2500.0,
    bwbp3: 5000.0,
    bwbp4: 10000.0,
    bwbp5: 999999.0,    
    
    dim_options: [
	{text: 'LOW', value: 'low'},
	{text: 'MEDIUM', value: 'med'},
	{text: 'HIGH', value: 'high'},
	],
	selected_dim1: 'low',
	selected_dim2: 'low',
	selected_dim3: 'low',
	selected_dim4: 'low',
	selected_dim5: 'low',
	
	year_options: [
    {text: '2015', value: '2015'},
    {text: '2050', value: '2050'},
    {text: 'Change', value: 'diff'},
    ],
    selected_year: '2015',
    sliderValue: [YR_LIST[0],YR_LIST[0]],
    
    selected_timep: 'AM',
    tp_options: [
	{text: 'AM', value: 'AM'},
    {text: 'PM', value: 'PM'}],
	
	selected_timep2: 'AM',
    tp_options2: [
	{text: 'AM', value: 'AM'},
    {text: 'PM', value: 'PM'},
	{text: 'DAILY', value: 'DAILY'}],
    
    selected_metric: 'load',
    metric_options: [
    {text: 'Crowding', value: 'load'},
    {text: 'Volume', value: 'ab_vol'},
    //{text: 'Capacity', value: 'periodcap'},
    ],
    
    selected_op: 'munib',
    operator_options: [
    {text: 'MUNI BUS', value: 'munib'},
    {text: 'MUNI RAIL', value: 'munil'},
    {text: 'REGIONAL TRANSIT', value: 'regtrn'},   
    ],
	
	selected_purp: 'mandatory',
    purp_options: [
    {text: 'Work / School', value: 'mandatory'},
    {text: 'Other', value: 'discretionary'},
    ],

    selected_income: 'all',
    income_options: [
    {text: 'Low Income', value: 'below_200pct_poverty'},
    {text: 'Not Low Income', value: 'above_200pct_poverty'},
    {text: 'All Incomes', value: 'all'},
    ],
    
    addLayers:[],
  },
  watch: {
    dim1Value: dim1Changed,
	dim2Value: dim2Changed,
	dim3Value: dim3Changed,
	dim4Value: dim4Changed,
	dim5Value: dim5Changed,
	comp_check: compMode,
  },
  methods: {
    clickToggleHelp: clickToggleHelp,
    clickedShowHide: clickedShowHide,
    yrChanged: yrChanged,
    metricChanged: metricChanged,
    tpChanged: tpChanged,
	tpChanged2: tpChanged2,
    opChanged: opChanged,
	incomeChanged: incomeChanged,
    purpChanged: purpChanged,
	clickViz: clickViz,
  },
  components: {
    vueSlider,
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

