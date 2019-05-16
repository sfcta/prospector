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

var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML2;
let getColorFromVal = maplib.getColorFromVal2;

let baseLayer = maplib.baseLayer;
let mymap = maplib.sfmap;
mymap.setView([37.76889, -122.440997], 13);
mymap.removeLayer(baseLayer);
let url = 'https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let token = 'pk.eyJ1Ijoic2ZjdGEiLCJhIjoiY2ozdXBhNm1mMDFkaTJ3dGRmZHFqanRuOCJ9.KDmACTJBGNA6l0CyPi1Luw';
let attribution ='<a href="http://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="http://mapbox.com">Mapbox</a>';
baseLayer = L.tileLayer(url, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
}).addTo(mymap);

let url2 = 'https://api.mapbox.com/styles/v1/sfcta/cjscclu2q07qn1fpimxuf2wbd/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let streetLayer = L.tileLayer(url2, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
  pane: 'shadowPane',
});
streetLayer.addTo(mymap);

let stripes = new L.StripePattern({weight:3,spaceWeight:3,opacity:0.6,angle:135}); stripes.addTo(mymap);

const ADDLAYERS = [
  {
    view: 'sup_district_boundaries', name: 'Supervisorial District Boundaries',
    style: { opacity: 1, weight: 3, color: '#730073', fillOpacity: 0, interactive: false},
  },
  {
    view: 'sfparks', name: 'Major Parks',
    style: { opacity: 1, weight: 2, color: 'grey', fillPattern: stripes, interactive: false},
  },
  {
    view: 'hin2017', name: 'High Injury Network',
    style: { opacity: 1, weight: 3, color: '#FF8C00', interactive: false},
  },
]


// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'coc2017';
const DATA_VIEW = 'coc2017';
const COMMENT_SERVER = 'https://api.sfcta.org/commapi/';
const COMMENT_VIEW = 'coc_comment';

const GEOTYPE = 'CoC';
const GEOID_VAR = 'geoid_1';

const FRAC_COLS = [];
const YR_LIST = [2015,2050];

const INT_COLS = [];
const DISCRETE_VAR_LIMIT = 10;
const MISSING_COLOR = '#ffffcc';
const COLORRAMP = {SEQ: ['#fceca8', '#f6c558', '#dc9e48', '#8f5448'],
                    DIV: ['#d7191c','#fdae61','#ffffbf','#a6d96a','#1a9641']};

const MAX_PCTDIFF = 200;
const CUSTOM_BP_DICT = {
  'min': {'base':[50,70,90],},
  'linc': {'base':[25,30,35],},
  'o75': {'base':[5,10,15],},
  'disab': {'base':[10,25,40],},
  'lep': {'base':[10,20,30],},
  'zvhh': {'base':[5,10,15],},
  'spfam': {'base':[10,20,30],},
  'rentb': {'base':[5,15,25],},
};

const METRIC_UNITS = {'pop': '000s per sq. mi.',
                      'tot': '000s per sq. mi.',
                      'jobpop': '000s per sq. mi.'};
const METRIC_DESC = {'pop': 'Population','tot': 'Jobs',
                      'jobpop': 'Jobs+Population',
};
const METRIC_DESC_SHORT = {'min': 'Minority Pop','linc': 'Low-Income Pop','o75': 'Over 75 yrs Pop','disab': 'Disabled Pop',
                      'lep': 'Low English Pop','zvhh': 'Zero-Veh HH','spfam': 'Single-Parent Fam','rentb': 'Rent-Burdened HH'
};
const VARMAP = [
  {'min':'pct_minori','linc':'pct_below2','o75':'pct_over75','disab':'pct_disab',
  'lep':'pct_lep','zvhh':'pct_zvhhs','spfam':'pct_spfam','rentb':'pct_hus_re'},
  {'min':'pct_mino_1','linc':'pct_lowinc','o75':'pct_over_1','disab':'pct_disab_',
  'lep':'pct_lep_1','zvhh':'pct_zvhh','spfam':'pct_spfam_','rentb':'pct_rent50'}
];

let sel_colorvals, sel_colors, sel_binsflag;

let chart_deftitle = 'All ' + GEOTYPE + 's Combined';

let geoLayer, mapLegend;
let _featJson;
let _aggregateData;
let prec;
let addLayerStore = {};

async function initialPrep() {

  console.log('1...');
  _featJson = await fetchMapFeatures();

  console.log('2... ');
  await drawMapFeatures();
  
  console.log('3... ');
  await fetchAddLayers();
  
  console.log('4... ');
  await checkCookie();

  console.log('5 !!!');
}

async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?select=geoid_1,geometry';

  try {
    let resp = await fetch(geo_url);
    let features = await resp.json();

    // do some parsing and stuff
    for (let feat of features) {
      feat['type'] = 'Feature';
      feat['geometry'] = JSON.parse(feat.geometry);
      feat = updateGeoType(feat);
    }
    return features;

  } catch (error) {
    console.log('map feature error: ' + error);
  }
}
async function updateGeoType(obj) {
  obj['bgflag'] = 0;
  if (obj[GEOID_VAR].length==11) {
    obj['tract_id'] = obj[GEOID_VAR].substring(5,11);
    obj['bg_id'] = 'NA';
  } else if (obj[GEOID_VAR].length==19) {
    obj['tract_id'] = obj[GEOID_VAR].substring(12,18);
    obj['bg_id'] = obj[GEOID_VAR].substring(18,19);
    obj['bgflag'] = 1;
  } else {
    throw 'ERROR: Unknown feature/geography!!!' + GEOID_VAR + ': ' + obj[GEOID_VAR];
  }
  return obj;
}

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

// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

function getInfoHtml(geo) {
  let retval = '<b>TRACT ID: </b>' + `${geo['tract_id']}<br/>` +
                '<b>BLOCKGROUP ID: </b>' + `${geo['bg_id']}<br/><hr>`;
                
  if (app.selected_metric != 'None') {
    retval += `<b>${METRIC_DESC_SHORT[app.selected_metric]}</b>` + `<b> Percent: </b>` + `${geo['metric']}` + `%`;
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
    if (oldHoverTarget.feature[GEOID_VAR] != selGeoId) geoLayer.resetStyle(oldHoverTarget);
  }, 2500);
};
infoPanel.addTo(mymap);

async function getMapData() {
  let data_url = API_SERVER + DATA_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();
  base_lookup = {};
  let tmp = {};
  for (let yr of YR_LIST) {
    tmp[yr] = {};
    for (let met of app.metric_options) {
      tmp[yr][met.value] = 0;
    }
  }
  for (let entry of jsonData) {
    
    base_lookup[entry[GEOID_VAR]] = entry;
    
    for (let yr of YR_LIST) {
      for (let met of app.metric_options) {
        tmp[yr][met.value] += entry[met.value+yr];
      }
    }
  }
  _aggregateData = [];
  for (let yr of YR_LIST) {
    let row = {};
    row['year'] = yr.toString();
    for (let met of app.metric_options) {
      row[met.value] = tmp[yr][met.value];
    }
    _aggregateData.push(row);
  }
}

let base_lookup;
let map_vals;
async function drawMapFeatures(queryMapData=true) {

  // create a clean copy of the feature Json
  if (!_featJson) return;
  let cleanFeatures = _featJson.slice();
  let sel_metric = app.selected_metric;

  let base_metric = sel_metric + app.sliderValue[0];
  let comp_metric = sel_metric + app.sliderValue[1];
  if (base_metric==comp_metric) {
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
      map_vals = [];
      for (let feat of cleanFeatures) {
        map_metric = null;

        if (app.comp_check) {
          if (base_lookup.hasOwnProperty(feat[GEOID_VAR])) {
            let feat_entry = base_lookup[feat[GEOID_VAR]];
            map_metric = Math.round(feat_entry[comp_metric]/(feat['sq_mile']*1000)) - Math.round(feat_entry[base_metric]/(feat['sq_mile']*1000));
            feat['base'] = feat_entry[base_metric];
            feat['comp'] = feat_entry[comp_metric];
            if (app.pct_check && app.comp_check) {
              if (feat_entry[base_metric]>0) {
                map_metric = map_metric*100/feat_entry[base_metric];
              }
            }
          }
        } else {
          if (base_lookup.hasOwnProperty(feat[GEOID_VAR])) {
            map_metric = base_lookup[feat[GEOID_VAR]][VARMAP[feat['bgflag']][sel_metric]]*100;
          }
        }       
        
        if (map_metric !== null) {
          map_metric = Math.round(map_metric*prec)/prec;
          map_vals.push(map_metric);
        }
        feat['metric'] = map_metric;
      }
      map_vals = map_vals.sort((a, b) => a - b);  
    }
    
    if (map_vals.length > 0) {
      let color_func;
      let sel_colorvals2;
      let bp;
      
      if (queryMapData) {
        sel_colorvals = Array.from(new Set(map_vals)).sort((a, b) => a - b);
        
        if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) {
          sel_binsflag = false;
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals.concat([sel_colorvals[sel_colorvals.length-1]+1]));
          sel_colorvals2 = sel_colorvals.slice(0);
          
          app.bp0 = 0;
          app.bp1 = 0;
          app.bp2 = 0;
          app.bp3 = 0;
          app.bp4 = 0;
          app.bp5 = 1;
          
        } else {         
          let mode = 'base';
          if (app.comp_check){
            if(app.pct_check){
              mode = 'pctdiff';
            } else {
              mode = 'diff';
            }
          }
          
          let custom_bps = CUSTOM_BP_DICT[sel_metric][mode];
          sel_colorvals = [map_vals[0]].concat(custom_bps);
          (map_vals[map_vals.length-1] > custom_bps[custom_bps.length-1])? sel_colorvals.push(map_vals[map_vals.length-1]): sel_colorvals.push(custom_bps[custom_bps.length-1]+1);

          bp = Array.from(sel_colorvals).sort((a, b) => a - b);
          app.bp0 = bp[0];
          app.bp5 = bp[bp.length-1];
          app.bp1 = custom_bps[0];
          app.bp2 = custom_bps[1];
          app.bp3 = custom_bps[2];
          app.bp4 = custom_bps[3];
          if (custom_bps[0] < app.bp0) app.bp1 = app.bp0;

          sel_colorvals = Array.from(new Set(sel_colorvals)).sort((a, b) => a - b);
          //updateColorScheme(sel_colorvals);
          sel_binsflag = true; 
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
          sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
        }
      } else {
        throw 'ERROR: This step should not be occurring!!!';
      }
      
      sel_colors = [];
      for(let i of sel_colorvals2) {
        sel_colors.push(color_func(i).hex());
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
          sel_binsflag,
          '%'
        );

        legHTML = '<h4>' + METRIC_DESC_SHORT[sel_metric] +
                  (app.pct_check? ' % Diff': (METRIC_UNITS.hasOwnProperty(sel_metric)? ('<br>(' + METRIC_UNITS[sel_metric] + ')') : '')) +
                  '</h4>' + legHTML;
        div.innerHTML = legHTML;
        return div;
      };
      if (app.selected_metric != 'None') mapLegend.addTo(mymap);
      
      if (selectedGeo) {
        if (base_lookup.hasOwnProperty(selectedGeo.feature[GEOID_VAR])) {
          //buildChartHtmlFromData(selectedGeo.feature[GEOID_VAR]);
          return cleanFeatures.filter(entry => entry[GEOID_VAR] == selectedGeo.feature[GEOID_VAR])[0];
        } else {
          resetPopGeo();
        }
      } else {
        //buildChartHtmlFromData();
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
  if (app.selected_metric == 'None') {
    return { fillColor: '#baa0d2', opacity: 0, weight: 0, color: color, fillOpacity: 0.5};
  } else {
    return { fillColor: color, opacity: 1, weight: 1, color: color, fillOpacity: 1};
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
  highlightedGeo.setStyle(styles.selected);
  oldHoverTarget = e.target; 
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

let selGeoId;
let selectedGeo, prevSelectedGeo;
let selectedLatLng;

function clickedOnFeature(e) {
  e.target.setStyle(styles.popup);
  let geo = e.target.feature;
  selGeoId = geo[GEOID_VAR];

  // unselect the previously-selected selection, if there is one
  if (selectedGeo && selectedGeo.feature[GEOID_VAR] != geo[GEOID_VAR]) {
    prevSelectedGeo = selectedGeo;
    geoLayer.resetStyle(prevSelectedGeo);
  }
  selectedGeo = e.target;
  let selfeat = selectedGeo.feature;
  app.chartSubtitle = GEOTYPE + ' ' + selfeat[GEOID_VAR] + ' in ' + selfeat.nhood;
  selectedLatLng = e.latlng;
  if (base_lookup.hasOwnProperty(selGeoId)) {
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
  app.chartSubtitle = chart_deftitle;
}

async function selectionChanged(thing) {
  app.chartTitle = METRIC_DESC[app.selected_metric] + ' Trend';
  if (app.sliderValue && app.selected_metric) {
    let selfeat = await drawMapFeatures();
    if (selfeat) {
      highlightSelectedSegment();
      popSelGeo.setContent(getInfoHtml(selfeat));
    }
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
  app.selected_metric = metric;
}

function getColorMode(cscheme) {
  if (app.modeMap.hasOwnProperty(cscheme.toString())) {
    return app.modeMap[cscheme];
  } else {
    return 'lrgb';
  }
}

function showExtraLayers(e) {
  for (let lyr in addLayerStore) {
    mymap.removeLayer(addLayerStore[lyr]);
  }
  for (let lyr of app.addLayers) {
    addLayerStore[lyr].addTo(mymap);
  }
}


let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  components: {
    'vue-recaptcha': VueRecaptcha
  },  
  data: {
    isPanelHidden: false,
    extraLayers: ADDLAYERS,
    comp_check: false,
    pct_check: false,
    bp0: 0.0,
    bp1: 0.0,
    bp2: 0.0,
    bp3: 0.0,
    bp4: 0.0,
    bp5: 0.0,
    aggData: [{pop:0,tot:0,jobpop:0},
              {pop:0,tot:0,jobpop:0}],
    
    year_options: [
    {text: 'Year 2015', value: '2015'},
    {text: 'Year 2050', value: '2050'},
    {text: 'Change', value: 'diff'},
    ],
    selected_year: '2015',
    sliderValue: [YR_LIST[0],YR_LIST[0]],
    
    selected_metric: 'None',
    metric_options: [
    {text: 'None', value: 'None'},
    {text: 'Minority', value: 'min'},
    {text: 'Low Income', value: 'linc'},
    {text: 'Elderly', value: 'o75'},
    {text: 'Disability', value: 'disab'},
    {text: 'Low English Prof.', value: 'lep'},
    {text: 'Zero-Veh HH', value: 'zvhh'},
    {text: 'Single Parent', value: 'spfam'},
    {text: 'Rent Burdened', value: 'rentb'},
    ],
    chartTitle: METRIC_DESC['pop'] + ' Trend',
    chartSubtitle: chart_deftitle, 
    
    selected_colorscheme: COLORRAMP.SEQ,
    modeMap: {
      '#ffffcc,#663399': 'lch',
      '#ebbe5e,#3f324f': 'hsl',
      '#ffffcc,#3f324f': 'hsl',
      '#3f324f,#ffffcc': 'hsl',
      '#fafa6e,#2A4858': 'lch',
    },
    comment: '',
    comment_instruction: 'Please provide feedback. What do you think about this map? (800 maximum characters)',
    submit_loading: false,
    submit_disabled: false,
    addLayers:[],
  },
  watch: {
    sliderValue: selectionChanged,
    selected_metric: selectionChanged,
    addLayers: showExtraLayers,
  },
  methods: {
    clickToggleHelp: clickToggleHelp,
    clickedShowHide: clickedShowHide,
    yrChanged: yrChanged,
    metricChanged: metricChanged,
    handleSubmit: handleSubmit,
    onCaptchaVerified: onCaptchaVerified,
    onCaptchaExpired: onCaptchaExpired,
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

/* Cookie functions for comments*/
function setCookie(cname, exdays) {
  var d = new Date();
  d.setTime(d.getTime() + (exdays*24*60*60*1000));
  var expires = "expires="+ d.toUTCString();
  document.cookie = cname + "=" + d.getTime() + ";" + expires + ";path=/";
}

function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function checkCookie() {
  var username = getCookie("username");
  if (username == "") {
    setCookie("username", 365);
  }
}

/* Code for storing comments*/
let comment = {
  select_metric: '',
  add_layer: '',
  comment_user: '',
  comment_time: new Date(),
  comment_latitude: -999,
  comment_longitude: -999,
  comment_content: ''
};

function showPosition(position) {
  comment.comment_latitude = position.coords.latitude;
  comment.comment_longitude = position.coords.longitude; 
}

async function postComments(comment) {
  const comment_url = COMMENT_SERVER + COMMENT_VIEW;
  // console.log(JSON.stringify(comment))
  try {
    await fetch(comment_url, {
      method: 'POST',
      body: JSON.stringify(comment),
      headers:{
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    console.log('comment error: ' + error);
  }
}

function handleSubmit() {
  this.$refs.recaptcha.execute();
  let timestamp = new Date();
  app.submit_loading = true;
  
  setTimeout(function() {
    if (app.comment==null | app.comment=='') {
      app.submit_loading = false;
    } else {
      comment.select_metric = app.selected_metric;
      comment.add_layer = app.addLayers;
      comment.comment_user = getCookie("username");
      comment.comment_time = timestamp;
      comment.comment_content = app.comment;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(showPosition);
      } else {
        console.log("Geolocation is not supported by this browser.");
      }
      postComments(comment);
      app.comment_instruction = 'Thank you for your feedback!';
      app.comment = '';
      app.submit_loading = false;
    }
  }, 1000)
}

/* Captcha functions*/
function onCaptchaVerified(recaptchaToken) {
  const self = this;
  self.$refs.recaptcha.reset();
  if (!recaptchaToken) {
    return console.log("recaptchaToken is required");
  }

  const verifyCaptchaOptions = {
    secret: "6Leo_KMUAAAAAANqRfq4isW7Q50pAslnNdYbI8Pa",
    response: recaptchaToken
  };

  fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify(verifyCaptchaOptions),
    headers:{
      'Content-Type': 'application/json',
    }
  })
  .catch(error => console.error('Error:', error))
  .then(response => function (response) {
    // JSON.stringify(response)
    console.log("Congratulations! We think you are human.");
  });
}

function onCaptchaExpired() {
  this.$refs.recaptcha.reset();
}


initialPrep();

