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
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML2;
let getColorFromVal = maplib.getColorFromVal2;
// let getBWLegHTML = maplib.getBWLegHTML;
let getQuantiles = maplib.getQuantiles;

let baseLayer = maplib.baseLayer;
let mymap = maplib.sfmap;
// set map center and zoom level
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

let url2 = 'https://api.mapbox.com/styles/v1/sfcta/cjrtv3hb001pe1fmzeryo0eih/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let streetLayer = L.tileLayer(url2, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
  pane: 'shadowPane',
});
streetLayer.addTo(mymap);


// some important global variables.
// the data source
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'taz_boundaries';
const DATA_VIEW = 'connectsf_accjobs';


const FRAC_COLS = [];
const YR_LIST = [2015,2050];
const TRANSIT_MODE = ['auto','transit'];

const INT_COLS = [];
const DISCRETE_VAR_LIMIT = 10;
const MISSING_COLOR = '#ccd';
const COLORRAMP = {SEQ: ['#ffecb3','#f2ad86', '#d55175', '#963d8e','#3f324f'],
                    DIV: ['#d7191c','#fdae61','#ffffbf','#a6d96a','#1a9641']};
const CUSTOM_BP_DICT = {
  'transittotal': {'2015':[200000, 400000, 550000, 650000], '2050':[300000, 600000, 750000, 900000], 'diff':[0, 150000, 225000, 300000]},
  'autototal': {'2015':[850000, 1000000, 1100000, 1200000], '2050':[1000000, 1100000, 1200000, 1300000], 'diff':[0, 50000, 100000, 150000]},
}

const METRIC_UNITS = {};
let modeSelect = 'auto';
let yearSelect = '2015';
let sel_colorvals, sel_colors, sel_binsflag;
let sel_bwvals;

// let chart_deftitle = 'All TAZs Combined';

let geoLayer, mapLegend;
let _featJson;
let _aggregateData;
let prec;

async function initialPrep() {

  console.log('1...');
  _featJson = await fetchMapFeatures();

  console.log('2... ');
  await drawMapFeatures();
  
  console.log('3... ');
  await buildChartHtmlFromData();

  console.log('4 !!!');
}

// get the taz boundary data
async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?select=taz,geometry,nhood';

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


// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

function getInfoHtml(geo) {
  let retval = '<b>TAZ: </b>' + `${geo.taz}<br/>` +
                '<b>NEIGHBORHOOD: </b>' + `${geo.nhood}<br/><hr>`;

  let metric1 = app.selected_metric + YR_LIST[0];
  let metric2 = app.selected_metric + YR_LIST[1];
  let diff = geo[metric2] - geo[metric1];

  retval += `<b>${YR_LIST[0]}</b> `+`<b>${METRIC_DESC[app.selected_metric]}: </b>` + `${geo[metric1]}<br/>` +
            `<b>${YR_LIST[1]}</b> `+`<b>${METRIC_DESC[app.selected_metric]}: </b>` + `${geo[metric2]}<br/>`+
            '<b> Change: </b>' + `${diff}`;
  return retval; 
  retval += `<b>2015 JOBS ACCESSIBILITY: </b> ` + `${base_val}<br/>` +
            `<b>2050 JOBS ACCESSIBILITY: </b> ` + `${comp_val}<br/>`;
  retval += `<b>JOBS ACCESSIBILITY CHANGE: </b>` + `${metric_val}`; 
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
    if (oldHoverTarget.feature.taz != selGeoId) geoLayer.resetStyle(oldHoverTarget);
  }, 2000);
};
infoPanel.addTo(mymap);

// get data from database
async function getMapData() {
  let data_url = API_SERVER + DATA_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();

  base_lookup = {};
  let tmp = {};
  for (let yr of YR_LIST) {
    tmp[yr] = {};
    for (let mode of TRANSIT_MODE) {
      tmp[yr][mode] = {}
      for (let met of app.metric_options) {
        tmp[yr][mode][met.value] = 0;
      }
    }
  }

  for (let entry of jsonData) {
    base_lookup[entry.taz] = entry;
    for (let yr of YR_LIST) {
      for (let mode of TRANSIT_MODE) {
        for (let met of app.metric_options) {
          tmp[yr][mode][met.value] += entry[mode+met.value+yr];
        }
      }
    }
  }

  _aggregateData = [];
  for (let yr of YR_LIST) {
    for (let mode of TRANSIT_MODE) {
      let row = {};
      row['year'] = yr.toString();
      row['mode'] = mode.toString()
      for (let met of app.metric_options) {
        row[met.value] = tmp[yr][mode][met.value];
      }
      _aggregateData.push(row);
    }
  }
  // console.log(_aggregateData)
}

let base_lookup;
let map_vals;
let bwidth_vals;
async function drawMapFeatures(queryMapData=true) {

  // create a clean copy of the feature Json
  if (!_featJson) return;
  let cleanFeatures = _featJson.slice();
  let sel_metric = app.selected_metric;
  let mode_metric = modeSelect + sel_metric;
  let base_metric = mode_metric;
  let comp_metric = mode_metric;
  if (yearSelect == "diff") {
    base_metric = base_metric + "2015";
    comp_metric = comp_metric + "2050";
  } else {
    base_metric = base_metric + yearSelect;
  }

  // if (base_metric==comp_metric) {
  //   // base num for a year
  //   app.comp_check = false;
  //   app.pct_check = false;
  // } else {
  //   // changing num for time duration
  //   app.comp_check = true;
  // }
  
  prec = (FRAC_COLS.includes(sel_metric) ? 100 : 1);
  

  try {
    // draw data
    if (queryMapData) {
      app.custom_check = false;
      if (base_lookup == undefined) await getMapData();
      // console.log(base_lookup)
      console.log("data draw!")
      let map_metric;
      // let bwidth_metric;
      map_vals = [];
      bwidth_vals = [];
      for (let feat of cleanFeatures) {
        // bwidth_metric = null;
        // if (base_lookup.hasOwnProperty(feat.taz)) {
        //   bwidth_metric = Math.round(base_lookup[feat.taz][app.selected_bwidth]);
        //   if (bwidth_metric !== null) bwidth_vals.push(bwidth_metric);
        // }
        // feat['bwmetric'] = bwidth_metric;
        map_metric = null;
        // if (app.comp_check) {
        //   // changing num for time duration
        //   if (base_lookup.hasOwnProperty(feat.taz)) {
        //     // console.log("drawMapFeatures, 1")
        //     let feat_entry = base_lookup[feat.taz];
        //     map_metric = feat_entry[comp_metric] - feat_entry[base_metric];
        //     feat['base'] = feat_entry[base_metric];
        //     feat['comp'] = feat_entry[comp_metric];
        //     if (app.pct_check && app.comp_check) {
        //       if (feat_entry[base_metric]>0) {
        //         map_metric = map_metric*100/feat_entry[base_metric];
        //       }
        //     }
        //   }
        // } else {
        //   // base num for a year
        //   if (base_lookup.hasOwnProperty(feat.taz)) {
        //     // console.log("drawMapFeatures, 2")
        //     map_metric = base_lookup[feat.taz][base_metric];
        //     // console.log(base_lookup[feat.taz])
        //     // console.log(base_metric)
        //     // console.log(map_metric)
        //   }
        // }
        if (yearSelect == "diff") {
          // changing num for time duration
          if (base_lookup.hasOwnProperty(feat.taz)) {
            console.log("drawMapFeatures, 1")
            let feat_entry = base_lookup[feat.taz];
            map_metric = feat_entry[comp_metric] - feat_entry[base_metric];
            feat['base'] = feat_entry[base_metric];
            feat['comp'] = feat_entry[comp_metric];
            // percent mode
            // if (app.pct_check && app.comp_check) {
            //   if (feat_entry[base_metric]>0) {
            //     map_metric = map_metric*100/feat_entry[base_metric];
            //   }
            // }
          }
        } else {
          // base num for a year
          if (base_lookup.hasOwnProperty(feat.taz)) {
            console.log("drawMapFeatures, 2")
            map_metric = base_lookup[feat.taz][base_metric];
            // console.log(base_lookup[feat.taz])
            // console.log(base_metric)
            // console.log(map_metric)
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
    
    // draw map color
    if (map_vals.length > 0) {
      let color_func;
      let sel_colorvals2;
      let bp;
      console.log("color draw!")
      if (queryMapData) {
        
        sel_colorvals = Array.from(new Set(map_vals)).sort((a, b) => a - b);

        // draw the distribution plot
        // let dist_vals = app.comp_check? map_vals.filter(entry => entry <= MAX_PCTDIFF) : map_vals;
        // console.log(app.comp_check)
        // console.log(dist_vals)
        // let x = d3.scaleLinear()
        //         .domain([dist_vals[0], dist_vals[dist_vals.length-1]])
        // let numticks = 20;
        // if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) numticks = sel_colorvals.length;
        // let histogram = d3.histogram()
        //     .domain(x.domain())
        //     .thresholds(x.ticks(numticks));
        // updateDistChart(histogram(dist_vals));

        // console.log(sel_colorvals.length)
        // console.log(DISCRETE_VAR_LIMIT)
        if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) {
          console.log("drawMapFeatures, 3")
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
          console.log("drawMapFeatures, 4")
          app.custom_disable = false;
          
          let year = '2015';
          // let mode = 'base'
          // if (app.comp_check){
          //   if(app.pct_check){
          //     mode = 'pctdiff';
          //   } else {
          //     mode = 'diff';
          //   }
          // }
          let custom_bps;
          // console.log(CUSTOM_BP_DICT)
          // console.log(mode_metric)
          if (CUSTOM_BP_DICT.hasOwnProperty(mode_metric)){
            custom_bps = CUSTOM_BP_DICT[mode_metric][yearSelect];
            // console.log(custom_bps)
            sel_colorvals = [map_vals[0]];
            for (var i = 0; i < custom_bps.length; i++) {
              if (custom_bps[i]>map_vals[0] && custom_bps[i]<map_vals[map_vals.length-1]) sel_colorvals.push(custom_bps[i]);
            }
            sel_colorvals.push(map_vals[map_vals.length-1]);
            app.custom_check = true;
          } else {
            sel_colorvals = getQuantiles(map_vals, app.selected_breaks);
          }
          bp = Array.from(sel_colorvals).sort((a, b) => a - b);
          app.bp0 = bp[0];
          app.bp5 = bp[bp.length-1];
          if (CUSTOM_BP_DICT.hasOwnProperty(mode_metric)){
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

        // app.bwcustom_disable = false;
        // sel_bwvals = getQuantiles(bwidth_vals, 5);
        // bp = Array.from(sel_bwvals).sort((a, b) => a - b);
        // app.bwbp0 = bp[0];
        // app.bwbp1 = bp[1];
        // app.bwbp2 = bp[2];
        // app.bwbp3 = bp[3];
        // app.bwbp4 = bp[4];
        // app.bwbp5 = bp[5];
        // sel_bwvals = Array.from(new Set(sel_bwvals)).sort((a, b) => a - b); 
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

      // let bw_widths;
      // if (app.bwidth_check) {
      //   bw_widths = BWIDTH_MAP[sel_bwvals.length]; 
      //   for (let feat of cleanFeatures) {
      //     if (feat['bwmetric'] !== null) {
      //       if (sel_bwvals.length <= 2){
      //         feat['bwmetric_scaled'] = bw_widths;
      //       } else {
      //         for (var i = 0; i < sel_bwvals.length-1; i++) {
      //           if (feat['bwmetric'] <= sel_bwvals[i + 1]) {
      //             feat['bwmetric_scaled'] = bw_widths[i];
      //             break;
      //           }
      //         }
      //       }
      //       //feat['bwmetric_scaled'] = (feat['bwmetric']-bwidth_vals[0])*(MAX_BWIDTH-MIN_BWIDTH)/(bwidth_vals[bwidth_vals.length-1]-bwidth_vals[0])+MIN_BWIDTH;
      //     } else {
      //       feat['bwmetric_scaled'] = null;
      //     }
      //   }
      // }
      
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
          (app.pct_check && app.comp_check)? '%': ''
        );
        legHTML = '<h4>' + sel_metric.toUpperCase() + (app.pct_check? ' % Diff': (METRIC_UNITS.hasOwnProperty(sel_metric)? (' (' + METRIC_UNITS[sel_metric] + ')') : '')) +
                  '</h4>' + legHTML;
        // if (app.bwidth_check) {
        //   // legHTML += '<hr/>' + '<h4>' + app.selected_bwidth.toUpperCase() +  '</h4>';
        //   legHTML += getBWLegHTML(sel_bwvals, bw_widths);
        // }
        div.innerHTML = legHTML;
        return div;
      };
      mapLegend.addTo(mymap);
      
      if (selectedGeo) {
        if (base_lookup.hasOwnProperty(selectedGeo.feature.taz)) {
          buildChartHtmlFromData(selectedGeo.feature.taz);
          return cleanFeatures.filter(entry => entry.taz == selectedGeo.feature.taz)[0];
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
    // app.selected_colorscheme = COLORRAMP.DIV;
    app.selected_colorscheme = COLORRAMP.SEQ;
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

  // the opacity 
  let fo = 1;
  if (feat['metric']==0) {
    fo = 0;
  }
  if (!app.bwidth_check) {
    return { fillColor: color, opacity: 0.5, weight: 0, fillOpacity: fo };
  } else {
    return { color: color, weight: feat['bwmetric_scaled'], opacity: 1.0 };
  }
}

let infoPanelTimeout;
let oldHoverTarget;

function hoverFeature(e) {
  clearTimeout(infoPanelTimeout);
  infoPanel.update(e.target.feature);
  
  // don't do anything else if the feature is already clicked
  if (selGeoId === e.target.feature.taz) return;

  // return previously-hovered segment to its original color
  if (oldHoverTarget && e.target.feature.taz != selGeoId) {
    if (oldHoverTarget.feature.taz != selGeoId)
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
      if (e.feature.taz === selGeoId) {
        e.bringToFront();
        e.setStyle(styles.popup);
        selectedGeo = e;
        return;
      }
    } catch(error) {}
  });
}

// let distChart = null;
// let distLabels;
// function updateDistChart(bins) {
//   let data = [];
//   distLabels = [];
//   for (let b of bins) {
//     let x0 = Math.round(b.x0*prec)/prec;
//     let x1 = Math.round(b.x1*prec)/prec;
//     data.push({x:x0, y:b.length});
//     distLabels.push(x0 + '-' + x1);
//   }

//   if (distChart) {
//     distChart.setData(data);
//   } else {
//       distChart = new Morris.Area({
//         // ID of the element in which to draw the chart.
//         element: 'dist-chart',
//         data: data,
//         // The name of the data record attribute that contains x-values.
//         xkey: 'x',
//         // A list of names of data record attributes that contain y-values.
//         ykeys: 'y',
//         ymin: 0,
//         labels: ['Freq'],
//         lineColors: ['#1fc231'],
//         xLabels: 'x',
//         xLabelAngle: 25,
//         xLabelFormat: binFmt,
//         //yLabelFormat: yFmt,
//         hideHover: true,
//         parseTime: false,
//         fillOpacity: 0.4,
//         pointSize: 1,
//         behaveLikeLine: false,
//         eventStrokeWidth: 2,
//         eventLineColors: ['#ccc'],
//       });
//   }

// }

// function binFmt(x) {
//   return distLabels[x.x] + ((app.pct_check && app.comp_check)? '%':'');
// }

let selGeoId;
let selectedGeo, prevSelectedGeo;
let selectedLatLng;

function clickedOnFeature(e) {
  e.target.setStyle(styles.popup);
  let geo = e.target.feature;
  selGeoId = geo.taz;

  // unselect the previously-selected selection, if there is one
  if (selectedGeo && selectedGeo.feature.taz != geo.taz) {
    prevSelectedGeo = selectedGeo;
    geoLayer.resetStyle(prevSelectedGeo);
  }
  selectedGeo = e.target;
  let selfeat = selectedGeo.feature;
  app.chartSubtitle = 'TAZ ' + selfeat.taz + ' in ' + selfeat.nhood;
  selectedLatLng = e.latlng;
  if (base_lookup.hasOwnProperty(selGeoId)) {
    showGeoDetails(selectedLatLng);
    buildChartHtmlFromData(selGeoId);
  } else {
    resetPopGeo();
  }
}

// let popSelGeo;
// function showGeoDetails(latlng) {
//   // show popup
//   popSelGeo = L.popup()
//     .setLatLng(latlng)
//     .setContent(infoPanel._div.innerHTML)
//     .addTo(mymap);

//   // Revert to overall chart when no segment selected
//   popSelGeo.on('remove', function(e) {
//     resetPopGeo();
//   });
// }

// function resetPopGeo() {
//   geoLayer.resetStyle(selectedGeo);
//   prevSelectedGeo = selectedGeo = selGeoId = null;
//   app.chartSubtitle = chart_deftitle;
//   buildChartHtmlFromData();
// }

// let trendChart = null
// function buildChartHtmlFromData(geoid = null) {
//   document.getElementById('longchart').innerHTML = '';
//   if (geoid) {
//     let selgeodata = [];
//     for (let yr of YR_LIST) {
//       let row = {};
//       row['year'] = yr.toString();
//       for (let met of app.metric_options) {
//         row[met.value] = base_lookup[geoid][met.value+yr];
//       }
//       selgeodata.push(row);
//     } 
//     trendChart = new Morris.Line({
//       data: selgeodata,
//       element: 'longchart',
//       gridTextColor: '#aaa',
//       hideHover: true,
//       labels: [app.selected_metric.toUpperCase()],
//       lineColors: ['#f66'],
//       xkey: 'year',
//       smooth: false,
//       parseTime: false,
//       xLabelAngle: 45,
//       ykeys: [app.selected_metric],
//     });
//   } else {
//     trendChart = new Morris.Line({
//       data: _aggregateData,
//       element: 'longchart',
//       gridTextColor: '#aaa',
//       hideHover: true,
//       labels: [app.selected_metric.toUpperCase()],
//       lineColors: ['#f66'],
//       xkey: 'year',
//       smooth: false,
//       parseTime: false,
//       xLabelAngle: 45,
//       ykeys: [app.selected_metric],
//     });
//   }
// }


// SLIDER ----
let scnSlider = {
  data: YR_LIST,
  //direction: 'vertical',
  //reverse: true,
  lazy: true,
  height: 3,
  //width: 'auto',
  style: {marginTop: '10px'},
  processDragable: true,
  eventType: 'auto',
  piecewise: true,
  piecewiseLabel: true,
  tooltip: 'always',
  tooltipDir: 'bottom',
  tooltipStyle: { backgroundColor: '#eaae00', borderColor: '#eaae00', marginLeft:'5px'},
  processStyle: { backgroundColor: "#eaae00"},
  labelStyle: {color: "#ccc", marginLeft:'5px', marginTop:'5px'},
  piecewiseStyle: {backgroundColor: '#ccc',width: '8px',height: '8px',visibility: 'visible'},
};

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
// function bwbp1Changed(thing) {
//   if (thing < app.bwbp0) app.bwbp1 = app.bwbp0;
//   if (thing > app.bwbp2) app.bwbp2 = thing;
//   app.isBWUpdActive = true;
// }
// function bwbp2Changed(thing) {
//   if (thing < app.bwbp1) app.bwbp1 = thing;
//   if (thing > app.bwbp3) app.bwbp3 = thing;
//   app.isBWUpdActive = true;
// }
// function bwbp3Changed(thing) {
//   if (thing < app.bwbp2) app.bwbp2 = thing;
//   if (thing > app.bwbp4) app.bwbp4 = thing;
//   app.isBWUpdActive = true;
// }
// function bwbp4Changed(thing) {
//   if (thing < app.bwbp3) app.bwbp3 = thing;
//   if (thing > app.bwbp5) app.bwbp4 = app.bwbp5;
//   app.isBWUpdActive = true;
// }

async function selectionChanged(thing) {
  // app.chartTitle = app.selected_metric.toUpperCase() + ' TREND';
  app.chartTitle = METRIC_DESC[app.selected_metric] + ' Trend';
  if (app.sliderValue && app.selected_metric) {
    let selfeat = await drawMapFeatures();
    console.log(selfeat)
    if (selfeat) {
      highlightSelectedSegment();
      popSelGeo.setContent(getInfoHtml(selfeat));
    }
  }
}

async function updateColor(thing) {
  app.isUpdActive = false;
  let selfeat = await drawMapFeatures(false);
  if (selfeat) {
    highlightSelectedSegment();
    popSelGeo.setContent(getInfoHtml(selfeat));
  }
}

async function updateMap(thing) {
  app.isUpdActive = false;
  let selfeat = await drawMapFeatures();
  if (selfeat) {
    highlightSelectedSegment();
    popSelGeo.setContent(getInfoHtml(selfeat));
  }
}

// function yr2015(thing){
//   yearSelect = "2015";
//   app.is2015 = true,
//   app.is2050 = false,
//   app.isDIFF = false,
//   updateMap();
// }

// function yr2050(thing){
//   yearSelect = "2050";
//   app.is2015 = false,
//   app.is2050 = true,
//   app.isDIFF = false,
//   updateMap();
// }

// function yrdiff(thing){
//   yearSelect = "diff";
//   app.is2015 = false,
//   app.is2050 = false,
//   app.isDIFF = true,
//   updateMap();
// }

function yrChanged(yr) {
  app.selected_year = yr;
  if (yr=='diff') {
    app.sliderValue = YR_LIST;
  } else {
    app.sliderValue = [yr,yr];
  }
}

function customBreakPoints(thing) {
  if(thing) {
    app.isUpdActive = false;
  } else {
    drawMapFeatures();
  }
}

// function customBWBreakPoints(thing) {
//   if(thing) {
//     app.isBWUpdActive = false;
//   } else {
//     drawMapFeatures();
//   }
// }
// 
// function colorschemeChanged(thing) {
//   app.selected_colorscheme = thing;
//   drawMapFeatures(false);
// }

function pickAU(thing){
  modeSelect = "auto";
  app.isAUActive = true;
  app.isTRActive = false;
  updateMap();
}

function pickTR(thing){
  modeSelect = "transit";
  app.isTRActive = true;
  app.isAUActive = false;
  updateMap();
}

// function bwidthChanged(thing) {
//   app.bwcustom_disable = !thing;
//   drawMapFeatures(false);
// }
// function bwUpdateMap(thing) {
//   app.isBWUpdActive = false;
//   drawMapFeatures(false);
// }


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
    // year
    year_options: [
      {text: 'Year 2015', value: '2015'},
      {text: 'Year 2050', value: '2050'},
      {text: 'Change', value: 'diff'},
      ],
    selected_year: '2015',
    sliderValue: [YR_LIST[0],YR_LIST[0]],

    // transit type
    // isAUActive: true,
    // isTRActive: false,
    selected_metric: 'auto',
    metric_options: [
    {text: 'auto', value: 'auto'},
    {text: 'transit', value: 'transit'},
    ],

    custom_check: false,
    // custom_disable: false,
    
    // custom break points
    bp0: 0.0,
    bp1: 0.0,
    bp2: 0.0,
    bp3: 0.0,
    bp4: 0.0,
    bp5: 0.0,
    // update after change custom break points
    isUpdActive: false,
    
    // isBWUpdActive: false,
    // bwcustom_check: false,
    // bwcustom_disable: true,
    // bwbp0: 0.0,
    // bwbp1: 0.0,
    // bwbp2: 0.0,
    // bwbp3: 0.0,
    // bwbp4: 0.0,
    // bwbp5: 0.0,
    
    // selected_metric: 'total',
    // metric_options: [
    // {text: 'Total_Jobs', value: 'total'},
    // {text: 'CIE_Jobs', value: 'cie'},
    // {text: 'MED_Jobs', value: 'med'},
    // {text: 'MIPS_Jobs', value: 'mips'},
    // {text: 'PDR_Jobs', value: 'pdr'},
    // {text: 'RET_Jobs', value: 'retail'},
    // {text: 'VIS_Jobs', value: 'visitor'},
    // ],

    // chartTitle: 'Household Accessible Jobs TREND',
    // chartSubtitle: chart_deftitle,
    
    // scnSlider: scnSlider,
    // sliderValue: [YR_LIST[0],YR_LIST[YR_LIST.length-1]],

    // selected_bwidth: bwidth_metric_list[0],
    // bwidth_options: [],    
    
    // selected_colorscheme: COLORRAMP.DIV,
    // map color control
    modeMap: {
      '#ffffcc,#663399': 'lch',
      '#ebbe5e,#3f324f': 'hsl',
      '#ffffcc,#3f324f': 'hsl',
      '#3f324f,#ffffcc': 'hsl',
      '#fafa6e,#2A4858': 'lch',
    },

    // selected_breaks: 5,
    // break_options: [
    // {text: 'Tertiles (3)', value: 3},
    // {text: 'Quartiles (4)', value: 4},
    // {text: 'Quintiles (5)', value: 5},
    // ]      
  },
  watch: {
    sliderValue: selectionChanged,
    // selected_metric: selectionChanged,
    // pct_check: selectionChanged,
    
    //selected_colorscheme: colorschemeChanged,
    bp1: bp1Changed,
    bp2: bp2Changed,
    bp3: bp3Changed,
    bp4: bp4Changed,
    // bwbp1: bwbp1Changed,
    // bwbp2: bwbp2Changed,
    // bwbp3: bwbp3Changed,
    // bwbp4: bwbp4Changed,
    custom_check: customBreakPoints,
    // bwcustom_check: customBWBreakPoints,
    // bwidth_check: bwidthChanged,
  },
  methods: {
    // yr2015: yr2015,
    // yr2050: yr2050,
    // yrdiff: yrdiff,
    yrChanged: yrChanged,
    pickAU: pickAU,
    pickTR: pickTR,
    updateMap: updateColor,
    // bwUpdateMap: bwUpdateMap,
    clickToggleHelp: clickToggleHelp,
    clickedShowHide: clickedShowHide,
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

// test
