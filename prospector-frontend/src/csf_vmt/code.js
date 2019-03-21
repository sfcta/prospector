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
    view: 'coc2017_diss', name: 'Communities of Concern',
    style: { opacity: 1, weight: 2, color: 'grey', fillPattern: stripes, interactive: false},
  },
  {
    view: 'sfparks', name: 'Major Parks',
    style: { opacity: 1, weight: 2, color: 'grey', fillPattern: stripes, interactive: false},
  },  
  {
    view: 'hin2017', name: 'High Injury Network',
    style: { opacity: 1, weight: 2, color: 'orange', interactive: false},
  },
]


// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'taz_boundaries';
const DATA_VIEW = 'connectsf_vmt';
const FREQ_DIST_VIEW = 'connectsf_vmt_dist_all';
const FREQ_BY_GEO_VIEW = 'PLACEHOLDER';
const FREQ_DIST_BIN_VAR = 'bin';
const FREQ_DIST_METRIC_VAR = 'pct_persons';

const GEOTYPE = 'TAZ';
const GEOID_VAR = 'taz';
const YEAR_VAR = 'year';

const FRAC_COLS = ['vmt','vmt_per_hh','vmt_per_pers'];
const YR_LIST = ['2015','2050','diff'];

const INT_COLS = ['num_tours'];
const DISCRETE_VAR_LIMIT = 10;
const MISSING_COLOR = '#f3f3f3';

//COLOR RAMPS
/*
#feffc2','#e2f0ad','#b9da8b','#90c36a','#74b250','#5d9a56','#437656','#205756','#054252 //pale green to dark blue-green
#eefacd','#c5e5bf','#89c5a8','#49a895','#009485','#00807b','#116570','#164b61','#173252 //pale blue-green to dark blue
#daf2ef','#bedceb','#9abae2','#709bd9','#5885d1','#5674b9','#585b94','#544270','#512f57 //pale blue to dark blue-purple
#e1f9fc','#d1e3f9','#c7ccf4','#bfb1de','#baa0d2','#928cbb','#57709a','#045377','#004263 //pale blue-purple to dark blue
#ffdcd2','#f8bdb6','#eaafbe','#dd97c4','#d687c8','#b473b4','#88599a','#5e3d7f','#442c6b //peach to purple
#ffedff','#ffdaea','#f5c0c6','#e2a9a1','#d79a8a','#bd807e','#975d70','#6f3b5d','#562756 //off-white to maroon-purple
#fffcd4','#fde5ba','#fdc193','#ffa175','#f28350','#d47144','#a1563b','#73464c','#3d3551 //pale yellow to dark dust-purple
#ffe6c9','#ffd6b1','#ffbe90','#f0a76b','#e09246','#a48146','#6e6e43','#445c3b','#214236 //peach to dark green
#fff9bf','#feefa9','#ffe28a','#ffd469','#ffc845','#eba946','#cc7b45','#995045','#7d3e43 //pale yellow to dark rust
*/

// ConnectSF brand color ramps
/*const COLORRAMP = {SEQ: ['#f3f3f3','#f6d3d2','#f6b3b1','#f29292','#ec7074'],
                   DIV: ['#54bdba','#a9d7d5','#f1f1f1','#f5b2b0','#ec7074']};*/
const COLORRAMP = {//SEQ: ['#fffcd4','#fdc193','#f28350','#a1563b','#3d3551'],
                   SEQ: ['#fffcd4','#fde5ba','#fdc193','#ffa175','#f28350','#d47144','#a1563b','#73464c','#3d3551'],
                   DIV: ['#54bdba','#a9d7d5','#f1f1f1','#f5b2b0','#ec7074']};
                   
                   
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
  'vmt': {'base':[2000, 4000, 6000, 80000, 10000, 20000], 'diff':[-10000,-1000,-100,100,1000,10000], 'pctdiff':[-20, -5, 5, 20]},
  'vmt_per_pers': {'base':[1, 2, 3, 4, 5, 6, 7, 8], 'diff':[-5,-3,-1,1,3,5], 'pctdiff':[-20, -5, 5, 20]},
  'vmt_per_hh': {'base':[5, 10, 15, 20, 25, 30, 35, 40], 'diff':[-5,-3,-1,1,3,5], 'pctdiff':[-20, -5, 5, 20]},
}

const METRIC_UNITS = {'avg_time':'minutes','num_tours':'tours'}; // needed?

let sel_colorvals, sel_colors, sel_binsflag;

let chart_deftitle = 'All Segments Combined';

let geoLayer, mapLegend;
let _featJson;
let _aggregateData;
let prec;
let addLayerStore = {};

async function initialPrep() {
  //console.log('1...');
  _featJson = await fetchMapFeatures();

  //console.log('2... ');
  await getFreqDistData();
  
  //console.log('3... ');
  await drawMapFeatures();
  
  //console.log('4... ');
  await fetchAddLayers();

  //console.log('5 !!!');
}

async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?taz=lt.1000&select=taz,geometry,nhood';

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

// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

function getInfoHtml(geo) {
  let metric_val = null;
  let retval = '<b>TAZ: </b>' + `${geo[GEOID_VAR]}<br/>`;
  
  retval += `<b>${app.metric_options[0]['text']}</b><br/>` ;
  for (let yr of YR_LIST) {
    if (base_lookup[yr].hasOwnProperty(geo[GEOID_VAR])) {
      metric_val = base_lookup[yr][geo[GEOID_VAR]][app.selected_metric];
      
      if (metric_val !== null) {
        metric_val = Math.round(metric_val*prec)/prec;
      }
    }
    retval += `${yr}: ${metric_val}<br/>`;
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
  }, 2000);
};
infoPanel.addTo(mymap);

async function getMapData() {
  let data_url = API_SERVER + DATA_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();
  base_lookup = {}; // collects attributes for each geometry
  
  let tmp = {}; // aggregates attributes across all geometries
  for (let yr of YR_LIST) {
    tmp[yr] = {};
    base_lookup[yr] = {};
      for (let met of app.metric_options) {
        tmp[yr][met.value] = 0;
      }
  }
  
  for (let entry of jsonData) {
    base_lookup[entry[YEAR_VAR]][entry[GEOID_VAR]] = entry;
    for (let met of app.metric_options) {
      tmp[entry[YEAR_VAR]][met.value] += entry[met.value];
    }
  }
}

async function getFreqDistData() {
  let data_url = API_SERVER + FREQ_DIST_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();
  
  freq_dist_lookup = {}; // collects attributes for each bin in the frequency distribution
  
  // build the dictionary
  for (let yr of YR_LIST) {
    freq_dist_lookup[yr] = {};
    for (let met of app.chart_metric_options) {
      freq_dist_lookup[yr][met.value] = {};
      // last loop is unnecessary
      for (let bin=app.bin_start; bin < app.bin_stop; bin+=app.bin_step) {
        freq_dist_lookup[yr][met.value][bin] = 0
      }
    }
  }
  
  // fill the dictionary
  for (let entry of jsonData) {
    for (let met of app.chart_metric_options) {
      freq_dist_lookup[entry[YEAR_VAR]][met.value][entry[FREQ_DIST_BIN_VAR]] = entry[met.value];
    }
  }
  
}

let base_lookup;
let freq_dist_lookup;
let map_vals;

async function buildChartData(){
  // frequency distribution chart
  let dist_vals = {};
  let pct_dist_vals = [];
  let tot = 0;
  let val;
  let bin_tot = 0;
  let xlabels = [];
  let bin_min = app.bin_start;
  let bin_max = bin_min + app.bin_step;
  let ykeys = [];
  let ylabels = {};
  
  for (let met of app.chart_metric_options) {
    if (met.value == app.selected_chart_metric) {
      dist_vals[met.value]
      ylabels.push(met.text);
    }
  }
  for (let bin=app.bin_start; bin <= app.bin_stop; bin++) {
    if (bin==bin_max) {
      // reached the end of the last bin, push the data and lables and move to the next one
      xlabels.push(bin_min + '-' + bin_max);
      pct_dist_vals.push({x:bin_min, y:bin_tot});
      
      bin_min = bin_max;
      bin_max = bin_min + app.bin_step;
      bin_tot = 0;
    }
    
    val = freq_dist_lookup[app.selected_year][app.selected_chart_metric][bin];
    bin_tot += val;
    tot += val;
    //console.log(val, bin_tot, tot);
  }
  // push the overflow bin
  dist_vals.push({x:bin_min, y:val});
  xlabels.push('>' + bin_min);
}

async function buildCharts() {
  // frequency distribution chart
  let dist_vals = [];
  let pct_dist_vals = [];
  let tot = 0;
  let val;
  let bin_tot = 0;
  let xlabels = [];
  let bin_min = app.bin_start;
  let bin_max = bin_min + app.bin_step;
  let ylabels = [];
  let yMin = 'auto 0';
  let yMax = 'auto';
  
  for (let met of app.chart_metric_options) {
    if (met.value == app.selected_chart_metric) {
      ylabels.push(met.text);
    }
  }
  for (let bin=app.bin_start; bin <= app.bin_stop; bin++) {
    if (bin==bin_max) {
      // reached the end of the last bin, push the data and lables and move to the next one
      xlabels.push(bin_min + '-' + bin_max);
      pct_dist_vals.push({x:bin_min, y:bin_tot});
      
      bin_min = bin_max;
      bin_max = bin_min + app.bin_step;
      bin_tot = 0;
    }
    
    val = freq_dist_lookup[app.selected_year][app.selected_chart_metric][bin];
    bin_tot += val;
    tot += val;
  }
  // push the overflow bin
  pct_dist_vals.push({x:bin_min, y:val});
  xlabels.push('>' + bin_min);
  
  //updateDistChart(dist_vals, 'x', 'y', xlabels, 'Tours', binFmt, yFmtInt, 'dist-chart-simple')
  updateDistChart(pct_dist_vals, 'x', 'y', xlabels, ylabels, yMin, yMax, binFmt, yFmtPct, 'dist-chart')
}

async function drawMapFeatures(queryMapData=true) {
  // create a clean copy of the feature Json
  if (!_featJson) return;
  let cleanFeatures = _featJson.slice();
  let sel_metric = app.selected_metric;

  prec = (FRAC_COLS.includes(sel_metric) ? 100 : 1);
  
  try {
    if (queryMapData) {
      if (base_lookup == undefined) await getMapData();
      let map_metric;
      map_vals = [];
      
      await buildCharts();
        
      for (let feat of cleanFeatures) {
        map_metric = null;
        if (base_lookup[app.selected_year].hasOwnProperty(feat[GEOID_VAR])) {
          map_metric = base_lookup[app.selected_year][feat[GEOID_VAR]][sel_metric];
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
      let dist_vals = [];
      if (queryMapData) {
        
        
        // color ramps
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
          if (app.selected_year == 'diff') {
            mode = 'diff';
            app.selected_colorscheme = COLORRAMP.DIV;
          } else {
            app.selected_colorscheme = COLORRAMP.SEQ;
          }
          
          let custom_bps = CUSTOM_BP_DICT[sel_metric][mode];
          sel_colorvals = [map_vals[0]];
          for (var i = 0; i < custom_bps.length; i++) {
            if (custom_bps[i]>map_vals[0] && custom_bps[i]<map_vals[map_vals.length-1]) sel_colorvals.push(custom_bps[i]);
          }
          sel_colorvals.push(map_vals[map_vals.length-1]);
          
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
        let div = L.DomUtil.create('div', 'info legend');
        let legHTML = getLegHTML(
          sel_colorvals,
          sel_colors,
          sel_binsflag,
        );
        legHTML = '<h4>Vehicle Miles Traveled</h4>' + legHTML;
        div.innerHTML = legHTML;
        return div;
      };
      mapLegend.addTo(mymap);
      
      if (selectedGeo) {
        if (base_lookup[app.selected_year].hasOwnProperty(selectedGeo.feature[GEOID_VAR])) {
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
    alert(error);
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
  if (feat['metric']==0) {
    color = MISSING_COLOR;
  }
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

let distChart = {};
let distLabels;

function updateDistChart(data, xKey, yKeys, xLabels, yLabels, yMin, yMax, xFmt, yFmt, el='dist-chart') {
  distLabels = xLabels;
  //let colors = ['#54bdba','#ec7074','#767676']
  let colors = ['#f28350']
  if (yKeys instanceof String) {
    colors = colors.slice(0, 1)
  } else {
    colors = colors.slice(0, yKeys.length)
  }
  if (distChart[el]) {
    distChart[el].setData(data);
  } else {
      distChart[el] = new Morris.Line({
        element: el,
        data: data,
        xkey: xKey,
        ykeys: yKeys,
        ymin: yMin,
        ymax: yMax,
        labels: yLabels,
        lineColors: colors,
        xLabels: xKey,
        xLabelAngle: 25,
        xLabelFormat: xFmt,
        yLabelFormat: yFmt,
        hideHover: true,
        parseTime: false,
        fillOpacity: 0.4,
        pointSize: 1,
        //behaveLikeLine: true,
        eventStrokeWidth: 2,
        eventLineColors: ['#f28350'],
      });
  }
}

function binFmt(x) {
  return distLabels[x.x];
}

function yFmtInt(y) {
  return Math.round(y);
}

function yFmtPct(y) {
  return (Math.round(y*1000)/10).toString() + '%';
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
  app.chartSubtitle = GEOTYPE + ' ' + selfeat[GEOID_VAR];
  selectedLatLng = e.latlng;
  if (base_lookup[app.selected_year].hasOwnProperty(selGeoId)) {
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

let trendChart = null
/*function buildChartHtmlFromData(geoid = null) {
  document.getElementById('longchart').innerHTML = '';
  if (geoid) {
    let selgeodata = [];
    for (let yr of YR_LIST) {
      let row = {};
      row['year'] = yr.toString();
      row[app.selected_metric] = base_lookup[yr][geoid][app.selected_metric];
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
      data: _aggregateData,
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
  
}*/

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

async function selectionChanged(thing) {
  app.chartTitle = app.selected_metric.toUpperCase() + ' TREND';
  if (app.selected_year && app.selected_metric) {
    let selfeat = await drawMapFeatures();
    if (selfeat) {
      highlightSelectedSegment();
      popSelGeo.setContent(getInfoHtml(selfeat));
    }
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

function colorschemeChanged(thing) {
  app.selected_colorscheme = thing;
  drawMapFeatures(false);
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
  if (metric == 'vmt_per_hh') {
    app.selected_chart_metric = 'pct_households';
  } else {
    app.selected_chart_metric = 'pct_persons';
  }
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
    
    selected_year: '2015',
    year_options: [
    {text: '2015', value: '2015'},
    {text: '2050', value: '2050'},
    {text: 'Change', value: 'diff'},
    ],
    
    selected_metric: 'vmt_per_pers',
    metric_options: [
    {text: 'VMT per Person', value: 'vmt_per_pers'},
    {text: 'VMT per Household', value: 'vmt_per_hh'},
    //{text: 'VMT', value: 'vmt'},
    ],
    
    selected_chart_metric: 'pct_persons',
    chart_metric_options: [
    {text: 'Percent of Households', value: 'pct_households'},
    {text: 'Percent of Persons', value: 'pct_persons'},
    ],
    
    chartTitle: 'AVG_RIDE TREND',
    chartSubtitle: chart_deftitle,
    
    bin_start: 0,
    bin_stop: 50,
    bin_step: 2,
    distChartName: ['dist-chart'],
    pctDistChartName: ['pct-dist-chart'],
    
    selected_colorscheme: COLORRAMP.SEQ,
    modeMap: {
      '#ffffcc,#663399': 'lch',
      '#ebbe5e,#3f324f': 'hsl',
      '#ffffcc,#3f324f': 'hsl',
      '#3f324f,#ffffcc': 'hsl',
      '#fafa6e,#2A4858': 'lch',
    },
	comment: '',
    addLayers:[],
    selected_breaks: 5,
  },
  watch: {
    selected_year: selectionChanged,
    selected_metric: selectionChanged,
    addLayers: showExtraLayers,
    
    bp1: bp1Changed,
    bp2: bp2Changed,
    bp3: bp3Changed,
    bp4: bp4Changed,
  },
  methods: {
    yrChanged: yrChanged,
    metricChanged: metricChanged,
    updateMap: updateMap,
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

