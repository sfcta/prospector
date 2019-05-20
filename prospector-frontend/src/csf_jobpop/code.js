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
let attribution ='<a href="https://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="https://mapbox.com">Mapbox</a>';
baseLayer = L.tileLayer(url, {
  attribution:attribution,
  minZoom: 10,
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
    view: 'coc2017_diss', name: 'Communities of Concern',
    style: { opacity: 1, weight: 2, color: 'grey', fillPattern: stripes, interactive: false},
    info: 'https://www.arcgis.com/home/item.html?id=1501fe1552414d569ca747e0e23628ff',
  },
  {
    view: 'hin2017', name: 'High Injury Network',
    style: { opacity: 1, weight: 3, color: '#FF8C00', interactive: false},
    info: 'https://www.visionzerosf.org/maps-data/',
  },
  {
    view: 'sfparks', name: 'Major Parks',
    style: { opacity: 1, weight: 2, color: 'grey', fillPattern: stripes, interactive: false},
  },
  {
    view: 'sup_district_boundaries', name: 'Supervisorial District Boundaries',
    style: { opacity: 1, weight: 3, color: '#730073', fillOpacity: 0, interactive: false},
    info: 'https://sfbos.org/',
  },
]


// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'taz_boundaries';
const DATA_VIEW = 'connectsf_lu';

const GEOTYPE = 'TAZ';
const GEOID_VAR = 'taz';

const COMMENT_SERVER = 'https://api.sfcta.org/commapi/';
const COMMENT_VIEW = 'csf_jobpop_comment';
const VIZNAME = 'csf_jobpop';

const FRAC_COLS = [];
const YR_LIST = [2015,2050];

const INT_COLS = [];
const DISCRETE_VAR_LIMIT = 10;
const MISSING_COLOR = '#ffffcc';
const COLORRAMP = {SEQ: ['#d3f1f0','#b5e8e6','#8edcd8','#69d0cc','#47c6c1','#31bfb9','#26a4a3','#1b888b'],
                    //SEQ: ['#e2f0ad', '#b9da8b', '#90c36a', '#5d9a56', '#437656', '#205756'],
                    //SEQ: ['#ffffcc','#d9f0a3','#addd8e', '#78c679', '#31a354','#006837'],
                    //SEQ: ['#ffecb3','#f2ad86', '#d55175', '#963d8e','#5b2d5b'],
                    DIV: ['#d7191c','#fdae61','#ffffbf','#a6d96a','#1a9641']};

const MAX_PCTDIFF = 200;
const CUSTOM_BP_DICT = {
  'jobpop': {'base':[25,50,100,200,400], 'diff':[25,50,100,200,400], 'pctdiff':[-20, -5, 5, 20]},
  'pop': {'base':[25,50,100,200,400], 'diff':[25,50,100,200,400], 'pctdiff':[-20, -5, 5, 20]},
  'tot': {'base':[25,50,100,200,400], 'diff':[25,50,100,200,400], 'pctdiff':[-20, -5, 5, 20]},
};

const METRIC_UNITS = {'pop': '000s per sq. mi.',
                      'tot': '000s per sq. mi.',
                      'jobpop': '000s per sq. mi.'};
const METRIC_DESC = {'pop': 'Population','tot': 'Jobs',
                      'jobpop': 'Jobs+Population',
};
const METRIC_DESC_SHORT = {'pop': 'Population','tot': 'Jobs',
                      'jobpop': 'Jobs+Pop',
};

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
  //await buildChartHtmlFromData();
  updateStats();
  
  console.log('4... ');
  await fetchAddLayers();
  
  console.log('5... ');
  await checkCookie();

  console.log('6 !!!');
}

async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?taz=lt.1000&select=taz,geometry,nhood,sq_mile';

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

function updateStats() {
  for (let i = 0; i < _aggregateData.length; i++) {
    for (let m of app.metric_options) {
      app.aggData[i][m.value] = (Math.round(_aggregateData[i][m.value]/100)*100).toLocaleString();
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
  let retval = '<b>TAZ: </b>' + `${geo[GEOID_VAR]}<br/>` +
                '<b>NEIGHBORHOOD: </b>' + `${geo.nhood}<br/><hr>`;

  let metcol1 = app.selected_metric + YR_LIST[0];
  let metcol2 = app.selected_metric + YR_LIST[1];
  let metcol3 = app.selected_metric + 'den' + YR_LIST[0];
  let metcol4 = app.selected_metric + 'den' + YR_LIST[1];
  
  let metric1 = geo[metcol1].toLocaleString();
  let metric2 = geo[metcol2].toLocaleString();
  let metric3 = geo[metcol3].toLocaleString();
  let metric4 = geo[metcol4].toLocaleString();
  let diff = (geo[metcol2] - geo[metcol1]).toLocaleString();
  let dendiff = (geo[metcol4] - geo[metcol3]).toLocaleString();

  retval += `<b>${YR_LIST[0]}</b> `+`<b>${METRIC_DESC[app.selected_metric]}: </b>` + `${metric1}<br/>` +
            `<b>${YR_LIST[1]}</b> `+`<b>${METRIC_DESC[app.selected_metric]}: </b>` + `${metric2}<br/>` +
            `<b>${METRIC_DESC_SHORT[app.selected_metric]}</b>` + '<b> Change: </b>' + `${diff}<br/><hr>` +
            `<b>${YR_LIST[0]}</b> `+`<b>${METRIC_DESC_SHORT[app.selected_metric]}</b>` + `<b> Density (000s /sq. mi.): </b>` + `${metric3}<br/>` +
            `<b>${YR_LIST[1]}</b> `+`<b>${METRIC_DESC_SHORT[app.selected_metric]}</b>` + `<b> Density (000s /sq. mi.): </b>` + `${metric4}<br/>` +
            `<b>${METRIC_DESC_SHORT[app.selected_metric]}</b>` + '<b> Density Change: </b>' + `${dendiff}<br/>`;
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
        
        if (base_lookup.hasOwnProperty(feat[GEOID_VAR])) {
          feat[sel_metric + YR_LIST[0]] = base_lookup[feat[GEOID_VAR]][sel_metric + YR_LIST[0]];
          feat[sel_metric + YR_LIST[1]] = base_lookup[feat[GEOID_VAR]][sel_metric + YR_LIST[1]];
          feat[sel_metric + 'den' + YR_LIST[0]] = Math.round(feat[sel_metric + YR_LIST[0]]/(feat['sq_mile']*1000));
          feat[sel_metric + 'den' + YR_LIST[1]] = Math.round(feat[sel_metric + YR_LIST[1]]/(feat['sq_mile']*1000));
        } 
        
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
            map_metric = base_lookup[feat[GEOID_VAR]][base_metric]/(feat['sq_mile']*1000);
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
          (app.pct_check && app.comp_check)? '%': ''
        );

        legHTML = '<h4>' + METRIC_DESC_SHORT[sel_metric] + ' Density' +
                  (app.pct_check? ' % Diff': (METRIC_UNITS.hasOwnProperty(sel_metric)? ('<br>(' + METRIC_UNITS[sel_metric] + ')') : '')) +
                  '</h4>' + legHTML;
        div.innerHTML = legHTML;
        return div;
      };
      mapLegend.addTo(mymap);
      
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
  return { fillColor: color, opacity: 1, weight: 1, color: color, fillOpacity: 1};
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

let comment = {
  vizname: VIZNAME,
  select_year: '',
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

function handleSubmit() {
  this.$refs.recaptcha.execute();
  app.submit_loading = true;
}

function onCaptchaVerified(recaptchaToken) {
  const self = this;
  self.$refs.recaptcha.reset();

  let timestamp = new Date();
  setTimeout(function() {
    if (app.comment==null | app.comment=='') {
      app.submit_loading = false;
    } else {
      comment.select_year = app.selected_year;
      comment.select_mode = app.selected_metric;
      comment.add_layer = app.addLayers;
      comment.comment_user = getCookie("username");
      comment.comment_time = timestamp;
      comment.comment_content = app.comment;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(showPosition);
      } else {
        console.log("Geolocation is not supported by this browser.");
      }
      //console.log(JSON.stringify(comment));
      postComments(comment);
      app.comment_instruction = 'Thank you for your feedback! You can provide more.';
      app.comment = '';
      app.submit_loading = false;
      // app.submit_disabled = true;
    }
  }, 1000)
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

function onCaptchaExpired() {
  this.$refs.recaptcha.reset();
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
    {text: '2015', value: '2015'},
    {text: '2050', value: '2050'},
    {text: 'Change', value: 'diff'},
    ],
    selected_year: '2015',
    sliderValue: [YR_LIST[0],YR_LIST[0]],
    
    selected_metric: 'pop',
    metric_options: [
    {text: 'Population', value: 'pop'},
    {text: 'Jobs', value: 'tot'},
    {text: 'Jobs + Population', value: 'jobpop'},
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
    comment_instruction: 'Based on this data, what do you think are the city’s transportation needs? (800 characters)',
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
    handleSubmit: handleSubmit,
    yrChanged: yrChanged,
    metricChanged: metricChanged,
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

initialPrep();

